#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Command } from 'commander';
import { nanoid } from 'nanoid';
import WebSocket from 'ws';
import { createEnvelope, type CommandPayload, type Envelope } from '@telepat/otto-protocol';
import type { NetworkInterceptListenerOptions, RecipeTestStream } from '@telepat/otto-protocol';
import {
  DEFAULT_CONTROLLER_RELAY_URL,
  deriveHttpUrl,
  loadConfig,
  saveConfig,
  type OttoConfig,
} from './config.js';
import { refreshControllerAccessToken } from './auth-refresh.js';
import { buildRelayStatusReport, renderRelayStatusPretty } from './daemon-status.js';
import { installExtensionArtifact } from './extension-manager.js';
import { resolveTargetNodeId } from './node-resolution.js';
import { readRelayDaemonState, startRelayAttached, startRelayDaemon, stopRelayDaemon } from './relay-daemon.js';
import { ensureRelayDaemonReadyForSetup, shouldReuseCachedInstall, shouldRunSetupNonInteractive } from './setup-logic.js';
import { runCommandTui, runLogsFollowTui, runSettingsTui, runSetupPromptTui, showTerminalErrorAlert } from './tui.js';
import {
  formatLogEntryHuman,
  formatLogEntryJson,
  parseLatestOption,
  parseLogLevelOption,
  parseLogSourceOption,
  type LogEntry,
  type LogSource,
} from './logs-options.js';
import { resolveRecipeAutoOpenUrl } from './recipe-open-url.js';
import { shouldAttemptAccessTokenRefreshOnAuthError } from './auth-retry.js';
import {
  CLIENT_SECRET_ENV_VAR,
  deleteClientSecret,
  resolveClientSecret,
  storeClientSecret,
} from './client-secret-store.js';

type RecipeDescriptorLike = {
  site?: string;
  id?: string;
  preloadHost?: string;
};

type RecipeTestInfo = {
  openUrl: string;
};

type ControllerRegisterResponse = {
  clientId: string;
  name: string;
  description: string;
  avatarSeed?: string;
  clientSecret: string;
  createdAt: number;
};

type ControllerTokenResponse = {
  clientId: string;
  controllerId: string;
  scopes: string[];
  accessToken: string;
  refreshToken: string;
};

type ControllerRemoveResponse = {
  ok: boolean;
  clientId: string;
  revokedAt: number;
  aclRevokedCount: number;
  refreshRevokedCount: number;
  disconnectedSessions: number;
  alreadyRevoked?: boolean;
};

type ControllerRemoveAllResponse = {
  ok: boolean;
  removedClientIds: string[];
  removedCount: number;
  alreadyRevokedCount: number;
  aclRevokedCount: number;
  refreshRevokedCount: number;
  disconnectedSessions: number;
};

type RelayAuthErrorPayload = {
  category?: string;
  code?: string;
  message?: string;
  actionableHint?: string;
  clientId?: string;
  nodeId?: string;
};

type ControllerRegistrationMetadata = {
  name: string;
  description: string;
  avatarSeed?: string;
};

class RelayAuthError extends Error {
  payload?: RelayAuthErrorPayload;

  constructor(message: string, payload?: RelayAuthErrorPayload) {
    super(message);
    this.name = 'RelayAuthError';
    this.payload = payload;
  }
}

async function requestJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

export async function openControllerSocket(config: OttoConfig): Promise<WebSocket> {
  let resolvedConfig = config;
  let accessToken = resolvedConfig.controllerAccessToken;

  if (!accessToken) {
    const refreshed = await refreshControllerAccessToken(resolvedConfig);
    if (refreshed) {
      accessToken = refreshed.accessToken;
      resolvedConfig = {
        ...resolvedConfig,
        relayHttpUrl: resolvedConfig.relayHttpUrl ?? deriveHttpUrl(resolvedConfig.relayUrl),
        controllerAccessToken: refreshed.accessToken,
        controllerRefreshToken: refreshed.refreshToken ?? resolvedConfig.controllerRefreshToken,
      };
      saveConfig(resolvedConfig);
    }
  }

  if (!accessToken) {
    throw new Error('Missing controllerAccessToken. Run `otto client login` (or `otto pair <code>` for legacy pairing flow).');
  }

  const authWithToken = async (token: string): Promise<WebSocket> => {
    console.error('[otto:cli][debug] opening controller websocket connection');
    const ws = new WebSocket(resolvedConfig.relayUrl);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    ws.send(
      JSON.stringify(
        createEnvelope('hello', 'controller', nanoid(), {
          role: 'controller',
          capabilities: ['commands', 'logs'],
        }),
      ),
    );

    ws.send(
      JSON.stringify(
        createEnvelope('auth', 'controller', nanoid(), {
          accessToken: token,
        }),
      ),
    );

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Timed out waiting for auth_ack'));
      }, 5000);
      ws.on('message', (data) => {
        const msg = JSON.parse(String(data)) as Envelope;
        if (msg.messageType === 'auth_ack') {
          console.error('[otto:cli][debug] relay auth acknowledged for controller session');
          clearTimeout(timeout);
          resolve();
        }
        if (msg.messageType === 'error') {
          clearTimeout(timeout);
          ws.close();
          const payload = (msg.payload && typeof msg.payload === 'object')
            ? msg.payload as RelayAuthErrorPayload
            : undefined;
          reject(new RelayAuthError(`Auth failed: ${JSON.stringify(msg.payload)}`, payload));
        }
      });
    });

    return ws;
  };

  try {
    return await authWithToken(accessToken);
  } catch (error) {
    const authError = error instanceof RelayAuthError ? error : null;
    if (!shouldAttemptAccessTokenRefreshOnAuthError(error, authError?.payload)) {
      throw error;
    }

    const refreshed = await refreshControllerAccessToken(resolvedConfig);
    if (!refreshed) {
      throw error;
    }

    console.error('[otto:cli][debug] access token refreshed after invalid_access_token; retrying websocket auth');

    const updatedConfig: OttoConfig = {
      ...resolvedConfig,
      relayHttpUrl: resolvedConfig.relayHttpUrl ?? deriveHttpUrl(resolvedConfig.relayUrl),
      controllerAccessToken: refreshed.accessToken,
      controllerRefreshToken: refreshed.refreshToken ?? resolvedConfig.controllerRefreshToken,
    };
    saveConfig(updatedConfig);
    return authWithToken(refreshed.accessToken);
  }
}

function parseJsonObject(value: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function isJsonOutput(config: OttoConfig): boolean {
  return config.outputFormat === 'json';
}

function logJsonAware(config: OttoConfig, value: unknown): void {
  if (isJsonOutput(config)) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (typeof value === 'string') {
    console.log(value);
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

function parseMaybeNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Value must be a positive number');
  }
  return parsed;
}

function parsePositiveNumberOption(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return parsed;
}

function parseNetworkMode(value: unknown): 'network' | 'fetch' | 'hybrid' {
  const mode = String(value ?? 'network').trim() as 'network' | 'fetch' | 'hybrid';
  if (!['network', 'fetch', 'hybrid'].includes(mode)) {
    throw new Error('--mode must be one of network|fetch|hybrid');
  }
  return mode;
}

function collectString(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseSetupStrategy(value: unknown): 'auto' | 'download' | 'build' {
  const strategy = String(value ?? 'auto') as 'auto' | 'download' | 'build';
  if (!['auto', 'download', 'build'].includes(strategy)) {
    throw new Error('--strategy must be one of auto|download|build');
  }
  return strategy;
}

function normalizeControllerName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 120);
}

function normalizeControllerDescription(value: string): string {
  return value.trim().slice(0, 500);
}

