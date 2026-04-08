import type { IncomingMessage, ServerResponse } from 'node:http';

type RelayLogLevel = 'debug' | 'info' | 'warn' | 'error';
type RelayLogSource = 'relay' | 'controller' | 'node' | 'all';

type RelayLogEvent = {
  timestamp: string;
  level: RelayLogLevel;
  source: 'relay' | 'controller' | 'node';
  nodeId?: string;
  requestId?: string;
};

export function jsonResponse(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function parseBearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;
  return token;
}

export function parseSinceMs(since: string | null, fallbackMs: number): number | null {
  if (!since) return fallbackMs;
  const parsed = Date.parse(since);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

export function parseLatest(latest: string | null): number | null {
  if (!latest) return null;
  const parsed = Number(latest);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export function parseLogLevel(level: string | null): RelayLogLevel | null {
  if (!level) return null;
  const normalized = level.toLowerCase();
  if (normalized === 'debug' || normalized === 'info' || normalized === 'warn' || normalized === 'error') {
    return normalized;
  }
  return null;
}

export function parseLogSource(source: string | null): RelayLogSource | null {
  if (!source) return null;
  const normalized = source.toLowerCase();
  if (normalized === 'relay' || normalized === 'controller' || normalized === 'node' || normalized === 'all') {
    return normalized;
  }
  return null;
}

export function filterLogs(
  events: RelayLogEvent[],
  params: {
    sinceMs: number;
    level?: RelayLogLevel;
    nodeId?: string;
    requestId?: string;
    source?: RelayLogSource;
    latest?: number;
  },
): RelayLogEvent[] {
  const filtered = events.filter((evt) => {
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