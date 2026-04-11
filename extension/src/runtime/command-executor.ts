import { nanoid } from 'nanoid';
import type { CommandPayload } from '@telepat/otto-protocol';
import { listCommandsForRuntime, runCommandAction, runCommandTestAction } from './command-runtime.js';
import { CommandExecutionError } from './execution-error.js';
import { createSingleFlight } from './single-flight.js';
import { getTabAudioKeepaliveManager } from './listener-managers.js';

type ChromeLike = typeof chrome;
const AUTOMATION_GROUP_SINGLE_FLIGHT_KEY = 'automation-group.ensure';
const KEEPALIVE_PERMISSION_TIMEOUT_MS = 120_000;

type TabSessionMode = 'normal' | 'keepalive';
type TabSessionReadiness = 'ready' | 'pending_user_permission' | 'keepalive_active' | 'denied' | 'timed_out';

const runtimeSingleFlight = createSingleFlight();

export type CommandExecutionResult = {
  durationMs: number;
  data: unknown;
};

function isMissingTabGroupError(error: unknown): boolean {
  const candidates: string[] = [];

  if (typeof error === 'string') {
    candidates.push(error);
  }

  if (error && typeof error === 'object') {
    const asRecord = error as Record<string, unknown>;
    const directMessage = asRecord.message;
    if (typeof directMessage === 'string') {
      candidates.push(directMessage);
    }

    const nestedLastError = asRecord.lastError;
    if (nestedLastError && typeof nestedLastError === 'object') {
      const nestedMessage = (nestedLastError as Record<string, unknown>).message;
      if (typeof nestedMessage === 'string') {
        candidates.push(nestedMessage);
      }
    }

    const nestedCause = asRecord.cause;
    if (nestedCause && typeof nestedCause === 'object') {
      const nestedMessage = (nestedCause as Record<string, unknown>).message;
      if (typeof nestedMessage === 'string') {
        candidates.push(nestedMessage);
      }
    }

    try {
      candidates.push(JSON.stringify(error));
    } catch {
      // Ignore circular or non-serializable objects.
    }
  }

  if (candidates.length === 0) {
    candidates.push(String(error ?? ''));
  }

  return candidates.some((candidate) => /no group with id/i.test(candidate));
}

function isNonNormalWindowTabGroupingError(error: unknown): boolean {
  const candidates: string[] = [];

  if (typeof error === 'string') {
    candidates.push(error);
  }

  if (error && typeof error === 'object') {
    const asRecord = error as Record<string, unknown>;
    const directMessage = asRecord.message;
    if (typeof directMessage === 'string') {
      candidates.push(directMessage);
    }

    const nestedLastError = asRecord.lastError;
    if (nestedLastError && typeof nestedLastError === 'object') {
      const nestedMessage = (nestedLastError as Record<string, unknown>).message;
      if (typeof nestedMessage === 'string') {
        candidates.push(nestedMessage);
      }
    }

    const nestedCause = asRecord.cause;
    if (nestedCause && typeof nestedCause === 'object') {
      const nestedMessage = (nestedCause as Record<string, unknown>).message;
      if (typeof nestedMessage === 'string') {
        candidates.push(nestedMessage);
      }
    }

    try {
      candidates.push(JSON.stringify(error));
    } catch {
      // Ignore circular or non-serializable objects.
    }
  }

  if (candidates.length === 0) {
    candidates.push(String(error ?? ''));
  }

  return candidates.some((candidate) => /tabs can only be moved to and from normal windows/i.test(candidate));
}

async function clearAutomationGroupId(chromeApi: ChromeLike): Promise<void> {
  await chromeApi.storage.session.set({ automationGroupId: null });
}