async function promptControllerMetadata(
  defaults: { name?: string; description?: string } = {},
): Promise<ControllerRegistrationMetadata> {
  const rl = createInterface({ input, output });
  try {
    const nameAnswer = await rl.question(`Controller name${defaults.name ? ` [${defaults.name}]` : ''}: `);
    const descriptionAnswer = await rl.question(
      `Controller description${defaults.description ? ` [${defaults.description}]` : ''}: `,
    );

    const name = normalizeControllerName(nameAnswer || defaults.name || '');
    const description = normalizeControllerDescription(descriptionAnswer || defaults.description || '');
    if (!name || !description) {
      throw new Error('Controller registration requires both name and description.');
    }

    return { name, description };
  } finally {
    rl.close();
  }
}

async function resolveControllerRegistrationMetadata(opts: {
  name?: string;
  description?: string;
  avatarSeed?: string;
}, defaults: { name?: string; description?: string } = {}, options: {
  promptIfMissing?: boolean;
} = {}): Promise<ControllerRegistrationMetadata> {
  const flagName = typeof opts.name === 'string' ? normalizeControllerName(opts.name) : '';
  const flagDescription = typeof opts.description === 'string' ? normalizeControllerDescription(opts.description) : '';
  const defaultName = normalizeControllerName(defaults.name ?? '');
  const defaultDescription = normalizeControllerDescription(defaults.description ?? '');
  const avatarSeed = typeof opts.avatarSeed === 'string' && opts.avatarSeed.trim().length > 0
    ? opts.avatarSeed.trim().slice(0, 64)
    : undefined;
  const promptIfMissing = options.promptIfMissing !== false;

  const resolvedName = flagName || defaultName;
  const resolvedDescription = flagDescription || defaultDescription;

  if (resolvedName && resolvedDescription && !promptIfMissing) {
    return {
      name: resolvedName,
      description: resolvedDescription,
      avatarSeed,
    };
  }

  if (flagName && flagDescription) {
    return { name: flagName, description: flagDescription, avatarSeed };
  }

  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    throw new Error('Non-interactive registration requires --name and --description.');
  }

  const prompted = await promptControllerMetadata({
    name: flagName || defaults.name,
    description: flagDescription || defaults.description,
  });
  return {
    ...prompted,
    avatarSeed,
  };
}

function showAclMissingGrantHint(errorPayload: {
  code?: string;
  nodeId?: string;
  clientId?: string;
  actionableHint?: string;
}): void {
  if (errorPayload.code !== 'acl_missing_node_grant' && errorPayload.code !== 'forbidden_node_access') {
    return;
  }

  const nodeSuffix = errorPayload.nodeId ? ` for node ${errorPayload.nodeId}` : '';
  const clientSuffix = errorPayload.clientId ? ` (client ${errorPayload.clientId})` : '';
  console.error(`[otto] controller access is not granted${nodeSuffix}${clientSuffix}.`);
  console.error(
    `[otto] ${errorPayload.actionableHint ?? 'Approve this controller in extension popup/options -> Controller Access.'}`,
  );
}

async function showTestFailureFooterAlert(errorPayload?: {
  message?: string;
  code?: string;
  action?: string;
}, title = 'otto test failed'): Promise<void> {
  const detailParts: string[] = [];
  if (typeof errorPayload?.code === 'string' && errorPayload.code.length > 0) {
    detailParts.push(`code=${errorPayload.code}`);
  }
  if (typeof errorPayload?.action === 'string' && errorPayload.action.length > 0) {
    detailParts.push(`action=${errorPayload.action}`);
  }

  const summary = typeof errorPayload?.message === 'string' && errorPayload.message.trim().length > 0
    ? errorPayload.message.trim()
    : (detailParts.length > 0 ? detailParts.join(' ') : 'Check the terminal response payload above for details.');

  await showTerminalErrorAlert(title, summary);
}

async function maybeSelfRegisterControllerForTest(
  config: OttoConfig,
  opts: { controllerName?: string; controllerDescription?: string; controllerAvatarSeed?: string },
): Promise<{ config: OttoConfig; autoRegisteredClientId?: string }> {
  const hasIdentity = Boolean(config.controllerClientId)
    || Boolean(config.controllerAccessToken)
    || Boolean(config.controllerRefreshToken);
  if (hasIdentity) {
    return { config };
  }

  const registration = await resolveControllerRegistrationMetadata(
    {
      name: opts.controllerName,
      description: opts.controllerDescription,
      avatarSeed: opts.controllerAvatarSeed,
    },
    {
      name: config.controllerName ?? 'otto-tester',
      description: config.controllerDescription ?? 'Auto-registered controller for otto test flows.',
    },
    { promptIfMissing: false },
  );

  const base = getRelayHttpBase(config);
  const registered = (await requestJson(`${base}/api/controller/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(registration),
  })) as ControllerRegisterResponse;
  const secretStored = await storeClientSecret(config, registered.clientId, registered.clientSecret);

  const tokenResult = (await requestJson(`${base}/api/controller/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      clientId: registered.clientId,
      clientSecret: registered.clientSecret,
    }),
  })) as ControllerTokenResponse;

  const nextConfig: OttoConfig = {
    ...config,
    relayHttpUrl: base,
    controllerClientId: tokenResult.clientId,
    controllerName: registered.name,
    controllerDescription: registered.description,
    controllerAccessToken: tokenResult.accessToken,
    controllerRefreshToken: tokenResult.refreshToken,
  };
  saveConfig(nextConfig);

  console.error(`[otto] auto-registered controller ${registered.clientId} (${registered.name}) for test flow`);
  if (!secretStored) {
    console.error(`[otto] keychain unavailable; set ${CLIENT_SECRET_ENV_VAR} for future non-interactive logins.`);
  }

  return {
    config: nextConfig,
    autoRegisteredClientId: registered.clientId,
  };
}

async function removeControllerClientAtRelay(config: OttoConfig, clientId: string): Promise<void> {
  try {
    await requestJson(`${getRelayHttpBase(config)}/api/controller/remove`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId }),
    });
  } catch (error) {
    const message = String(error instanceof Error ? error.message : error);
    if (message.includes('"client_not_found"')) {
      return;
    }
    throw error;
  }
}

function normalizeControllerRelayUrl(urlValue: string): string {
  const parsed = new URL(urlValue.trim());
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error('relayUrl must use ws:// or wss://');
  }
  if (parsed.searchParams.get('role') !== 'controller') {
    parsed.searchParams.set('role', 'controller');
  }
  return parsed.toString();
}

function getRelayHttpBase(config: OttoConfig): string {
  return config.relayHttpUrl ?? deriveHttpUrl(config.relayUrl);
}

async function runCommandOnce(
  config: OttoConfig,
  targetNodeId: string,
  opts: { action: string; tabSession?: string; payload: Record<string, unknown>; timeoutMs?: number },
): Promise<Envelope> {
  const ws = await openControllerSocket(config);
  try {
    return await runCommandWithSocket(ws, targetNodeId, opts);
  } finally {
    ws.close();
  }
}

