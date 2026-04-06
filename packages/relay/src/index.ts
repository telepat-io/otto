import { createServer } from 'node:http';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { nanoid } from 'nanoid';
import { jwtVerify, SignJWT } from 'jose';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import {
  PROTOCOL_VERSION,
  type Envelope,
  type ErrorPayload,
  type LockPayload,
  type MessageType,
  type OttoRole,
} from '@telepat/otto-protocol';

const PORT = Number(process.env.OTTO_RELAY_PORT ?? 8787);
const TOKEN_SECRET = process.env.OTTO_TOKEN_SECRET ?? 'dev-only-change-me';
const TOKEN_PREVIOUS_SECRET = process.env.OTTO_TOKEN_PREVIOUS_SECRET;
const TOKEN_ISSUER = process.env.OTTO_TOKEN_ISSUER ?? 'otto-relay';
const TOKEN_AUDIENCE = process.env.OTTO_TOKEN_AUDIENCE ?? 'otto-clients';

function parseEnvInt(name: string, fallback: number, min = 1, max?: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min || (typeof max === 'number' && parsed > max)) {
    console.warn(`[relay] invalid ${name}=${raw}; using fallback=${fallback}`);
    return fallback;
  }

  return parsed;
}

const TOKEN_TTL_SECONDS = parseEnvInt('OTTO_TOKEN_TTL_MINUTES', 15, 1, 24 * 60) * 60;
const REFRESH_TTL_SECONDS = parseEnvInt('OTTO_REFRESH_TTL_DAYS', 30, 1, 365) * 24 * 60 * 60;
const RATE_LIMIT_PER_MIN = Number(process.env.OTTO_RATE_LIMIT_PER_MIN ?? 120);
const REPLAY_WINDOW_MS = Number(process.env.OTTO_REPLAY_WINDOW_MS ?? 60_000);
const TAB_QUEUE_LIMIT = Math.max(1, Number(process.env.OTTO_TAB_QUEUE_LIMIT ?? 20));
const CONTROLLER_QUEUE_LIMIT = Math.max(1, Number(process.env.OTTO_CONTROLLER_QUEUE_LIMIT ?? 100));
const DEFAULT_CONTROLLER_SCOPES =
  process.env.OTTO_DEFAULT_CONTROLLER_SCOPES?.split(',').map((x) => x.trim()).filter(Boolean) ?? [
    'primitive.tab.open',
    'primitive.tab.close',
    'primitive.tab.navigate',
    'primitive.tab.query',
    'primitive.dom.extract_text',
    'recipe.list',
    'recipe.run',
    'recipe.test',
    'recipe.reddit_feed',
    'listener.subscribe',
    'listener.unsubscribe',
  ];
const LOG_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const LOG_DIR = process.env.OTTO_LOG_DIR ?? join(process.cwd(), '.otto-relay');
const LOG_LEGACY_FILE_NAME = 'operations.jsonl';
const LOG_WINDOW_PREFIX = 'operations-';
const LOG_WINDOW_SUFFIX = '.jsonl';
const LOG_WINDOW_MAX_FILE_BYTES = parseEnvInt('OTTO_LOG_MAX_FILE_BYTES', 100 * 1024 * 1024, 1024);
const REFRESH_SESSIONS_FILE = join(LOG_DIR, 'refresh-sessions.jsonl');
const CONTROLLER_CLIENTS_FILE = join(LOG_DIR, 'controller-clients.jsonl');
const CONTROLLER_ACL_FILE = join(LOG_DIR, 'controller-acl.jsonl');
const ALLOW_REMOTE_CONTROLLER_REGISTRATION = process.env.OTTO_ALLOW_REMOTE_CONTROLLER_REGISTRATION === '1';
const CONTROLLER_REGISTRATION_SECRET = process.env.OTTO_CONTROLLER_REGISTRATION_SECRET;

type Client = {
  id: string;
  ws: WebSocket;
  role: OttoRole;
  nodeId?: string;
  controllerId?: string;
  clientId?: string;
  scopes: string[];
  authenticated: boolean;
  subscriptions: Set<string>;
  logSourceFilter?: 'relay' | 'controller' | 'node' | 'all';
};

type LockState = {
  controllerId: string;
  expiresAt: number;
};

type PendingCommand = {
  requestId: string;
  controllerId: string;
  nodeId: string;
  action: string;
  timeoutMs: number;
  unsubscribeTargetRequestId?: string;
  createdAt: number;
  tabKey?: string;
  timeoutHandle: ReturnType<typeof setTimeout>;
};

type RecipeStreamListenerBinding = {
  listener: string;
  options: Record<string, unknown>;
  subscribeRequestId?: string;
};

type RecipeTestStreamSession = {
  requestId: string;
  controllerId: string;
  nodeId: string;
  action: string;
  createdAt: number;
  tabKey?: string;
  timeoutHandle?: ReturnType<typeof setTimeout>;
  listeners: RecipeStreamListenerBinding[];
};

type ListenerSubscription = {
  requestId: string;
  controllerId: string;
  nodeId: string;
  createdAt: number;
};

type QueuedCommand = {
  message: Envelope;
  controllerId: string;
  timeoutHandle: ReturnType<typeof setTimeout>;
};

type PairingChallenge = {
  challengeId: string;
  code: string;
  nodeId: string;
  status: 'pending' | 'approved' | 'expired';
  expiresAt: number;
  approvedAt?: number;
  nodeAccessToken?: string;
  nodeRefreshToken?: string;
};

type RefreshSession = {
  role: OttoRole;
  nodeId?: string;
  controllerId?: string;
  clientId?: string;
  scopes: string[];
  expiresAt: number;
};

type ControllerClientRecord = {
  clientId: string;
  name: string;
  description: string;
  normalizedName: string;
  avatarSeed: string;
  secretSalt: string;
  secretHash: string;
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
};

type ControllerAclGrant = {
  clientId: string;
  nodeId: string;
  grantedByNodeId: string;
  grantedAt: number;
  expiresAt?: number;
};

type RateLimitState = {
  windowStartMs: number;
  count: number;
};

type ReplayState = {
  nonceSeenAtMs: Map<string, number>;
};

type LogEvent = {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: 'relay' | 'controller' | 'node';
  type: string;
  requestId?: string;
  traceId?: string;
  nodeId?: string;
  action?: string;
  status?: string;
  data?: unknown;
};

type RefreshStoreEntry = {
  token: string;
  session: RefreshSession;
};

const helloSchema = z.object({
  role: z.enum(['controller', 'node']),
  capabilities: z.array(z.string()).default([]),
  nodeId: z.string().optional(),
});

const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
const logSourceSchema = z.enum(['relay', 'controller', 'node', 'all']);
const logsSubscribeSchema = z.object({
  type: z.literal('logs_subscribe'),
  source: logSourceSchema.optional(),
});

const extensionLogEventSchema = z.object({
  type: z.literal('extension_log'),
  entry: z.object({
    level: logLevelSchema.default('debug'),
    type: z.string().min(1).max(120),
    timestamp: z.string().datetime().optional(),
    requestId: z.string().optional(),
    traceId: z.string().optional(),
    action: z.string().optional(),
    status: z.string().optional(),
    data: z.unknown().optional(),
  }),
});

const listenerUpdateEventSchema = z.object({
  type: z.literal('listener_update'),
  data: z.unknown(),
  updateType: z.string().min(1).max(120).optional(),
  emittedAt: z.string().datetime().optional(),
});

const refreshSessionSchema = z.object({
  role: z.enum(['controller', 'node']),
  nodeId: z.string().optional(),
  controllerId: z.string().optional(),
  clientId: z.string().optional(),
  scopes: z.array(z.string()),
  expiresAt: z.number().int(),
});

const controllerClientSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  description: z.string().min(1).max(500).optional(),
  normalizedName: z.string().min(1).max(120).optional(),
  avatarSeed: z.string().min(1).max(64).optional(),
  // Legacy field kept optional for migration from older controller records.
  label: z.string().min(1).max(120).optional(),
  secretSalt: z.string().min(1),
  secretHash: z.string().min(1),
  createdAt: z.number().int(),
  lastUsedAt: z.number().int().optional(),
  revokedAt: z.number().int().optional(),
});

const controllerAclGrantSchema = z.object({
  clientId: z.string().min(1),
  nodeId: z.string().min(1),
  grantedByNodeId: z.string().min(1),
  grantedAt: z.number().int(),
  expiresAt: z.number().int().optional(),
});

const refreshStoreEntrySchema = z.object({
  token: z.string().min(1),
  session: refreshSessionSchema,
});

const controllerClientStoreEntrySchema = z.object({
  client: controllerClientSchema,
});

const controllerAclStoreEntrySchema = z.object({
  grant: controllerAclGrantSchema,
});

const clients = new Map<string, Client>();
const nodeClients = new Map<string, Client>();
const locks = new Map<string, LockState>();
const pendingCommands = new Map<string, PendingCommand>();
const listenerSubscriptions = new Map<string, ListenerSubscription>();
const listenerToRecipeStreamSession = new Map<string, string>();
const recipeTestStreamSessions = new Map<string, RecipeTestStreamSession>();
const queuedByTab = new Map<string, QueuedCommand[]>();
const inflightByTab = new Set<string>();
const pairingByCode = new Map<string, PairingChallenge>();
const pairingByChallenge = new Map<string, PairingChallenge>();
const refreshTokens = new Map<string, RefreshSession>();
const controllerClients = new Map<string, ControllerClientRecord>();
const controllerAcl = new Map<string, ControllerAclGrant>();
const rateLimit = new Map<string, RateLimitState>();
const replayState = new Map<string, ReplayState>();
const logEvents: LogEvent[] = [];
let activeLogWindowDate = '';
let activeLogWindowSpill = 0;

function logWindowDateKey(date: Date): string {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function logWindowFileName(dateKey: string, spill: number): string {
  return spill <= 0
    ? `${LOG_WINDOW_PREFIX}${dateKey}${LOG_WINDOW_SUFFIX}`
    : `${LOG_WINDOW_PREFIX}${dateKey}-${spill}${LOG_WINDOW_SUFFIX}`;
}

function isWindowedLogFileName(fileName: string): boolean {
  return /^operations-\d{4}-\d{2}-\d{2}(?:-\d+)?\.jsonl$/.test(fileName);
}

function isOperationLogFileName(fileName: string): boolean {
  return fileName === LOG_LEGACY_FILE_NAME || isWindowedLogFileName(fileName);
}

function listOperationLogFiles(): string[] {
  if (!existsSync(LOG_DIR)) {
    return [];
  }

  const names = readdirSync(LOG_DIR).filter(isOperationLogFileName);
  return names
    .map((name) => ({ name, path: join(LOG_DIR, name), mtimeMs: statSync(join(LOG_DIR, name)).mtimeMs }))
    .sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name))
    .map((item) => item.path);
}

function parseTimestampMs(timestamp: string): number | null {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? null : parsed;
}

