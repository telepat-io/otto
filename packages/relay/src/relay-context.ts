/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomBytes } from 'node:crypto';
import { nanoid } from 'nanoid';
import {
  PROTOCOL_VERSION,
  type Envelope,
  type ErrorPayload,
  type MessageType,
  type OttoRole,
} from '@telepat/otto-protocol';

import {
  PORT,
  RELAY_VERSION,
  TOKEN_SECRET,
  TOKEN_PREVIOUS_SECRET,
  TOKEN_ISSUER,
  TOKEN_AUDIENCE,
  TOKEN_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  RATE_LIMIT_PER_MIN,
  REPLAY_WINDOW_MS,
  TAB_QUEUE_LIMIT,
  CONTROLLER_QUEUE_LIMIT,
  DEFAULT_CONTROLLER_SCOPES,
  LOG_RETENTION_MS,
  LOG_DIR,
  LOG_LEGACY_FILE_NAME,
  LOG_WINDOW_PREFIX,
  LOG_WINDOW_SUFFIX,
  LOG_WINDOW_MAX_FILE_BYTES,
  REFRESH_SESSIONS_FILE,
  CONTROLLER_CLIENTS_FILE,
  CONTROLLER_ACL_FILE,
  ALLOW_REMOTE_CONTROLLER_REGISTRATION,
  CONTROLLER_REGISTRATION_SECRET,
  CONTROLLER_HEARTBEAT_INTERVAL_MS,
  CONTROLLER_HEARTBEAT_MISS_LIMIT,
} from './relay-config.js';

import {
  helloSchema,
  logsSubscribeSchema,
  extensionLogEventSchema,
  listenerUpdateEventSchema,
  refreshStoreEntrySchema,
  controllerClientStoreEntrySchema,
  controllerAclStoreEntrySchema,
  type LogEvent,
  type PairingChallenge,
  type RateLimitState,
  type ReplayState,
} from './relay-models-schemas.js';

import type {
  Client,
  LockState,
  PendingCommand,
  CommandTestStreamSession,
  ListenerSubscription,
  QueuedCommand,
} from './runtime/types.js';

import { createLogStorage } from './log-storage-utils.js';

import {
  send as sendMsg,
  buildEnvelope as buildEnvelopeFull,
  emitLog as emitLogFull,
  releaseExpiredLocks as releaseExpiredLocksFull,
  cleanupLogs as cleanupLogsFull,
} from './relay-log-helpers.js';

import { createRelayAuthBindings } from './auth/bindings.js';
import { isActionAllowed } from './auth/helpers.js';

import {
  issueRefreshToken,
  resolveRefreshSession,
  revokeRefreshToken,
  revokeRefreshSessionsByClientId,
  cleanupRefreshSessions as cleanupRefreshSessionsFn,
  type RefreshSession,
} from './refresh-session-utils.js';

import {
  persistRefreshSessionsToFile,
  persistControllerClientsToFile,
  persistControllerAclToFile,
  hydrateRelayStateFromDisk,
} from './relay-state-storage.js';

import {
  normalizeControllerNameInput,
  normalizedControllerNameKey,
  findControllerByNormalizedName,
  materializeControllerRecord,
  hashClientSecret,
  verifyClientSecret,
  canRegisterControllerClient,
  deriveAvatarSeed,
  type ControllerClientRecord,
  type RawControllerClientRecord,
} from './controller-client-utils.js';

import {
  aclKey,
  cleanupControllerAcl as cleanupControllerAclFn,
  listAclForNode,
  isControllerAllowedNode,
  revokeControllerAclByClientId,
  type ControllerAclGrant,
} from './controller-acl-utils.js';

import {
  removeControllerClientById,
  purgeControllerClientById,
  isRevokedControllerClient,
  disconnectControllerSessionsByClientId,
} from './controller-client-removal-utils.js';

import {
  asRecord,
  extractCommandStreamListeners,
  type CommandStreamListenerBinding,
} from './command-stream-utils.js';

import {
  jsonResponse,
  parseBearerToken,
  parseSinceMs,
  parseLatest,
  parseLogLevel,
  parseLogSource,
  filterLogs as filterLogsFn,
} from './http-log-utils.js';

// ─── State ───────────────────────────────────────────────────────────────────

