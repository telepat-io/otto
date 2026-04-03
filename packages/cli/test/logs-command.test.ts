import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLatestOption, parseLogLevelOption, parseLogSourceOption } from '../src/logs-options.js';

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