async function runCommandWithSocket(
  ws: WebSocket,
  targetNodeId: string,
  opts: { action: string; tabSession?: string; payload: Record<string, unknown>; timeoutMs?: number },
): Promise<Envelope> {
  const requestId = nanoid();
  const timeoutMs = Math.max(1000, Number(opts.timeoutMs ?? 30_000));

  const commandPayload: CommandPayload = {
    targetNodeId,
    tabSessionId: opts.tabSession,
    action: opts.action,
    payload: opts.payload,
    idempotencyKey: nanoid(),
    replayNonce: nanoid(),
    timeoutMs,
    waitPolicy: 'fail_fast',
  };

  return new Promise<Envelope>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for terminal response (${timeoutMs + 5000}ms)`));
    }, timeoutMs + 5000);

    const onMessage = (data: WebSocket.RawData) => {
      const msg = JSON.parse(String(data)) as Envelope;
      if (msg.requestId !== requestId) {
        return;
      }

      if (msg.messageType !== 'result' && msg.messageType !== 'error') {
        return;
      }

      clearTimeout(timeout);
      ws.off('message', onMessage);
      resolve(msg);
    };

    ws.on('message', onMessage);
    ws.send(JSON.stringify(createEnvelope('command', 'controller', requestId, commandPayload)));
  });
}

async function resolveTestInfo(
  config: OttoConfig,
  targetNodeId: string,
  site: string,
  recipe: string,
  timeoutMs: number,
  ws?: WebSocket,
): Promise<RecipeTestInfo> {
  const fallback = site.startsWith('http://') || site.startsWith('https://') ? site : `https://${site}`;

  try {
    const response = ws
      ? await runCommandWithSocket(ws, targetNodeId, {
        action: 'recipe.list',
        payload: {},
        timeoutMs,
      })
      : await runCommandOnce(config, targetNodeId, {
      action: 'recipe.list',
      payload: {},
      timeoutMs,
    });

    if (response.messageType === 'error') {
      return {
        openUrl: fallback,
      };
    }

    const payload = response.payload as {
      data?: {
        recipes?: RecipeDescriptorLike[];
      };
    };

    const descriptors = payload.data?.recipes ?? [];
    return {
      openUrl: resolveRecipeAutoOpenUrl(site, recipe, descriptors),
    };
  } catch {
    return {
      openUrl: fallback,
    };
  }
}

async function followLogsOnce(config: OttoConfig, source: LogSource | undefined, jsonOutput: boolean): Promise<void> {
  const ws = await openControllerSocket(config);
  const requestId = nanoid();
  console.error(`[otto:cli][debug] subscribing to logs stream source=${source ?? 'all'}`);
  ws.send(
    JSON.stringify(
      createEnvelope('event', 'controller', requestId, {
        type: 'logs_subscribe',
        source,
      }),
    ),
  );

  ws.on('message', (data) => {
    const msg = JSON.parse(String(data)) as Envelope;
    if (msg.messageType === 'event') {
      const payload = msg.payload as { type?: string; entry?: unknown };
      if (payload.type === 'log') {
        const entry = (payload.entry ?? {}) as LogEntry;
        const line = jsonOutput ? formatLogEntryJson(entry) : formatLogEntryHuman(entry);
        console.log(line);
      }
    }
  });

  console.log('[otto] following logs, press Ctrl+C to stop');
}

async function subscribeListenerAndFollow(
  ws: WebSocket,
  targetNodeId: string,
  recipeTestRequestId: string,
  listener: string,
  options: Record<string, unknown>,
  timeoutMs: number,
): Promise<void> {
  const subscribeRequestId = nanoid();
  let cleanedUp = false;
  let cancellationRequested = false;

  const unsubscribeFallback = async (): Promise<void> => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    const unsubscribeRequestId = nanoid();
    const unsubscribePayload: CommandPayload = {
      targetNodeId,
      action: 'listener.unsubscribe',
      payload: {
        targetRequestId: subscribeRequestId,
      },
      idempotencyKey: nanoid(),
      replayNonce: nanoid(),
      timeoutMs,
      waitPolicy: 'fail_fast',
    };

    ws.send(JSON.stringify(createEnvelope('command', 'controller', unsubscribeRequestId, unsubscribePayload)));
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1000);
      const handler = (data: WebSocket.RawData) => {
        const msg = JSON.parse(String(data)) as Envelope;
        if (msg.requestId !== unsubscribeRequestId) {
          return;
        }
        if (msg.messageType !== 'result' && msg.messageType !== 'error') {
          return;
        }
        clearTimeout(timer);
        ws.off('message', handler);
        resolve();
      };
      ws.on('message', handler);
    });
  };

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for subscribe response (${timeoutMs + 2000}ms)`));
    }, timeoutMs + 2000);

    const handler = (data: WebSocket.RawData) => {
      const msg = JSON.parse(String(data)) as Envelope;
      if (msg.requestId !== subscribeRequestId) {
        return;
      }

      if (msg.messageType === 'error') {
        clearTimeout(timer);
        ws.off('message', handler);
        const errorPayload = (msg.payload ?? {}) as {
          code?: string;
          action?: string;
          message?: string;
        };
        if (errorPayload.code === 'forbidden_action' && errorPayload.action === 'listener.subscribe') {
          reject(
            new Error(
              `${errorPayload.message ?? 'listener.subscribe forbidden'}; controller token likely lacks listener.subscribe scope. Re-auth controller (otto client login or re-pair) to mint a token with listener scopes.`,
            ),
          );
          return;
        }

        reject(new Error(`listener.subscribe failed: ${JSON.stringify(msg.payload)}`));
        return;
      }

      if (msg.messageType === 'result') {
        clearTimeout(timer);
        ws.off('message', handler);
        console.log(JSON.stringify(msg, null, 2));
        resolve();
      }
    };

    const commandPayload: CommandPayload = {
      targetNodeId,
      tabSessionId: typeof options.tabSessionId === 'string' ? options.tabSessionId : undefined,
      action: 'listener.subscribe',
      payload: {
        listener,
        options,
      },
      idempotencyKey: nanoid(),
      replayNonce: nanoid(),
      timeoutMs,
      waitPolicy: 'fail_fast',
    };

    ws.on('message', handler);
    ws.send(JSON.stringify(createEnvelope('command', 'controller', subscribeRequestId, commandPayload)));
  });

  console.error(`[otto] following ${listener} updates, press Ctrl+C to stop`);

  await new Promise<void>((resolve, reject) => {
    const handleSigint = () => {
      if (cancellationRequested) {
        return;
      }
      cancellationRequested = true;

      ws.send(JSON.stringify(createEnvelope('command_cancel', 'controller', nanoid(), {
        targetRequestId: recipeTestRequestId,
      })));
    };

    const handleClose = () => {
      process.removeListener('SIGINT', handleSigint);
      reject(new Error('stream connection closed before terminal outcome'));
    };

    const handleMessage = (data: WebSocket.RawData) => {
      const msg = JSON.parse(String(data)) as Envelope;

      if (msg.messageType === 'event') {
        const payload = (msg.payload ?? {}) as { type?: string };
        if (msg.requestId === recipeTestRequestId && payload.type === 'listener_update') {
          console.log(JSON.stringify(msg, null, 2));
          return;
        }
        return;
      }

      if ((msg.messageType === 'result' || msg.messageType === 'error') && msg.requestId === recipeTestRequestId) {
        console.log(JSON.stringify(msg, null, 2));
        process.removeListener('SIGINT', handleSigint);
        ws.off('message', handleMessage);
        ws.off('close', handleClose);
        void unsubscribeFallback().finally(() => {
          resolve();
        });
      }
    };

    process.once('SIGINT', handleSigint);
    ws.on('close', handleClose);
    ws.on('message', handleMessage);
  });
}

async function subscribeNetworkListenerAndFollow(
  config: OttoConfig,
  targetNodeId: string,
  options: NetworkInterceptListenerOptions,
  timeoutMs: number,
): Promise<void> {
  const ws = await openControllerSocket(config);
  const subscribeRequestId = nanoid();
  let unsubscribed = false;
  const handleSigint = () => {
    void cleanup().then(() => process.exit(0));
  };

  const commandPayload: CommandPayload = {
    targetNodeId,
    tabSessionId: options.tabSessionId,
    action: 'listener.subscribe',
    payload: {
      listener: 'network.http_intercept',
      options,
    },
    idempotencyKey: nanoid(),
    replayNonce: nanoid(),
    timeoutMs,
    waitPolicy: 'fail_fast',
  };

  const cleanup = async (): Promise<void> => {
    if (unsubscribed) {
      return;
    }

    unsubscribed = true;
    const unsubscribeRequestId = nanoid();
    const unsubscribePayload: CommandPayload = {
      targetNodeId,
      action: 'listener.unsubscribe',
      payload: {
        targetRequestId: subscribeRequestId,
      },
      idempotencyKey: nanoid(),
      replayNonce: nanoid(),
      timeoutMs,
      waitPolicy: 'fail_fast',
    };

    ws.send(JSON.stringify(createEnvelope('command', 'controller', unsubscribeRequestId, unsubscribePayload)));
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1000);
      const handler = (data: WebSocket.RawData) => {
        const msg = JSON.parse(String(data)) as Envelope;
        if (msg.requestId !== unsubscribeRequestId) {
          return;
        }
        if (msg.messageType !== 'result' && msg.messageType !== 'error') {
          return;
        }
        clearTimeout(timer);
        ws.off('message', handler);
        resolve();
      };
      ws.on('message', handler);
    });
    ws.close();
  };

  process.once('SIGINT', handleSigint);

  try {
    await new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for subscribe response (${timeoutMs + 2000}ms)`));
      }, timeoutMs + 2000);

      const handler = (data: WebSocket.RawData) => {
        const msg = JSON.parse(String(data)) as Envelope;
        if (msg.requestId !== subscribeRequestId) {
          return;
        }

        if (msg.messageType === 'error') {
          clearTimeout(timer);
          ws.off('message', handler);
          reject(new Error(`listener.subscribe failed: ${JSON.stringify(msg.payload)}`));
          return;
        }

        if (msg.messageType === 'result') {
          clearTimeout(timer);
          ws.off('message', handler);
          console.log(JSON.stringify(msg, null, 2));
          resolve(true);
        }
      };

      ws.on('message', handler);
      ws.send(JSON.stringify(createEnvelope('command', 'controller', subscribeRequestId, commandPayload)));
    });
  } catch (error) {
    process.removeListener('SIGINT', handleSigint);
    ws.close();
    throw error;
  }

  console.error('[otto] following network listener updates, press Ctrl+C to stop');
  ws.on('message', (data) => {
    const msg = JSON.parse(String(data)) as Envelope;
    if (msg.messageType !== 'event') {
      return;
    }
    if (msg.requestId !== subscribeRequestId) {
      return;
    }
    const payload = (msg.payload ?? {}) as { type?: string; data?: unknown };
    if (payload.type !== 'listener_update') {
      return;
    }
    console.log(JSON.stringify(msg, null, 2));
  });
}

