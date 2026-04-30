import assert from 'node:assert/strict';
import test from 'node:test';
import { isListenerUpdateForSubscription } from '../src/stream-correlation.js';

test('isListenerUpdateForSubscription returns true for matching listener update', () => {
  assert.equal(
    isListenerUpdateForSubscription(
      { messageType: 'event', requestId: 'sub-1', payload: { type: 'listener_update' } } as import('@telepat/otto-protocol').Envelope,
      'sub-1',
    ),
    true,
  );
});

test('isListenerUpdateForSubscription returns false for non-event', () => {
  assert.equal(
    isListenerUpdateForSubscription(
      { messageType: 'result', requestId: 'sub-1', payload: { type: 'listener_update' } } as import('@telepat/otto-protocol').Envelope,
      'sub-1',
    ),
    false,
  );
});

test('isListenerUpdateForSubscription returns false for mismatched requestId', () => {
  assert.equal(
    isListenerUpdateForSubscription(
      { messageType: 'event', requestId: 'sub-2', payload: { type: 'listener_update' } } as import('@telepat/otto-protocol').Envelope,
      'sub-1',
    ),
    false,
  );
});

test('isListenerUpdateForSubscription returns false for non-listener_update type', () => {
  assert.equal(
    isListenerUpdateForSubscription(
      { messageType: 'event', requestId: 'sub-1', payload: { type: 'other' } } as import('@telepat/otto-protocol').Envelope,
      'sub-1',
    ),
    false,
  );
});

test('isListenerUpdateForSubscription handles missing payload type', () => {
  assert.equal(
    isListenerUpdateForSubscription(
      { messageType: 'event', requestId: 'sub-1', payload: {} } as import('@telepat/otto-protocol').Envelope,
      'sub-1',
    ),
    false,
  );
});

test('isListenerUpdateForSubscription handles undefined payload', () => {
  assert.equal(
    isListenerUpdateForSubscription(
      { messageType: 'event', requestId: 'sub-1' } as import('@telepat/otto-protocol').Envelope,
      'sub-1',
    ),
    false,
  );
});
