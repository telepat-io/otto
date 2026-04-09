import { appendFileSync } from 'node:fs';
import type { WebSocket } from 'ws';
import type { Envelope, MessageType, OttoRole } from '@telepat/otto-protocol';
import type { LogEvent } from './relay-models-schemas.js';
import type { Client, LockState } from './runtime/types.js';

type LogStorageLike = {
  parseTimestampMs: (timestamp: string) => number | null;
  cleanupLogFiles: (cutoffMs: number) => void;
  resolveWriteLogFilePath: (line: string) => string;
};

export function redactValue(input: unknown): unknown {
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

export function cleanupLogs(logEvents: LogEvent[], logStorage: LogStorageLike, retentionMs: number): void {
  const cutoff = Date.now() - retentionMs;
  const retained = logEvents.filter((evt) => {
    const ts = logStorage.parseTimestampMs(evt.timestamp);
    return ts !== null && ts >= cutoff;
  });
  logEvents.length = 0;
  logEvents.push(...retained);
  logStorage.cleanupLogFiles(cutoff);
}

export function send(ws: WebSocket, msg: Envelope): void {
  ws.send(JSON.stringify(msg));
}

export function buildEnvelope(
  protocolVersion: Envelope['protocolVersion'],
  messageType: MessageType,
  senderRole: OttoRole | 'relay',
  requestId: string,
  payload: unknown,
): Envelope {
  return {
    protocolVersion,
    messageType,
    requestId,
    timestamp: new Date().toISOString(),
    senderRole,
    payload,
  };
}

export function emitLog(params: {
  event: Omit<LogEvent, 'id' | 'timestamp'>;
  logEvents: LogEvent[];
  logStorage: LogStorageLike;
  clients: Iterable<Client>;
  send: (ws: WebSocket, msg: Envelope) => void;
  buildEnvelope: (messageType: MessageType, senderRole: OttoRole | 'relay', requestId: string, payload: unknown) => Envelope;
  nextRequestId: () => string;
}): void {
  const full: LogEvent = {
    id: params.nextRequestId(),
    timestamp: new Date().toISOString(),
    ...params.event,
    data: redactValue(params.event.data),
  };
  params.logEvents.push(full);
  const line = `${JSON.stringify(full)}\n`;
  appendFileSync(params.logStorage.resolveWriteLogFilePath(line), line);

  for (const client of params.clients) {
    if (client.role !== 'controller' || !client.authenticated || !client.subscriptions.has('logs')) {
      continue;
    }

    const sourceFilter = client.logSourceFilter ?? 'all';
    if (sourceFilter !== 'all' && full.source !== sourceFilter) {
      continue;
    }

    params.send(client.ws, params.buildEnvelope('event', 'relay', params.nextRequestId(), { type: 'log', entry: full }));
  }
}

export function releaseExpiredLocks(locks: Map<string, LockState>, emitLogFn: (event: Omit<LogEvent, 'id' | 'timestamp'>) => void): void {
  const now = Date.now();
  for (const [key, state] of locks.entries()) {
    if (state.expiresAt <= now) {
      locks.delete(key);
      emitLogFn({
        level: 'warn',
        source: 'relay',
        type: 'lock_expired',
        data: { lockKey: key },
      });
    }
  }
}
