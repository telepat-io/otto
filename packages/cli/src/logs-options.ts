export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogSource = 'relay' | 'controller' | 'node' | 'all';

export type LogEntry = {
  id?: string;
  timestamp?: string;
  level?: LogLevel;
  source?: Exclude<LogSource, 'all'>;
  type?: string;
  requestId?: string;
  traceId?: string;
  nodeId?: string;
  action?: string;
  status?: string;
  data?: unknown;
};

export type HumanLogEntryParts = {
  timestamp: string;
  source: string;
  level: string;
  eventType: string;
  details: string[];
};

export function parseLogLevelOption(value?: string): LogLevel | undefined {
  if (!value) return undefined;
  if (value === 'debug' || value === 'info' || value === 'warn' || value === 'error') {
    return value;
  }
  throw new Error('--level must be one of debug|info|warn|error');
}

export function parseLogSourceOption(value?: string): LogSource | undefined {
  if (!value) return undefined;
  if (value === 'relay' || value === 'controller' || value === 'node' || value === 'all') {
    return value;
  }
  throw new Error('--source must be one of relay|controller|node|all');
}

export function parseLatestOption(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('--latest must be a positive integer');
  }
  return parsed;
}

function jsonLine(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function formatTimestamp(iso?: string): string {
  if (!iso) {
    return 'unknown-time';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  const normalized = date.toISOString();
  return `${normalized.slice(11, 23)}Z`;
}

function extractDataMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') {
    return undefined;
  }

  const candidate = (data as Record<string, unknown>).message;
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : undefined;
}

export function formatLogEntryHuman(entry: LogEntry): string {
  const parts = buildHumanLogEntryParts(entry);
  const suffix = parts.details.length > 0 ? ` | ${parts.details.join(' | ')}` : '';
  return `[${parts.timestamp}] [${parts.source}] [${parts.level}] ${parts.eventType}${suffix}`;
}

export function buildHumanLogEntryParts(entry: LogEntry): HumanLogEntryParts {
  const source = entry.source ?? 'unknown';
  const timestamp = formatTimestamp(entry.timestamp);
  const eventType = entry.type ?? 'log';
  const level = (entry.level ?? 'info').toUpperCase();
  const message = extractDataMessage(entry.data);

  const details: string[] = [];
  if (message) {
    details.push(message);
  }
  if (entry.action) {
    details.push(`action=${entry.action}`);
  }
  if (entry.status) {
    details.push(`status=${entry.status}`);
  }
  if (entry.nodeId) {
    details.push(`node=${entry.nodeId}`);
  }

  return {
    timestamp,
    source,
    level,
    eventType,
    details,
  };
}

export function formatLogEntryJson(entry: LogEntry): string {
  return jsonLine(entry);
}
