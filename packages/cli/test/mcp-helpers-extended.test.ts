import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import {
  requestJson,
  startControllerHeartbeat,
  sendCommandWithSocket,
  runCommandWithSocket,
  sendCommandCancelWithSocket,
  maybeSelfRegisterControllerForTest,
  removeControllerClientAtRelay,
} from '../src/mcp/otto-mcp-helpers.js';
import type { OttoConfig } from '../src/config.js';

function createMockWs(overrides: Record<string, unknown> = {}): any {
  const listeners: Record<string, Set<Function>> = {};
  const onceListeners: Record<string, Map<Function, boolean>> = {};
  const ws = {
    readyState: 1,
    send: mock.fn(),
    close: mock.fn(),
    on: mock.fn((event: string, handler: Function) => {
      if (!listeners[event]) listeners[event] = new Set();
      listeners[event].add(handler);
    }),
    once: mock.fn((event: string, handler: Function) => {
      if (!onceListeners[event]) onceListeners[event] = new Map();
      onceListeners[event].set(handler, true);
    }),
    off: mock.fn((event: string, handler: Function) => {
      if (listeners[event]) listeners[event].delete(handler);
      if (onceListeners[event]) onceListeners[event].delete(handler);
    }),
    emit: (event: string, data?: any) => {
      if (onceListeners[event]) {
        for (const [fn] of onceListeners[event]) {
          fn(data);
        }
        delete onceListeners[event];
      }
      if (listeners[event]) {
        for (const fn of listeners[event]) fn(data);
      }
    },
    ...overrides,
  };
  return ws;
}

