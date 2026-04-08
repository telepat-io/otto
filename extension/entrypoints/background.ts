import { nanoid } from 'nanoid';
import { createEnvelope, type CommandPayload, type Envelope } from '@telepat/otto-protocol';
import type { ExtensionLogEntry } from '@telepat/otto-protocol';
import { defineBackground } from 'wxt/utils/define-background';
import {
  bootstrap,
  ensureNodeId,
  ensureOffscreenDocument,
  ensurePairingState,
  getRelayUrl,
} from '../src/runtime/background-bootstrap.js';
import { getReplayResponse, rememberReplayResponse } from '../src/runtime/command-replay.js';
import { executeCommand } from '../src/runtime/command-executor.js';
import { CommandExecutionError } from '../src/runtime/execution-error.js';
import {
  getNetworkInterceptListenerManager,
  getRedditChatListenerManager,
} from '../src/runtime/listener-managers.js';
import { deriveOnboardingState, type RelayConnectionStatus } from '../src/runtime/onboarding-state.js';

function withRuntimeErrorLogging<T>(promise: Promise<T>): void {
  promise.catch((err) => {
    console.error('[otto:bg]', err);
  });
}

async function isLocalDevLogStreamingEnabled(chromeApi: typeof chrome): Promise<boolean> {
  const config = await chromeApi.storage.local.get(['localDevLogStreamingEnabled', 'relayUrl']);
  if (config.localDevLogStreamingEnabled !== true) {
    return false;
  }

  const relayUrl = typeof config.relayUrl === 'string' ? config.relayUrl : '';
  if (!relayUrl) {
    return false;
  }

  try {
    const parsed = new URL(relayUrl);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

async function forwardExtensionLog(chromeApi: typeof chrome, entry: ExtensionLogEntry): Promise<void> {
  const enabled = await isLocalDevLogStreamingEnabled(chromeApi);
  if (!enabled) {
    return;
  }

  try {
    await chromeApi.runtime.sendMessage({
      type: 'otto.offscreen.enqueueLog',
      payload: entry,
    });
  } catch (error) {
    console.warn('[otto:bg] unable to forward extension log to offscreen', error);
  }
}

async function syncActionBadge(chromeApi: typeof chrome): Promise<void> {
  const snapshot = await chromeApi.storage.local.get([
    'relayUrl',
    'nodeId',
    'pairingCode',
    'nodeAccessToken',
    'relayConnectionStatus',
    'relayConnectionError',
  ]);
  const state = deriveOnboardingState(snapshot);

  await chromeApi.action.setBadgeBackgroundColor({ color: state.badgeColor });
  await chromeApi.action.setBadgeText({ text: state.badgeText });
  await chromeApi.action.setTitle({ title: `Otto Node: ${state.stateLabel}` });
}

export default defineBackground(() => {
  let maintenanceInFlight: Promise<void> | null = null;
  let rerunRequested = false;
  let rerunRequiresBootstrap = false;
  const activeListenerRequestIds = new Set<string>();
  const listenerNameByRequestId = new Map<string, string>();
  const networkInterceptListenerManager = getNetworkInterceptListenerManager(chrome);
  const redditChatListenerManager = getRedditChatListenerManager(chrome);

  const runMaintenance = (mode: 'bootstrap' | 'keepwarm') => {
    if (maintenanceInFlight) {
      rerunRequested = true;
      if (mode === 'bootstrap') {
        rerunRequiresBootstrap = true;
      }
      return;
    }

    const task = async () => {
      if (mode === 'bootstrap') {
        await forwardExtensionLog(chrome, {
          level: 'debug',
          type: 'background.bootstrap_started',
          data: { mode },
        });
        await bootstrap(chrome, fetch, console.log);
        await syncActionBadge(chrome);
        await forwardExtensionLog(chrome, {
          level: 'debug',
          type: 'background.bootstrap_completed',
          data: { mode },
        });
        return;
      }

      await forwardExtensionLog(chrome, {
        level: 'debug',
        type: 'background.keepwarm_started',
      });
      await ensurePairingState(chrome, fetch, console.log);
      await ensureOffscreenDocument(chrome);
      await syncActionBadge(chrome);
      await forwardExtensionLog(chrome, {
        level: 'debug',
        type: 'background.keepwarm_completed',
      });
    };

    const running = task();
    maintenanceInFlight = running;
    withRuntimeErrorLogging(running);

    void running.finally(() => {
      maintenanceInFlight = null;
      if (!rerunRequested) {
        return;
      }

      const nextMode: 'bootstrap' | 'keepwarm' = rerunRequiresBootstrap ? 'bootstrap' : 'keepwarm';
      rerunRequested = false;
      rerunRequiresBootstrap = false;
      runMaintenance(nextMode);
    });
  };

  const requestMaintenance = async (mode: 'bootstrap' | 'keepwarm'): Promise<void> => {
    runMaintenance(mode);
    while (maintenanceInFlight || rerunRequested) {
      const current = maintenanceInFlight;
      if (!current) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 0);
        });
        continue;
      }

      await current.catch(() => undefined);
    }
  };

  runMaintenance('bootstrap');

  chrome.runtime.onInstalled.addListener(() => runMaintenance('bootstrap'));
  chrome.runtime.onStartup.addListener(() => runMaintenance('bootstrap'));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') {
      return;
    }
    if (
      changes.nodeAccessToken ||
      changes.pairingCode ||
      changes.relayConnectionStatus ||
      changes.relayConnectionError ||
      changes.relayUrl
    ) {
      withRuntimeErrorLogging(syncActionBadge(chrome));
    }
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'otto-keepwarm') {
      runMaintenance('keepwarm');
    }
  });

  chrome.runtime.onMessage.addListener((message: Envelope | { type?: string; payload?: unknown }, _sender, sendResponse) => {
    if ((message as { type?: string }).type === 'otto.extensionLog') {
      withRuntimeErrorLogging(
        (async () => {
          const payload = ((message as { payload?: unknown }).payload ?? {}) as Partial<ExtensionLogEntry>;
          if (!payload.type || typeof payload.type !== 'string') {
            sendResponse({ ok: false, error: 'invalid_extension_log_type' });
            return;
          }

          await forwardExtensionLog(chrome, {
            level: payload.level ?? 'debug',
            type: payload.type,
            timestamp: payload.timestamp,
            requestId: payload.requestId,
            traceId: payload.traceId,
            action: payload.action,
            status: payload.status,
            data: payload.data,
          });
          sendResponse({ ok: true });
        })(),
      );
      return true;
    }

    if ((message as { type?: string }).type === 'otto.refreshSetup') {
      withRuntimeErrorLogging(
        (async () => {
          try {
            await requestMaintenance('keepwarm');
            try {
              await chrome.runtime.sendMessage({ type: 'otto.offscreen.reconnect' });
            } catch {
              // Offscreen may not be ready yet; keepwarm will ensure the document exists.
            }
            await forwardExtensionLog(chrome, {
              level: 'debug',
              type: 'background.refresh_setup_completed',
            });
            sendResponse({ ok: true });
          } catch (error) {
            const details = error instanceof Error ? error.message : 'Failed to refresh setup state.';
            sendResponse({ ok: false, error: details });
          }
        })(),
      );
      return true;
    }

    if ((message as { type?: string }).type === 'otto.connectionStatus') {
      withRuntimeErrorLogging(
        (async () => {
          const payload = ((message as { payload?: unknown }).payload ?? {}) as {
            status?: RelayConnectionStatus;
            error?: string;
          };
          const status = payload.status ?? 'idle';
          await chrome.storage.local.set({
            relayConnectionStatus: status,
            relayConnectionUpdatedAt: Date.now(),
          });
            await forwardExtensionLog(chrome, {
              level: status === 'error' ? 'warn' : 'debug',
              type: 'background.connection_status',
              status,
              data: {
                hasError: Boolean(payload.error),
              },
            });
          const error = typeof payload.error === 'string' ? payload.error.trim() : '';
          if (error) {
            await chrome.storage.local.set({ relayConnectionError: error });
          } else {
            await chrome.storage.local.remove(['relayConnectionError']);
          }
          sendResponse({ ok: true });
        })(),
      );
      return true;
    }

    if ((message as { type?: string }).type === 'otto.listenerUpdate') {
      withRuntimeErrorLogging(
        (async () => {
          const payload = ((message as { payload?: unknown }).payload ?? {}) as {
            requestId?: string;
            data?: unknown;
            updateType?: string;
            emittedAt?: string;
          };
          const requestId = typeof payload.requestId === 'string' ? payload.requestId.trim() : '';
          if (!requestId) {
            await forwardExtensionLog(chrome, {
              level: 'warn',
              type: 'listener.update_dropped',
              data: {
                reason: 'missing_request_id',
              },
            });
            sendResponse({ ok: false, error: 'missing_request_id' });
            return;
          }

          if (!activeListenerRequestIds.has(requestId)) {
            await forwardExtensionLog(chrome, {
              level: 'warn',
              type: 'listener.update_dropped',
              requestId,
              data: {
                reason: 'listener_not_active',
                updateType: payload.updateType,
                activeListenerCount: activeListenerRequestIds.size,
              },
            });
            sendResponse({ ok: false, error: 'listener_not_active' });
            return;
          }

          await forwardExtensionLog(chrome, {
            level: 'debug',
            type: 'listener.update_forwarded',
            requestId,
            data: {
              updateType: payload.updateType,
            },
          });

          await chrome.runtime.sendMessage({
            type: 'otto.offscreen.emitListenerUpdate',
            payload: {
              requestId,
              data: payload.data,
              updateType: payload.updateType,
              emittedAt: payload.emittedAt,
            },
          });
          sendResponse({ ok: true });
        })(),
      );
      return true;
    }

    if ((message as { type?: string }).type === 'otto.getConfig') {
      withRuntimeErrorLogging(
        (async () => {
            const nodeId = await ensureNodeId(chrome);
            const relayUrl = await getRelayUrl(chrome);
          const config = await chrome.storage.local.get([
            'nodeAccessToken',
            'nodeRefreshToken',
            'pairingCode',
            'pairingChallengeId',
            'relayConnectionStatus',
            'relayConnectionError',
              'localDevLogStreamingEnabled',
          ]);
          sendResponse({
            nodeId,
            relayUrl,
            accessToken: config.nodeAccessToken,
            refreshToken: config.nodeRefreshToken,
            pairingCode: config.pairingCode,
            pairingChallengeId: config.pairingChallengeId,
            relayConnectionStatus: config.relayConnectionStatus,
            relayConnectionError: config.relayConnectionError,
              localDevLogStreamingEnabled: config.localDevLogStreamingEnabled === true,
          });
        })(),
      );
      return true;
    }

    if ((message as Envelope).messageType === 'command') {
      const cmd = message as Envelope<CommandPayload>;
      withRuntimeErrorLogging(
        (async () => {
          const replayed = await getReplayResponse(chrome.storage.session, cmd);
          if (replayed) {
            sendResponse(replayed);
            return;
          }

          try {
            const result = await executeCommand(chrome, cmd.payload);
            if (cmd.payload.action === 'listener.subscribe') {
              const listener = String(cmd.payload.payload.listener ?? '').trim();
              const resultData = (result.data ?? {}) as Record<string, unknown>;
              const normalizedOptions = (
                resultData.options && typeof resultData.options === 'object'
                  ? resultData.options
                  : {}
              ) as Record<string, unknown>;

              if (listener === 'network.http_intercept') {
                await networkInterceptListenerManager.subscribe(cmd.requestId, normalizedOptions as {
                  tabSessionId: string;
                  site: string;
                  urlPatterns?: string[];
                  requestHostAllowlist?: string[];
                  mode?: 'network' | 'fetch' | 'hybrid';
                  includeBody?: boolean;
                  includeHeaders?: boolean;
                  maxBodyBytes?: number;
                  mimeTypes?: string[];
                });
              } else if (listener === 'reddit.new_chat_messages') {
                await redditChatListenerManager.subscribe(cmd.requestId, normalizedOptions as {
                  tabSessionId?: string;
                  tabId?: number;
                  pollIntervalMs?: number;
                  mode?: 'intercept' | 'poll';
                });
              } else {
                throw new CommandExecutionError(
                  `Unsupported listener: ${listener}`,
                  'unsupported_listener',
                  'listener.subscribe',
                  false,
                );
              }
              activeListenerRequestIds.add(cmd.requestId);
              listenerNameByRequestId.set(cmd.requestId, listener);
              await chrome.runtime.sendMessage({
                type: 'otto.offscreen.emitListenerUpdate',
                payload: {
                  requestId: cmd.requestId,
                  updateType: 'debug.subscribe_ack',
                  emittedAt: new Date().toISOString(),
                  data: {
                    listener,
                  },
                },
              });
            }
            if (cmd.payload.action === 'listener.unsubscribe') {
              const targetRequestId = String(cmd.payload.payload.targetRequestId ?? '').trim();
              if (targetRequestId) {
                const listenerName = listenerNameByRequestId.get(targetRequestId);
                if (listenerName === 'network.http_intercept') {
                  await networkInterceptListenerManager.unsubscribe(targetRequestId);
                } else if (listenerName === 'reddit.new_chat_messages') {
                  await redditChatListenerManager.unsubscribe(targetRequestId);
                } else if (listenerName) {
                  throw new CommandExecutionError(
                    `Unsupported listener for unsubscribe: ${listenerName}`,
                    'unsupported_listener',
                    'listener.unsubscribe',
                    false,
                  );
                }
                activeListenerRequestIds.delete(targetRequestId);
                listenerNameByRequestId.delete(targetRequestId);
              }
            }
            const response = createEnvelope('result', 'node', cmd.requestId, {
              ok: true,
              durationMs: result.durationMs,
              action: cmd.payload.action,
              data: result.data,
            });
            await rememberReplayResponse(chrome.storage.session, cmd, response);
            sendResponse(
              response,
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Command execution failed';
            const code = err instanceof CommandExecutionError ? err.code : 'command_failed';
            const stage = err instanceof CommandExecutionError ? err.stage : 'execution';
            const retryable = err instanceof CommandExecutionError ? err.retryable : true;
            const errorResponse = createEnvelope('error', 'node', cmd.requestId, {
              category: 'execution',
              code,
              message,
              action: cmd.payload.action,
              stage,
              retryable,
              nodeId: await ensureNodeId(chrome),
              tabSessionId: cmd.payload.tabSessionId,
            });
            await rememberReplayResponse(chrome.storage.session, cmd, errorResponse);
            sendResponse(
              errorResponse,
            );
          }
        })(),
      );
      return true;
    }

    if ((message as Envelope).messageType === 'command_cancel') {
      const cancel = message as Envelope<{ targetRequestId?: string; action?: string; nodeId?: string }>;
      sendResponse(
        createEnvelope('event', 'node', cancel.requestId, {
          type: 'cancellation_rejected',
          targetRequestId: cancel.payload.targetRequestId,
          reason: 'in_progress_cancellation_not_supported_in_v1',
        }),
      );
      return true;
    }

    if ((message as Envelope).messageType === 'ping') {
      sendResponse(createEnvelope('pong', 'node', (message as Envelope).requestId ?? nanoid(), { ok: true }));
      return true;
    }

    return false;
  });

  chrome.runtime.onSuspend.addListener(() => {
    withRuntimeErrorLogging(
      Promise.all([
        networkInterceptListenerManager.unsubscribeAll(),
        redditChatListenerManager.unsubscribeAll(),
      ]).then(() => {
        activeListenerRequestIds.clear();
        listenerNameByRequestId.clear();
      }),
    );
  });
});