export type RelayState = {
  clients: Map<string, Client>;
  nodeClients: Map<string, Client>;
  locks: Map<string, LockState>;
  pendingCommands: Map<string, PendingCommand>;
  listenerSubscriptions: Map<string, ListenerSubscription>;
  listenerToCommandStreamSession: Map<string, string>;
  commandTestStreamSessions: Map<string, CommandTestStreamSession>;
  queuedByTab: Map<string, QueuedCommand[]>;
  inflightByTab: Set<string>;
  pairingByCode: Map<string, PairingChallenge>;
  pairingByChallenge: Map<string, PairingChallenge>;
  refreshTokens: Map<string, RefreshSession>;
  controllerClients: Map<string, ControllerClientRecord>;
  controllerAcl: Map<string, ControllerAclGrant>;
  rateLimit: Map<string, RateLimitState>;
  replayState: Map<string, ReplayState>;
  logEvents: LogEvent[];
};

export function createRelayState(): RelayState {
  return {
    clients: new Map(),
    nodeClients: new Map(),
    locks: new Map(),
    pendingCommands: new Map(),
    listenerSubscriptions: new Map(),
    listenerToCommandStreamSession: new Map(),
    commandTestStreamSessions: new Map(),
    queuedByTab: new Map(),
    inflightByTab: new Set(),
    pairingByCode: new Map(),
    pairingByChallenge: new Map(),
    refreshTokens: new Map(),
    controllerClients: new Map(),
    controllerAcl: new Map(),
    rateLimit: new Map(),
    replayState: new Map(),
    logEvents: [],
  };
}

// ─── Context ─────────────────────────────────────────────────────────────────

export type RelayContextResult = {
  ctx: Record<string, unknown>;
  hydrateStats: {
    refreshStoreStats: { loaded: number; invalid: number; expired: number };
    controllerClientStoreStats: { loaded: number; invalid: number };
    controllerAclStoreStats: { loaded: number; invalid: number; expired: number };
  };
};

