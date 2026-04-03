import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatLogEntryHuman,
  formatLogEntryJson,
  parseLatestOption,
  parseLogLevelOption,
  parseLogSourceOption,
} from '../src/logs-options.js';

test('parseLogLevelOption accepts debug and rejects unknown values', () => {
  assert.equal(parseLogLevelOption('debug'), 'debug');
  assert.equal(parseLogLevelOption('error'), 'error');
  assert.equal(parseLogLevelOption(undefined), undefined);
  assert.throws(() => parseLogLevelOption('trace'), /--level must be one of debug\|info\|warn\|error/);
});

test('parseLogSourceOption validates allowed log source filters', () => {
  assert.equal(parseLogSourceOption('relay'), 'relay');
  assert.equal(parseLogSourceOption('all'), 'all');
  assert.equal(parseLogSourceOption(undefined), undefined);
  assert.throws(() => parseLogSourceOption('extension'), /--source must be one of relay\|controller\|node\|all/);
});

test('parseLatestOption accepts positive integers and rejects non-positive values', () => {
  assert.equal(parseLatestOption('10'), 10);
  assert.equal(parseLatestOption(undefined), undefined);
  assert.throws(() => parseLatestOption('0'), /--latest must be a positive integer/);
  assert.throws(() => parseLatestOption('-2'), /--latest must be a positive integer/);
  assert.throws(() => parseLatestOption('1.5'), /--latest must be a positive integer/);
});

test('formatLogEntryHuman renders source timestamp and readable message fields', () => {
  const line = formatLogEntryHuman({
    timestamp: '2026-04-03T12:34:56.000Z',
    source: 'node',
    level: 'warn',
    type: 'offscreen.connect_attempt',
    requestId: 'req-1',
    nodeId: 'node-7',
    data: {
      message: 'socket reconnecting',
    },
  });

  assert.match(line, /\[12:34:56\.000Z\]/);
  assert.match(line, /\[node\]/);
  assert.match(line, /\[WARN\]/);
  assert.match(line, /offscreen\.connect_attempt/);
  assert.match(line, /socket reconnecting/);
  assert.match(line, /node=node-7/);
  assert.doesNotMatch(line, /request=/);
});

test('formatLogEntryJson preserves full structured entry', () => {
  const line = formatLogEntryJson({
    timestamp: '2026-04-03T00:00:00.000Z',
    source: 'relay',
    level: 'info',
    type: 'lock_released',
    data: {
      lockId: 'l-123',
      message: 'done',
    },
  });

  const parsed = JSON.parse(line) as { type: string; data: { lockId: string; message: string } };
  assert.equal(parsed.type, 'lock_released');
  assert.equal(parsed.data.lockId, 'l-123');
  assert.equal(parsed.data.message, 'done');
});
