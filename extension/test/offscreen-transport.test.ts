import test from 'node:test';
import assert from 'node:assert/strict';
import { createEnvelope, type Envelope } from '@telepat/otto-protocol';
import {
  computeReconnectDelayMs,
  enqueueOutbound,
  MAX_OUTBOUND_QUEUE,
} from '../src/runtime/offscreen-transport.js';

test('reconnect backoff increases and is capped', () => {
  const d0 = computeReconnectDelayMs(0, 0);
  const d1 = computeReconnectDelayMs(1, 0);
  const d2 = computeReconnectDelayMs(2, 0);
  const dHigh = computeReconnectDelayMs(20, 1);

  assert.equal(d0, 1000);
  assert.equal(d1, 2000);
  assert.equal(d2, 4000);
  assert.equal(dHigh, 30000);
});

test('outbound queue keeps newest messages within bound', () => {
  const queue: Envelope[] = [];
  const max = 3;
  for (let i = 0; i < 5; i += 1) {
    enqueueOutbound(
      queue,
      createEnvelope('event', 'node', `req_${i}`, { i }),
      max,
    );
  }

  assert.equal(queue.length, max);
  assert.deepEqual(
    queue.map((msg) => msg.requestId),
    ['req_2', 'req_3', 'req_4'],
  );
});

test('default max queue constant remains stable', () => {
  assert.equal(MAX_OUTBOUND_QUEUE, 200);
});
