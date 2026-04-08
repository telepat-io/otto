import assert from 'node:assert/strict';
import test from 'node:test';
import { createEnvelope } from '@telepat/otto-protocol';
import type { Envelope } from '@telepat/otto-protocol';
import { isListenerUpdateForSubscription } from '../src/stream-correlation.js';

function envelope(messageType: Envelope['messageType'], requestId: string, payload: unknown): Envelope {
  return createEnvelope(messageType, 'controller', requestId, payload);
}

test('matches listener_update events for subscribe request id', () => {
  const event = envelope('event', 'subscribe-req-1', {
    type: 'listener_update',
    updateType: 'network.response',
    data: { status: 200 },
  });

  assert.equal(isListenerUpdateForSubscription(event, 'subscribe-req-1'), true);
});

test('does not match listener_update events tied to recipe.test request id', () => {
  const event = envelope('event', 'recipe-test-req-1', {
    type: 'listener_update',
    updateType: 'network.response',
    data: { status: 200 },
  });

  assert.equal(isListenerUpdateForSubscription(event, 'subscribe-req-1'), false);
});

test('does not match non-event or non-listener_update envelopes', () => {
  const resultFrame = envelope('result', 'subscribe-req-1', {
    ok: true,
  });
  const otherEvent = envelope('event', 'subscribe-req-1', {
    type: 'extension_log',
  });

  assert.equal(isListenerUpdateForSubscription(resultFrame, 'subscribe-req-1'), false);
  assert.equal(isListenerUpdateForSubscription(otherEvent, 'subscribe-req-1'), false);
});
