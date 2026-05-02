/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict';
import test from 'node:test';
import { ListenersClient, StreamSession } from '../src/streaming.js';
import type { ListenerUpdateEvent } from '../src/types.js';

test('ListenersClient.subscribe returns StreamSession', () => {
  const mockWsSession = {
    sendAndWaitForResponse: async () => ({
      requestId: 'req_123',
      payload: { ok: true },
    } as any),
    onMessage: () => () => {},
  } as any;

  const client = new ListenersClient(mockWsSession);
  const stream = client.subscribe({
    nodeId: 'node_1',
    listener: 'test.listener',
  });

  assert.ok(stream instanceof StreamSession);
});

test('StreamSession emit fires events', () => {
  const mockWsSession = {
    sendAndWaitForResponse: async () => ({ requestId: 'req_123', payload: { ok: true } } as any),
    onMessage: () => () => {},
  } as any;

  const stream = new StreamSession(mockWsSession, 'node_1', 'test.listener');

  const event: ListenerUpdateEvent = {
    type: 'listener_update',
    data: { result: 'test' },
    emittedAt: new Date().toISOString(),
  };

  let emitCalled = false;
  stream.on('data', (e) => {
    emitCalled = true;
    assert.deepEqual(e, event);
  });

  stream.emit('data', event);
  assert.equal(emitCalled, true);
});