const program = new Command();
program.name('otto').description('Otto CLI').version('0.1.0');

program
  .command('start')
  .description('Start relay (daemon by default, or attached for development)')
  .option('-a, --attached', 'Run attached in foreground and stream logs to current terminal', false)
  .option('--port <port>', 'Relay port', '8787')
  .action(async (opts) => {
    const port = Number(opts.port);
    if (!Number.isFinite(port) || port <= 0) {
      throw new Error('--port must be a positive number');
    }

    if (opts.attached) {
      const existing = readRelayDaemonState();
      if (existing) {
        console.error(`[otto] relay daemon already running (pid ${existing.pid}). Stop it first with \`otto stop\`.`);
        process.exit(1);
      }

      const proc = startRelayAttached(port);
      proc.on('exit', (code) => process.exit(code ?? 0));
      return;
    }

    const existing = readRelayDaemonState();
    if (existing) {
      console.log(`[otto] relay already running (pid ${existing.pid})`);
      console.log(`[otto] logs: ${existing.logPath}`);
      return;
    }

    const state = startRelayDaemon(port);
    console.log(`[otto] relay started in daemon mode (pid ${state.pid})`);
    console.log(`[otto] logs: ${state.logPath}`);
    console.log('[otto] stop with: otto stop');
  });

program
  .command('stop')
  .description('Stop relay daemon if it is running')
  .action(async () => {
    const result = await stopRelayDaemon();
    if (!result.stopped || !result.state) {
      console.log('[otto] relay already stopped');
      return;
    }

    console.log(`[otto] relay stopped (pid ${result.state.pid})`);
  });

program
  .command('status')
  .description('Show relay daemon status')
  .action(async () => {
    const config = loadConfig();
    const report = buildRelayStatusReport(readRelayDaemonState());

    if (isJsonOutput(config)) {
      logJsonAware(config, report);
    } else {
      console.log(renderRelayStatusPretty(report));
    }
  });

program
  .command('relay:start')
  .description('Start relay in attached foreground mode (legacy alias)')
  .option('--port <port>', 'Relay port', '8787')
  .action((opts) => {
    const port = Number(opts.port);
    if (!Number.isFinite(port) || port <= 0) {
      throw new Error('--port must be a positive number');
    }

    const proc = startRelayAttached(port);
    proc.on('exit', (code) => process.exit(code ?? 0));
  });

program
  .command('config')
  .description('Configure relay and defaults')
  .requiredOption('--relay-url <url>', 'Relay websocket URL')
  .option('--relay-http-url <url>', 'Relay HTTP base URL')
  .option('--node-id <id>', 'Default target node ID')
  .action((opts) => {
    const previous = loadConfig();
    const relayUrl = normalizeControllerRelayUrl(String(opts.relayUrl));
    const relayHttpUrl = opts.relayHttpUrl ?? deriveHttpUrl(relayUrl);
    saveConfig({
      ...previous,
      relayUrl,
      relayHttpUrl,
      targetNodeId: opts.nodeId,
    });
    console.log('[otto] config saved');
  });

