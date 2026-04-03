import assert from 'node:assert/strict';
import test from 'node:test';
import { createExtensionLogQueue } from '../src/runtime/extension-log-queue.js';

test('createExtensionLogQueue enforces max size by dropping oldest entries', () => {
  const queue = createExtensionLogQueue(2);

  queue.enqueue({ level: 'debug', type: 'a' });
  queue.enqueue({ level: 'debug', type: 'b' });
  queue.enqueue({ level: 'debug', type: 'c' });

  const drained = queue.drain();
  assert.equal(drained.length, 2);
  assert.equal(drained[0]?.type, 'b');
  assert.equal(drained[1]?.type, 'c');
  assert.equal(queue.size(), 0);
});

test('createExtensionLogQueue injects timestamp when absent', () => {
  const queue = createExtensionLogQueue(5);
  queue.enqueue({ level: 'info', type: 'with_timestamp' });

  const drained = queue.drain();
  assert.equal(drained.length, 1);
  assert.equal(typeof drained[0]?.timestamp, 'string');
  assert.equal(Number.isNaN(Date.parse(String(drained[0]?.timestamp))), false);
});
