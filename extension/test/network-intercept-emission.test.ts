import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmitUpdate, createEmitSubscriptionUpdate, emitNetworkUpdate } from '../src/runtime/network-intercept/emission.js';

test('createEmitUpdate sends messages via chrome runtime', async () => {
  const messages: unknown[] = [];
  const chromeApi = {
    runtime: {
      sendMessage: async (msg: unknown) => { messages.push(msg); },
    },
  } as unknown as import('../src/runtime/network-intercept/types.js').ChromeLike;

  const emitUpdate = createEmitUpdate(chromeApi);
  await emitUpdate('req-1', 'network.response', { ok: true });

  assert.equal(messages.length, 2);
  assert.equal((messages[0] as { type: string }).type, 'otto.offscreen.emitListenerUpdate');
  assert.equal((messages[1] as { type: string }).type, 'otto.listenerUpdate');
});

test('createEmitUpdate swallows send errors', async () => {
  const chromeApi = {
    runtime: {
      sendMessage: async () => { throw new Error('fail'); },
    },
  } as unknown as import('../src/runtime/network-intercept/types.js').ChromeLike;

  const emitUpdate = createEmitUpdate(chromeApi);
  await assert.doesNotReject(emitUpdate('req-1', 'network.response', {}));
});

test('createEmitSubscriptionUpdate emits to relay when enabled', async () => {
  const updates: Array<{ requestId: string; type: string; data: unknown }> = [];
  const emitUpdate = async (requestId: string, updateType: string, data: unknown) => {
    updates.push({ requestId, type: updateType, data });
  };

  const emitSub = createEmitSubscriptionUpdate(emitUpdate);
  const sub = { requestId: 'sub-1', tabId: 1, tabSessionId: 't1', site: 'reddit.com', urlPatterns: [], requestHostAllowlist: [], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'network', mimeTypes: [], emitToRelay: true } as import('../src/runtime/network-intercept/types.js').SubscriptionState;

  await emitSub(sub, 'network.response', { ok: true });
  assert.equal(updates.length, 1);
});

test('createEmitSubscriptionUpdate calls onUpdate when provided', async () => {
  const localUpdates: Array<{ type: string; data: unknown }> = [];
  const emitUpdate = async () => {};
  const emitSub = createEmitSubscriptionUpdate(emitUpdate);

  const sub = { requestId: 'sub-1', tabId: 1, tabSessionId: 't1', site: 'reddit.com', urlPatterns: [], requestHostAllowlist: [], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'network', mimeTypes: [], emitToRelay: false, onUpdate: (type: string, data: unknown) => { localUpdates.push({ type, data }); } } as import('../src/runtime/network-intercept/types.js').SubscriptionState;

  await emitSub(sub, 'network.response', { ok: true });
  assert.equal(localUpdates.length, 1);
  assert.equal(localUpdates[0].type, 'network.response');
});

test('createEmitSubscriptionUpdate swallows onUpdate errors', async () => {
  const emitUpdate = async () => {};
  const emitSub = createEmitSubscriptionUpdate(emitUpdate);

  const sub = { requestId: 'sub-1', tabId: 1, tabSessionId: 't1', site: 'reddit.com', urlPatterns: [], requestHostAllowlist: [], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'network', mimeTypes: [], emitToRelay: false, onUpdate: () => { throw new Error('fail'); } } as import('../src/runtime/network-intercept/types.js').SubscriptionState;

  await assert.doesNotReject(emitSub(sub, 'network.response', {}));
});

test('emitNetworkUpdate emits error update', async () => {
  const updates: Array<{ sub: import('../src/runtime/network-intercept/types.js').SubscriptionState; type: string; data: unknown }> = [];
  const emitSub = async (sub: import('../src/runtime/network-intercept/types.js').SubscriptionState, type: string, data: unknown) => {
    updates.push({ sub, type, data });
  };

  const sub = { requestId: 'sub-1', tabId: 1, tabSessionId: 't1', site: 'reddit.com', urlPatterns: [], requestHostAllowlist: [], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'network', mimeTypes: [], emitToRelay: true } as import('../src/runtime/network-intercept/types.js').SubscriptionState;

  await emitNetworkUpdate(emitSub, sub, { url: 'https://example.com', status: 0 }, 'req-1', 'network', undefined, 'timeout');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].type, 'network.error');
  assert.equal((updates[0].data as { error?: string }).error, 'timeout');
});

test('emitNetworkUpdate emits response without body', async () => {
  const updates: Array<{ sub: import('../src/runtime/network-intercept/types.js').SubscriptionState; type: string; data: unknown }> = [];
  const emitSub = async (sub: import('../src/runtime/network-intercept/types.js').SubscriptionState, type: string, data: unknown) => {
    updates.push({ sub, type, data });
  };

  const sub = { requestId: 'sub-1', tabId: 1, tabSessionId: 't1', site: 'reddit.com', urlPatterns: [], requestHostAllowlist: [], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'network', mimeTypes: [], emitToRelay: true } as import('../src/runtime/network-intercept/types.js').SubscriptionState;

  await emitNetworkUpdate(emitSub, sub, { url: 'https://example.com', status: 200 }, 'req-1', 'network');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].type, 'network.response');
  assert.equal((updates[0].data as { body?: string }).body, undefined);
});

test('emitNetworkUpdate emits response with body and headers', async () => {
  const updates: Array<{ sub: import('../src/runtime/network-intercept/types.js').SubscriptionState; type: string; data: unknown }> = [];
  const emitSub = async (sub: import('../src/runtime/network-intercept/types.js').SubscriptionState, type: string, data: unknown) => {
    updates.push({ sub, type, data });
  };

  const sub = { requestId: 'sub-1', tabId: 1, tabSessionId: 't1', site: 'reddit.com', urlPatterns: [], requestHostAllowlist: [], includeBody: true, includeHeaders: true, maxBodyBytes: 1_000_000, mode: 'network', mimeTypes: [], emitToRelay: true } as import('../src/runtime/network-intercept/types.js').SubscriptionState;

  await emitNetworkUpdate(emitSub, sub, { url: 'https://example.com', status: 200, requestHeaders: { 'Authorization': 'secret' }, responseHeaders: { 'Set-Cookie': 'x' } }, 'req-1', 'network', { body: 'body-data', base64Encoded: false });
  const data = updates[0].data as { requestHeaders?: Record<string, string>; responseHeaders?: Record<string, string>; body?: string };
  assert.equal(data.body, 'body-data');
  assert.equal(data.requestHeaders?.['Authorization'], '<redacted>');
  assert.equal(data.responseHeaders?.['Set-Cookie'], '<redacted>');
});