program
  .command('setup')
  .description('Guided controller setup including relay daemon readiness, extension acquisition, and Chrome handoff instructions')
  .option('--relay-url <url>', 'Controller relay websocket URL')
  .option('--strategy <strategy>', 'auto|download|build')
  .option('--yes', 'Accept defaults without interactive confirmation', false)
  .option('--force', 'Reinstall extension artifact even if local cached version is present', false)
  .option('--output-dir <path>', 'Directory for downloaded extension artifacts')
  .option('--release-base-url <url>', 'Release base URL for extension downloads')
  .option('--repo-path <path>', 'Local repo path used for --strategy build')
  .option('--download-timeout-ms <ms>', 'Download timeout in milliseconds')
  .option('--non-interactive', 'Skip interactive prompts and emit deterministic output', false)
  .action(async (opts) => {
    const config = loadConfig();
    const cliVersion = program.version() ?? '0.1.0';
    const interactiveAllowed = process.stdout.isTTY && process.stdin.isTTY;
    const explicitNonInteractive = Boolean(opts.nonInteractive);
    const nonInteractive = shouldRunSetupNonInteractive(interactiveAllowed, explicitNonInteractive);

    const defaults = {
      relayUrl: normalizeControllerRelayUrl(opts.relayUrl ?? config.relayUrl ?? DEFAULT_CONTROLLER_RELAY_URL),
      strategy: parseSetupStrategy(opts.strategy ?? config.setupStrategyDefault ?? 'auto'),
      repoPath: opts.repoPath as string | undefined,
    };

    const resolved = (!nonInteractive && !opts.yes)
      ? await runSetupPromptTui(defaults)
      : defaults;

    if (!resolved) {
      console.log('[otto] setup cancelled');
      return;
    }

    const relayUrl = normalizeControllerRelayUrl(resolved.relayUrl);
    const relayHttpUrl = deriveHttpUrl(relayUrl);
    const timeoutMs = parseMaybeNumber(opts.downloadTimeoutMs, config.downloadTimeoutMs ?? 25_000);
    const strategy = resolved.strategy;
    const relayDaemon = ensureRelayDaemonReadyForSetup(relayUrl, readRelayDaemonState, startRelayDaemon);

    const cachedUnpackedPath = config.extension?.unpackedPath;
    const canReuseCachedInstall = shouldReuseCachedInstall(config, cliVersion, Boolean(opts.force), existsSync);

    const install = canReuseCachedInstall
      ? {
          source: config.extension?.source ?? 'download',
          version: cliVersion,
          zipPath: config.extension?.zipPath,
          unpackedPath: cachedUnpackedPath as string,
          checksumSha256: config.extension?.checksumSha256,
          releaseBaseUrl: config.extension?.releaseBaseUrl,
        }
      : await installExtensionArtifact({
          strategy,
          version: cliVersion,
          outputDir: opts.outputDir,
          releaseBaseUrl: opts.releaseBaseUrl,
          timeoutMs,
          repoPath: resolved.repoPath,
        });

    const nextConfig: OttoConfig = {
      ...config,
      relayUrl,
      relayHttpUrl,
      downloadTimeoutMs: timeoutMs,
      extension: {
        version: install.version,
        source: install.source,
        zipPath: install.zipPath,
        unpackedPath: install.unpackedPath,
        checksumSha256: install.checksumSha256,
        installedAt: new Date().toISOString(),
        releaseBaseUrl: install.releaseBaseUrl,
      },
    };
    saveConfig(nextConfig);

    const summary = {
      relayUrl,
      relayHttpUrl,
      relayDaemon: {
        status: relayDaemon.status,
        ...relayDaemon.state,
      },
      extension: nextConfig.extension,
      pairingReady: Boolean(nextConfig.controllerAccessToken),
      nextSteps: nextConfig.controllerAccessToken
        ? ['Open extension popup to confirm node status', 'otto recipes list', 'otto test reddit.com getFeed']
        : [
            'Open extension popup and confirm pairing code is visible',
            'otto authcode',
            'otto pair <code>',
            'Re-open extension popup and confirm status = Connected',
            'otto recipes list',
          ],
    };

    if (nonInteractive) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    console.log('[otto] setup complete');
    if (relayDaemon.status === 'started') {
      console.log(`[otto] relay daemon started (pid ${relayDaemon.state.pid})`);
    } else {
      console.log(`[otto] relay daemon already running (pid ${relayDaemon.state.pid})`);
    }
    console.log(`[otto] relay daemon logs: ${relayDaemon.state.logPath}`);
    if (canReuseCachedInstall) {
      console.log('[otto] reused existing local extension artifact cache');
    }
    console.log(`[otto] relay URL: ${relayUrl}`);
    console.log(`[otto] extension source: ${install.source}`);
    if (install.zipPath) {
      console.log(`[otto] extension zip: ${install.zipPath}`);
    }
    console.log(`[otto] extension folder (load unpacked): ${install.unpackedPath}`);
    console.log('[otto] Chrome install steps:');
    console.log('  1) Open chrome://extensions');
    console.log('  2) Enable Developer mode');
    console.log(`  3) Click Load unpacked and select: ${install.unpackedPath}`);
    console.log('  4) Click the Otto toolbar icon to open node setup popup');
    console.log('  5) Verify relay URL and wait for pairing code in popup status');
    if (!nextConfig.controllerAccessToken) {
      console.log('[otto] pairing required next: otto authcode && otto pair <code>');
      console.log('[otto] after pairing: open popup again and confirm status shows Connected');
    }
  });

const extension = program.command('extension').description('Manage extension artifact installation for setup');

extension
  .command('get')
  .description('Download or build an extension artifact and cache it locally')
  .option('--strategy <strategy>', 'auto|download|build', 'auto')
  .option('--output-dir <path>', 'Directory for downloaded extension artifacts')
  .option('--release-base-url <url>', 'Release base URL for extension downloads')
  .option('--repo-path <path>', 'Local repo path used for --strategy build')
  .option('--download-timeout-ms <ms>', 'Download timeout in milliseconds')
  .action(async (opts) => {
    const config = loadConfig();
    const cliVersion = program.version() ?? '0.1.0';
    const strategy = parseSetupStrategy(opts.strategy);

    const install = await installExtensionArtifact({
      strategy,
      version: cliVersion,
      outputDir: opts.outputDir,
      releaseBaseUrl: opts.releaseBaseUrl,
      timeoutMs: parseMaybeNumber(opts.downloadTimeoutMs, config.downloadTimeoutMs ?? 25_000),
      repoPath: opts.repoPath,
    });

    const nextConfig: OttoConfig = {
      ...config,
      extension: {
        version: install.version,
        source: install.source,
        zipPath: install.zipPath,
        unpackedPath: install.unpackedPath,
        checksumSha256: install.checksumSha256,
        installedAt: new Date().toISOString(),
        releaseBaseUrl: install.releaseBaseUrl,
      },
    };
    saveConfig(nextConfig);

    logJsonAware(nextConfig, {
      ok: true,
      extension: nextConfig.extension,
    });
  });

extension
  .command('info')
  .description('Show installed extension artifact metadata from local config')
  .action(() => {
    const config = loadConfig();
    logJsonAware(config, {
      extension: config.extension ?? null,
      relayUrl: config.relayUrl,
      relayHttpUrl: config.relayHttpUrl ?? deriveHttpUrl(config.relayUrl),
    });
  });

program
  .command('settings')
  .description('Edit controller-global settings stored in ~/.otto/config.json')
  .action(async () => {
    const config = loadConfig();
    if (!process.stdout.isTTY || !process.stdin.isTTY) {
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    const updated = await runSettingsTui(config);
    saveConfig(updated);
    console.log('[otto] settings saved');
  });

const client = program.command('client').description('Manage independently registered controller clients');

client
  .command('register')
  .description('Register a new controller client and store secret securely when keychain is available')
  .option('--name <name>', 'Human-readable controller name (required in non-interactive mode)')
  .option('--description <description>', 'Controller description (required in non-interactive mode)')
  .option('--avatar-seed <seed>', 'Optional deterministic avatar seed value')
  .action(async (opts) => {
    const config = loadConfig();
    const base = getRelayHttpBase(config);
    const payload = await resolveControllerRegistrationMetadata(opts, {
      name: config.controllerName,
      description: config.controllerDescription,
    });

    const result = (await requestJson(`${base}/api/controller/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })) as ControllerRegisterResponse;

    const storedInKeychain = await storeClientSecret(config, result.clientId, result.clientSecret);

    saveConfig({
      ...config,
      relayHttpUrl: base,
      controllerClientId: result.clientId,
      controllerName: result.name,
      controllerDescription: result.description,
    });

    if (isJsonOutput(config)) {
      logJsonAware(config, {
        clientId: result.clientId,
        name: result.name,
        description: result.description,
        createdAt: result.createdAt,
        secretStoredIn: storedInKeychain ? 'keychain' : 'env',
        clientSecret: storedInKeychain ? undefined : result.clientSecret,
      });
      return;
    }

    console.log(`[otto] registered client ${result.clientId} (${result.name})`);
    if (storedInKeychain) {
      console.log('[otto] client secret stored in OS keychain');
      return;
    }

    console.log('[otto] keychain unavailable, secret was not stored automatically');
    console.log(`[otto] export ${CLIENT_SECRET_ENV_VAR}='${result.clientSecret}'`);
  });

client
  .command('login')
  .description('Exchange controller client credentials for access/refresh tokens and save local auth')
  .option('--client-id <id>', 'Controller client id (defaults to configured client id)')
  .option('--client-secret <secret>', `Client secret (if omitted, resolve from ${CLIENT_SECRET_ENV_VAR} or keychain)`)
  .option('--remember-secret', 'Store --client-secret in keychain when available', false)
  .action(async (opts) => {
    const config = loadConfig();
    const base = getRelayHttpBase(config);
    const clientId = String(opts.clientId ?? config.controllerClientId ?? '').trim();
    if (!clientId) {
      throw new Error('Missing client id. Pass --client-id or run otto client register first.');
    }

    let clientSecret: string;
    let secretSource: 'flag' | 'env' | 'keychain';
    if (typeof opts.clientSecret === 'string' && opts.clientSecret.trim().length > 0) {
      clientSecret = opts.clientSecret.trim();
      secretSource = 'flag';
    } else {
      const resolved = await resolveClientSecret(config, clientId);
      clientSecret = resolved.secret;
      secretSource = resolved.source;
    }

    const result = (await requestJson(`${base}/api/controller/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret }),
    })) as ControllerTokenResponse;

    if (opts.rememberSecret && secretSource === 'flag') {
      await storeClientSecret(config, clientId, clientSecret);
    }

    saveConfig({
      ...config,
      relayHttpUrl: base,
      controllerClientId: result.clientId,
      controllerAccessToken: result.accessToken,
      controllerRefreshToken: result.refreshToken,
      controllerName: config.controllerName,
      controllerDescription: config.controllerDescription,
    });

    logJsonAware(config, {
      ok: true,
      clientId: result.clientId,
      controllerId: result.controllerId,
      scopes: result.scopes,
      secretSource,
    });
  });

