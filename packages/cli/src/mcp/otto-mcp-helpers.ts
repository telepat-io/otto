import { nanoid } from 'nanoid';
import WebSocket from 'ws';
import { createEnvelope, type CommandPayload, type Envelope } from '@telepat/otto-protocol';
import { deriveHttpUrl, loadConfig, saveConfig, type OttoConfig } from '../config.js';
import { refreshControllerAccessToken } from '../auth/refresh.js';
import { shouldAttemptAccessTokenRefreshOnAuthError } from '../auth/retry.js';
import {
  CLIENT_SECRET_ENV_VAR,
  deleteClientSecret,
  resolveClientSecret,
  storeClientSecret,
} from '../client-secret-store.js';
import { buildRelayStatusReport, type RelayStatusReport } from '../daemon-status.js';
import { readRelayDaemonState, startRelayDaemon, stopRelayDaemon, type RelayDaemonState } from '../relay-daemon.js';
import { resolveTargetNodeId } from '../node-resolution.js';
import { createSocketClosedWhileWaitingError } from '../cli/socket-errors.js';

const DEFAULT_CONTROLLER_HEARTBEAT_INTERVAL_MS = 8_000;
const controllerHeartbeatIntervalBySocket = new WeakMap<WebSocket, number>();

type RelayAuthErrorPayload = {
  category?: string;
  code?: string;
  message?: string;
  actionableHint?: string;
  clientId?: string;
  nodeId?: string;
};

class RelayAuthError extends Error {
  payload?: RelayAuthErrorPayload;

  constructor(message: string, payload?: RelayAuthErrorPayload) {
    super(message);
    this.name = 'RelayAuthError';
    this.payload = payload;
  }
}

export type ControllerRegisterResponse = {
  clientId: string;
  name: string;
  description: string;
  avatarSeed?: string;
  clientSecret: string;
  createdAt: number;
};

export type ControllerTokenResponse = {
  clientId: string;
  controllerId: string;
  scopes: string[];
  accessToken: string;
  refreshToken: string;
};

export type ControllerRemoveResponse = {
  ok: boolean;
  clientId: string;
  revokedAt: number;
  aclRevokedCount: number;
  refreshRevokedCount: number;
  disconnectedSessions: number;
  alreadyRevoked?: boolean;
};

export type ControllerRemoveAllResponse = {
  ok: boolean;
  removedClientIds: string[];
  removedCount: number;
  alreadyRevokedCount: number;
  aclRevokedCount: number;
  refreshRevokedCount: number;
  disconnectedSessions: number;
};

export async function requestJson(url: string, init?: RequestInit): Promise<unknown> {
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

export function getRelayHttpBase(config: OttoConfig): string {
  return config.relayHttpUrl ?? deriveHttpUrl(config.relayUrl);
}

export function normalizeControllerRelayUrl(urlValue: string): string {
  const parsed = new URL(urlValue.trim());
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error('relayUrl must use ws:// or wss://');
  }
  if (parsed.searchParams.get('role') !== 'controller') {
    parsed.searchParams.set('role', 'controller');
  }
  return parsed.toString();
}