function resolveWriteLogFilePath(eventLine: string): string {
  const now = new Date();
  const dateKey = logWindowDateKey(now);
  if (activeLogWindowDate !== dateKey) {
    activeLogWindowDate = dateKey;
    activeLogWindowSpill = 0;
  }

  const nextBytes = Buffer.byteLength(eventLine, 'utf8');
  while (true) {
    const filePath = join(LOG_DIR, logWindowFileName(activeLogWindowDate, activeLogWindowSpill));
    const currentSize = existsSync(filePath) ? statSync(filePath).size : 0;
    if (currentSize === 0 || currentSize + nextBytes <= LOG_WINDOW_MAX_FILE_BYTES) {
      return filePath;
    }
    activeLogWindowSpill += 1;
  }
}

function cleanupLogFiles(cutoffMs: number): void {
  for (const filePath of listOperationLogFiles()) {
    try {
      const stats = statSync(filePath);
      if (stats.mtimeMs < cutoffMs) {
        unlinkSync(filePath);
      }
    } catch {
      // Ignore races where another process rotates/deletes between stat and unlink.
    }
  }
}

function totalLogBytes(): number {
  return listOperationLogFiles().reduce((total, filePath) => {
    try {
      return total + statSync(filePath).size;
    } catch {
      return total;
    }
  }, 0);
}

function persistRefreshSessions(): void {
  const serialized = Array.from(refreshTokens.entries())
    .map(([token, session]) => JSON.stringify({ token, session } satisfies RefreshStoreEntry))
    .join('\n');
  writeFileSync(REFRESH_SESSIONS_FILE, serialized ? `${serialized}\n` : '');
}

function persistControllerClients(): void {
  const serialized = Array.from(controllerClients.values())
    .map((client) => JSON.stringify({ client }))
    .join('\n');
  writeFileSync(CONTROLLER_CLIENTS_FILE, serialized ? `${serialized}\n` : '');
}

