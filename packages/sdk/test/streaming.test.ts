/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict';
import test from 'node:test';
import { StreamSession } from '../src/streaming.js';

test('StreamSession is an AsyncIterable', () => {
  const mockWsSession = {
    sendAndWaitForResponse: async () => ({ requestId: '', payload: {} } as any),
    onMessage: () => () => {},
  } as any;

  const stream = new StreamSession(mockWsSession, 'node_1', 'test.listener');
  assert.ok(stream[Symbol.asyncIterator]);
});

test('StreamSession extends EventEmitter', () => {
  const mockWsSession = {
    sendAndWaitForResponse: async () => ({ requestId: '', payload: {} } as any),
    onMessage: () => () => {},
  } as any;

  const stream = new StreamSession(mockWsSession, 'node_1', 'test.listener');
  assert.ok(stream.on);
  assert.ok(stream.emit);
  assert.ok(stream.once);
});

test('StreamSession methods exist', () => {
  const mockWsSession = {
    sendAndWaitForResponse: async () => ({ requestId: '', payload: {} } as any),
    onMessage: () => () => {},
  } as any;

  const stream = new StreamSession(mockWsSession, 'node_1', 'test.listener');
  assert.ok(typeof stream.start === 'function');
  assert.ok(typeof stream.unsubscribe === 'function');
});