test('requestJson returns parsed JSON on success', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock.fn(() => Promise.resolve(new Response('{"ok":true,"status":"running"}', { status: 200 }))) as typeof globalThis.fetch;
  try {
    const result = await requestJson('https://example.com/api/status');
    assert.deepEqual(result, { ok: true, status: 'running' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('requestJson returns empty object for empty response body', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock.fn(() => Promise.resolve(new Response('', { status: 200 }))) as typeof globalThis.fetch;
  try {
    const result = await requestJson('https://example.com/api/status');
    assert.deepEqual(result, {});
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('requestJson returns raw text for invalid JSON', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock.fn(() => Promise.resolve(new Response('not json', { status: 200 }))) as typeof globalThis.fetch;
  try {
    const result = await requestJson('https://example.com/api/status') as Record<string, unknown>;
    assert.equal(result.raw, 'not json');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('requestJson throws on non-ok status', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock.fn(() => Promise.resolve(new Response('{"error":"not found"}', { status: 404 }))) as typeof globalThis.fetch;
  try {
    await assert.rejects(
      requestJson('https://example.com/api/missing'),
      /HTTP 404/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('requestJson sends POST with correct headers', async () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = mock.fn((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response('{"registered":true}', { status: 200 }));
  }) as typeof globalThis.fetch;
  try {
    await requestJson('https://example.com/api/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'test' }),
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://example.com/api/register');
    assert.equal(calls[0].init?.method, 'POST');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('startControllerHeartbeat sends ping at interval and returns stop function', async () => {
  const ws = createMockWs();
  let intervalCb: (() => void) | undefined;
  const originalSetInterval = globalThis.setInterval;
  globalThis.setInterval = ((cb: () => void) => { intervalCb = cb; return 999 as any; }) as any;
  const originalClearInterval = globalThis.clearInterval;
  let cleared = false;
  globalThis.clearInterval = ((_: any) => { cleared = true; }) as any;
  try {
    const stop = startControllerHeartbeat(ws);
    assert.equal(typeof stop, 'function');
    assert.ok(intervalCb !== undefined);
    ws.readyState = 1;
    intervalCb!();
    assert.ok(ws.send.mock.calls.length >= 1);
    const sentData = JSON.parse(ws.send.mock.calls[0].arguments[0] as string);
    assert.equal(sentData.messageType, 'ping');
    stop();
    assert.ok(cleared);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test('startControllerHeartbeat skips send when socket not open', async () => {
  const ws = createMockWs();
  let intervalCb: (() => void) | undefined;
  const originalSetInterval = globalThis.setInterval;
  globalThis.setInterval = ((cb: () => void) => { intervalCb = cb; return 998 as any; }) as any;
  const originalClearInterval = globalThis.clearInterval;
  globalThis.clearInterval = (() => {}) as any;
  try {
    const stop = startControllerHeartbeat(ws);
    ws.readyState = 3;
    intervalCb!();
    assert.equal(ws.send.mock.calls.length, 0);
    stop();
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test('startControllerHeartbeat clears interval on socket close', async () => {
  const ws = createMockWs();
  let closeHandler: Function | undefined;
  ws.once = mock.fn((event: string, handler: Function) => {
    if (event === 'close') closeHandler = handler;
  });
  let intervalCb: (() => void) | undefined;
  const originalSetInterval = globalThis.setInterval;
  globalThis.setInterval = ((cb: () => void) => { intervalCb = cb; return 777 as any; }) as any;
  let clearedTimer = false;
  const originalClearInterval = globalThis.clearInterval;
  globalThis.clearInterval = ((id: any) => { if (id === 777) clearedTimer = true; }) as any;

  try {
    startControllerHeartbeat(ws);
    assert.ok(closeHandler !== undefined);
    closeHandler!();
    assert.ok(clearedTimer);
  } finally {
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test('sendCommandWithSocket sends envelope and resolves on matching result', async () => {
  const ws = createMockWs();
  const result = sendCommandWithSocket(ws, 'node-1', {
    action: 'primitive.tab.open',
    payload: { url: 'https://example.com' },
    timeoutMs: 5000,
  });

  assert.equal(ws.send.mock.calls.length, 1);
  const sentEnvelope = JSON.parse(ws.send.mock.calls[0].arguments[0] as string);
  assert.equal(sentEnvelope.messageType, 'command');
  assert.equal(sentEnvelope.payload.targetNodeId, 'node-1');
  assert.equal(sentEnvelope.payload.action, 'primitive.tab.open');

  ws.emit('message', Buffer.from(JSON.stringify({
    requestId: sentEnvelope.requestId,
    messageType: 'result',
    payload: { ok: true },
  })));

  const response = await result.response;
  assert.equal(response.messageType, 'result');
});

test('sendCommandWithSocket rejects on abort signal', async () => {
  const ws = createMockWs();
  const controller = new AbortController();
  controller.abort();

  const result = sendCommandWithSocket(ws, 'node-1', {
    action: 'test',
    payload: {},
    signal: controller.signal,
  });

  await assert.rejects(result.response, /Aborted/);
});

test('sendCommandWithSocket rejects on socket close event', async () => {
  const pendingResolve: Array<(data: Buffer) => void> = [];
  const onceSetup: Array<{ event: string; handler: Function }> = [];
  const handlers: Record<string, Function[]> = {};

  const ws = {
    readyState: 1,
    send: mock.fn((data: string) => {
      const envelope = JSON.parse(data);
      setTimeout(() => {
        if (handlers['close']) {
          for (const fn of handlers['close']) fn();
        }
      }, 0);
    }),
    close: mock.fn(),
    on: mock.fn((event: string, handler: Function) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }),
    once: mock.fn((event: string, handler: Function) => {
      onceSetup.push({ event, handler });
      if (event === 'close') {
        setTimeout(() => handler(), 10);
      }
    }),
    off: mock.fn(),
  };

  const result = sendCommandWithSocket(ws as any, 'node-1', {
    action: 'test',
    payload: {},
    timeoutMs: 30000,
  });

  await assert.rejects(result.response);
});

test('sendCommandWithSocket ignores non-matching requestIds', async () => {
  const ws = createMockWs();
  const result = sendCommandWithSocket(ws, 'node-1', {
    action: 'test',
    payload: {},
    timeoutMs: 30000,
  });

  ws.emit('message', Buffer.from(JSON.stringify({
    requestId: 'different-id',
    messageType: 'result',
    payload: {},
  })));

  const sentEnvelope = JSON.parse(ws.send.mock.calls[0].arguments[0] as string);

  ws.emit('message', Buffer.from(JSON.stringify({
    requestId: sentEnvelope.requestId,
    messageType: 'result',
    payload: { ok: true },
  })));

  const response = await result.response;
  assert.equal(response.messageType, 'result');
});

test('sendCommandWithSocket resolves on error message type', async () => {
  const ws = createMockWs();
  const result = sendCommandWithSocket(ws, 'node-1', {
    action: 'test',
    payload: {},
    timeoutMs: 30000,
  });

  const sentEnvelope = JSON.parse(ws.send.mock.calls[0].arguments[0] as string);

  ws.emit('message', Buffer.from(JSON.stringify({
    requestId: sentEnvelope.requestId,
    messageType: 'error',
    payload: { code: 'test_error' },
  })));

  const response = await result.response;
  assert.equal(response.messageType, 'error');
});

test('runCommandWithSocket delegates to sendCommandWithSocket', async () => {
  const ws = createMockWs();
  const promise = runCommandWithSocket(ws, 'node-1', {
    action: 'test',
    payload: {},
    timeoutMs: 30000,
  });

  const sentEnvelope = JSON.parse(ws.send.mock.calls[0].arguments[0] as string);

  ws.emit('message', Buffer.from(JSON.stringify({
    requestId: sentEnvelope.requestId,
    messageType: 'result',
    payload: { success: true },
  })));

  const response = await promise;
  assert.equal(response.messageType, 'result');
});

test('sendCommandCancelWithSocket sends cancel and resolves', async () => {
  const ws = createMockWs();
  ws.readyState = 1;

  const cancelPromise = sendCommandCancelWithSocket(ws, 'req-123', 100);

  assert.ok(ws.send.mock.calls.length >= 1);
  const sentEnvelope = JSON.parse(ws.send.mock.calls[0].arguments[0] as string);
  assert.equal(sentEnvelope.messageType, 'command_cancel');
  assert.equal(sentEnvelope.payload.targetRequestId, 'req-123');

  ws.emit('message', Buffer.from(JSON.stringify({
    requestId: sentEnvelope.requestId,
    messageType: 'result',
    payload: {},
  })));

  await cancelPromise;
});

test('sendCommandCancelWithSocket skips when socket not open', async () => {
  const ws = createMockWs();
  ws.readyState = 3;

  await sendCommandCancelWithSocket(ws, 'req-123', 100);
  assert.equal(ws.send.mock.calls.length, 0);
});

test('sendCommandCancelWithSocket ignores non-matching requestIds and times out', async () => {
  const ws = createMockWs();
  ws.readyState = 1;
  ws.on = mock.fn((event: string, handler: Function) => {
    if (event === 'message') {
      setTimeout(() => {
        handler(Buffer.from(JSON.stringify({
          requestId: 'other-request-id',
          messageType: 'result',
          payload: {},
        })));
      }, 5);
    }
  });

  await sendCommandCancelWithSocket(ws, 'req-456', 50);
});

test('sendCommandCancelWithSocket resolves on matching event', async () => {
  const ws = createMockWs();
  ws.readyState = 1;

  const cancelPromise = sendCommandCancelWithSocket(ws, 'req-789', 2000);

  const sentEnvelope = JSON.parse(ws.send.mock.calls[0].arguments[0] as string);

  ws.emit('message', Buffer.from(JSON.stringify({
    requestId: sentEnvelope.requestId,
    messageType: 'event',
    payload: {},
  })));

  await cancelPromise;
});

test('maybeSelfRegisterControllerForTest returns config unchanged when identity exists', async () => {
  const config: OttoConfig = {
    relayUrl: 'ws://localhost:8787?role=controller',
    controllerClientId: 'existing-client',
    controllerAccessToken: 'existing-token',
  };

  const result = await maybeSelfRegisterControllerForTest(config, {});
  assert.equal(result.config.controllerClientId, 'existing-client');
  assert.equal(result.autoRegisteredClientId, undefined);
});

test('maybeSelfRegisterControllerForTest returns config unchanged when refresh token exists', async () => {
  const config: OttoConfig = {
    relayUrl: 'ws://localhost:8787?role=controller',
    controllerRefreshToken: 'existing-refresh',
  };

  const result = await maybeSelfRegisterControllerForTest(config, {});
  assert.equal(result.autoRegisteredClientId, undefined);
});

test('removeControllerClientAtRelay sends remove request', async () => {
  const config: OttoConfig = {
    relayUrl: 'ws://localhost:8787?role=controller',
    relayHttpUrl: 'http://localhost:8787',
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock.fn(() => Promise.resolve(new Response('{"ok":true}', { status: 200 }))) as typeof globalThis.fetch;

  try {
    await removeControllerClientAtRelay(config, 'client-1');
    assert.ok(true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('removeControllerClientAtRelay ignores client_not_found errors', async () => {
  const config: OttoConfig = {
    relayUrl: 'ws://localhost:8787?role=controller',
    relayHttpUrl: 'http://localhost:8787',
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock.fn(() => Promise.resolve(new Response('{"error":"client_not_found"}', { status: 404 }))) as typeof globalThis.fetch;

  try {
    await removeControllerClientAtRelay(config, 'nonexistent-client');
    assert.ok(true, 'Should not throw for client_not_found');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('removeControllerClientAtRelay throws on other errors', async () => {
  const config: OttoConfig = {
    relayUrl: 'ws://localhost:8787?role=controller',
    relayHttpUrl: 'http://localhost:8787',
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock.fn(() => Promise.resolve(new Response('{"error":"internal"}', { status: 500 }))) as typeof globalThis.fetch;

  try {
    await assert.rejects(
      removeControllerClientAtRelay(config, 'client-1'),
      /HTTP 500/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('sendCommandWithSocket handles abort signal listener correctly', async () => {
  const ws = createMockWs();
  const controller = new AbortController();

  const result = sendCommandWithSocket(ws, 'node-1', {
    action: 'test',
    payload: {},
    timeoutMs: 30000,
    signal: controller.signal,
  });

  controller.abort();

  await assert.rejects(result.response, /Aborted/);
});

test('sendCommandWithSocket ignores non-result non-error messages', async () => {
  const ws = createMockWs();
  const result = sendCommandWithSocket(ws, 'node-1', {
    action: 'test',
    payload: {},
    timeoutMs: 30000,
  });

  const sentEnvelope = JSON.parse(ws.send.mock.calls[0].arguments[0] as string);

  ws.emit('message', Buffer.from(JSON.stringify({
    requestId: sentEnvelope.requestId,
    messageType: 'event',
    payload: {},
  })));

  ws.emit('message', Buffer.from(JSON.stringify({
    requestId: sentEnvelope.requestId,
    messageType: 'result',
    payload: { ok: true },
  })));

  const response = await result.response;
  assert.equal(response.messageType, 'result');
});