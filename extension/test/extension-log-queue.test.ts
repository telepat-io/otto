import assert from 'node:assert/strict';
import test from 'node:test';
import { createExtensionLogQueue } from '../src/runtime/extension-log-queue.js';

test('createExtensionLogQueue enqueues entries', () => {
  const queue = createExtensionLogQueue(10);
  queue.enqueue({ level: 'info', type: 'test' });
  assert.equal(queue.size(), 1);
});

test('createExtensionLogQueue adds timestamp when missing', () => {
  const queue = createExtensionLogQueue(10);
  queue.enqueue({ level: 'info', type: 'test' });
  const drained = queue.drain();
  assert.equal(drained.length, 1);
  assert.ok(typeof drained[0].timestamp === 'string');
});

test('createExtensionLogQueue preserves existing timestamp', () => {
  const queue = createExtensionLogQueue(10);
  queue.enqueue({ level: 'info', type: 'test', timestamp: '2024-01-01T00:00:00.000Z' });
  const drained = queue.drain();
  assert.equal(drained[0].timestamp, '2024-01-01T00:00:00.000Z');
});

test('createExtensionLogQueue drops oldest when over maxSize', () => {
  const queue = createExtensionLogQueue(3);
  queue.enqueue({ level: 'info', type: '1' });
  queue.enqueue({ level: 'info', type: '2' });
  queue.enqueue({ level: 'info', type: '3' });
  queue.enqueue({ level: 'info', type: '4' });

  const drained = queue.drain();
  assert.equal(drained.length, 3);
  assert.equal(drained[0].type, '2');
  assert.equal(drained[2].type, '4');
});

test('createExtensionLogQueue drain returns empty array when empty', () => {
  const queue = createExtensionLogQueue(10);
  assert.deepEqual(queue.drain(), []);
  assert.equal(queue.size(), 0);
});

test('createExtensionLogQueue drain clears queue', () => {
  const queue = createExtensionLogQueue(10);
  queue.enqueue({ level: 'info', type: 'test' });
  queue.drain();
  assert.equal(queue.size(), 0);
});
