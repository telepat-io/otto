import { homedir } from 'node:os';
import { join } from 'node:path';
import packageJson from '../package.json' with { type: 'json' };

export const RELAY_VERSION: string = packageJson.version;
export const PORT = Number(process.env.OTTO_RELAY_PORT ?? 8787);
export const TOKEN_SECRET = process.env.OTTO_TOKEN_SECRET ?? 'dev-only-change-me';
export const TOKEN_PREVIOUS_SECRET = process.env.OTTO_TOKEN_PREVIOUS_SECRET;
export const TOKEN_ISSUER = process.env.OTTO_TOKEN_ISSUER ?? 'otto-relay';
export const TOKEN_AUDIENCE = process.env.OTTO_TOKEN_AUDIENCE ?? 'otto-clients';

export function parseEnvInt(name: string, fallback: number, min = 1, max?: number): number {
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

export const TOKEN_TTL_SECONDS = parseEnvInt('OTTO_TOKEN_TTL_MINUTES', 15, 1, 24 * 60) * 60;
export const REFRESH_TTL_SECONDS = parseEnvInt('OTTO_REFRESH_TTL_DAYS', 30, 1, 365) * 24 * 60 * 60;
export const RATE_LIMIT_PER_MIN = Number(process.env.OTTO_RATE_LIMIT_PER_MIN ?? 120);
export const REPLAY_WINDOW_MS = Number(process.env.OTTO_REPLAY_WINDOW_MS ?? 60_000);
export const TAB_QUEUE_LIMIT = Math.max(1, Number(process.env.OTTO_TAB_QUEUE_LIMIT ?? 20));
export const CONTROLLER_QUEUE_LIMIT = Math.max(1, Number(process.env.OTTO_CONTROLLER_QUEUE_LIMIT ?? 100));
export const DEFAULT_CONTROLLER_SCOPES: string[] =
  process.env.OTTO_DEFAULT_CONTROLLER_SCOPES?.split(',').map((x) => x.trim()).filter(Boolean) ?? [
    'primitive.tab.*',
    'primitive.dom.*',
    'primitive.page.*',
    'command.list',
    'command.run',
    'command.test',
    'command.reddit_feed',
    'listener.subscribe',
    'listener.unsubscribe',
  ];

export const LOG_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
export const LOG_DIR = process.env.OTTO_LOG_DIR ?? join(homedir(), '.otto', 'relay');
export const LOG_LEGACY_FILE_NAME = 'operations.jsonl';
export const LOG_WINDOW_PREFIX = 'operations-';
export const LOG_WINDOW_SUFFIX = '.jsonl';
export const LOG_WINDOW_MAX_FILE_BYTES = parseEnvInt('OTTO_LOG_MAX_FILE_BYTES', 100 * 1024 * 1024, 1024);
export const REFRESH_SESSIONS_FILE = join(LOG_DIR, 'refresh-sessions.jsonl');
export const CONTROLLER_CLIENTS_FILE = join(LOG_DIR, 'controller-clients.jsonl');
export const CONTROLLER_ACL_FILE = join(LOG_DIR, 'controller-acl.jsonl');
export const ALLOW_REMOTE_CONTROLLER_REGISTRATION = process.env.OTTO_ALLOW_REMOTE_CONTROLLER_REGISTRATION === '1';
export const CONTROLLER_REGISTRATION_SECRET = process.env.OTTO_CONTROLLER_REGISTRATION_SECRET;
export const CONTROLLER_HEARTBEAT_INTERVAL_MS = parseEnvInt('OTTO_CONTROLLER_HEARTBEAT_INTERVAL_MS', 8_000, 1_000, 120_000);
export const CONTROLLER_HEARTBEAT_MISS_LIMIT = parseEnvInt('OTTO_CONTROLLER_HEARTBEAT_MISS_LIMIT', 3, 1, 20);