client
  .command('status')
  .description('Show local controller client state and secret resolution source')
  .option('--client-id <id>', 'Override client id to inspect')
  .action(async (opts) => {
    const config = loadConfig();
    const clientId = String(opts.clientId ?? config.controllerClientId ?? '').trim();

    let secretSource: 'missing' | 'env' | 'keychain' = 'missing';
    if (clientId) {
      try {
        const resolved = await resolveClientSecret(config, clientId);
        secretSource = resolved.source;
      } catch {
        secretSource = 'missing';
      }
    }

    logJsonAware(config, {
      relayUrl: config.relayUrl,
      relayHttpUrl: getRelayHttpBase(config),
      controllerClientId: clientId || null,
      controllerName: config.controllerName ?? null,
      controllerDescription: config.controllerDescription ?? null,
      hasAccessToken: Boolean(config.controllerAccessToken),
      hasRefreshToken: Boolean(config.controllerRefreshToken),
      secretSource,
    });
  });

client
  .command('forget')
  .description('Delete stored client secret and clear local controller client auth state')
  .option('--client-id <id>', 'Override client id to forget')
  .action(async (opts) => {
    const config = loadConfig();
    const clientId = String(opts.clientId ?? config.controllerClientId ?? '').trim();
    const keychainRemoved = clientId
      ? await deleteClientSecret(config, clientId)
      : false;

    saveConfig({
      ...config,
      controllerClientId: undefined,
      controllerName: undefined,
      controllerDescription: undefined,
      controllerAccessToken: undefined,
      controllerRefreshToken: undefined,
    });

    logJsonAware(config, {
      ok: true,
      clientId: clientId || null,
      keychainRemoved,
      envVar: CLIENT_SECRET_ENV_VAR,
    });
  });

client
  .command('remove')
  .description('Remove a registered controller client at relay and cut access immediately')
  .option('--client-id <id>', 'Controller client id (defaults to configured client id)')
  .option('--all', 'Remove every registered controller client from relay', false)
  .action(async (opts) => {
    const config = loadConfig();
    const base = getRelayHttpBase(config);
    const removeAll = Boolean(opts.all);
    const explicitClientId = typeof opts.clientId === 'string' ? opts.clientId.trim() : '';
    const clientId = explicitClientId || String(config.controllerClientId ?? '').trim();
    if (removeAll && explicitClientId) {
      throw new Error('Do not combine --all with --client-id. Use one removal target.');
    }
    if (!removeAll && !clientId) {
      throw new Error('Missing client id. Pass --client-id or configure controllerClientId first.');
    }

    if (removeAll) {
      const result = (await requestJson(`${base}/api/controller/remove-all`, {
        method: 'POST',
      })) as ControllerRemoveAllResponse;

      let keychainRemovedCount = 0;
      for (const removedClientId of result.removedClientIds) {
        if (await deleteClientSecret(config, removedClientId)) {
          keychainRemovedCount += 1;
        }
      }

      const removedCurrentClient = Boolean(
        config.controllerClientId
        && result.removedClientIds.includes(config.controllerClientId),
      );
      const nextConfig: OttoConfig = removedCurrentClient
        ? {
          ...config,
          controllerClientId: undefined,
          controllerName: undefined,
          controllerDescription: undefined,
          controllerAccessToken: undefined,
          controllerRefreshToken: undefined,
        }
        : config;
      saveConfig(nextConfig);

      logJsonAware(config, {
        ...result,
        keychainRemovedCount,
        removedCurrentClient,
      });
      return;
    }

    const result = (await requestJson(`${base}/api/controller/remove`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId }),
    })) as ControllerRemoveResponse;

    const keychainRemoved = await deleteClientSecret(config, clientId);
    const removedCurrentClient = config.controllerClientId === clientId;

    const nextConfig: OttoConfig = removedCurrentClient
      ? {
        ...config,
        controllerClientId: undefined,
        controllerName: undefined,
        controllerDescription: undefined,
        controllerAccessToken: undefined,
        controllerRefreshToken: undefined,
      }
      : config;

    saveConfig(nextConfig);

    logJsonAware(config, {
      ...result,
      keychainRemoved,
      removedCurrentClient,
    });
  });

program
  .command('authcode')
  .description('List pending auth codes')
  .action(async () => {
    const config = loadConfig();
    const base = config.relayHttpUrl ?? deriveHttpUrl(config.relayUrl);
    const result = (await requestJson(`${base}/api/pairing/pending`)) as { pending: unknown[] };
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command('pair')
  .description('Approve pairing code and store controller tokens')
  .argument('<code>', 'Pairing code like 123-456')
  .action(async (code: string) => {
    const config = loadConfig();
    const base = config.relayHttpUrl ?? deriveHttpUrl(config.relayUrl);
    const result = (await requestJson(`${base}/api/pairing/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    })) as {
      nodeId: string;
      scopes: string[];
      controllerAccessToken: string;
      controllerRefreshToken: string;
    };

    saveConfig({
      ...config,
      targetNodeId: config.targetNodeId ?? result.nodeId,
      relayHttpUrl: base,
      controllerAccessToken: result.controllerAccessToken,
      controllerRefreshToken: result.controllerRefreshToken,
    });

    console.log('[otto] pairing approved and controller tokens saved');
    console.log(`[otto] target node default: ${config.targetNodeId ?? result.nodeId}`);
    console.log(`[otto] controller scopes: ${result.scopes.join(', ')}`);
  });

program
  .command('revoke')
  .description('Revoke stored refresh token from relay and clear local controller auth')
  .action(async () => {
    const config = loadConfig();
    const base = config.relayHttpUrl ?? deriveHttpUrl(config.relayUrl);

    if (config.controllerRefreshToken) {
      await requestJson(`${base}/api/auth/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: config.controllerRefreshToken }),
      });
    }

    saveConfig({
      ...config,
      controllerAccessToken: undefined,
      controllerRefreshToken: undefined,
    });
    console.log('[otto] controller tokens cleared and refresh token revoked');
  });

