import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseLogLevelOption,
  parseLogSourceOption,
  parseLatestOption,
  formatLogEntryHuman,
  buildHumanLogEntryParts,
  formatLogEntryJson,
} from '../src/logs-options.js';

test('parseLogLevelOption validates levels', () => {
  assert.equal(parseLogLevelOption('debug'), 'debug');
  assert.equal(parseLogLevelOption('error'), 'error');
  assert.equal(parseLogLevelOption(undefined), undefined);
  assert.throws(() => parseLogLevelOption('verbose'), /debug|info|warn|error/);
});

test('parseLogSourceOption validates sources', () => {
  assert.equal(parseLogSourceOption('node'), 'node');
  assert.equal(parseLogSourceOption('all'), 'all');
  assert.equal(parseLogSourceOption(undefined), undefined);
  assert.throws(() => parseLogSourceOption('extension'), /relay|controller|node|all/);
});

test('parseLatestOption validates positive integer', () => {
  assert.equal(parseLatestOption('10'), 10);
  assert.equal(parseLatestOption(undefined), undefined);
  assert.throws(() => parseLatestOption('0'), /positive integer/);
  assert.throws(() => parseLatestOption('-1'), /positive integer/);
  assert.throws(() => parseLatestOption('1.5'), /positive integer/);
});

test('buildHumanLogEntryParts constructs parts correctly', () => {
  const parts = buildHumanLogEntryParts({
    timestamp: '2024-01-01T12:34:56.789Z',
    source: 'relay',
    level: 'warn',
    type: 'test.type',
    action: 'test.action',
    status: 'ok',
    nodeId: 'n1',
    data: { message: 'hello world' },
  });

  assert.equal(parts.source, 'relay');
  assert.equal(parts.level, 'WARN');
  assert.equal(parts.eventType, 'test.type');
  assert.ok(parts.details.includes('hello world'));
  assert.ok(parts.details.includes('action=test.action'));
  assert.ok(parts.details.includes('status=ok'));
  assert.ok(parts.details.includes('node=n1'));
});

test('buildHumanLogEntryParts handles missing fields', () => {
  const parts = buildHumanLogEntryParts({});
  assert.equal(parts.source, 'unknown');
  assert.equal(parts.level, 'INFO');
  assert.equal(parts.eventType, 'log');
  assert.deepEqual(parts.details, []);
});

test('buildHumanLogEntryParts handles invalid timestamp', () => {
  const parts = buildHumanLogEntryParts({ timestamp: 'invalid' });
  assert.equal(parts.timestamp, 'invalid');
});

test('formatLogEntryHuman builds formatted string', () => {
  const line = formatLogEntryHuman({ timestamp: '2024-01-01T12:34:56.789Z', source: 'relay', level: 'info', type: 'test' });
  assert.ok(line.includes('relay'));
  assert.ok(line.includes('INFO'));
  assert.ok(line.includes('test'));
});

test('formatLogEntryJson returns JSON string', () => {
  const line = formatLogEntryJson({ id: '1', type: 'test' });
  assert.equal(line, JSON.stringify({ id: '1', type: 'test' }));
});

test('formatLogEntryJson handles circular reference gracefully', () => {
  const entry: Record<string, unknown> = { id: '1', type: 'test' };
  entry.self = entry;
  const line = formatLogEntryJson(entry);
  assert.equal(line, '[object Object]');
});

test('buildHumanLogEntryParts handles non-string data message', () => {
  const parts = buildHumanLogEntryParts({
    data: { message: 123 },
  });
  assert.deepEqual(parts.details, []);
});