export function createRelayContext(state: RelayState): RelayContextResult {
  const {
    clients,
    nodeClients,
    locks,
    pendingCommands,
    listenerSubscriptions,
    listenerToCommandStreamSession,
    commandTestStreamSessions,
    queuedByTab,
    inflightByTab,
    pairingByCode,
    pairingByChallenge,
    refreshTokens,
    controllerClients,
    controllerAcl,
    rateLimit,
    replayState,
    logEvents,
  } = state;

  // ── Log storage ────────────────────────────────────────────────────────────
  const logStorage = createLogStorage({
    logDir: LOG_DIR,
    legacyFileName: LOG_LEGACY_FILE_NAME,
    windowPrefix: LOG_WINDOW_PREFIX,
    windowSuffix: LOG_WINDOW_SUFFIX,
    maxFileBytes: LOG_WINDOW_MAX_FILE_BYTES,
  });

  // ── Persistence ───────────────────────────────────────────────────────────
  function persistRefreshSessions(): void {
    persistRefreshSessionsToFile(REFRESH_SESSIONS_FILE, refreshTokens);
  }
  function persistControllerClients(): void {
    persistControllerClientsToFile(CONTROLLER_CLIENTS_FILE, controllerClients);
  }
  function persistControllerAcl(): void {
    persistControllerAclToFile(CONTROLLER_ACL_FILE, controllerAcl);
  }

  // ── Disk hydration ────────────────────────────────────────────────────────
  const hydrateStats = hydrateRelayStateFromDisk({
    logDir: LOG_DIR,
    refreshSessionsFile: REFRESH_SESSIONS_FILE,
    controllerClientsFile: CONTROLLER_CLIENTS_FILE,
    controllerAclFile: CONTROLLER_ACL_FILE,
    refreshTokens,
    controllerClients,
    controllerAcl,
    parseRefreshEntry: (raw) => {
      const parsed = refreshStoreEntrySchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
    parseClient: (raw): RawControllerClientRecord | null => {
      const parsed = controllerClientStoreEntrySchema.safeParse(raw);
      return parsed.success ? (parsed.data.client as unknown as RawControllerClientRecord) : null;
    },
    parseGrant: (raw): ControllerAclGrant | null => {
      const parsed = controllerAclStoreEntrySchema.safeParse(raw);
      return parsed.success ? (parsed.data.grant as ControllerAclGrant) : null;
    },
    materializeControllerRecord,
    aclKey,
    persistRefreshSessions,
    persistControllerClients,
    persistControllerAcl,
    logStorage,
    logEvents,
    logRetentionMs: LOG_RETENTION_MS,
  });

  // ── Auth bindings ─────────────────────────────────────────────────────────
  const authBindings = createRelayAuthBindings({
    tokenSecret: TOKEN_SECRET,
    tokenPreviousSecret: TOKEN_PREVIOUS_SECRET,
    tokenIssuer: TOKEN_ISSUER,
    tokenAudience: TOKEN_AUDIENCE,
    tokenTtlSeconds: TOKEN_TTL_SECONDS,
    rateLimitPerMin: RATE_LIMIT_PER_MIN,
    replayWindowMs: REPLAY_WINDOW_MS,
    rateLimit,
    replayState,
  });

  // ── Envelope helpers ──────────────────────────────────────────────────────
  function buildEnvelope(messageType: MessageType, senderRole: OttoRole | 'relay', requestId: string, payload: unknown): Envelope {
    return buildEnvelopeFull(PROTOCOL_VERSION, messageType, senderRole, requestId, payload);
  }

  function buildError(requestId: string, role: OttoRole | 'relay', payload: ErrorPayload): Envelope<ErrorPayload> {
    return buildEnvelope('error', role, requestId, payload) as Envelope<ErrorPayload>;
  }

  const send = sendMsg;

  // ── Logging ───────────────────────────────────────────────────────────────
  function emitLog(event: Omit<LogEvent, 'id' | 'timestamp'>): void {
    emitLogFull({ event, logEvents, logStorage, clients: clients.values(), send, buildEnvelope, nextRequestId: nanoid });
  }

  function releaseExpiredLocks(): void {
    releaseExpiredLocksFull(locks, emitLog);
  }

  function cleanupLogs(): void {
    cleanupLogsFull(logEvents, logStorage, LOG_RETENTION_MS);
  }

  function cleanupRefreshSessions(): { removed: number } {
    return cleanupRefreshSessionsFn(refreshTokens, persistRefreshSessions);
  }

  function cleanupControllerAcl(): { removed: number } {
    return cleanupControllerAclFn(controllerAcl, persistControllerAcl);
  }

  // ── Log filter helpers ────────────────────────────────────────────────────
  // Routes call filterLogs(logEvents, params) using the original 2-arg signature
  const filterLogs = filterLogsFn;

  // ── Tab/queue helpers ─────────────────────────────────────────────────────
  function lockKey(nodeId: string, tabSessionId: string): string {
    return `${nodeId}:${tabSessionId}`;
  }

  function tabQueueKey(nodeId: string, tabSessionId: string): string {
    return `${nodeId}:${tabSessionId}`;
  }

  function queuedDepthForController(controllerId: string): number {
    let total = 0;
    for (const queue of queuedByTab.values()) {
      for (const item of queue) {
        if (item.controllerId === controllerId) total += 1;
      }
    }
    return total;
  }

  function removeQueuedCommandsForController(controllerId: string): void {
    for (const [tabKey, queue] of queuedByTab.entries()) {
      const kept: QueuedCommand[] = [];
      for (const queued of queue) {
        if (queued.controllerId !== controllerId) {
          kept.push(queued);
          continue;
        }
        clearTimeout(queued.timeoutHandle);
        emitLog({
          level: 'info',
          source: 'relay',
          type: 'queued_command_dropped',
          requestId: queued.message.requestId,
          status: 'controller_disconnected',
          data: { controllerId, tabKey },
        });
      }
      if (kept.length === 0) {
        queuedByTab.delete(tabKey);
      } else {
        queuedByTab.set(tabKey, kept);
      }
    }
  }

  function withControllerOwnershipMetadata(msg: Envelope, controllerClientId?: string): Envelope {
    const payload = asRecord(msg.payload);
    const action = typeof payload?.action === 'string' ? payload.action : undefined;
    if (action !== 'primitive.tab.open' || !controllerClientId) {
      return msg;
    }
    const nested = asRecord(payload?.payload) ?? {};
    return {
      ...msg,
      payload: {
        ...payload,
        payload: { ...nested, __controllerClientId: controllerClientId },
      },
    };
  }

  function requestOwnedTabCleanupForController(client: Client): void {
    if (client.role !== 'controller' || !client.clientId) {
      return;
    }
    for (const nodeClient of nodeClients.values()) {
      if (!nodeClient.authenticated || !nodeClient.nodeId) {
        continue;
      }
      const cleanupRequestId = nanoid();
      send(nodeClient.ws, buildEnvelope('command', 'relay', cleanupRequestId, {
        targetNodeId: nodeClient.nodeId,
        action: 'primitive.tab.close_owned',
        payload: { controllerClientId: client.clientId },
        timeoutMs: 10_000,
        waitPolicy: 'fail_fast',
      }));
      emitLog({
        level: 'info',
        source: 'relay',
        type: 'orphan_tab_cleanup_dispatched',
        requestId: cleanupRequestId,
        nodeId: nodeClient.nodeId,
        action: 'primitive.tab.close_owned',
        status: 'dispatched',
        data: { controllerId: client.controllerId, clientId: client.clientId },
      });
    }
  }

  function markControllerHeartbeat(client: Client): void {
    if (client.role !== 'controller') {
      return;
    }
    client.lastHeartbeatAtMs = Date.now();
  }

  // ── Listener / stream session helpers ────────────────────────────────────
  function clearCommandTestStreamSession(sessionRequestId: string): void {
    const session = commandTestStreamSessions.get(sessionRequestId);
    if (!session) {
      return;
    }
    if (session.timeoutHandle) {
      clearTimeout(session.timeoutHandle);
    }
    for (const listener of session.listeners) {
      if (listener.subscribeRequestId) {
        listenerToCommandStreamSession.delete(listener.subscribeRequestId);
      }
    }
    commandTestStreamSessions.delete(sessionRequestId);
  }

  function clearCommandTestStreamSessionsForController(controllerId: string): void {
    for (const [requestId, session] of commandTestStreamSessions.entries()) {
      if (session.controllerId === controllerId) {
        clearCommandTestStreamSession(requestId);
      }
    }
  }

  function clearCommandTestStreamSessionsForNode(nodeId: string): void {
    for (const [requestId, session] of commandTestStreamSessions.entries()) {
      if (session.nodeId === nodeId) {
        clearCommandTestStreamSession(requestId);
      }
    }
  }

  function removeListenerSubscription(requestId: string): void {
    const sessionRequestId = listenerToCommandStreamSession.get(requestId);
    if (sessionRequestId) {
      const session = commandTestStreamSessions.get(sessionRequestId);
      if (session) {
        for (const listener of session.listeners) {
          if (listener.subscribeRequestId === requestId) {
            listener.subscribeRequestId = undefined;
          }
        }
      }
      listenerToCommandStreamSession.delete(requestId);
    }
    listenerSubscriptions.delete(requestId);
  }

  function removeListenerSubscriptionsForController(controllerId: string): void {
    for (const [requestId, subscription] of listenerSubscriptions.entries()) {
      if (subscription.controllerId === controllerId) {
        listenerSubscriptions.delete(requestId);
        listenerToCommandStreamSession.delete(requestId);
      }
    }
  }

  function removeListenerSubscriptionsForNode(nodeId: string): void {
    for (const [requestId, subscription] of listenerSubscriptions.entries()) {
      if (subscription.nodeId === nodeId) {
        listenerSubscriptions.delete(requestId);
        listenerToCommandStreamSession.delete(requestId);
      }
    }
  }

  // ── Command routing ───────────────────────────────────────────────────────
  function findCandidateCommandStreamSession(
    controllerId: string,
    nodeId: string,
    tabKey: string | undefined,
    listener: string,
  ): CommandTestStreamSession | undefined {
    for (const session of commandTestStreamSessions.values()) {
      if (session.controllerId !== controllerId || session.nodeId !== nodeId) {
        continue;
      }
      if (session.tabKey !== tabKey) {
        continue;
      }
      const candidate = session.listeners.find((declared) => {
        if (declared.subscribeRequestId) {
          return false;
        }
        return declared.listener === listener;
      });
      if (candidate) {
        return session;
      }
    }
    return undefined;
  }

  // Runs the next queued command for a tab after the current inflight command completes.
  function clearInflightAndRunNext(tabKey?: string): void {
    if (!tabKey) {
      return;
    }
    inflightByTab.delete(tabKey);
    const queue = queuedByTab.get(tabKey);
    if (!queue || queue.length === 0) {
      queuedByTab.delete(tabKey);
      return;
    }

    const next = queue.shift();
    if (!next) {
      return;
    }
    clearTimeout(next.timeoutHandle);
    if (queue.length === 0) {
      queuedByTab.delete(tabKey);
    }

    const payload = next.message.payload as {
      targetNodeId?: string;
      action?: string;
      timeoutMs?: number;
      tabSessionId?: string;
    };
    const nodeId = payload.targetNodeId;
    if (!nodeId) {
      return;
    }

    const owner = clients.get(next.controllerId);
    const targetNode = nodeClients.get(nodeId);
    if (!owner || !targetNode || !targetNode.authenticated) {
      if (owner) {
        send(owner.ws, buildError(next.message.requestId, 'relay', {
          category: 'routing',
          code: 'node_offline',
          message: `Node ${nodeId} is not connected`,
          retryable: true,
          nodeId,
        }));
      }
      return;
    }

    const timeoutMs = Number(payload.timeoutMs ?? 30_000);
    inflightByTab.add(tabKey);
    const timeoutHandle = setTimeout(() => {
      const stillPending = pendingCommands.get(next.message.requestId);
      if (!stillPending) {
        return;
      }
      if (stillPending.action === 'listener.subscribe') {
        const sessionRequestId = listenerToCommandStreamSession.get(stillPending.requestId);
        if (sessionRequestId) {
          const streamSession = commandTestStreamSessions.get(sessionRequestId);
          const streamOwner = streamSession ? clients.get(streamSession.controllerId) : undefined;
          if (streamSession && streamOwner) {
            send(streamOwner.ws, buildEnvelope('result', 'relay', streamSession.requestId, {
              ok: true,
              durationMs: Date.now() - streamSession.createdAt,
              action: streamSession.action,
              commandOutcome: 'timed_out',
              data: { streamTimedOut: true, reason: 'listener_subscribe_timeout' },
            }));
          }
          clearCommandTestStreamSession(sessionRequestId);
        }
      }
      const controller = clients.get(stillPending.controllerId);
      if (controller) {
        send(controller.ws, buildError(next.message.requestId, 'relay', {
          category: 'timeout',
          code: 'command_timed_out',
          message: 'Command exceeded timeout before terminal response',
          retryable: true,
          nodeId: stillPending.nodeId,
          action: stillPending.action,
        }));
      }
      pendingCommands.delete(next.message.requestId);
      clearInflightAndRunNext(stillPending.tabKey);
    }, Math.max(1000, timeoutMs));

    pendingCommands.set(next.message.requestId, {
      requestId: next.message.requestId,
      controllerId: next.controllerId,
      nodeId,
      action: String(payload.action ?? 'unknown'),
      timeoutMs,
      createdAt: Date.now(),
      tabKey,
      timeoutHandle,
    });

    send(targetNode.ws, next.message);
    send(owner.ws, buildEnvelope('event', 'relay', next.message.requestId, {
      type: 'routed',
      targetNodeId: nodeId,
    }));
  }

  // ── Controller removal ────────────────────────────────────────────────────
  function removeControllerClientByIdWithSideEffects(clientId: string) {
    return removeControllerClientById(
      controllerClients,
      persistControllerClients,
      (id) => revokeControllerAclByClientId(controllerAcl, persistControllerAcl, id),
      (id) => revokeRefreshSessionsByClientId(refreshTokens, persistRefreshSessions, id),
      (id) => disconnectControllerSessionsByClientId(clients.values(), id, (conn) => {
        send((conn as Client).ws, buildError(nanoid(), 'relay', {
          category: 'auth',
          code: 'controller_revoked',
          message: 'Controller client has been removed and access has been revoked',
          clientId: id,
        }));
        (conn as Client).ws.close();
      }),
      (data) => emitLog({
        level: 'warn',
        source: 'relay',
        type: 'controller_client_removed',
        status: 'revoked',
        data,
      }),
      clientId,
    );
  }

  // ── Assemble context ──────────────────────────────────────────────────────
  const ctx: Record<string, unknown> = {
    // Config constants
    PORT,
    RELAY_VERSION,
    TOKEN_TTL_SECONDS,
    REFRESH_TTL_SECONDS,
    TAB_QUEUE_LIMIT,
    CONTROLLER_QUEUE_LIMIT,
    DEFAULT_CONTROLLER_SCOPES,
    LOG_WINDOW_MAX_FILE_BYTES,
    ALLOW_REMOTE_CONTROLLER_REGISTRATION,
    CONTROLLER_REGISTRATION_SECRET,
    CONTROLLER_HEARTBEAT_INTERVAL_MS,
    CONTROLLER_HEARTBEAT_MISS_LIMIT,
    REFRESH_SESSIONS_FILE,
    CONTROLLER_CLIENTS_FILE,
    CONTROLLER_ACL_FILE,

    // Schemas
    helloSchema,
    logsSubscribeSchema,
    extensionLogEventSchema,
    listenerUpdateEventSchema,

    // In-memory state (maps passed by reference)
    clients,
    nodeClients,
    locks,
    pendingCommands,
    listenerSubscriptions,
    listenerToCommandStreamSession,
    commandTestStreamSessions,
    queuedByTab,
    inflightByTab,
    pairingByCode,
    pairingByChallenge,
    refreshTokens,
    controllerClients,
    controllerAcl,
    rateLimit,
    replayState,
    logEvents,

    // Log storage object
    logStorage,

    // Bound envelope/log helpers
    send,
    buildEnvelope,
    buildError,
    emitLog,
    releaseExpiredLocks,
    cleanupLogs,
    cleanupRefreshSessions,
    cleanupControllerAcl,

    // Auth (bound wrappers from createRelayAuthBindings)
    issueAccessToken: authBindings.issueAccessToken,
    verifyAccessToken: authBindings.verifyAccessToken,
    checkRateLimit: authBindings.checkRateLimit,
    isActionAllowed,
    validateReplayWindow: authBindings.validateReplayWindow,
    deriveStatus: authBindings.deriveStatus,
    randomCode: authBindings.randomCode,

    // Refresh session helpers (pass-through with explicit deps; route modules call with maps)
    issueRefreshToken,
    resolveRefreshSession,
    revokeRefreshToken,
    revokeRefreshSessionsByClientId,

    // Persistence (bound, 0-arg)
    persistRefreshSessions,
    persistControllerClients,
    persistControllerAcl,

    // HTTP log helpers
    jsonResponse,
    parseBearerToken,
    parseSinceMs,
    parseLatest,
    parseLogLevel,
    parseLogSource,
    filterLogs,

    // Controller client helpers (pass-through; route modules supply maps explicitly)
    normalizeControllerNameInput,
    normalizedControllerNameKey,
    deriveAvatarSeed,
    hashClientSecret,
    verifyClientSecret,
    materializeControllerRecord,
    findControllerByNormalizedName,
    canRegisterControllerClient,
    isRevokedControllerClient,
    purgeControllerClientById,

    // ACL helpers (pass-through; route modules supply maps explicitly)
    aclKey,
    listAclForNode,
    isControllerAllowedNode,
    revokeControllerAclByClientId,

    // Command stream helpers (pass-through)
    asRecord,
    extractCommandStreamListeners,

    // Bound tab/queue helpers
    lockKey,
    tabQueueKey,
    queuedDepthForController,
    removeQueuedCommandsForController,
    withControllerOwnershipMetadata,
    requestOwnedTabCleanupForController,
    markControllerHeartbeat,

    // Bound listener/session helpers
    clearCommandTestStreamSession,
    clearCommandTestStreamSessionsForController,
    clearCommandTestStreamSessionsForNode,
    removeListenerSubscription,
    removeListenerSubscriptionsForController,
    removeListenerSubscriptionsForNode,

    // Bound routing helper
    findCandidateCommandStreamSession,
    clearInflightAndRunNext,

    // Bound controller removal
    removeControllerClientByIdWithSideEffects,

    // Misc
    nanoid,
    randomBytes,
  };

  return { ctx, hydrateStats };
}

// Re-export types used by callers of this module
export type { RefreshSession, ControllerClientRecord, ControllerAclGrant, CommandStreamListenerBinding };