export function startControllerHeartbeat(ws: WebSocket): () => void {
  const intervalMs = Math.max(1000, controllerHeartbeatIntervalBySocket.get(ws) ?? DEFAULT_CONTROLLER_HEARTBEAT_INTERVAL_MS);
  const timer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      ws.send(JSON.stringify(createEnvelope('ping', 'controller', nanoid(), {
        ts: Date.now(),
      })));
    } catch {
      // Keep heartbeat best-effort; close handlers own lifecycle cleanup.
    }
  }, intervalMs);

  const onClose = () => {
    clearInterval(timer);
  };

  ws.once('close', onClose);

  return () => {
    ws.off('close', onClose);
    clearInterval(timer);
  };
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
    const ws = new WebSocket(resolvedConfig.relayUrl);
    let heartbeatIntervalMs = DEFAULT_CONTROLLER_HEARTBEAT_INTERVAL_MS;
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
        if (msg.messageType === 'hello_ack') {
          const payload = msg.payload as { heartbeatIntervalMs?: unknown };
          const parsed = Number(payload?.heartbeatIntervalMs);
          if (Number.isFinite(parsed) && parsed > 0) {
            heartbeatIntervalMs = parsed;
          }
        }
        if (msg.messageType === 'auth_ack') {
          clearTimeout(timeout);
          controllerHeartbeatIntervalBySocket.set(ws, heartbeatIntervalMs);
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

type SentCommand = {
  requestId: string;
  response: Promise<Envelope>;
};

export function sendCommandWithSocket(
  ws: WebSocket,
  targetNodeId: string,
  opts: { action: string; tabSession?: string; payload: Record<string, unknown>; timeoutMs?: number; signal?: AbortSignal },
): SentCommand {
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

  const response = new Promise<Envelope>((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new Error(`Aborted waiting for ${opts.action} response`));
      return;
    }

    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      ws.off('message', onMessage);
      ws.off('close', onClose);
      if (opts.signal) {
        opts.signal.removeEventListener('abort', onAbort);
      }
      fn();
    };

    const timeout = setTimeout(() => {
      settle(() => reject(new Error(`Timed out waiting for terminal response (${timeoutMs + 5000}ms)`)));
    }, timeoutMs + 5000);

    const onMessage = (data: WebSocket.RawData) => {
      const msg = JSON.parse(String(data)) as Envelope;
      if (msg.requestId !== requestId) {
        return;
      }

      if (msg.messageType !== 'result' && msg.messageType !== 'error') {
        return;
      }

      settle(() => resolve(msg));
    };

    const onClose = () => {
      settle(() => reject(createSocketClosedWhileWaitingError(opts.action)));
    };

    const onAbort = () => {
      settle(() => reject(new Error(`Aborted waiting for ${opts.action} response`)));
    };

    ws.on('message', onMessage);
    ws.once('close', onClose);
    if (opts.signal) {
      opts.signal.addEventListener('abort', onAbort, { once: true });
    }
    ws.send(JSON.stringify(createEnvelope('command', 'controller', requestId, commandPayload)));
  });

  return {
    requestId,
    response,
  };
}

export async function runCommandWithSocket(
  ws: WebSocket,
  targetNodeId: string,
  opts: { action: string; tabSession?: string; payload: Record<string, unknown>; timeoutMs?: number; signal?: AbortSignal },
): Promise<Envelope> {
  return sendCommandWithSocket(ws, targetNodeId, opts).response;
}

export async function runCommandOnce(
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

export async function sendCommandCancelWithSocket(ws: WebSocket, targetRequestId: string, timeoutMs = 1500): Promise<void> {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }

  const cancelRequestId = nanoid();
  ws.send(
    JSON.stringify(
      createEnvelope('command_cancel', 'controller', cancelRequestId, {
        targetRequestId,
      }),
    ),
  );

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      resolve();
    }, timeoutMs);

    const onMessage = (data: WebSocket.RawData) => {
      const msg = JSON.parse(String(data)) as Envelope;
      if (msg.requestId !== cancelRequestId) {
        return;
      }

      if (msg.messageType !== 'event' && msg.messageType !== 'result' && msg.messageType !== 'error') {
        return;
      }

      clearTimeout(timer);
      ws.off('message', onMessage);
      resolve();
    };

    ws.on('message', onMessage);
  });
}

export async function maybeSelfRegisterControllerForTest(
  config: OttoConfig,
  opts: { controllerName?: string; controllerDescription?: string; controllerAvatarSeed?: string },
): Promise<{ config: OttoConfig; autoRegisteredClientId?: string }> {
  const hasIdentity = Boolean(config.controllerClientId)
    || Boolean(config.controllerAccessToken)
    || Boolean(config.controllerRefreshToken);
  if (hasIdentity) {
    return { config };
  }

  const registration = {
    name: opts.controllerName ?? config.controllerName ?? 'otto-tester',
    description: opts.controllerDescription ?? config.controllerDescription ?? 'Auto-registered controller for otto test flows.',
    avatarSeed: opts.controllerAvatarSeed,
  };

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

  if (!secretStored) {
    console.error(`[otto] keychain unavailable; set ${CLIENT_SECRET_ENV_VAR} for future non-interactive logins.`);
  }

  return {
    config: nextConfig,
    autoRegisteredClientId: registered.clientId,
  };
}

export async function removeControllerClientAtRelay(config: OttoConfig, clientId: string): Promise<void> {
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

export {
  buildRelayStatusReport,
  deleteClientSecret,
  loadConfig,
  readRelayDaemonState,
  resolveClientSecret,
  resolveTargetNodeId,
  saveConfig,
  startRelayDaemon,
  stopRelayDaemon,
  storeClientSecret,
};

export type { OttoConfig, RelayDaemonState, RelayStatusReport };