program
  .command('cmd')
  .description('Send a command to a target node')
  .requiredOption('--action <action>', 'Action name')
  .option('--tab-session <id>', 'tabSessionId')
  .option('--node-id <id>', 'Override target node id')
  .option('--payload <json>', 'JSON payload', '{}')
  .option('--timeout <ms>', 'Command timeout in milliseconds', '30000')
  .action(async (opts) => {
    const config = loadConfig();
    const targetNodeId = await resolveTargetNodeId(config, opts.nodeId);

    if (process.stdout.isTTY && process.stdin.isTTY) {
      await runCommandTui(config, {
        targetNodeId,
        tabSessionId: opts.tabSession,
        action: opts.action,
        payload: opts.payload,
      });
      return;
    }

    const response = await runCommandOnce(config, targetNodeId, {
      action: opts.action,
      tabSession: opts.tabSession,
      payload: parseJsonObject(opts.payload, '--payload'),
      timeoutMs: Number(opts.timeout),
    });

    console.log(JSON.stringify(response, null, 2));
    if (response.messageType === 'error') {
      const errorPayload = (response.payload && typeof response.payload === 'object')
        ? response.payload as { code?: string; nodeId?: string; clientId?: string; actionableHint?: string }
        : undefined;
      if (errorPayload) {
        showAclMissingGrantHint(errorPayload);
      }
      process.exitCode = 1;
    }
  });

program
  .command('test')
  .description('Run a website recipe for local developer testing')
  .argument('<site>', 'Website domain, for example reddit.com')
  .argument('<recipe>', 'Recipe id, for example getFeed')
  .option('--node-id <id>', 'Override target node id')
  .option('--tab-session <id>', 'Use an existing tabSessionId instead of auto-opening a tab')
  .option('--payload <json>', 'Recipe input JSON object', '{}')
  .option('--timeout <ms>', 'Command timeout in milliseconds', '30000')
  .option('--auth-mode <mode>', 'auto|strict_fail|skip', 'auto')
  .option('--controller-name <name>', 'Controller name for auto self-registration when identity is missing')
  .option('--controller-description <description>', 'Controller description for auto self-registration when identity is missing')
  .option('--controller-avatar-seed <seed>', 'Optional avatar seed for auto self-registration')
  .option('--no-cleanup-test-controller', 'Keep auto-registered test controller after command completion')
  .option('--keep-tab-open', 'Keep auto-opened tab instead of closing it after test', false)
  .action(async (site: string, recipe: string, opts) => {
    const registration = await maybeSelfRegisterControllerForTest(loadConfig(), opts);
    const config = registration.config;
    const targetNodeId = await resolveTargetNodeId(config, opts.nodeId);

    if (!['auto', 'strict_fail', 'skip'].includes(String(opts.authMode))) {
      throw new Error('--auth-mode must be one of auto|strict_fail|skip');
    }

    const timeoutMs = Number(opts.timeout);
    const recipeInput = parseJsonObject(opts.payload, '--payload');
    const ws = await openControllerSocket(config);

    let tabSessionId = opts.tabSession as string | undefined;
    let openedTabSessionId: string | undefined;

    try {
      const testInfo = await resolveTestInfo(config, targetNodeId, site, recipe, timeoutMs, ws);

      if (!tabSessionId) {
        const openResponse = await runCommandWithSocket(ws, targetNodeId, {
          action: 'primitive.tab.open',
          payload: { url: testInfo.openUrl },
          timeoutMs,
        });

        console.log(JSON.stringify(openResponse, null, 2));
        if (openResponse.messageType === 'error') {
          const errorPayload = (openResponse.payload && typeof openResponse.payload === 'object')
            ? openResponse.payload as {
              code?: string;
              action?: string;
              message?: string;
              nodeId?: string;
              clientId?: string;
              actionableHint?: string;
            }
            : undefined;
          if (errorPayload) {
            showAclMissingGrantHint(errorPayload);
          }
          await showTestFailureFooterAlert(errorPayload, 'otto test failed during primitive.tab.open');
          process.exitCode = 1;
          return;
        }

        const openPayload = openResponse.payload as { data?: { tabSessionId?: string } };
        tabSessionId = openPayload.data?.tabSessionId;
        openedTabSessionId = tabSessionId;
        if (!tabSessionId) {
          throw new Error('primitive.tab.open succeeded but did not return tabSessionId');
        }
      }

      const testResponse = await runCommandWithSocket(ws, targetNodeId, {
        action: 'recipe.test',
        tabSession: tabSessionId,
        payload: {
          tabSessionId,
          site,
          recipe,
          input: recipeInput,
          authMode: opts.authMode,
        },
        timeoutMs,
      });

      console.log(JSON.stringify(testResponse, null, 2));
      if (testResponse.messageType === 'error') {
        const errorPayload = (testResponse.payload && typeof testResponse.payload === 'object')
          ? testResponse.payload as {
            category?: string;
            code?: string;
            action?: string;
            message?: string;
            nodeId?: string;
            clientId?: string;
            actionableHint?: string;
          }
          : undefined;
        if (errorPayload) {
          showAclMissingGrantHint(errorPayload);
        }
        if (
          errorPayload?.code === 'forbidden_action'
          && errorPayload?.action === 'recipe.test'
        ) {
          const nodeSuffix = errorPayload.nodeId ? ` for node ${errorPayload.nodeId}` : '';
          console.error(
            `[otto] controller token is missing recipe.test scope${nodeSuffix}. Re-pair to issue a token with updated scopes.`,
          );
          console.error('[otto] suggested fix: otto revoke && otto authcode && otto pair <code>');
        }
        await showTestFailureFooterAlert(errorPayload);
        process.exitCode = 1;
        return;
      }

      const resultPayload = testResponse.payload as {
        data?: {
          stream?: RecipeTestStream;
        };
      };

      const listeners = resultPayload.data?.stream?.listeners ?? [];
      if (listeners.length > 1) {
        throw new Error(
          `recipe.test stream currently supports exactly one listener for ${site}/${recipe}`,
        );
      }

      const streamListener = listeners[0];
      if (streamListener) {
        if (!streamListener.listener || typeof streamListener.listener !== 'string') {
          throw new Error(
            `recipe.test stream requires stream.listeners[0].listener for ${site}/${recipe}`,
          );
        }

        const options = streamListener.options && typeof streamListener.options === 'object'
          ? streamListener.options
          : {};

        await subscribeListenerAndFollow(
          ws,
          targetNodeId,
          testResponse.requestId,
          streamListener.listener,
          options,
          timeoutMs,
        );
      }
    } finally {
      if (openedTabSessionId && !opts.keepTabOpen) {
        const closeResponse = await runCommandWithSocket(ws, targetNodeId, {
          action: 'primitive.tab.close',
          tabSession: openedTabSessionId,
          payload: { tabSessionId: openedTabSessionId },
          timeoutMs,
        });
        console.log(JSON.stringify(closeResponse, null, 2));
        if (closeResponse.messageType === 'error') {
          const errorPayload = (closeResponse.payload && typeof closeResponse.payload === 'object')
            ? closeResponse.payload as {
              code?: string;
              action?: string;
              message?: string;
              nodeId?: string;
              clientId?: string;
              actionableHint?: string;
            }
            : undefined;
          if (errorPayload) {
            showAclMissingGrantHint(errorPayload);
          }
          await showTestFailureFooterAlert(errorPayload, 'otto test cleanup failed during primitive.tab.close');
          process.exitCode = 1;
        }
      }

      ws.close();

      if (registration.autoRegisteredClientId && opts.cleanupTestController !== false) {
        try {
          await removeControllerClientAtRelay(config, registration.autoRegisteredClientId);
          await deleteClientSecret(config, registration.autoRegisteredClientId);

          const latest = loadConfig();
          if (latest.controllerClientId === registration.autoRegisteredClientId) {
            saveConfig({
              ...latest,
              controllerClientId: undefined,
              controllerName: undefined,
              controllerDescription: undefined,
              controllerAccessToken: undefined,
              controllerRefreshToken: undefined,
            });
          }

          console.error(
            `[otto] cleaned up auto-registered test controller ${registration.autoRegisteredClientId}`,
          );
        } catch (error) {
          console.error(
            `[otto] failed to clean up auto-registered test controller ${registration.autoRegisteredClientId}: ${String(error)}`,
          );
        }
      }
    }
  });