function normalizeControllerNameInput(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizedControllerNameKey(value: string): string {
  return normalizeControllerNameInput(value).normalize('NFKC').toLowerCase();
}

function deriveAvatarSeed(name: string): string {
  return createHash('sha256').update(normalizedControllerNameKey(name)).digest('hex').slice(0, 16);
}

function findControllerByNormalizedName(normalizedName: string): ControllerClientRecord | undefined {
  for (const record of controllerClients.values()) {
    if (record.normalizedName !== normalizedName) {
      continue;
    }

    if (typeof record.revokedAt === 'number') {
      continue;
    }

    return record;
  }

  return undefined;
}

function materializeControllerRecord(raw: z.infer<typeof controllerClientSchema>): ControllerClientRecord | null {
  const fallbackName = typeof raw.label === 'string' && raw.label.trim().length > 0
    ? raw.label
    : undefined;
  const resolvedName = normalizeControllerNameInput(String(raw.name ?? fallbackName ?? ''));
  if (!resolvedName) {
    return null;
  }

  const normalizedName = raw.normalizedName && raw.normalizedName.trim().length > 0
    ? raw.normalizedName.trim()
    : normalizedControllerNameKey(resolvedName);
  const description = typeof raw.description === 'string' && raw.description.trim().length > 0
    ? raw.description.trim()
    : 'No description provided.';
  const avatarSeed = typeof raw.avatarSeed === 'string' && raw.avatarSeed.trim().length > 0
    ? raw.avatarSeed.trim().slice(0, 64)
    : deriveAvatarSeed(resolvedName);

  return {
    clientId: raw.clientId,
    name: resolvedName,
    description,
    normalizedName,
    avatarSeed,
    secretSalt: raw.secretSalt,
    secretHash: raw.secretHash,
    createdAt: raw.createdAt,
    lastUsedAt: raw.lastUsedAt,
    revokedAt: raw.revokedAt,
  };
}

function persistControllerAcl(): void {
  const serialized = Array.from(controllerAcl.values())
    .map((grant) => JSON.stringify({ grant }))
    .join('\n');
  writeFileSync(CONTROLLER_ACL_FILE, serialized ? `${serialized}\n` : '');
}

function aclKey(clientId: string, nodeId: string): string {
  return `${clientId}:${nodeId}`;
}

function cleanupRefreshSessions(): { removed: number } {
  let removed = 0;
  const now = Date.now();
  for (const [token, session] of refreshTokens.entries()) {
    if (session.expiresAt <= now) {
      refreshTokens.delete(token);
      removed += 1;
    }
  }

  if (removed > 0) {
    persistRefreshSessions();
  }

  return { removed };
}

function cleanupControllerAcl(): { removed: number } {
  let removed = 0;
  const now = Date.now();
  for (const [key, grant] of controllerAcl.entries()) {
    if (grant.expiresAt && grant.expiresAt <= now) {
      controllerAcl.delete(key);
      removed += 1;
    }
  }

  if (removed > 0) {
    persistControllerAcl();
  }

  return { removed };
}

function loadRefreshSessions(): { loaded: number; invalid: number; expired: number } {
  if (!existsSync(REFRESH_SESSIONS_FILE)) {
    return { loaded: 0, invalid: 0, expired: 0 };
  }

  const lines = readFileSync(REFRESH_SESSIONS_FILE, 'utf8').split('\n').filter(Boolean);
  let loaded = 0;
  let invalid = 0;
  let expired = 0;
  const now = Date.now();

  for (const line of lines) {
    try {
      const raw = JSON.parse(line);
      const parsed = refreshStoreEntrySchema.safeParse(raw);
      if (!parsed.success) {
        invalid += 1;
        continue;
      }

      if (parsed.data.session.expiresAt <= now) {
        expired += 1;
        continue;
      }

      refreshTokens.set(parsed.data.token, parsed.data.session);
      loaded += 1;
    } catch {
      invalid += 1;
    }
  }

  // Rewrite to drop malformed and expired entries, and to dedupe by map key.
  persistRefreshSessions();
  return { loaded, invalid, expired };
}

function loadControllerClients(): { loaded: number; invalid: number } {
  if (!existsSync(CONTROLLER_CLIENTS_FILE)) {
    return { loaded: 0, invalid: 0 };
  }

  const lines = readFileSync(CONTROLLER_CLIENTS_FILE, 'utf8').split('\n').filter(Boolean);
  let loaded = 0;
  let invalid = 0;

  for (const line of lines) {
    try {
      const parsed = controllerClientStoreEntrySchema.safeParse(JSON.parse(line));
      if (!parsed.success) {
        invalid += 1;
        continue;
      }
      const materialized = materializeControllerRecord(parsed.data.client);
      if (!materialized) {
        invalid += 1;
        continue;
      }

      controllerClients.set(materialized.clientId, materialized);
      loaded += 1;
    } catch {
      invalid += 1;
    }
  }

  persistControllerClients();
  return { loaded, invalid };
}

function loadControllerAcl(): { loaded: number; invalid: number; expired: number } {
  if (!existsSync(CONTROLLER_ACL_FILE)) {
    return { loaded: 0, invalid: 0, expired: 0 };
  }

  const now = Date.now();
  const lines = readFileSync(CONTROLLER_ACL_FILE, 'utf8').split('\n').filter(Boolean);
  let loaded = 0;
  let invalid = 0;
  let expired = 0;

  for (const line of lines) {
    try {
      const parsed = controllerAclStoreEntrySchema.safeParse(JSON.parse(line));
      if (!parsed.success) {
        invalid += 1;
        continue;
      }

      const grant = parsed.data.grant;
      if (grant.expiresAt && grant.expiresAt <= now) {
        expired += 1;
        continue;
      }
      controllerAcl.set(aclKey(grant.clientId, grant.nodeId), grant);
      loaded += 1;
    } catch {
      invalid += 1;
    }
  }

  persistControllerAcl();
  return { loaded, invalid, expired };
}

function hashClientSecret(secret: string, salt: string): string {
  return scryptSync(secret, salt, 32).toString('base64');
}

function verifyClientSecret(secret: string, record: ControllerClientRecord): boolean {
  const expected = Buffer.from(record.secretHash, 'base64');
  const actual = Buffer.from(hashClientSecret(secret, record.secretSalt), 'base64');
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) {
    return false;
  }
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function canRegisterControllerClient(req: import('node:http').IncomingMessage): boolean {
  if (!ALLOW_REMOTE_CONTROLLER_REGISTRATION && !isLoopbackAddress(req.socket.remoteAddress)) {
    return false;
  }

  if (!CONTROLLER_REGISTRATION_SECRET) {
    return true;
  }

  return req.headers['x-otto-registration-secret'] === CONTROLLER_REGISTRATION_SECRET;
}

function listAclForNode(nodeId: string): Array<{
  clientId: string;
  name: string;
  description: string;
  avatarSeed: string;
  createdAt: number;
  lastUsedAt?: number;
  revoked: boolean;
  granted: boolean;
  grantExpiresAt?: number;
}> {
  return Array.from(controllerClients.values())
    .map((client) => {
      const grant = controllerAcl.get(aclKey(client.clientId, nodeId));
      return {
        clientId: client.clientId,
        name: client.name,
        description: client.description,
        avatarSeed: client.avatarSeed,
        createdAt: client.createdAt,
        lastUsedAt: client.lastUsedAt,
        revoked: typeof client.revokedAt === 'number',
        granted: Boolean(grant),
        grantExpiresAt: grant?.expiresAt,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function revokeControllerAclByClientId(clientId: string): number {
  let removed = 0;
  for (const [key, grant] of controllerAcl.entries()) {
    if (grant.clientId !== clientId) {
      continue;
    }
    controllerAcl.delete(key);
    removed += 1;
  }

  if (removed > 0) {
    persistControllerAcl();
  }

  return removed;
}

function revokeRefreshSessionsByClientId(clientId: string): number {
  let removed = 0;
  for (const [token, session] of refreshTokens.entries()) {
    if (session.clientId !== clientId) {
      continue;
    }
    refreshTokens.delete(token);
    removed += 1;
  }

  if (removed > 0) {
    persistRefreshSessions();
  }

  return removed;
}

function disconnectControllerSessionsByClientId(clientId: string): number {
  let disconnected = 0;
  for (const client of clients.values()) {
    if (client.role !== 'controller' || client.clientId !== clientId || !client.authenticated) {
      continue;
    }

    send(client.ws, buildError(nanoid(), 'relay', {
      category: 'auth',
      code: 'controller_revoked',
      message: 'Controller client has been removed and access has been revoked',
      clientId,
    }));
    client.ws.close();
    disconnected += 1;
  }

  return disconnected;
}

function removeControllerClientById(clientId: string): {
  ok: boolean;
  clientId: string;
  revokedAt: number;
  aclRevokedCount: number;
  refreshRevokedCount: number;
  disconnectedSessions: number;
  alreadyRevoked: boolean;
} {
  const record = controllerClients.get(clientId);
  if (!record) {
    throw new Error('client_not_found');
  }

  if (typeof record.revokedAt === 'number') {
    return {
      ok: true,
      clientId,
      revokedAt: record.revokedAt,
      aclRevokedCount: 0,
      refreshRevokedCount: 0,
      disconnectedSessions: 0,
      alreadyRevoked: true,
    };
  }

  record.revokedAt = Date.now();
  controllerClients.set(clientId, record);
  persistControllerClients();

  const aclRevokedCount = revokeControllerAclByClientId(clientId);
  const refreshRevokedCount = revokeRefreshSessionsByClientId(clientId);
  const disconnectedSessions = disconnectControllerSessionsByClientId(clientId);

  emitLog({
    level: 'warn',
    source: 'relay',
    type: 'controller_client_removed',
    status: 'revoked',
    data: {
      clientId,
      aclRevokedCount,
      refreshRevokedCount,
      disconnectedSessions,
    },
  });

  return {
    ok: true,
    clientId,
    revokedAt: record.revokedAt,
    aclRevokedCount,
    refreshRevokedCount,
    disconnectedSessions,
    alreadyRevoked: false,
  };
}

function purgeControllerClientById(clientId: string): boolean {
  if (!controllerClients.has(clientId)) {
    return false;
  }

  controllerClients.delete(clientId);
  persistControllerClients();
  return true;
}

function isRevokedControllerClient(clientId: string | undefined): boolean {
  if (!clientId) {
    return false;
  }

  const record = controllerClients.get(clientId);
  return !record || typeof record.revokedAt === 'number';
}

function isControllerAllowedNode(client: Client, targetNodeId: string): boolean {
  if (!client.clientId) {
    return true;
  }

  const grant = controllerAcl.get(aclKey(client.clientId, targetNodeId));
  if (!grant) {
    return false;
  }

  if (grant.expiresAt && grant.expiresAt <= Date.now()) {
    controllerAcl.delete(aclKey(client.clientId, targetNodeId));
    persistControllerAcl();
    return false;
  }

  return true;
}

function issueRefreshToken(
  role: OttoRole,
  nodeId?: string,
  controllerId?: string,
  scopes: string[] = [],
  clientId?: string,
): string {
  const token = `rt_${nanoid(36)}`;
  refreshTokens.set(token, {
    role,
    nodeId,
    controllerId,
    clientId,
    scopes,
    expiresAt: Date.now() + REFRESH_TTL_SECONDS * 1000,
  });
  persistRefreshSessions();
  return token;
}

function resolveRefreshSession(refreshToken: string): RefreshSession | undefined {
  const session = refreshTokens.get(refreshToken);
  if (!session) {
    return undefined;
  }

  if (session.expiresAt <= Date.now()) {
    refreshTokens.delete(refreshToken);
    persistRefreshSessions();
    return undefined;
  }

  return session;
}

function revokeRefreshToken(refreshToken: string): boolean {
  const existed = refreshTokens.delete(refreshToken);
  if (existed) {
    persistRefreshSessions();
  }
  return existed;
}

if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

const refreshStoreStats = loadRefreshSessions();
const controllerClientStoreStats = loadControllerClients();
const controllerAclStoreStats = loadControllerAcl();

for (const filePath of listOperationLogFiles()) {
  const lines = readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const evt = JSON.parse(line) as LogEvent;
      const ts = parseTimestampMs(evt.timestamp);
      if (ts !== null && Date.now() - ts <= LOG_RETENTION_MS) {
        logEvents.push(evt);
      }
    } catch {
      // ignore
    }
  }
}

function redactValue(input: unknown): unknown {
  if (!input || typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map(redactValue);

  const out: Record<string, unknown> = {};
  const obj = input as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (lower.includes('token') || lower.includes('cookie') || lower.includes('authorization') || lower.includes('password')) {
      out[key] = '<redacted>';
    } else {
      out[key] = redactValue(value);
    }
  }
  return out;
}

function cleanupLogs(): void {
  const cutoff = Date.now() - LOG_RETENTION_MS;
  const retained = logEvents.filter((evt) => {
    const ts = parseTimestampMs(evt.timestamp);
    return ts !== null && ts >= cutoff;
  });
  logEvents.length = 0;
  logEvents.push(...retained);
  cleanupLogFiles(cutoff);
}

function send(ws: WebSocket, msg: Envelope): void {
  ws.send(JSON.stringify(msg));
}

function buildEnvelope(messageType: MessageType, senderRole: OttoRole | 'relay', requestId: string, payload: unknown): Envelope {
  return {
    protocolVersion: PROTOCOL_VERSION,
    messageType,
    requestId,
    timestamp: new Date().toISOString(),
    senderRole,
    payload,
  };
}

function buildError(requestId: string, role: OttoRole | 'relay', payload: ErrorPayload): Envelope<ErrorPayload> {
  return buildEnvelope('error', role, requestId, payload) as Envelope<ErrorPayload>;
}

function emitLog(event: Omit<LogEvent, 'id' | 'timestamp'>): void {
  const full: LogEvent = {
    id: nanoid(),
    timestamp: new Date().toISOString(),
    ...event,
    data: redactValue(event.data),
  };
  logEvents.push(full);
  const line = `${JSON.stringify(full)}\n`;
  appendFileSync(resolveWriteLogFilePath(line), line);

  for (const client of clients.values()) {
    if (client.role !== 'controller' || !client.authenticated || !client.subscriptions.has('logs')) {
      continue;
    }

    const sourceFilter = client.logSourceFilter ?? 'all';
    if (sourceFilter !== 'all' && full.source !== sourceFilter) {
      continue;
    }

    send(client.ws, buildEnvelope('event', 'relay', nanoid(), { type: 'log', entry: full }));
  }
}

function releaseExpiredLocks(): void {
  const now = Date.now();
  for (const [key, state] of locks.entries()) {
    if (state.expiresAt <= now) {
      locks.delete(key);
      emitLog({
        level: 'warn',
        source: 'relay',
        type: 'lock_expired',
        data: { lockKey: key },
      });
    }
  }
}

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

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function extractRecipeStreamListeners(payload: unknown): RecipeStreamListenerBinding[] {
  const resultPayload = asRecord(payload);
  const data = asRecord(resultPayload?.data);
  const stream = asRecord(data?.stream);
  const listenersRaw = stream?.listeners;
  if (!Array.isArray(listenersRaw)) {
    return [];
  }

  const listeners: RecipeStreamListenerBinding[] = [];
  for (const entry of listenersRaw) {
    const listenerRecord = asRecord(entry);
    const listener = listenerRecord?.listener;
    if (typeof listener !== 'string' || listener.length === 0) {
      continue;
    }
    const optionsRecord = asRecord(listenerRecord?.options) ?? {};
    listeners.push({
      listener,
      options: optionsRecord,
    });
  }

  return listeners;
}

function findCandidateRecipeStreamSession(
  controllerId: string,
  nodeId: string,
  tabKey: string | undefined,
  listener: string,
): RecipeTestStreamSession | undefined {
  for (const session of recipeTestStreamSessions.values()) {
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

function randomCode(): string {
  const a = Math.floor(100 + Math.random() * 900);
  const b = Math.floor(100 + Math.random() * 900);
  return `${a}-${b}`;
}

async function issueAccessToken(
  role: OttoRole,
  nodeId?: string,
  controllerId?: string,
  scopes: string[] = [],
  clientId?: string,
): Promise<string> {
  const secret = new TextEncoder().encode(TOKEN_SECRET);
  return new SignJWT({ role, nodeId, controllerId, clientId, scopes })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(TOKEN_ISSUER)
    .setAudience(TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

async function verifyAccessToken(token: string): Promise<{
  role: OttoRole;
  nodeId?: string;
  controllerId?: string;
  clientId?: string;
  scopes: string[];
}> {
  const secrets = [TOKEN_SECRET, TOKEN_PREVIOUS_SECRET].filter((x): x is string => Boolean(x));
  let payload: Awaited<ReturnType<typeof jwtVerify>>['payload'] | undefined;
  for (const candidate of secrets) {
    try {
      const secret = new TextEncoder().encode(candidate);
      const verified = await jwtVerify(token, secret, {
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
      });
      payload = verified.payload;
      break;
    } catch {
      // Try next secret.
    }
  }

  if (!payload) {
    throw new Error('token_verification_failed');
  }

  const role = payload.role as OttoRole | undefined;
  if (!role) throw new Error('missing_role');
  const scopes = Array.isArray(payload.scopes) ? payload.scopes.map((x) => String(x)) : [];
  return {
    role,
    nodeId: payload.nodeId as string | undefined,
    controllerId: payload.controllerId as string | undefined,
    clientId: payload.clientId as string | undefined,
    scopes,
  };
}

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const current = rateLimit.get(clientId);
  if (!current || now - current.windowStartMs >= 60_000) {
    rateLimit.set(clientId, { windowStartMs: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= RATE_LIMIT_PER_MIN;
}

function isActionAllowed(scopes: string[], action: string): boolean {
  if (scopes.includes('*')) return true;
  return scopes.includes(action);
}

function validateReplayWindow(clientId: string, timestampIso: string, replayNonce?: string): { ok: true } | { ok: false; code: string; message: string } {
  if (!replayNonce) {
    return { ok: false, code: 'missing_replay_nonce', message: 'command payload must include replayNonce' };
  }

  const ts = Date.parse(timestampIso);
  if (Number.isNaN(ts)) {
    return { ok: false, code: 'invalid_timestamp', message: 'command envelope timestamp must be valid ISO-8601' };
  }

  const now = Date.now();
  if (Math.abs(now - ts) > REPLAY_WINDOW_MS) {
    return {
      ok: false,
      code: 'timestamp_out_of_window',
      message: `command timestamp outside replay window (${REPLAY_WINDOW_MS}ms)`,
    };
  }

  const state = replayState.get(clientId) ?? { nonceSeenAtMs: new Map<string, number>() };
  const cutoff = now - REPLAY_WINDOW_MS;
  for (const [nonce, seenAt] of state.nonceSeenAtMs.entries()) {
    if (seenAt < cutoff) state.nonceSeenAtMs.delete(nonce);
  }

  if (state.nonceSeenAtMs.has(replayNonce)) {
    return { ok: false, code: 'replay_rejected', message: 'replayNonce has already been used in this session window' };
  }

  state.nonceSeenAtMs.set(replayNonce, now);
  replayState.set(clientId, state);
  return { ok: true };
}

function deriveStatus(challenge: PairingChallenge): PairingChallenge {
  if (challenge.status === 'pending' && challenge.expiresAt <= Date.now()) {
    challenge.status = 'expired';
  }
  return challenge;
}

function clearInflightAndRunNext(tabKey?: string): void {
  if (!tabKey) return;
  inflightByTab.delete(tabKey);
  const queue = queuedByTab.get(tabKey);
  if (!queue || queue.length === 0) {
    queuedByTab.delete(tabKey);
    return;
  }

  const next = queue.shift();
  if (!next) return;
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
  if (!nodeId) return;

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
    if (!stillPending) return;
    if (stillPending.action === 'listener.subscribe') {
      const sessionRequestId = listenerToRecipeStreamSession.get(stillPending.requestId);
      if (sessionRequestId) {
        const streamSession = recipeTestStreamSessions.get(sessionRequestId);
        const streamOwner = streamSession ? clients.get(streamSession.controllerId) : undefined;
        if (streamSession && streamOwner) {
          send(streamOwner.ws, buildEnvelope('result', 'relay', streamSession.requestId, {
            ok: true,
            durationMs: Date.now() - streamSession.createdAt,
            action: streamSession.action,
            commandOutcome: 'timed_out',
            data: {
              streamTimedOut: true,
              reason: 'listener_subscribe_timeout',
            },
          }));
        }
        clearRecipeTestStreamSession(sessionRequestId);
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

function removeListenerSubscription(requestId: string): void {
  const sessionRequestId = listenerToRecipeStreamSession.get(requestId);
  if (sessionRequestId) {
    const session = recipeTestStreamSessions.get(sessionRequestId);
    if (session) {
      for (const listener of session.listeners) {
        if (listener.subscribeRequestId === requestId) {
          listener.subscribeRequestId = undefined;
        }
      }
    }
    listenerToRecipeStreamSession.delete(requestId);
  }
  listenerSubscriptions.delete(requestId);
}

function removeListenerSubscriptionsForController(controllerId: string): void {
  for (const [requestId, subscription] of listenerSubscriptions.entries()) {
    if (subscription.controllerId === controllerId) {
      listenerSubscriptions.delete(requestId);
      listenerToRecipeStreamSession.delete(requestId);
    }
  }
}

function removeListenerSubscriptionsForNode(nodeId: string): void {
  for (const [requestId, subscription] of listenerSubscriptions.entries()) {
    if (subscription.nodeId === nodeId) {
      listenerSubscriptions.delete(requestId);
      listenerToRecipeStreamSession.delete(requestId);
    }
  }
}

function clearRecipeTestStreamSession(sessionRequestId: string): void {
  const session = recipeTestStreamSessions.get(sessionRequestId);
  if (!session) {
    return;
  }

  if (session.timeoutHandle) {
    clearTimeout(session.timeoutHandle);
  }

  for (const listener of session.listeners) {
    if (listener.subscribeRequestId) {
      listenerToRecipeStreamSession.delete(listener.subscribeRequestId);
    }
  }

  recipeTestStreamSessions.delete(sessionRequestId);
}

function clearRecipeTestStreamSessionsForController(controllerId: string): void {
  for (const [requestId, session] of recipeTestStreamSessions.entries()) {
    if (session.controllerId === controllerId) {
      clearRecipeTestStreamSession(requestId);
    }
  }
}

function clearRecipeTestStreamSessionsForNode(nodeId: string): void {
  for (const [requestId, session] of recipeTestStreamSessions.entries()) {
    if (session.nodeId === nodeId) {
      clearRecipeTestStreamSession(requestId);
    }
  }
}

const server = createServer();
const wss = new WebSocketServer({ noServer: true });

function jsonResponse(res: import('node:http').ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseBearerToken(req: import('node:http').IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;
  return token;
}

function parseSinceMs(since: string | null, fallbackMs: number): number | null {
  if (!since) return fallbackMs;
  const parsed = Date.parse(since);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function parseLatest(latest: string | null): number | null {
  if (!latest) return null;
  const parsed = Number(latest);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseLogLevel(level: string | null): LogEvent['level'] | null {
  if (!level) return null;
  const parsed = logLevelSchema.safeParse(level);
  return parsed.success ? parsed.data : null;
}

function parseLogSource(source: string | null): 'relay' | 'controller' | 'node' | 'all' | null {
  if (!source) return null;
  const parsed = logSourceSchema.safeParse(source);
  return parsed.success ? parsed.data : null;
}

function filterLogs(params: {
  sinceMs: number;
  level?: LogEvent['level'];
  nodeId?: string;
  requestId?: string;
  source?: 'relay' | 'controller' | 'node' | 'all';
  latest?: number;
}): LogEvent[] {
  const filtered = logEvents.filter((evt) => {
    if (Date.parse(evt.timestamp) < params.sinceMs) return false;
    if (params.level && evt.level !== params.level) return false;
    if (params.nodeId && evt.nodeId !== params.nodeId) return false;
    if (params.requestId && evt.requestId !== params.requestId) return false;
    if (params.source && params.source !== 'all' && evt.source !== params.source) return false;
    return true;
  });

  if (!params.latest) {
    return filtered;
  }

  return filtered.slice(Math.max(0, filtered.length - params.latest));
}

server.on('request', (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (req.method === 'POST' && url.pathname === '/api/pairing/request') {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { nodeId?: string };
        if (!body.nodeId) {
          jsonResponse(res, 400, { error: 'nodeId_required' });
          return;
        }

        for (const existing of pairingByCode.values()) {
          const fresh = deriveStatus(existing);
          if (fresh.nodeId === body.nodeId && fresh.status === 'pending') {
            jsonResponse(res, 200, fresh);
            return;
          }
        }

        const challenge: PairingChallenge = {
          challengeId: `ch_${nanoid(12)}`,
          code: randomCode(),
          nodeId: body.nodeId,
          status: 'pending',
          expiresAt: Date.now() + 5 * 60 * 1000,
        };

        pairingByCode.set(challenge.code, challenge);
        pairingByChallenge.set(challenge.challengeId, challenge);
        emitLog({
          level: 'info',
          source: 'relay',
          type: 'pairing_requested',
          nodeId: challenge.nodeId,
          status: 'pending',
          data: { challengeId: challenge.challengeId, code: challenge.code },
        });

        jsonResponse(res, 200, challenge);
      } catch {
        jsonResponse(res, 400, { error: 'invalid_json' });
      }
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/pairing/pending') {
    const pending = Array.from(pairingByCode.values())
      .map(deriveStatus)
      .filter((x) => x.status === 'pending');
    jsonResponse(res, 200, { pending });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/pairing/approve') {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { code?: string };
        if (!body.code) {
          jsonResponse(res, 400, { error: 'code_required' });
          return;
        }

        const challenge = pairingByCode.get(body.code);
        if (!challenge) {
          jsonResponse(res, 404, { error: 'pairing_not_found' });
          return;
        }
        deriveStatus(challenge);
        if (challenge.status !== 'pending') {
          jsonResponse(res, 409, { error: 'pairing_not_pending' });
          return;
        }

        const controllerId = `ctl_${nanoid(10)}`;
        challenge.status = 'approved';
        challenge.approvedAt = Date.now();
        challenge.nodeAccessToken = await issueAccessToken('node', challenge.nodeId, undefined, ['*']);
        challenge.nodeRefreshToken = issueRefreshToken('node', challenge.nodeId, undefined, ['*']);

        const controllerAccessToken = await issueAccessToken(
          'controller',
          challenge.nodeId,
          controllerId,
          DEFAULT_CONTROLLER_SCOPES,
        );
        const controllerRefreshToken = issueRefreshToken(
          'controller',
          challenge.nodeId,
          controllerId,
          DEFAULT_CONTROLLER_SCOPES,
        );

        emitLog({
          level: 'info',
          source: 'relay',
          type: 'pairing_approved',
          nodeId: challenge.nodeId,
          status: 'approved',
          data: { challengeId: challenge.challengeId, controllerId },
        });

        jsonResponse(res, 200, {
          challengeId: challenge.challengeId,
          nodeId: challenge.nodeId,
          controllerId,
          scopes: DEFAULT_CONTROLLER_SCOPES,
          controllerAccessToken,
          controllerRefreshToken,
        });
      } catch {
        jsonResponse(res, 400, { error: 'invalid_json' });
      }
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/pairing/status') {
    const challengeId = url.searchParams.get('challengeId');
    if (!challengeId) {
      jsonResponse(res, 400, { error: 'challengeId_required' });
      return;
    }
    const challenge = pairingByChallenge.get(challengeId);
    if (!challenge) {
      jsonResponse(res, 404, { error: 'challenge_not_found' });
      return;
    }
    jsonResponse(res, 200, deriveStatus(challenge));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/refresh') {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { refreshToken?: string };
        if (!body.refreshToken) {
          jsonResponse(res, 400, { error: 'refreshToken_required' });
          return;
        }
        const session = resolveRefreshSession(body.refreshToken);
        if (!session) {
          jsonResponse(res, 401, { error: 'invalid_refresh_token' });
          return;
        }
        const accessToken = await issueAccessToken(
          session.role,
          session.nodeId,
          session.controllerId,
          session.scopes,
          session.clientId,
        );
        const refreshToken = issueRefreshToken(
          session.role,
          session.nodeId,
          session.controllerId,
          session.scopes,
          session.clientId,
        );
        revokeRefreshToken(body.refreshToken);
        jsonResponse(res, 200, { accessToken, refreshToken });
      } catch {
        jsonResponse(res, 400, { error: 'invalid_json' });
      }
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/revoke') {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { refreshToken?: string };
        if (!body.refreshToken) {
          jsonResponse(res, 400, { error: 'refreshToken_required' });
          return;
        }
        const existed = revokeRefreshToken(body.refreshToken);
        jsonResponse(res, 200, { revoked: existed });
      } catch {
        jsonResponse(res, 400, { error: 'invalid_json' });
      }
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/controller/register') {
    if (!canRegisterControllerClient(req)) {
      jsonResponse(res, 403, { error: 'registration_forbidden' });
      return;
    }

    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          name?: string;
          description?: string;
          avatarSeed?: string;
        };
        const name = typeof body.name === 'string' ? normalizeControllerNameInput(body.name).slice(0, 120) : '';
        const description = typeof body.description === 'string'
          ? body.description.trim().slice(0, 500)
          : '';
        if (!name || !description) {
          jsonResponse(res, 400, { error: 'controller_metadata_required' });
          return;
        }

        const normalizedName = normalizedControllerNameKey(name);
        const existing = findControllerByNormalizedName(normalizedName);
        if (existing) {
          jsonResponse(res, 409, {
            error: 'controller_name_conflict',
            code: 'controller_name_conflict',
            message: 'Controller name is already registered',
            clientId: existing.clientId,
          });
          return;
        }

        const clientId = `clt_${nanoid(10)}`;
        const clientSecret = `cs_${randomBytes(24).toString('base64url')}`;
        const secretSalt = randomBytes(16).toString('hex');
        const record: ControllerClientRecord = {
          clientId,
          name,
          description,
          normalizedName,
          avatarSeed: typeof body.avatarSeed === 'string' && body.avatarSeed.trim().length > 0
            ? body.avatarSeed.trim().slice(0, 64)
            : deriveAvatarSeed(name),
          secretSalt,
          secretHash: hashClientSecret(clientSecret, secretSalt),
          createdAt: Date.now(),
        };

        controllerClients.set(clientId, record);
        persistControllerClients();

        emitLog({
          level: 'info',
          source: 'relay',
          type: 'controller_client_registered',
          status: 'created',
          data: { clientId, name },
        });

        jsonResponse(res, 200, {
          clientId,
          name,
          description,
          avatarSeed: record.avatarSeed,
          clientSecret,
          createdAt: record.createdAt,
        });
      } catch {
        jsonResponse(res, 400, { error: 'invalid_json' });
      }
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/controller/token') {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          clientId?: string;
          clientSecret?: string;
        };

        if (!body.clientId || !body.clientSecret) {
          jsonResponse(res, 400, { error: 'client_credentials_required' });
          return;
        }

        const record = controllerClients.get(body.clientId);
        if (!record || record.revokedAt) {
          jsonResponse(res, 401, { error: 'invalid_client_credentials' });
          return;
        }

        if (!verifyClientSecret(body.clientSecret, record)) {
          emitLog({
            level: 'warn',
            source: 'relay',
            type: 'controller_client_auth_failed',
            status: 'denied',
            data: { clientId: body.clientId },
          });
          jsonResponse(res, 401, { error: 'invalid_client_credentials' });
          return;
        }

        const controllerId = `ctl_${nanoid(10)}`;
        const accessToken = await issueAccessToken(
          'controller',
          undefined,
          controllerId,
          DEFAULT_CONTROLLER_SCOPES,
          record.clientId,
        );
        const refreshToken = issueRefreshToken(
          'controller',
          undefined,
          controllerId,
          DEFAULT_CONTROLLER_SCOPES,
          record.clientId,
        );

        record.lastUsedAt = Date.now();
        controllerClients.set(record.clientId, record);
        persistControllerClients();

        emitLog({
          level: 'info',
          source: 'relay',
          type: 'controller_client_token_issued',
          status: 'issued',
          data: { clientId: record.clientId, controllerId },
        });

        jsonResponse(res, 200, {
          clientId: record.clientId,
          controllerId,
          scopes: DEFAULT_CONTROLLER_SCOPES,
          accessToken,
          refreshToken,
        });
      } catch {
        jsonResponse(res, 400, { error: 'invalid_json' });
      }
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/controller/remove') {
    if (!canRegisterControllerClient(req)) {
      jsonResponse(res, 403, { error: 'registration_forbidden' });
      return;
    }

    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { clientId?: string };
        const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
        if (!clientId) {
          jsonResponse(res, 400, { error: 'clientId_required' });
          return;
        }

        if (!controllerClients.has(clientId)) {
          jsonResponse(res, 404, { error: 'client_not_found' });
          return;
        }

        jsonResponse(res, 200, removeControllerClientById(clientId));
      } catch {
        jsonResponse(res, 400, { error: 'invalid_json' });
      }
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/controller/remove-all') {
    if (!canRegisterControllerClient(req)) {
      jsonResponse(res, 403, { error: 'registration_forbidden' });
      return;
    }

    const removedClientIds: string[] = [];
    let aclRevokedCount = 0;
    let refreshRevokedCount = 0;
    let disconnectedSessions = 0;
    const clientIds = Array.from(controllerClients.keys());

    for (const clientId of clientIds) {
      const removal = removeControllerClientById(clientId);
      removedClientIds.push(clientId);
      aclRevokedCount += removal.aclRevokedCount;
      refreshRevokedCount += removal.refreshRevokedCount;
      disconnectedSessions += removal.disconnectedSessions;
      purgeControllerClientById(clientId);
    }

    jsonResponse(res, 200, {
      ok: true,
      removedClientIds,
      removedCount: removedClientIds.length,
      aclRevokedCount,
      refreshRevokedCount,
      disconnectedSessions,
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/controller/access') {
    const token = parseBearerToken(req);
    if (!token) {
      jsonResponse(res, 401, { error: 'missing_access_token' });
      return;
    }

    void (async () => {
      try {
        const claims = await verifyAccessToken(token);
        if (claims.role !== 'node' || !claims.nodeId) {
          jsonResponse(res, 403, { error: 'forbidden_role' });
          return;
        }

        jsonResponse(res, 200, {
          nodeId: claims.nodeId,
          clients: listAclForNode(claims.nodeId),
        });
      } catch {
        jsonResponse(res, 401, { error: 'invalid_access_token' });
      }
    })();
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/controller/access') {
    const token = parseBearerToken(req);
    if (!token) {
      jsonResponse(res, 401, { error: 'missing_access_token' });
      return;
    }

    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      void (async () => {
        try {
          const claims = await verifyAccessToken(token);
          if (claims.role !== 'node' || !claims.nodeId) {
            jsonResponse(res, 403, { error: 'forbidden_role' });
            return;
          }

          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
            clientId?: string;
            grant?: boolean;
            expiresAt?: number;
          };

          if (!body.clientId || typeof body.grant !== 'boolean') {
            jsonResponse(res, 400, { error: 'clientId_and_grant_required' });
            return;
          }

          const record = controllerClients.get(body.clientId);
          if (!record || record.revokedAt) {
            jsonResponse(res, 404, { error: 'client_not_found' });
            return;
          }

          const key = aclKey(body.clientId, claims.nodeId);
          if (body.grant) {
            if (typeof body.expiresAt === 'number' && body.expiresAt <= Date.now()) {
              jsonResponse(res, 400, { error: 'invalid_expiresAt' });
              return;
            }

            const nextGrant: ControllerAclGrant = {
              clientId: body.clientId,
              nodeId: claims.nodeId,
              grantedByNodeId: claims.nodeId,
              grantedAt: Date.now(),
              expiresAt: typeof body.expiresAt === 'number' ? body.expiresAt : undefined,
            };

            controllerAcl.set(key, nextGrant);
            persistControllerAcl();

            emitLog({
              level: 'info',
              source: 'node',
              type: 'controller_acl_granted',
              nodeId: claims.nodeId,
              status: 'granted',
              data: { clientId: body.clientId, expiresAt: nextGrant.expiresAt },
            });

            jsonResponse(res, 200, { ok: true, clientId: body.clientId, nodeId: claims.nodeId, granted: true });
            return;
          }

          const removed = controllerAcl.delete(key);
          if (removed) {
            persistControllerAcl();
          }

          emitLog({
            level: 'info',
            source: 'node',
            type: 'controller_acl_revoked',
            nodeId: claims.nodeId,
            status: 'revoked',
            data: { clientId: body.clientId, existed: removed },
          });

          jsonResponse(res, 200, { ok: true, clientId: body.clientId, nodeId: claims.nodeId, granted: false });
        } catch {
          jsonResponse(res, 400, { error: 'invalid_json' });
        }
      })();
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/logs') {
    const since = url.searchParams.get('since');
    const level = url.searchParams.get('level');
    const nodeId = url.searchParams.get('nodeId');
    const requestId = url.searchParams.get('requestId');
    const source = url.searchParams.get('source');
    const latest = url.searchParams.get('latest');
    const sinceMs = parseSinceMs(since, Date.now() - 60 * 60 * 1000);
    if (since && sinceMs === null) {
      jsonResponse(res, 400, { error: 'invalid_since' });
      return;
    }
    const parsedLevel = parseLogLevel(level);
    if (level && parsedLevel === null) {
      jsonResponse(res, 400, { error: 'invalid_level' });
      return;
    }
    const parsedSource = parseLogSource(source);
    if (source && parsedSource === null) {
      jsonResponse(res, 400, { error: 'invalid_source' });
      return;
    }
    const parsedLatest = parseLatest(latest);
    if (latest && parsedLatest === null) {
      jsonResponse(res, 400, { error: 'invalid_latest' });
      return;
    }

    const logs = filterLogs({
      sinceMs: sinceMs ?? Date.now() - 60 * 60 * 1000,
      level: parsedLevel ?? undefined,
      nodeId: nodeId ?? undefined,
      requestId: requestId ?? undefined,
      source: parsedSource ?? undefined,
      latest: parsedLatest ?? undefined,
    });
    jsonResponse(res, 200, { logs });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/logs/status') {
    const sizeBytes = totalLogBytes();
    const oldest = logEvents.length > 0 ? logEvents[0]?.timestamp : null;
    const newest = logEvents.length > 0 ? logEvents[logEvents.length - 1]?.timestamp : null;
    jsonResponse(res, 200, {
      retentionDays: 14,
      totalEvents: logEvents.length,
      sizeBytes,
      windowing: {
        mode: 'daily',
        maxFileBytes: LOG_WINDOW_MAX_FILE_BYTES,
      },
      oldest,
      newest,
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/logs/export') {
    const since = url.searchParams.get('since');
    const level = url.searchParams.get('level');
    const nodeId = url.searchParams.get('nodeId');
    const requestId = url.searchParams.get('requestId');
    const source = url.searchParams.get('source');
    const latest = url.searchParams.get('latest');
    const sinceMs = parseSinceMs(since, Date.now() - 24 * 60 * 60 * 1000);
    if (since && sinceMs === null) {
      jsonResponse(res, 400, { error: 'invalid_since' });
      return;
    }
    const parsedLevel = parseLogLevel(level);
    if (level && parsedLevel === null) {
      jsonResponse(res, 400, { error: 'invalid_level' });
      return;
    }
    const parsedSource = parseLogSource(source);
    if (source && parsedSource === null) {
      jsonResponse(res, 400, { error: 'invalid_source' });
      return;
    }
    const parsedLatest = parseLatest(latest);
    if (latest && parsedLatest === null) {
      jsonResponse(res, 400, { error: 'invalid_latest' });
      return;
    }

    const filtered = filterLogs({
      sinceMs: sinceMs ?? Date.now() - 24 * 60 * 60 * 1000,
      level: parsedLevel ?? undefined,
      nodeId: nodeId ?? undefined,
      requestId: requestId ?? undefined,
      source: parsedSource ?? undefined,
      latest: parsedLatest ?? undefined,
    });

    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    res.end(filtered.map((evt) => JSON.stringify(evt)).join('\n'));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/nodes/connected') {
    const token = parseBearerToken(req);
    if (!token) {
      jsonResponse(res, 401, { error: 'missing_access_token' });
      return;
    }

    void (async () => {
      try {
        const claims = await verifyAccessToken(token);
        if (claims.role !== 'controller') {
          jsonResponse(res, 403, { error: 'forbidden_role' });
          return;
        }

        const nodes = Array.from(nodeClients.entries())
          .filter(([, client]) => client.authenticated)
          .map(([nodeId]) => ({ nodeId }));

        jsonResponse(res, 200, { nodes });
      } catch {
        jsonResponse(res, 401, { error: 'invalid_access_token' });
      }
    })();
    return;
  }

  jsonResponse(res, 404, { error: 'not_found' });
});

server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin;
  const role = req.url?.includes('role=node') ? 'node' : 'controller';

  emitLog({
    level: 'info',
    source: 'relay',
    type: 'ws_upgrade_attempt',
    data: {
      role,
      url: req.url,
      origin,
    },
  });

  if (role === 'node') {
    const allowedOrigin = process.env.OTTO_EXTENSION_ORIGIN;
    if (allowedOrigin && origin !== allowedOrigin) {
      emitLog({
        level: 'warn',
        source: 'relay',
        type: 'ws_upgrade_rejected',
        data: {
          role,
          url: req.url,
          origin,
          reason: 'origin_not_allowed',
          allowedOrigin,
        },
      });
      socket.write('HTTP/1.1 403 Forbidden\\r\\n\\r\\n');
      socket.destroy();
      return;
    }
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws);
  });
});

wss.on('connection', (ws) => {
  const clientId = nanoid();
  let client: Client | null = null;

  ws.on('message', (raw) => {
    releaseExpiredLocks();

    let msg: Envelope;
    try {
      msg = JSON.parse(String(raw)) as Envelope;
    } catch {
      send(ws, buildError('unknown', 'relay', {
        category: 'validation',
        code: 'invalid_json',
        message: 'Unable to parse JSON frame',
      }));
      return;
    }

    if (msg.messageType === 'hello') {
      const parsed = helloSchema.safeParse(msg.payload);
      if (!parsed.success) {
        send(ws, buildError(msg.requestId, 'relay', {
          category: 'validation',
          code: 'invalid_hello',
          message: parsed.error.message,
        }));
        return;
      }

      client = {
        id: clientId,
        ws,
        role: parsed.data.role,
        nodeId: parsed.data.nodeId,
        scopes: [],
        authenticated: false,
        subscriptions: new Set<string>(),
      };
      clients.set(client.id, client);
      if (client.role === 'node' && client.nodeId) {
        nodeClients.set(client.nodeId, client);
      }

      send(ws, buildEnvelope('hello_ack', 'relay', msg.requestId, {
        accepted: true,
        heartbeatIntervalMs: 15000,
      }));
      return;
    }

    if (!client) {
      send(ws, buildError(msg.requestId, 'relay', {
        category: 'auth',
        code: 'not_initialized',
        message: 'Send hello first',
      }));
      return;
    }

    if (msg.messageType === 'auth') {
      const payload = msg.payload as { accessToken?: string };
      if (!payload.accessToken) {
        emitLog({
          level: 'warn',
          source: 'relay',
          type: 'auth_rejected',
          requestId: msg.requestId,
          nodeId: client.nodeId,
          data: { reason: 'missing_access_token', role: client.role },
        });
        send(ws, buildError(msg.requestId, 'relay', {
          category: 'auth',
          code: 'missing_access_token',
          message: 'accessToken is required',
        }));
        return;
      }

      verifyAccessToken(payload.accessToken)
        .then((token) => {
          if (token.role !== client?.role) {
            emitLog({
              level: 'warn',
              source: 'relay',
              type: 'auth_rejected',
              requestId: msg.requestId,
              nodeId: client?.nodeId,
              data: { reason: 'role_mismatch', role: client?.role, tokenRole: token.role },
            });
            send(ws, buildError(msg.requestId, 'relay', {
              category: 'auth',
              code: 'role_mismatch',
              message: 'Token role mismatch',
            }));
            return;
          }
          if (client?.role === 'node' && client.nodeId && token.nodeId && client.nodeId !== token.nodeId) {
            emitLog({
              level: 'warn',
              source: 'relay',
              type: 'auth_rejected',
              requestId: msg.requestId,
              nodeId: client.nodeId,
              data: { reason: 'node_mismatch', tokenNodeId: token.nodeId },
            });
            send(ws, buildError(msg.requestId, 'relay', {
              category: 'auth',
              code: 'node_mismatch',
              message: 'Token nodeId mismatch',
            }));
            return;
          }

          if (token.role === 'controller' && isRevokedControllerClient(token.clientId)) {
            emitLog({
              level: 'warn',
              source: 'relay',
              type: 'auth_rejected',
              requestId: msg.requestId,
              data: { reason: 'controller_revoked', clientId: token.clientId },
            });
            send(ws, buildError(msg.requestId, 'relay', {
              category: 'auth',
              code: 'invalid_access_token',
              message: 'Controller client has been revoked',
              clientId: token.clientId,
            }));
            return;
          }

          if (client) {
            client.authenticated = true;
            client.nodeId = token.nodeId ?? client.nodeId;
            client.controllerId = token.controllerId;
            client.clientId = token.clientId;
            client.scopes = token.scopes;
          }

          send(ws, buildEnvelope('auth_ack', 'relay', msg.requestId, {
            accepted: true,
            role: token.role,
            nodeId: token.nodeId,
            controllerId: token.controllerId,
            scopes: token.scopes,
          }));
        })
        .catch(() => {
          emitLog({
            level: 'warn',
            source: 'relay',
            type: 'auth_rejected',
            requestId: msg.requestId,
            nodeId: client?.nodeId,
            data: { reason: 'invalid_access_token', role: client?.role },
          });
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'auth',
            code: 'invalid_access_token',
            message: 'Access token verification failed',
          }));
        });
      return;
    }

    if (!client.authenticated) {
      emitLog({
        level: 'warn',
        source: 'relay',
        type: 'unauthenticated_frame_rejected',
        requestId: msg.requestId,
        nodeId: client.nodeId,
        data: {
          role: client.role,
          messageType: msg.messageType,
        },
      });
      send(ws, buildError(msg.requestId, 'relay', {
        category: 'auth',
        code: 'unauthenticated',
        message: 'Authenticate before sending this frame type',
      }));
      return;
    }

    if (!checkRateLimit(client.id)) {
      send(ws, buildError(msg.requestId, 'relay', {
        category: 'auth',
        code: 'rate_limited',
        message: 'Rate limit exceeded for this session',
        retryable: true,
      }));
      return;
    }

    if (msg.messageType === 'event') {
      const payload = msg.payload as { type?: string };
      if (client.role === 'controller' && payload.type === 'logs_subscribe') {
        const parsed = logsSubscribeSchema.safeParse(msg.payload);
        if (!parsed.success) {
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'validation',
            code: 'invalid_logs_subscribe',
            message: parsed.error.message,
          }));
          return;
        }

        const sourceFilter = parsed.data.source ?? 'all';
        client.subscriptions.add('logs');
        client.logSourceFilter = sourceFilter;
        send(ws, buildEnvelope('event', 'relay', msg.requestId, { type: 'logs_subscribed', source: sourceFilter }));
        return;
      }

      if (client.role === 'node' && payload.type === 'extension_log') {
        const parsed = extensionLogEventSchema.safeParse(msg.payload);
        if (!parsed.success) {
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'validation',
            code: 'invalid_extension_log',
            message: parsed.error.message,
          }));
          return;
        }

        const entry = parsed.data.entry;
        emitLog({
          level: entry.level,
          source: 'node',
          type: entry.type,
          requestId: entry.requestId ?? msg.requestId,
          traceId: entry.traceId,
          nodeId: client.nodeId,
          action: entry.action,
          status: entry.status,
          data: {
            eventTimestamp: entry.timestamp,
            payload: entry.data,
          },
        });
      }

      if (client.role === 'node' && payload.type === 'listener_update') {
        const parsed = listenerUpdateEventSchema.safeParse(msg.payload);
        if (!parsed.success) {
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'validation',
            code: 'invalid_listener_update',
            message: parsed.error.message,
          }));
          return;
        }

        const subscription = listenerSubscriptions.get(msg.requestId);
        if (!subscription) {
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'routing',
            code: 'listener_not_found',
            message: 'No active listener subscription for requestId',
          }));
          return;
        }

        if (subscription.nodeId !== client.nodeId) {
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'auth',
            code: 'listener_node_mismatch',
            message: 'Listener subscription does not belong to this node session',
            nodeId: client.nodeId,
          }));
          return;
        }

        const owner = clients.get(subscription.controllerId);
        if (!owner || !owner.authenticated) {
          removeListenerSubscription(msg.requestId);
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'routing',
            code: 'listener_owner_offline',
            message: 'Listener owner is no longer connected',
            nodeId: client.nodeId,
          }));
          return;
        }

        const streamSessionRequestId = listenerToRecipeStreamSession.get(msg.requestId);
        if (streamSessionRequestId) {
          send(owner.ws, buildEnvelope('event', 'relay', streamSessionRequestId, {
            type: 'listener_update',
            data: parsed.data.data,
            updateType: parsed.data.updateType,
            emittedAt: parsed.data.emittedAt,
          }));
        } else {
          send(owner.ws, msg);
        }
        emitLog({
          level: 'info',
          source: 'node',
          type: 'listener_update',
          requestId: msg.requestId,
          nodeId: client.nodeId,
          status: 'update',
          data: parsed.data,
        });
        return;
      }
      return;
    }

    if (msg.messageType === 'tab_lock') {
      if (client.role !== 'controller') {
        send(ws, buildError(msg.requestId, 'relay', {
          category: 'auth',
          code: 'forbidden_role',
          message: 'Only controllers can lock tabs',
        }));
        return;
      }

      const payload = msg.payload as LockPayload;
      const key = lockKey(payload.targetNodeId, payload.tabSessionId);
      const current = locks.get(key);
      if (current && current.controllerId !== client.id) {
        send(ws, buildError(msg.requestId, 'relay', {
          category: 'lock_conflict',
          code: 'tab_locked',
          message: 'tabSessionId is locked by another controller',
          retryable: true,
          nodeId: payload.targetNodeId,
          tabSessionId: payload.tabSessionId,
        }));
        send(ws, buildEnvelope('event', 'relay', msg.requestId, {
          type: 'lock_conflict',
          targetNodeId: payload.targetNodeId,
          tabSessionId: payload.tabSessionId,
          lockOwnerControllerId: current.controllerId,
          lockExpiresAt: current.expiresAt,
        }));
        emitLog({
          level: 'warn',
          source: 'relay',
          type: 'lock_conflict',
          requestId: msg.requestId,
          nodeId: payload.targetNodeId,
          data: { tabSessionId: payload.tabSessionId },
        });
        return;
      }

      if (current && current.controllerId === client.id) {
        const nextExpiresAt = Date.now() + (payload.lockLeaseMs ?? 30_000);
        current.expiresAt = nextExpiresAt;
        send(ws, buildEnvelope('event', 'relay', msg.requestId, {
          type: 'lock_renewed',
          targetNodeId: payload.targetNodeId,
          tabSessionId: payload.tabSessionId,
          lockOwnerControllerId: client.id,
          lockLeaseMs: payload.lockLeaseMs ?? 30_000,
          lockExpiresAt: nextExpiresAt,
        }));
        return;
      }

      const lockExpiresAt = Date.now() + (payload.lockLeaseMs ?? 30_000);
      locks.set(key, {
        controllerId: client.id,
        expiresAt: lockExpiresAt,
      });

      send(ws, buildEnvelope('event', 'relay', msg.requestId, {
        type: 'lock_acquired',
        targetNodeId: payload.targetNodeId,
        tabSessionId: payload.tabSessionId,
        lockOwnerControllerId: client.id,
        lockLeaseMs: payload.lockLeaseMs ?? 30_000,
        lockExpiresAt,
      }));
      return;
    }

    if (msg.messageType === 'tab_unlock') {
      const payload = msg.payload as LockPayload;
      const key = lockKey(payload.targetNodeId, payload.tabSessionId);
      const current = locks.get(key);
      if (current?.controllerId === client.id) {
        locks.delete(key);
      }
      send(ws, buildEnvelope('event', 'relay', msg.requestId, {
        type: 'lock_released',
        targetNodeId: payload.targetNodeId,
        tabSessionId: payload.tabSessionId,
      }));
      return;
    }

    if (msg.messageType === 'command') {
      if (client.role !== 'controller') {
        send(ws, buildError(msg.requestId, 'relay', {
          category: 'auth',
          code: 'forbidden_role',
          message: 'Only controller can send command frames',
        }));
        return;
      }

      if (isRevokedControllerClient(client.clientId)) {
        send(ws, buildError(msg.requestId, 'relay', {
          category: 'auth',
          code: 'controller_revoked',
          message: 'Controller client has been removed and cannot execute commands',
          clientId: client.clientId,
        }));
        ws.close();
        return;
      }

      const payload = msg.payload as {
        targetNodeId?: string;
        action?: string;
        replayNonce?: string;
        payload?: { targetRequestId?: string };
      };
      if (!isActionAllowed(client.scopes, String(payload.action ?? ''))) {
        send(ws, buildError(msg.requestId, 'relay', {
          category: 'auth',
          code: 'forbidden_action',
          message: 'Controller token does not allow this action',
          action: String(payload.action ?? ''),
          nodeId: payload.targetNodeId,
        }));
        return;
      }

      const replay = validateReplayWindow(client.id, msg.timestamp, payload.replayNonce);
      if (!replay.ok) {
        send(ws, buildError(msg.requestId, 'relay', {
          category: 'validation',
          code: replay.code,
          message: replay.message,
        }));
        return;
      }

      if (!payload.targetNodeId) {
        send(ws, buildError(msg.requestId, 'relay', {
          category: 'validation',
          code: 'missing_target_node',
          message: 'targetNodeId is required',
        }));
        return;
      }

      if (!isControllerAllowedNode(client, payload.targetNodeId)) {
        send(ws, buildError(msg.requestId, 'relay', {
          category: 'auth',
          code: 'acl_missing_node_grant',
          message: 'Controller is not granted access to targetNodeId. Approve this controller in extension Controller Access UI.',
          actionableHint: 'Approve this controller from extension popup/options Controller Access section.',
          action: String(payload.action ?? ''),
          nodeId: payload.targetNodeId,
          clientId: client.clientId,
        }));
        emitLog({
          level: 'warn',
          source: 'relay',
          type: 'controller_acl_denied',
          requestId: msg.requestId,
          nodeId: payload.targetNodeId,
          action: String(payload.action ?? ''),
          status: 'denied',
          data: {
            controllerId: client.controllerId,
            clientId: client.clientId,
          },
        });
        return;
      }

      if (payload.action === 'listener.unsubscribe') {
        const targetRequestId = payload.payload?.targetRequestId;
        if (!targetRequestId || typeof targetRequestId !== 'string') {
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'validation',
            code: 'missing_listener_target',
            message: 'listener.unsubscribe requires payload.targetRequestId',
            action: String(payload.action ?? ''),
          }));
          return;
        }

        const existing = listenerSubscriptions.get(targetRequestId);
        if (!existing) {
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'routing',
            code: 'listener_not_found',
            message: 'No active listener subscription for payload.targetRequestId',
            action: String(payload.action ?? ''),
            nodeId: payload.targetNodeId,
          }));
          return;
        }

        if (existing.controllerId !== client.id) {
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'auth',
            code: 'listener_owner_mismatch',
            message: 'Cannot unsubscribe a listener owned by another controller',
            action: String(payload.action ?? ''),
            nodeId: payload.targetNodeId,
          }));
          return;
        }

        if (existing.nodeId !== payload.targetNodeId) {
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'validation',
            code: 'listener_node_mismatch',
            message: 'listener target node must match subscribed listener node',
            action: String(payload.action ?? ''),
            nodeId: payload.targetNodeId,
          }));
          return;
        }
      }

      const targetNode = nodeClients.get(payload.targetNodeId);
      if (!targetNode || !targetNode.authenticated) {
        send(ws, buildError(msg.requestId, 'relay', {
          category: 'routing',
          code: 'node_offline',
          message: `Node ${payload.targetNodeId} is not connected`,
          retryable: true,
          nodeId: payload.targetNodeId,
        }));
        return;
      }

      const tabSessionId = (msg.payload as { tabSessionId?: string }).tabSessionId;
      const queueKey = tabSessionId ? tabQueueKey(payload.targetNodeId, tabSessionId) : undefined;
      if (queueKey && inflightByTab.has(queueKey)) {
        const waitPolicy = (msg.payload as { waitPolicy?: string }).waitPolicy ?? 'fail_fast';
        if (waitPolicy === 'fail_fast') {
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'lock_conflict',
            code: 'tab_busy',
            message: 'tabSessionId is busy and waitPolicy is fail_fast',
            retryable: true,
            nodeId: payload.targetNodeId,
            tabSessionId,
            action: String(payload.action ?? 'unknown'),
          }));
          return;
        }

        const queue = queuedByTab.get(queueKey) ?? [];
        if (queue.length >= TAB_QUEUE_LIMIT) {
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'lock_conflict',
            code: 'tab_queue_limit_exceeded',
            message: `tabSessionId queue limit exceeded (${TAB_QUEUE_LIMIT})`,
            retryable: true,
            nodeId: payload.targetNodeId,
            tabSessionId,
            action: String(payload.action ?? 'unknown'),
          }));
          return;
        }

        const controllerQueuedDepth = queuedDepthForController(client.id);
        if (controllerQueuedDepth >= CONTROLLER_QUEUE_LIMIT) {
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'lock_conflict',
            code: 'controller_queue_limit_exceeded',
            message: `controller queued command limit exceeded (${CONTROLLER_QUEUE_LIMIT})`,
            retryable: true,
            nodeId: payload.targetNodeId,
            tabSessionId,
            action: String(payload.action ?? 'unknown'),
          }));
          return;
        }

        const waitTimeoutMs = Math.max(1000, Number((msg.payload as { timeoutMs?: number }).timeoutMs ?? 30_000));
        const timeoutHandle = setTimeout(() => {
          const currentQueue = queuedByTab.get(queueKey);
          if (!currentQueue) return;
          const index = currentQueue.findIndex((item) => item.message.requestId === msg.requestId);
          if (index === -1) return;
          const [removed] = currentQueue.splice(index, 1);
          if (currentQueue.length === 0) queuedByTab.delete(queueKey);

          if (removed) {
            const owner = clients.get(removed.controllerId);
            if (owner) {
              send(owner.ws, buildError(msg.requestId, 'relay', {
                category: 'timeout',
                code: 'queue_wait_timed_out',
                message: 'Command timed out while waiting in queue',
                retryable: true,
                nodeId: payload.targetNodeId,
                action: String(payload.action ?? 'unknown'),
                tabSessionId,
              }));
            }
          }
        }, waitTimeoutMs);

        queue.push({ message: msg, controllerId: client.id, timeoutHandle });
        queuedByTab.set(queueKey, queue);
        send(ws, buildEnvelope('event', 'relay', msg.requestId, {
          type: 'queued',
          targetNodeId: payload.targetNodeId,
          tabSessionId,
          queueDepth: queue.length,
        }));
        return;
      }

      if (payload.action === 'listener.subscribe') {
        const subscribePayload = asRecord(payload.payload);
        const listener = subscribePayload?.listener;
        if (typeof listener === 'string' && listener.length > 0) {
          const streamSession = findCandidateRecipeStreamSession(
            client.id,
            payload.targetNodeId,
            queueKey,
            listener,
          );
          if (streamSession) {
            const declaredListener = streamSession.listeners.find((item) => {
              if (item.subscribeRequestId) {
                return false;
              }
              return item.listener === listener;
            });
            if (declaredListener) {
              declaredListener.subscribeRequestId = msg.requestId;
              listenerToRecipeStreamSession.set(msg.requestId, streamSession.requestId);
            }
          }
        }
      }

      const timeoutMs = Number((msg.payload as { timeoutMs?: number }).timeoutMs ?? 30_000);
      if (queueKey) inflightByTab.add(queueKey);
      const timeoutHandle = setTimeout(() => {
        const stillPending = pendingCommands.get(msg.requestId);
        if (!stillPending) return;
        if (stillPending.action === 'listener.subscribe') {
          const sessionRequestId = listenerToRecipeStreamSession.get(stillPending.requestId);
          if (sessionRequestId) {
            const streamSession = recipeTestStreamSessions.get(sessionRequestId);
            const streamOwner = streamSession ? clients.get(streamSession.controllerId) : undefined;
            if (streamSession && streamOwner) {
              send(streamOwner.ws, buildEnvelope('result', 'relay', streamSession.requestId, {
                ok: true,
                durationMs: Date.now() - streamSession.createdAt,
                action: streamSession.action,
                commandOutcome: 'timed_out',
                data: {
                  streamTimedOut: true,
                  reason: 'listener_subscribe_timeout',
                },
              }));
            }
            clearRecipeTestStreamSession(sessionRequestId);
          }
        }
        const owner = clients.get(stillPending.controllerId);
        if (owner) {
          send(owner.ws, buildError(msg.requestId, 'relay', {
            category: 'timeout',
            code: 'command_timed_out',
            message: 'Command exceeded timeout before terminal response',
            retryable: true,
            nodeId: stillPending.nodeId,
            action: stillPending.action,
          }));
        }
        pendingCommands.delete(msg.requestId);
        clearInflightAndRunNext(stillPending.tabKey);
      }, Math.max(1000, timeoutMs));

      pendingCommands.set(msg.requestId, {
        requestId: msg.requestId,
        controllerId: client.id,
        nodeId: payload.targetNodeId,
        action: String(payload.action ?? 'unknown'),
        timeoutMs,
        unsubscribeTargetRequestId: payload.action === 'listener.unsubscribe' ? payload.payload?.targetRequestId : undefined,
        createdAt: Date.now(),
        tabKey: queueKey,
        timeoutHandle,
      });

      send(targetNode.ws, msg);
      send(ws, buildEnvelope('event', 'relay', msg.requestId, {
        type: 'routed',
        targetNodeId: payload.targetNodeId,
        tabSessionId,
      }));
      emitLog({
        level: 'info',
        source: 'controller',
        type: 'command_routed',
        requestId: msg.requestId,
        nodeId: payload.targetNodeId,
        action: String(payload.action ?? ''),
        status: 'routed',
      });
      return;
    }

    if (msg.messageType === 'command_cancel') {
      if (client.role !== 'controller') {
        send(ws, buildError(msg.requestId, 'relay', {
          category: 'auth',
          code: 'forbidden_role',
          message: 'Only controller can cancel commands',
        }));
        return;
      }

      const payload = msg.payload as { targetRequestId?: string };
      if (!payload.targetRequestId) {
        send(ws, buildError(msg.requestId, 'relay', {
          category: 'validation',
          code: 'missing_target_request',
          message: 'targetRequestId is required',
        }));
        return;
      }

      const pending = pendingCommands.get(payload.targetRequestId);
      if (!pending) {
        let removedFromQueue = false;
        let queuedControllerId: string | undefined;
        let queuedAction: string | undefined;
        let queuedNodeId: string | undefined;
        let queuedTabSessionId: string | undefined;
        for (const [tabKey, queue] of queuedByTab.entries()) {
          const index = queue.findIndex((item) => item.message.requestId === payload.targetRequestId);
          if (index !== -1) {
            const queued = queue[index];
            const queuedPayload = queued?.message.payload as { action?: string; targetNodeId?: string; tabSessionId?: string } | undefined;
            queuedControllerId = queued?.controllerId;
            queuedAction = queuedPayload?.action;
            queuedNodeId = queuedPayload?.targetNodeId;
            queuedTabSessionId = queuedPayload?.tabSessionId;
            clearTimeout(queued?.timeoutHandle);
            queue.splice(index, 1);
            if (queue.length === 0) queuedByTab.delete(tabKey);
            removedFromQueue = true;
            break;
          }
        }

        if (removedFromQueue) {
          const queuedOwner = queuedControllerId ? clients.get(queuedControllerId) : undefined;
          if (queuedOwner) {
            send(queuedOwner.ws, buildError(payload.targetRequestId, 'relay', {
              category: 'execution',
              code: 'command_cancelled',
              message: 'Command was cancelled before execution',
              retryable: true,
              action: queuedAction,
              nodeId: queuedNodeId,
              tabSessionId: queuedTabSessionId,
            }));
          }

          send(ws, buildEnvelope('event', 'relay', msg.requestId, {
            type: 'cancel_ack',
            targetRequestId: payload.targetRequestId,
            status: 'cancelled',
          }));
          return;
        }

        const streamSession = recipeTestStreamSessions.get(payload.targetRequestId);
        if (streamSession) {
          if (streamSession.controllerId !== client.id) {
            send(ws, buildError(msg.requestId, 'relay', {
              category: 'auth',
              code: 'command_owner_mismatch',
              message: 'Cannot cancel a recipe test stream owned by another controller',
              nodeId: streamSession.nodeId,
              action: streamSession.action,
            }));
            return;
          }

          const nodeClient = nodeClients.get(streamSession.nodeId);
          if (nodeClient) {
            for (const listener of streamSession.listeners) {
              if (!listener.subscribeRequestId) {
                continue;
              }

              send(nodeClient.ws, buildEnvelope('command', 'relay', nanoid(), {
                targetNodeId: streamSession.nodeId,
                action: 'listener.unsubscribe',
                payload: {
                  targetRequestId: listener.subscribeRequestId,
                },
                timeoutMs: 5000,
                waitPolicy: 'fail_fast',
              }));
            }
          }

          send(ws, buildEnvelope('result', 'relay', payload.targetRequestId, {
            ok: true,
            durationMs: Date.now() - streamSession.createdAt,
            action: streamSession.action,
            commandOutcome: 'cancelled',
            data: {
              streamCancelled: true,
            },
          }));
          clearRecipeTestStreamSession(streamSession.requestId);
          send(ws, buildEnvelope('event', 'relay', msg.requestId, {
            type: 'cancel_ack',
            targetRequestId: payload.targetRequestId,
            status: 'cancelled',
          }));
          return;
        }

        send(ws, buildError(msg.requestId, 'relay', {
          category: 'routing',
          code: 'command_not_found',
          message: 'No pending command with targetRequestId',
        }));
        return;
      }

      const nodeClient = nodeClients.get(pending.nodeId);
      if (nodeClient) {
        send(nodeClient.ws, buildEnvelope('command_cancel', 'relay', msg.requestId, {
          targetRequestId: payload.targetRequestId,
          nodeId: pending.nodeId,
          action: pending.action,
        }));
      }

      send(ws, buildEnvelope('event', 'relay', msg.requestId, {
        type: 'cancel_ack',
        targetRequestId: payload.targetRequestId,
        status: 'forwarded',
      }));
      return;
    }

    if (msg.messageType === 'result' || msg.messageType === 'error') {
      const pending = pendingCommands.get(msg.requestId);
      if (pending) {
        const owner = clients.get(pending.controllerId);
        if (owner) send(owner.ws, msg);

        if (msg.messageType === 'result') {
          const resultPayload = msg.payload as { ok?: boolean };
          if (resultPayload.ok === true && pending.action === 'listener.subscribe') {
            listenerSubscriptions.set(msg.requestId, {
              requestId: msg.requestId,
              controllerId: pending.controllerId,
              nodeId: pending.nodeId,
              createdAt: Date.now(),
            });
          }
          if (resultPayload.ok === true && pending.action === 'listener.unsubscribe' && pending.unsubscribeTargetRequestId) {
            removeListenerSubscription(pending.unsubscribeTargetRequestId);
          }

          if (resultPayload.ok === true && pending.action === 'recipe.test') {
            const listeners = extractRecipeStreamListeners(msg.payload);
            if (listeners.length > 0) {
              const streamTimeoutMs = Math.max(1000, pending.timeoutMs);
              const timeoutHandle = setTimeout(() => {
                const activeSession = recipeTestStreamSessions.get(msg.requestId);
                if (!activeSession) {
                  return;
                }

                const sessionOwner = clients.get(activeSession.controllerId);
                if (sessionOwner) {
                  send(sessionOwner.ws, buildEnvelope('result', 'relay', activeSession.requestId, {
                    ok: true,
                    durationMs: Date.now() - activeSession.createdAt,
                    action: activeSession.action,
                    commandOutcome: 'timed_out',
                    data: {
                      streamTimedOut: true,
                    },
                  }));
                }
                clearRecipeTestStreamSession(activeSession.requestId);
              }, streamTimeoutMs);

              recipeTestStreamSessions.set(msg.requestId, {
                requestId: msg.requestId,
                controllerId: pending.controllerId,
                nodeId: pending.nodeId,
                action: pending.action,
                createdAt: pending.createdAt,
                tabKey: pending.tabKey,
                timeoutHandle,
                listeners,
              });
            }
          }
        }

        if (pending.action === 'listener.subscribe') {
          const sessionRequestId = listenerToRecipeStreamSession.get(msg.requestId);
          const listenerSubscribeFailed = msg.messageType === 'error'
            || (msg.messageType === 'result' && (msg.payload as { ok?: boolean }).ok !== true);
          if (sessionRequestId && listenerSubscribeFailed) {
            const streamSession = recipeTestStreamSessions.get(sessionRequestId);
            const streamOwner = streamSession ? clients.get(streamSession.controllerId) : undefined;
            if (streamSession && streamOwner) {
              send(streamOwner.ws, buildEnvelope('result', 'relay', streamSession.requestId, {
                ok: true,
                durationMs: Date.now() - streamSession.createdAt,
                action: streamSession.action,
                commandOutcome: 'failed',
                data: {
                  streamFailed: true,
                  reason: 'listener_subscribe_failed',
                },
              }));
            }
            clearRecipeTestStreamSession(sessionRequestId);
          }
        }

        clearTimeout(pending.timeoutHandle);
        pendingCommands.delete(msg.requestId);
        clearInflightAndRunNext(pending.tabKey);
      }

      emitLog({
        level: msg.messageType === 'error' ? 'error' : 'info',
        source: client.role,
        type: msg.messageType,
        requestId: msg.requestId,
        nodeId: client.nodeId,
        status: msg.messageType,
        data: msg.payload,
      });
      return;
    }

    if (msg.messageType === 'refresh') {
      const payload = msg.payload as { refreshToken?: string };
      if (!payload.refreshToken) {
        send(ws, buildError(msg.requestId, 'relay', {
          category: 'auth',
          code: 'missing_refresh_token',
          message: 'refreshToken is required',
        }));
        return;
      }
      const session = resolveRefreshSession(payload.refreshToken);
      if (!session) {
        send(ws, buildError(msg.requestId, 'relay', {
          category: 'auth',
          code: 'invalid_refresh_token',
          message: 'Refresh token invalid',
        }));
        return;
      }
      issueAccessToken(session.role, session.nodeId, session.controllerId, session.scopes, session.clientId)
        .then((accessToken) => {
          send(ws, buildEnvelope('refresh_ack', 'relay', msg.requestId, { accessToken }));
        })
        .catch(() => {
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'internal',
            code: 'refresh_failed',
            message: 'Failed to refresh access token',
          }));
        });
    }
  });

  ws.on('close', () => {
    if (!client) return;

    clients.delete(client.id);
    replayState.delete(client.id);
    if (client.role === 'node' && client.nodeId) {
      nodeClients.delete(client.nodeId);
      removeListenerSubscriptionsForNode(client.nodeId);

      for (const [sessionRequestId, session] of recipeTestStreamSessions.entries()) {
        if (session.nodeId !== client.nodeId) {
          continue;
        }
        const owner = clients.get(session.controllerId);
        if (owner) {
          send(owner.ws, buildEnvelope('result', 'relay', sessionRequestId, {
            ok: true,
            durationMs: Date.now() - session.createdAt,
            action: session.action,
            commandOutcome: 'failed',
            data: {
              streamFailed: true,
              reason: 'node_disconnected',
            },
          }));
        }
      }
      clearRecipeTestStreamSessionsForNode(client.nodeId);

      for (const [requestId, pending] of pendingCommands.entries()) {
        if (pending.nodeId === client.nodeId) {
          const owner = clients.get(pending.controllerId);
          if (owner) {
            send(owner.ws, buildError(requestId, 'relay', {
              category: 'execution',
              code: 'node_disconnected',
              message: 'Node disconnected during in-flight command',
              retryable: true,
              nodeId: pending.nodeId,
              action: pending.action,
            }));
          }
          clearTimeout(pending.timeoutHandle);
          pendingCommands.delete(requestId);
          clearInflightAndRunNext(pending.tabKey);
        }
      }
    }

    if (client.role === 'controller') {
      removeListenerSubscriptionsForController(client.id);
      clearRecipeTestStreamSessionsForController(client.id);
    }

    for (const [key, lock] of locks.entries()) {
      if (lock.controllerId === client.id) {
        locks.delete(key);
      }
    }
  });
});

setInterval(() => {
  cleanupLogs();
  cleanupRefreshSessions();
  cleanupControllerAcl();
}, 60 * 60 * 1000);

server.listen(PORT, () => {
  console.log(`[relay] listening on :${PORT}`);
  console.log(
    `[relay] auth config accessTtl=${TOKEN_TTL_SECONDS}s refreshTtl=${REFRESH_TTL_SECONDS}s refreshStore=${REFRESH_SESSIONS_FILE}`,
  );
  emitLog({
    level: 'info',
    source: 'relay',
    type: 'relay_started',
    status: 'listening',
    data: {
      port: PORT,
      accessTokenTtlSeconds: TOKEN_TTL_SECONDS,
      refreshTokenTtlSeconds: REFRESH_TTL_SECONDS,
      refreshSessionStore: {
        file: REFRESH_SESSIONS_FILE,
        ...refreshStoreStats,
      },
      controllerClientStore: {
        file: CONTROLLER_CLIENTS_FILE,
        ...controllerClientStoreStats,
      },
      controllerAclStore: {
        file: CONTROLLER_ACL_FILE,
        ...controllerAclStoreStats,
      },
    },
  });
});