async function ensureAutomationGroup(chromeApi: ChromeLike, seedTabId: number): Promise<number> {
  return runtimeSingleFlight.run(AUTOMATION_GROUP_SINGLE_FLIGHT_KEY, async () => {
    const existing = await chromeApi.storage.session.get(['automationGroupId']);
    const existingGroupId = typeof existing.automationGroupId === 'number'
      ? existing.automationGroupId
      : undefined;

    if (existingGroupId) {
      try {
        await chromeApi.tabGroups.update(existingGroupId, {
          title: 'Otto',
          color: 'blue',
          collapsed: true,
        });
        return existingGroupId;
      } catch (error) {
        if (!isMissingTabGroupError(error)) {
          throw error;
        }
        await clearAutomationGroupId(chromeApi);
      }
    }

    const groupId = await chromeApi.tabs.group({ tabIds: [seedTabId] as [number] });
    await chromeApi.tabGroups.update(groupId as number, {
      title: 'Otto',
      color: 'blue',
      collapsed: true,
    });
    await chromeApi.storage.session.set({ automationGroupId: groupId });
    return groupId as number;
  });
}

async function applyAutomationGroupPresentation(chromeApi: ChromeLike, groupId: number): Promise<void> {
  await chromeApi.tabGroups.update(groupId, {
    title: 'Otto',
    color: 'blue',
    collapsed: true,
  });
}

async function attachTabToAutomationGroup(chromeApi: ChromeLike, tabId: number): Promise<number> {
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let groupId: number;
    try {
      groupId = await ensureAutomationGroup(chromeApi, tabId);
    } catch (error) {
      if (isNonNormalWindowTabGroupingError(error)) {
        return -1;
      }
      throw error;
    }

    try {
      await chromeApi.tabs.group({ groupId, tabIds: [tabId] as [number] });
      return groupId;
    } catch (error) {
      if (isNonNormalWindowTabGroupingError(error)) {
        return -1;
      }

      if (!isMissingTabGroupError(error)) {
        throw error;
      }

      await clearAutomationGroupId(chromeApi);
    }
  }

  try {
    const freshGroupId = await chromeApi.tabs.group({ tabIds: [tabId] as [number] });
    await applyAutomationGroupPresentation(chromeApi, freshGroupId as number);
    await chromeApi.storage.session.set({ automationGroupId: freshGroupId });
    return freshGroupId as number;
  } catch (error) {
    if (isNonNormalWindowTabGroupingError(error)) {
      return -1;
    }
    throw error;
  }
}

async function getTabSessions(chromeApi: ChromeLike): Promise<Record<string, number>> {
  const map = await chromeApi.storage.session.get(['tabSessions']);
  return (map.tabSessions as Record<string, number> | undefined) ?? {};
}

async function saveTabSessions(chromeApi: ChromeLike, tabSessions: Record<string, number>): Promise<void> {
  await chromeApi.storage.session.set({ tabSessions });
}

async function getTabSessionOwners(chromeApi: ChromeLike): Promise<Record<string, string>> {
  const map = await chromeApi.storage.session.get(['tabSessionOwners']);
  return (map.tabSessionOwners as Record<string, string> | undefined) ?? {};
}

async function saveTabSessionOwners(chromeApi: ChromeLike, tabSessionOwners: Record<string, string>): Promise<void> {
  await chromeApi.storage.session.set({ tabSessionOwners });
}

async function getTabSessionModes(chromeApi: ChromeLike): Promise<Record<string, TabSessionMode>> {
  const map = await chromeApi.storage.session.get(['tabSessionModes']);
  return (map.tabSessionModes as Record<string, TabSessionMode> | undefined) ?? {};
}

async function saveTabSessionModes(chromeApi: ChromeLike, tabSessionModes: Record<string, TabSessionMode>): Promise<void> {
  await chromeApi.storage.session.set({ tabSessionModes });
}

async function getTabSessionReadiness(chromeApi: ChromeLike): Promise<Record<string, TabSessionReadiness>> {
  const map = await chromeApi.storage.session.get(['tabSessionReadiness']);
  return (map.tabSessionReadiness as Record<string, TabSessionReadiness> | undefined) ?? {};
}

async function saveTabSessionReadiness(
  chromeApi: ChromeLike,
  tabSessionReadiness: Record<string, TabSessionReadiness>,
): Promise<void> {
  await chromeApi.storage.session.set({ tabSessionReadiness });
}

async function getMostRecentActiveTabId(chromeApi: ChromeLike): Promise<number | null> {
  try {
    const [activeTab] = await chromeApi.tabs.query({ active: true, lastFocusedWindow: true });
    return typeof activeTab?.id === 'number' ? activeTab.id : null;
  } catch {
    return null;
  }
}

