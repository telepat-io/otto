import assert from 'node:assert/strict';
import test from 'node:test';
import {
  jsonResponse,
  parseBearerToken,
  parseSinceMs,
  parseLatest,
  parseLogLevel,
  parseLogSource,
  filterLogs,
} from '../../src/http-log-utils.js';

test('jsonResponse writes JSON with status', () => {
  let statusCode = 0;
  let headers: Record<string, string> = {};
  let body = '';

  const res = {
    writeHead: (code: number, hdrs: Record<string, string>) => { statusCode = code; headers = hdrs; },
    end: (data: string) => { body = data; },
  } as unknown as import('node:http').ServerResponse;

  jsonResponse(res, 201, { ok: true });
  assert.equal(statusCode, 201);
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(body, JSON.stringify({ ok: true }));
});

test('parseBearerToken extracts token', () => {
  assert.equal(parseBearerToken({ headers: { authorization: 'Bearer token123' } } as import('node:http').IncomingMessage), 'token123');
  assert.equal(parseBearerToken({ headers: { authorization: 'Basic token123' } } as import('node:http').IncomingMessage), null);
  assert.equal(parseBearerToken({ headers: {} } as import('node:http').IncomingMessage), null);
  assert.equal(parseBearerToken({ headers: { authorization: 'Bearer' } } as import('node:http').IncomingMessage), null);
});

test('parseSinceMs handles null and invalid values', () => {
  assert.equal(parseSinceMs(null, 1000), 1000);
  assert.equal(parseSinceMs('invalid', 1000), null);
  assert.equal(parseSinceMs('2024-01-01T00:00:00.000Z', 1000), Date.parse('2024-01-01T00:00:00.000Z'));
});

test('parseLatest handles null and invalid values', () => {
  assert.equal(parseLatest(null), null);
  assert.equal(parseLatest('0'), null);
  assert.equal(parseLatest('-1'), null);
  assert.equal(parseLatest('1.5'), null);
  assert.equal(parseLatest('10'), 10);
});

test('parseLogLevel validates levels', () => {
  assert.equal(parseLogLevel(null), null);
  assert.equal(parseLogLevel('debug'), 'debug');
  assert.equal(parseLogLevel('INFO'), 'info');
  assert.equal(parseLogLevel('Warn'), 'warn');
  assert.equal(parseLogLevel('invalid'), null);
});

test('parseLogSource validates sources', () => {
  assert.equal(parseLogSource(null), null);
  assert.equal(parseLogSource('relay'), 'relay');
  assert.equal(parseLogSource('CONTROLLER'), 'controller');
  assert.equal(parseLogSource('invalid'), null);
});

test('filterLogs applies all filters', () => {
  const events = [
    { timestamp: '2024-01-01T00:00:00.000Z', level: 'info' as const, source: 'relay' as const, nodeId: 'n1', requestId: 'r1' },
    { timestamp: '2024-01-01T00:00:01.000Z', level: 'error' as const, source: 'node' as const, nodeId: 'n2', requestId: 'r2' },
    { timestamp: '2024-01-01T00:00:02.000Z', level: 'debug' as const, source: 'controller' as const, nodeId: 'n1', requestId: 'r3' },
  ];

  const sinceMs = Date.parse('2024-01-01T00:00:00.500Z');

  const filtered = filterLogs(events, { sinceMs, level: 'error', nodeId: 'n2', requestId: 'r2' });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].level, 'error');
});

test('filterLogs respects source filter excluding all', () => {
  const events = [
    { timestamp: '2024-01-01T00:00:00.000Z', level: 'info' as const, source: 'relay' as const },
    { timestamp: '2024-01-01T00:00:01.000Z', level: 'info' as const, source: 'node' as const },
  ];

  const result = filterLogs(events, { sinceMs: 0, source: 'all' });
  assert.equal(result.length, 2);
});

test('filterLogs applies latest limit', () => {
  const events = [
    { timestamp: '2024-01-01T00:00:00.000Z', level: 'info' as const, source: 'relay' as const },
    { timestamp: '2024-01-01T00:00:01.000Z', level: 'info' as const, source: 'relay' as const },
    { timestamp: '2024-01-01T00:00:02.000Z', level: 'info' as const, source: 'relay' as const },
  ];

  const result = filterLogs(events, { sinceMs: 0, latest: 2 });
  assert.equal(result.length, 2);
  assert.equal(result[0].timestamp, '2024-01-01T00:00:01.000Z');
});
