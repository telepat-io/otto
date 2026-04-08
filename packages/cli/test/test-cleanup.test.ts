import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCleanupSocketStrategy } from '../src/test-cleanup.js';

test('resolveCleanupSocketStrategy reuses open socket when available', () => {
  const strategy = resolveCleanupSocketStrategy({
    socketReadyState: 1,
    socketOpenState: 1,
    hasOriginalError: false,
  });

  assert.equal(strategy, 'reuse');
});

test('resolveCleanupSocketStrategy reconnects when socket is closed without prior error', () => {
  const strategy = resolveCleanupSocketStrategy({
    socketReadyState: 3,
    socketOpenState: 1,
    hasOriginalError: false,
  });

  assert.equal(strategy, 'reconnect');
});

test('resolveCleanupSocketStrategy reconnects when socket is closed and there is an original error', () => {
  const strategy = resolveCleanupSocketStrategy({
    socketReadyState: 3,
    socketOpenState: 1,
    hasOriginalError: true,
  });

  assert.equal(strategy, 'reconnect');
});