async function requestKeepAlivePermission(chromeApi: ChromeLike, tabId: number): Promise<boolean> {
  const result = await chromeApi.scripting.executeScript({
    target: { tabId },
    world: 'ISOLATED',
    func: () => {
      return new Promise<boolean>((resolve) => {
        const PROMPT_TIMEOUT_MS = 115000;
        const existing = document.getElementById('__otto_keepalive_prompt_root');
        if (existing) {
          existing.remove();
        }

        const root = document.createElement('div');
        root.id = '__otto_keepalive_prompt_root';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-live', 'polite');
        root.style.position = 'fixed';
        root.style.inset = '0';
        root.style.zIndex = '2147483647';
        root.style.display = 'flex';
        root.style.alignItems = 'center';
        root.style.justifyContent = 'center';
        root.style.padding = '16px';
        root.style.background = 'rgba(9, 12, 18, 0.38)';
        root.style.backdropFilter = 'blur(2px)';

        const panel = document.createElement('div');
        panel.style.width = 'min(460px, 100%)';
        panel.style.borderRadius = '14px';
        panel.style.background = '#0f172a';
        panel.style.color = '#e2e8f0';
        panel.style.border = '1px solid rgba(148, 163, 184, 0.35)';
        panel.style.boxShadow = '0 20px 44px rgba(2, 6, 23, 0.45)';
        panel.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
        panel.style.padding = '16px';

        const title = document.createElement('div');
        title.textContent = 'Allow Otto keepalive for this tab?';
        title.style.fontWeight = '700';
        title.style.fontSize = '16px';
        title.style.marginBottom = '8px';

        const message = document.createElement('div');
        message.textContent = 'This keeps the tab active for reliable automation while commands run.';
        message.style.fontSize = '13px';
        message.style.lineHeight = '1.45';
        message.style.color = 'rgba(226, 232, 240, 0.92)';
        message.style.marginBottom = '14px';

        const actions = document.createElement('div');
        actions.style.display = 'flex';
        actions.style.justifyContent = 'flex-end';
        actions.style.gap = '8px';

        const denyButton = document.createElement('button');
        denyButton.type = 'button';
        denyButton.textContent = 'Not now';
        denyButton.style.border = '1px solid rgba(148, 163, 184, 0.5)';
        denyButton.style.background = 'transparent';
        denyButton.style.color = '#e2e8f0';
        denyButton.style.padding = '8px 12px';
        denyButton.style.borderRadius = '10px';
        denyButton.style.cursor = 'pointer';

        const allowButton = document.createElement('button');
        allowButton.type = 'button';
        allowButton.textContent = 'Allow keepalive';
        allowButton.style.border = '1px solid #0ea5e9';
        allowButton.style.background = '#0284c7';
        allowButton.style.color = '#ffffff';
        allowButton.style.padding = '8px 12px';
        allowButton.style.borderRadius = '10px';
        allowButton.style.cursor = 'pointer';
        allowButton.style.fontWeight = '600';

        let settled = false;

        const onKeyDown = (event: KeyboardEvent) => {
          if (event.key === 'Escape') {
            finish(false);
          }
        };

        const dispose = () => {
          window.removeEventListener('keydown', onKeyDown, true);
          root.remove();
        };

        const finish = (allowed: boolean) => {
          if (settled) {
            return;
          }
          settled = true;
          clearTimeout(promptTimeout);
          dispose();
          resolve(allowed);
        };

        const promptTimeout = setTimeout(() => {
          finish(false);
        }, PROMPT_TIMEOUT_MS);

        const tryPrimeKeepalive = async (): Promise<boolean> => {
          const stateKey = '__otto_audio_keepalive_state_v1';
          const runtime = globalThis as Record<string, unknown>;
          const currentState = runtime[stateKey] as
            | { context?: AudioContext; oscillator?: OscillatorNode; gain?: GainNode }
            | undefined;

          if (currentState?.context && currentState.context.state !== 'closed') {
            try {
              if (currentState.context.state === 'suspended') {
                await currentState.context.resume();
              }
              return true;
            } catch {
              return false;
            }
          }

          const AudioContextCtor = (globalThis as {
            AudioContext?: typeof AudioContext;
            webkitAudioContext?: typeof AudioContext;
          }).AudioContext
            ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

          if (!AudioContextCtor) {
            return false;
          }

          try {
            const context = new AudioContextCtor();
            if (context.state === 'suspended') {
              await context.resume();
            }

            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.value = 20000;
            gain.gain.value = 0.001;

            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start();

            const resume = () => {
              if (context.state === 'suspended') {
                void context.resume().catch(() => undefined);
              }
            };

            const visibilityListener = () => {
              resume();
            };

            document.addEventListener('visibilitychange', visibilityListener, true);

            runtime[stateKey] = {
              context,
              oscillator,
              gain,
              resume,
              visibilityListener,
            };

            return true;
          } catch {
            return false;
          }
        };

        denyButton.addEventListener('click', () => {
          finish(false);
        });

        allowButton.addEventListener('click', () => {
          void (async () => {
            const primed = await tryPrimeKeepalive();
            finish(primed);
          })();
        });

        actions.appendChild(denyButton);
        actions.appendChild(allowButton);
        panel.appendChild(title);
        panel.appendChild(message);
        panel.appendChild(actions);
        root.appendChild(panel);
        document.documentElement.appendChild(root);
        window.addEventListener('keydown', onKeyDown, true);
      });
    },
  });

  return result[0]?.result === true;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  let timeoutHandle: number | undefined;

  try {
    const timed = await Promise.race([
      promise.then((value) => ({ timedOut: false as const, value })),
      new Promise<{ timedOut: true }>((resolve) => {
        timeoutHandle = setTimeout(() => {
          resolve({ timedOut: true });
        }, timeoutMs) as unknown as number;
      }),
    ]);

    return timed;
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

export async function resolveTabId(chromeApi: ChromeLike, tabSessionId: string | undefined): Promise<number> {
  if (!tabSessionId) {
    throw new CommandExecutionError('tabSessionId is required for this action', 'missing_tab_session', 'validation', false);
  }

  const sessions = await getTabSessions(chromeApi);
  const tabId = sessions[tabSessionId];
  if (!tabId) {
    throw new CommandExecutionError(`Unknown tabSessionId: ${tabSessionId}`, 'unknown_tab_session', 'resolve_tab', false);
  }

  try {
    await chromeApi.tabs.get(tabId);
  } catch {
    delete sessions[tabSessionId];
    const tabSessionOwners = await getTabSessionOwners(chromeApi);
    const tabSessionModes = await getTabSessionModes(chromeApi);
    const tabSessionReadiness = await getTabSessionReadiness(chromeApi);
    delete tabSessionOwners[tabSessionId];
    delete tabSessionModes[tabSessionId];
    delete tabSessionReadiness[tabSessionId];
    await Promise.all([
      saveTabSessions(chromeApi, sessions),
      saveTabSessionOwners(chromeApi, tabSessionOwners),
      saveTabSessionModes(chromeApi, tabSessionModes),
      saveTabSessionReadiness(chromeApi, tabSessionReadiness),
    ]);
    throw new CommandExecutionError(`Tab for tabSessionId is no longer available: ${tabSessionId}`, 'tab_session_closed', 'resolve_tab', true);
  }

  return tabId;
}

export async function executeCommand(chromeApi: ChromeLike, command: CommandPayload): Promise<CommandExecutionResult> {
  const start = Date.now();
  const tabAudioKeepaliveManager = getTabAudioKeepaliveManager(chromeApi);

  switch (command.action) {
    case 'primitive.tab.open': {
      const url = String(command.payload.url ?? 'about:blank');
      const keepAlive = command.payload.keepAlive === true;
      const controllerClientId = typeof command.payload.__controllerClientId === 'string'
        ? command.payload.__controllerClientId
        : undefined;
      const previousActiveTabId = keepAlive ? await getMostRecentActiveTabId(chromeApi) : null;
      const tab = await chromeApi.tabs.create({ url, active: keepAlive });
      if (!tab.id || tab.windowId === undefined) {
        throw new CommandExecutionError('Failed to create tab', 'tab_create_failed', 'primitive.tab.open', true);
      }

      await attachTabToAutomationGroup(chromeApi, tab.id);

      const tabSessionId = `tab_${nanoid(10)}`;
      const tabSessions = await getTabSessions(chromeApi);
      tabSessions[tabSessionId] = tab.id;
      const tabSessionOwners = await getTabSessionOwners(chromeApi);
      const tabSessionModes = await getTabSessionModes(chromeApi);
      const tabSessionReadiness = await getTabSessionReadiness(chromeApi);
      if (controllerClientId) {
        tabSessionOwners[tabSessionId] = controllerClientId;
      }
      tabSessionModes[tabSessionId] = keepAlive ? 'keepalive' : 'normal';
      tabSessionReadiness[tabSessionId] = keepAlive ? 'pending_user_permission' : 'ready';
      await Promise.all([
        saveTabSessions(chromeApi, tabSessions),
        saveTabSessionOwners(chromeApi, tabSessionOwners),
        saveTabSessionModes(chromeApi, tabSessionModes),
        saveTabSessionReadiness(chromeApi, tabSessionReadiness),
      ]);

      if (keepAlive) {
        let permissionTimedOut = false;
        let permissionApproved = false;

        try {
          const permissionResult = await withTimeout(
            requestKeepAlivePermission(chromeApi, tab.id),
            KEEPALIVE_PERMISSION_TIMEOUT_MS,
          );

          if (permissionResult.timedOut) {
            permissionTimedOut = true;
          } else {
            permissionApproved = permissionResult.value;
          }
        } finally {
          if (typeof previousActiveTabId === 'number' && previousActiveTabId !== tab.id) {
            try {
              await chromeApi.tabs.update(previousActiveTabId, { active: true });
            } catch {
              // Ignore focus restore failures when original tab is gone.
            }
          }
        }

        if (permissionTimedOut) {
          tabSessionReadiness[tabSessionId] = 'timed_out';
          await saveTabSessionReadiness(chromeApi, tabSessionReadiness);
          throw new CommandExecutionError(
            'Timed out waiting for keepalive permission confirmation',
            'keepalive_permission_timeout',
            'primitive.tab.open',
            true,
          );
        }

        if (!permissionApproved) {
          tabSessionReadiness[tabSessionId] = 'denied';
          await saveTabSessionReadiness(chromeApi, tabSessionReadiness);
          throw new CommandExecutionError(
            'Keepalive permission was denied by the user',
            'keepalive_permission_denied',
            'primitive.tab.open',
            false,
          );
        }

        const keepaliveStarted = await tabAudioKeepaliveManager.startForManagedTab(tabSessionId, tab.id);
        if (!keepaliveStarted) {
          tabSessionReadiness[tabSessionId] = 'denied';
          await saveTabSessionReadiness(chromeApi, tabSessionReadiness);
          throw new CommandExecutionError(
            'Failed to activate keepalive session for the opened tab',
            'keepalive_start_failed',
            'primitive.tab.open',
            true,
          );
        }

        tabSessionReadiness[tabSessionId] = 'keepalive_active';
        await saveTabSessionReadiness(chromeApi, tabSessionReadiness);
      }

      return {
        durationMs: Date.now() - start,
        data: { tabId: tab.id, tabSessionId, url, keepAlive },
      };
    }
    case 'primitive.tab.close': {
      const tabSessionId = String(command.payload.tabSessionId ?? command.tabSessionId ?? '');
      const tabSessions = await getTabSessions(chromeApi);
      const tabSessionOwners = await getTabSessionOwners(chromeApi);
      const tabSessionModes = await getTabSessionModes(chromeApi);
      const tabSessionReadiness = await getTabSessionReadiness(chromeApi);
      const tabId = await resolveTabId(chromeApi, tabSessionId);
      await tabAudioKeepaliveManager.stopForManagedTab(tabSessionId, tabId);
      await chromeApi.tabs.remove(tabId);
      delete tabSessions[tabSessionId];
      delete tabSessionOwners[tabSessionId];
      delete tabSessionModes[tabSessionId];
      delete tabSessionReadiness[tabSessionId];
      await Promise.all([
        saveTabSessions(chromeApi, tabSessions),
        saveTabSessionOwners(chromeApi, tabSessionOwners),
        saveTabSessionModes(chromeApi, tabSessionModes),
        saveTabSessionReadiness(chromeApi, tabSessionReadiness),
      ]);
      return {
        durationMs: Date.now() - start,
        data: { closed: true, tabSessionId },
      };
    }
    case 'primitive.tab.close_owned': {
      const controllerClientId = String(command.payload.controllerClientId ?? '').trim();
      if (!controllerClientId) {
        throw new CommandExecutionError('controllerClientId is required', 'missing_controller_client_id', 'validation', false);
      }

      const tabSessions = await getTabSessions(chromeApi);
      const tabSessionOwners = await getTabSessionOwners(chromeApi);
      const tabSessionModes = await getTabSessionModes(chromeApi);
      const tabSessionReadiness = await getTabSessionReadiness(chromeApi);
      const tabSessionIds = Object.keys(tabSessions).filter((tabSessionId) => tabSessionOwners[tabSessionId] === controllerClientId);

      let closedCount = 0;
      let missingCount = 0;

      for (const tabSessionId of tabSessionIds) {
        const tabId = tabSessions[tabSessionId];
        await tabAudioKeepaliveManager.stopForManagedTab(tabSessionId, tabId);
        try {
          await chromeApi.tabs.remove(tabId);
          closedCount += 1;
        } catch {
          missingCount += 1;
        }
        delete tabSessions[tabSessionId];
        delete tabSessionOwners[tabSessionId];
        delete tabSessionModes[tabSessionId];
        delete tabSessionReadiness[tabSessionId];
      }

      await Promise.all([
        saveTabSessions(chromeApi, tabSessions),
        saveTabSessionOwners(chromeApi, tabSessionOwners),
        saveTabSessionModes(chromeApi, tabSessionModes),
        saveTabSessionReadiness(chromeApi, tabSessionReadiness),
      ]);

      return {
        durationMs: Date.now() - start,
        data: {
          controllerClientId,
          closedCount,
          missingCount,
          totalOwnedSessions: tabSessionIds.length,
        },
      };
    }
    case 'primitive.tab.navigate': {
      const tabSessionId = String(command.payload.tabSessionId ?? command.tabSessionId ?? '');
      const url = String(command.payload.url ?? 'about:blank');
      const tabId = await resolveTabId(chromeApi, tabSessionId);
      await chromeApi.tabs.update(tabId, { url });
      return {
        durationMs: Date.now() - start,
        data: { tabSessionId, url },
      };
    }
    case 'primitive.tab.query': {
      const tabSessions = await getTabSessions(chromeApi);
      return {
        durationMs: Date.now() - start,
        data: { tabSessions },
      };
    }
    case 'primitive.dom.extract_text': {
      const tabSessionId = String(command.payload.tabSessionId ?? command.tabSessionId ?? '');
      const selector = String(command.payload.selector ?? 'body');
      const tabId = await resolveTabId(chromeApi, tabSessionId);
      const result = await chromeApi.scripting.executeScript({
        target: { tabId },
        func: (sel: string) => {
          const el = document.querySelector(sel);
          return el?.textContent?.trim() ?? null;
        },
        args: [selector],
      });
      return {
        durationMs: Date.now() - start,
        data: { tabSessionId, selector, text: result[0]?.result ?? null },
      };
    }
    case 'command.list': {
      return {
        durationMs: Date.now() - start,
        data: { commands: listCommandsForRuntime() },
      };
    }
    case 'command.run':
    case 'command.reddit_feed': {
      const tabSessionId = String(command.payload.tabSessionId ?? command.tabSessionId ?? '');
      const tabId = await resolveTabId(chromeApi, tabSessionId);
      const data = await runCommandAction(chromeApi, command, tabId, tabSessionId);
      const payload = data && typeof data === 'object' && !Array.isArray(data)
        ? data as Record<string, unknown>
        : { result: data };

      return {
        durationMs: Date.now() - start,
        data: { tabSessionId, ...payload },
      };
    }
    case 'command.test': {
      const tabSessionId = String(command.payload.tabSessionId ?? command.tabSessionId ?? '');
      const tabId = await resolveTabId(chromeApi, tabSessionId);
      const data = await runCommandTestAction(chromeApi, command, tabId, tabSessionId);
      const payload = data && typeof data === 'object' && !Array.isArray(data)
        ? data as Record<string, unknown>
        : { result: data };

      return {
        durationMs: Date.now() - start,
        data: { tabSessionId, ...payload },
      };
    }
    case 'listener.subscribe': {
      const listener = String(command.payload.listener ?? '').trim();
      if (!listener) {
        throw new CommandExecutionError('listener is required', 'missing_listener_name', 'validation', false);
      }

      const rawOptions = (command.payload.options ?? {}) as Record<string, unknown>;
      let options = rawOptions;

      if (listener === 'network.http_intercept') {
        const tabSessionId = String(rawOptions.tabSessionId ?? command.payload.tabSessionId ?? command.tabSessionId ?? '').trim();
        if (!tabSessionId) {
          throw new CommandExecutionError(
            'network listener requires options.tabSessionId',
            'missing_tab_session',
            'validation',
            false,
          );
        }

        const site = String(rawOptions.site ?? '').trim().toLowerCase();
        if (!site) {
          throw new CommandExecutionError(
            'network listener requires options.site',
            'missing_site',
            'validation',
            false,
          );
        }

        const mode = String(rawOptions.mode ?? 'network').trim().toLowerCase();
        if (!['network', 'fetch', 'hybrid'].includes(mode)) {
          throw new CommandExecutionError(
            'network listener mode must be network|fetch|hybrid',
            'invalid_listener_mode',
            'validation',
            false,
          );
        }

        const maxBodyBytesValue = rawOptions.maxBodyBytes;
        let normalizedMaxBodyBytes: number | undefined;
        if (maxBodyBytesValue !== undefined) {
          const maxBodyBytes = Number(maxBodyBytesValue);
          if (!Number.isFinite(maxBodyBytes) || maxBodyBytes <= 0) {
            throw new CommandExecutionError(
              'network listener maxBodyBytes must be a positive number',
              'invalid_listener_max_body_bytes',
              'validation',
              false,
            );
          }
          normalizedMaxBodyBytes = Math.floor(maxBodyBytes);
        }

        if (rawOptions.urlPatterns !== undefined && !Array.isArray(rawOptions.urlPatterns)) {
          throw new CommandExecutionError(
            'network listener urlPatterns must be an array of strings',
            'invalid_listener_url_patterns',
            'validation',
            false,
          );
        }

        if (Array.isArray(rawOptions.urlPatterns) && rawOptions.urlPatterns.some((value) => typeof value !== 'string')) {
          throw new CommandExecutionError(
            'network listener urlPatterns must be an array of strings',
            'invalid_listener_url_patterns',
            'validation',
            false,
          );
        }

        if (rawOptions.mimeTypes !== undefined && !Array.isArray(rawOptions.mimeTypes)) {
          throw new CommandExecutionError(
            'network listener mimeTypes must be an array of strings',
            'invalid_listener_mime_types',
            'validation',
            false,
          );
        }

        if (rawOptions.includeBody !== undefined && typeof rawOptions.includeBody !== 'boolean') {
          throw new CommandExecutionError(
            'network listener includeBody must be a boolean',
            'invalid_listener_include_body',
            'validation',
            false,
          );
        }

        if (rawOptions.includeHeaders !== undefined && typeof rawOptions.includeHeaders !== 'boolean') {
          throw new CommandExecutionError(
            'network listener includeHeaders must be a boolean',
            'invalid_listener_include_headers',
            'validation',
            false,
          );
        }

        if (Array.isArray(rawOptions.mimeTypes) && rawOptions.mimeTypes.some((value) => typeof value !== 'string')) {
          throw new CommandExecutionError(
            'network listener mimeTypes must be an array of strings',
            'invalid_listener_mime_types',
            'validation',
            false,
          );
        }

        if (rawOptions.requestHostAllowlist !== undefined && !Array.isArray(rawOptions.requestHostAllowlist)) {
          throw new CommandExecutionError(
            'network listener requestHostAllowlist must be an array of strings',
            'invalid_listener_request_hosts',
            'validation',
            false,
          );
        }

        if (
          Array.isArray(rawOptions.requestHostAllowlist)
          && rawOptions.requestHostAllowlist.some((value) => typeof value !== 'string')
        ) {
          throw new CommandExecutionError(
            'network listener requestHostAllowlist must be an array of strings',
            'invalid_listener_request_hosts',
            'validation',
            false,
          );
        }

        const requestHostAllowlist = Array.isArray(rawOptions.requestHostAllowlist)
          ? Array.from(new Set(
            rawOptions.requestHostAllowlist
              .map((value) => String(value).trim().toLowerCase())
              .filter((value) => value.length > 0),
          ))
          : undefined;

        const urlPatterns = Array.isArray(rawOptions.urlPatterns)
          ? Array.from(new Set(
            rawOptions.urlPatterns
              .map((value) => String(value).trim())
              .filter((value) => value.length > 0),
          ))
          : undefined;

        const mimeTypes = Array.isArray(rawOptions.mimeTypes)
          ? Array.from(new Set(
            rawOptions.mimeTypes
              .map((value) => String(value).trim().toLowerCase())
              .filter((value) => value.length > 0),
          ))
          : undefined;

        const includeBody = typeof rawOptions.includeBody === 'boolean'
          ? rawOptions.includeBody
          : undefined;

        const includeHeaders = typeof rawOptions.includeHeaders === 'boolean'
          ? rawOptions.includeHeaders
          : undefined;

        let streamAdapter: string | undefined;
        if (rawOptions.streamAdapter !== undefined) {
          if (typeof rawOptions.streamAdapter !== 'string') {
            throw new CommandExecutionError(
              'network listener streamAdapter must be a string',
              'invalid_listener_stream_adapter',
              'validation',
              false,
            );
          }
          const normalized = rawOptions.streamAdapter.trim();
          if (normalized.length === 0) {
            throw new CommandExecutionError(
              'network listener streamAdapter must not be empty',
              'invalid_listener_stream_adapter',
              'validation',
              false,
            );
          }
          streamAdapter = normalized;
        }

        let selfUserId: string | undefined;
        if (rawOptions.selfUserId !== undefined) {
          if (typeof rawOptions.selfUserId !== 'string') {
            throw new CommandExecutionError(
              'network listener selfUserId must be a string',
              'invalid_listener_self_user_id',
              'validation',
              false,
            );
          }
          const normalized = rawOptions.selfUserId.trim();
          if (normalized.length > 0) {
            selfUserId = normalized;
          }
        }

        options = {
          tabSessionId,
          site,
          mode,
          ...(urlPatterns ? { urlPatterns } : {}),
          ...(mimeTypes ? { mimeTypes } : {}),
          ...(normalizedMaxBodyBytes !== undefined ? { maxBodyBytes: normalizedMaxBodyBytes } : {}),
          ...(includeBody !== undefined ? { includeBody } : {}),
          ...(includeHeaders !== undefined ? { includeHeaders } : {}),
          ...(requestHostAllowlist ? { requestHostAllowlist } : {}),
          ...(streamAdapter !== undefined ? { streamAdapter } : {}),
          ...(selfUserId !== undefined ? { selfUserId } : {}),
        };
      }

      return {
        durationMs: Date.now() - start,
        data: {
          listener,
          subscribed: true,
          options,
        },
      };
    }
    case 'listener.unsubscribe': {
      const targetRequestId = String(command.payload.targetRequestId ?? '').trim();
      if (!targetRequestId) {
        throw new CommandExecutionError(
          'targetRequestId is required',
          'missing_listener_target_request',
          'validation',
          false,
        );
      }

      return {
        durationMs: Date.now() - start,
        data: {
          targetRequestId,
          unsubscribed: true,
        },
      };
    }
    default:
      throw new CommandExecutionError(`Unsupported action: ${command.action}`, 'unsupported_action', 'validation', false);
  }
}