const recipes = program.command('recipes').description('Discover available recipes from target node');

recipes
  .command('list')
  .description('List available recipes')
  .option('--node-id <id>', 'Override target node id')
  .option('--site <site>', 'Filter by site, for example reddit.com')
  .option('--timeout <ms>', 'Command timeout in milliseconds', '30000')
  .action(async (opts) => {
    const config = loadConfig();
    const targetNodeId = await resolveTargetNodeId(config, opts.nodeId);

    const response = await runCommandOnce(config, targetNodeId, {
      action: 'recipe.list',
      payload: {},
      timeoutMs: Number(opts.timeout),
    });

    if (response.messageType === 'error') {
      console.log(JSON.stringify(response, null, 2));
      process.exitCode = 1;
      return;
    }

    const payload = response.payload as {
      data?: {
        recipes?: Array<{ site?: string }>;
      };
    };

    const recipes = payload.data?.recipes ?? [];
    const filtered = opts.site
      ? recipes.filter((recipe) => String(recipe.site ?? '').toLowerCase() === String(opts.site).toLowerCase())
      : recipes;

    const output = {
      ...response,
      payload: {
        ...(response.payload as Record<string, unknown>),
        data: {
          ...(payload.data ?? {}),
          recipes: filtered,
        },
      },
    };

    console.log(JSON.stringify(output, null, 2));
  });

const logs = program.command('logs').description('Read relay logs');

const listener = program.command('listener').description('Manage long-lived node listeners');

listener
  .command('subscribe-network')
  .description('Subscribe to network response interception updates and stream them')
  .requiredOption('--tab-session <id>', 'Target managed tab session id')
  .requiredOption('--site <site>', 'Site scope (for example reddit.com)')
  .option('--pattern <glob>', 'URL pattern to capture (repeat for multiple)', collectString, [])
  .option('--mode <mode>', 'network|fetch|hybrid', 'network')
  .option('--include-headers', 'Include redacted request/response headers in updates', false)
  .option('--no-include-body', 'Do not include response body in updates')
  .option('--max-body-bytes <n>', 'Max response body bytes per update', '256000')
  .option('--mime <mime>', 'Allowed MIME prefix (repeat for multiple)', collectString, [])
  .option('--node-id <id>', 'Override target node id')
  .option('--timeout <ms>', 'Command timeout in milliseconds', '30000')
  .action(async (opts) => {
    const config = loadConfig();
    const targetNodeId = await resolveTargetNodeId(config, opts.nodeId);
    const mode = parseNetworkMode(opts.mode);
    const maxBodyBytes = parsePositiveNumberOption(opts.maxBodyBytes, '--max-body-bytes');
    const timeoutMs = parseMaybeNumber(opts.timeout, 30_000);

    const options: NetworkInterceptListenerOptions = {
      tabSessionId: String(opts.tabSession),
      site: String(opts.site),
      mode,
      includeBody: Boolean(opts.includeBody),
      includeHeaders: Boolean(opts.includeHeaders),
      maxBodyBytes,
    };

    if (Array.isArray(opts.pattern) && opts.pattern.length > 0) {
      options.urlPatterns = opts.pattern;
    }

    if (Array.isArray(opts.mime) && opts.mime.length > 0) {
      options.mimeTypes = opts.mime;
    }

    await subscribeNetworkListenerAndFollow(config, targetNodeId, options, timeoutMs);
  });

listener
  .command('unsubscribe')
  .description('Unsubscribe an active listener by its subscribe request id')
  .requiredOption('--target-request-id <id>', 'Original subscribe request id')
  .option('--node-id <id>', 'Override target node id')
  .option('--timeout <ms>', 'Command timeout in milliseconds', '30000')
  .action(async (opts) => {
    const config = loadConfig();
    const targetNodeId = await resolveTargetNodeId(config, opts.nodeId);

    const response = await runCommandOnce(config, targetNodeId, {
      action: 'listener.unsubscribe',
      payload: {
        targetRequestId: String(opts.targetRequestId),
      },
      timeoutMs: parseMaybeNumber(opts.timeout, 30_000),
    });

    console.log(JSON.stringify(response, null, 2));
    if (response.messageType === 'error') {
      process.exitCode = 1;
    }
  });

logs
  .command('list')
  .description('List historical relay logs')
  .option('--since <iso>', 'ISO timestamp filter')
  .option('--level <level>', 'debug|info|warn|error')
  .option('--source <source>', 'relay|controller|node|all')
  .option('--latest <n>', 'Return only the latest N logs')
  .option('--node-id <id>', 'Filter by nodeId')
  .option('--request-id <id>', 'Filter by requestId')
  .action(async (opts) => {
    const config = loadConfig();
    const base = config.relayHttpUrl ?? deriveHttpUrl(config.relayUrl);
    const level = parseLogLevelOption(opts.level);
    const source = parseLogSourceOption(opts.source);
    const latest = parseLatestOption(opts.latest);
    const params = new URLSearchParams();
    if (opts.since) params.set('since', opts.since);
    if (level) params.set('level', level);
    if (source) params.set('source', source);
    if (latest) params.set('latest', String(latest));
    if (opts.nodeId) params.set('nodeId', opts.nodeId);
    if (opts.requestId) params.set('requestId', opts.requestId);
    const result = await requestJson(`${base}/api/logs?${params.toString()}`);
    console.log(JSON.stringify(result, null, 2));
  });

logs
  .command('follow')
  .description('Follow live relay logs')
  .option('--source <source>', 'relay|controller|node|all')
  .option('--json', 'Output full JSON log entries', false)
  .action(async (opts) => {
    const config = loadConfig();
    const source = parseLogSourceOption(opts.source);
    const jsonOutput = Boolean(opts.json);
    if (process.stdout.isTTY && process.stdin.isTTY) {
      await runLogsFollowTui(config, source, jsonOutput);
      return;
    }
    await followLogsOnce(config, source, jsonOutput);
  });

logs
  .command('status')
  .description('Show relay log storage status')
  .action(async () => {
    const config = loadConfig();
    const base = config.relayHttpUrl ?? deriveHttpUrl(config.relayUrl);
    const result = await requestJson(`${base}/api/logs/status`);
    console.log(JSON.stringify(result, null, 2));
  });

logs
  .command('export')
  .description('Export logs as newline-delimited JSON')
  .option('--since <iso>', 'ISO timestamp filter')
  .option('--level <level>', 'debug|info|warn|error')
  .option('--source <source>', 'relay|controller|node|all')
  .option('--latest <n>', 'Return only the latest N logs')
  .option('--node-id <id>', 'Filter by nodeId')
  .option('--request-id <id>', 'Filter by requestId')
  .action(async (opts) => {
    const config = loadConfig();
    const base = config.relayHttpUrl ?? deriveHttpUrl(config.relayUrl);
    const level = parseLogLevelOption(opts.level);
    const source = parseLogSourceOption(opts.source);
    const latest = parseLatestOption(opts.latest);
    const params = new URLSearchParams();
    if (opts.since) params.set('since', opts.since);
    if (level) params.set('level', level);
    if (source) params.set('source', source);
    if (latest) params.set('latest', String(latest));
    if (opts.nodeId) params.set('nodeId', opts.nodeId);
    if (opts.requestId) params.set('requestId', opts.requestId);

    const response = await fetch(`${base}/api/logs/export?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Failed to export logs: ${response.status}`);
    }
    const data = await response.text();
    console.log(data);
  });

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
