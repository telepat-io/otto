import assert from 'node:assert/strict';
import test from 'node:test';
import { createNetworkInterceptListenerManager } from '../src/runtime/network-intercept-listener.js';

type Listener<TArgs extends unknown[]> = (...args: TArgs) => void;

class Emitter<TArgs extends unknown[]> {
  private listeners = new Set<Listener<TArgs>>();

  addListener(listener: Listener<TArgs>): void {
    this.listeners.add(listener);
  }

  emit(...args: TArgs): void {
    for (const listener of this.listeners) {
      listener(...args);
    }
  }
}

type MockChrome = {
  runtimeMessages: Array<{ type?: string; payload?: unknown }>;
  chromeApi: typeof chrome;
  debuggerEventEmitter: Emitter<[chrome.debugger.Debuggee, string, unknown]>;
  tabsRemovedEmitter: Emitter<[number]>;
  tabsUpdatedEmitter: Emitter<[number, { status?: string }]>;
  setNetworkBody: (requestId: string, value: { body: string; base64Encoded: boolean }) => void;
  setFetchBodyError: (requestId: string) => void;
  getDebuggerCommands: () => Array<{ method: string; params: unknown }>;
  getDetachCount: () => number;
};

function createMockChrome(): MockChrome {
  const runtimeMessages: Array<{ type?: string; payload?: unknown }> = [];
  const debuggerCommands: Array<{ method: string; params: unknown }> = [];
  const networkBodies = new Map<string, { body: string; base64Encoded: boolean }>();
  const fetchBodyErrors = new Set<string>();
  const debuggerEventEmitter = new Emitter<[chrome.debugger.Debuggee, string, unknown]>();
  const debuggerDetachEmitter = new Emitter<[chrome.debugger.Debuggee, string]>();
  const tabsRemovedEmitter = new Emitter<[number]>();
  const tabsUpdatedEmitter = new Emitter<[number, { status?: string }]>();
  let detachCount = 0;

  const chromeApi = {
    storage: {
      session: {
        async get(keys: string[]) {
          if (keys.includes('tabSessions')) {
            return {
              tabSessions: {
                tab_alpha: 101,
              },
            };
          }
          return {};
        },
      },
    },
    runtime: {
      async sendMessage(message: { type?: string; payload?: unknown }) {
        runtimeMessages.push(message);
      },
    },
    tabs: {
      async get(tabId: number) {
        return {
          id: tabId,
          url: 'https://www.reddit.com/',
        };
      },
      onRemoved: {
        addListener(listener: (tabId: number) => void) {
          tabsRemovedEmitter.addListener(listener);
        },
      },
      onUpdated: {
        addListener(listener: (tabId: number, changeInfo: { status?: string }) => void) {
          tabsUpdatedEmitter.addListener(listener);
        },
      },
    },
    debugger: {
      onEvent: {
        addListener(listener: (source: chrome.debugger.Debuggee, method: string, params?: unknown) => void) {
          debuggerEventEmitter.addListener(listener);
        },
      },
      onDetach: {
        addListener(listener: (source: chrome.debugger.Debuggee, reason: string) => void) {
          debuggerDetachEmitter.addListener(listener);
        },
      },
      async attach(target: chrome.debugger.Debuggee, version: string) {
        void target;
        void version;
        return;
      },
      async detach(target: chrome.debugger.Debuggee) {
        void target;
        detachCount += 1;
      },
      async sendCommand(_target: chrome.debugger.Debuggee, method: string, params?: unknown) {
        debuggerCommands.push({ method, params });
        if (method === 'Network.getResponseBody') {
          const requestId = (params as { requestId?: string })?.requestId ?? '';
          const body = networkBodies.get(requestId);
          if (!body) {
            throw new Error('body not found');
          }
          return body;
        }

        if (method === 'Fetch.getResponseBody') {
          const requestId = (params as { requestId?: string })?.requestId ?? '';
          if (fetchBodyErrors.has(requestId)) {
            throw new Error('fetch body unavailable');
          }
          return {
            body: '{"ok":true}',
            base64Encoded: false,
          };
        }

        return {};
      },
    },
  } as unknown as typeof chrome;

  return {
    runtimeMessages,
    chromeApi,
    debuggerEventEmitter,
    tabsRemovedEmitter,
    tabsUpdatedEmitter,
    setNetworkBody(requestId, value) {
      networkBodies.set(requestId, value);
    },
    setFetchBodyError(requestId) {
      fetchBodyErrors.add(requestId);
    },
    getDebuggerCommands() {
      return debuggerCommands;
    },
    getDetachCount() {
      return detachCount;
    },
  };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

test('network interception manager captures Network loadingFinished bodies', async () => {
  const mock = createMockChrome();
  const manager = createNetworkInterceptListenerManager(mock.chromeApi);

  await manager.subscribe('sub_1', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    urlPatterns: ['https://www.reddit.com/api/*'],
    mode: 'network',
    includeBody: true,
    includeHeaders: true,
    maxBodyBytes: 1024,
  });

  mock.setNetworkBody('req_1', {
    body: '{"ok":true}',
    base64Encoded: false,
  });

  mock.debuggerEventEmitter.emit(
    { tabId: 101 },
    'Network.responseReceived',
    {
      requestId: 'req_1',
      request: {
        method: 'GET',
        headers: {
          Authorization: 'secret',
          Accept: 'application/json',
        },
      },
      response: {
        url: 'https://www.reddit.com/api/me.json',
        status: 200,
        mimeType: 'application/json',
        headers: {
          'set-cookie': 'abc',
          'content-type': 'application/json',
        },
      },
    },
  );

  mock.debuggerEventEmitter.emit(
    { tabId: 101 },
    'Network.loadingFinished',
    {
      requestId: 'req_1',
    },
  );

  await flushMicrotasks();

  const updateMessage = mock.runtimeMessages.find((entry) => entry.type === 'otto.listenerUpdate');
  assert.ok(updateMessage);
  const payload = (updateMessage?.payload ?? {}) as {
    requestId?: string;
    updateType?: string;
    data?: {
      captureSource?: string;
      body?: string;
      requestHeaders?: Record<string, string>;
      responseHeaders?: Record<string, string>;
    };
  };

  assert.equal(payload.requestId, 'sub_1');
  assert.equal(payload.updateType, 'network.response');
  assert.equal(payload.data?.captureSource, 'network');
  assert.equal(payload.data?.body, '{"ok":true}');
  assert.equal(payload.data?.requestHeaders?.Authorization, '<redacted>');
  assert.equal(payload.data?.responseHeaders?.['set-cookie'], '<redacted>');

  await manager.unsubscribe('sub_1');
  assert.equal(mock.getDetachCount(), 1);
});

test('fetch mode always continues paused request when body lookup fails', async () => {
  const mock = createMockChrome();
  const manager = createNetworkInterceptListenerManager(mock.chromeApi);

  await manager.subscribe('sub_fetch', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    mode: 'fetch',
    includeBody: true,
  });

  mock.setFetchBodyError('fetch_req_1');

  mock.debuggerEventEmitter.emit(
    { tabId: 101 },
    'Fetch.requestPaused',
    {
      requestId: 'fetch_req_1',
      request: {
        url: 'https://www.reddit.com/api/v1/me',
        method: 'GET',
      },
      responseStatusCode: 200,
      responseHeaders: [{ name: 'content-type', value: 'application/json' }],
    },
  );

  await flushMicrotasks();

  const commandMethods = mock.getDebuggerCommands().map((entry) => entry.method);
  assert.ok(commandMethods.includes('Fetch.getResponseBody'));
  assert.ok(commandMethods.includes('Fetch.continueRequest'));

  const errorUpdate = mock.runtimeMessages.find(
    (entry) => entry.type === 'otto.listenerUpdate'
      && ((entry.payload as { updateType?: string }).updateType === 'network.error'),
  );
  assert.ok(errorUpdate);
});

test('recipe-local interception can receive callback updates without relay emission', async () => {
  const mock = createMockChrome();
  const manager = createNetworkInterceptListenerManager(mock.chromeApi);
  const callbackUpdates: Array<{ updateType: string; data: unknown }> = [];

  await manager.subscribe(
    'sub_local',
    {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      mode: 'network',
      includeBody: true,
    },
    {
      emitToRelay: false,
      onUpdate(updateType, data) {
        callbackUpdates.push({ updateType, data });
      },
    },
  );

  mock.setNetworkBody('req_local_1', {
    body: '{"from":"local"}',
    base64Encoded: false,
  });

  mock.debuggerEventEmitter.emit(
    { tabId: 101 },
    'Network.responseReceived',
    {
      requestId: 'req_local_1',
      request: {
        method: 'GET',
      },
      response: {
        url: 'https://www.reddit.com/api/me.json',
        status: 200,
        mimeType: 'application/json',
      },
    },
  );

  mock.debuggerEventEmitter.emit(
    { tabId: 101 },
    'Network.loadingFinished',
    {
      requestId: 'req_local_1',
    },
  );

  await flushMicrotasks();

  const relayUpdates = mock.runtimeMessages.filter((entry) => entry.type === 'otto.listenerUpdate');
  assert.equal(relayUpdates.length, 0);
  assert.equal(callbackUpdates.length, 1);
  assert.equal(callbackUpdates[0]?.updateType, 'network.response');
});

test('network interception manager accepts cross-host response via requestHostAllowlist', async () => {
  const mock = createMockChrome();
  const manager = createNetworkInterceptListenerManager(mock.chromeApi);

  await manager.subscribe('sub_matrix', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    mode: 'network',
    includeBody: true,
    requestHostAllowlist: ['matrix.redditspace.com'],
    urlPatterns: ['https://matrix.redditspace.com/_matrix/client/v3/sync*'],
  });

  mock.setNetworkBody('req_matrix_1', {
    body: '{"rooms":{"join":{}},"next_batch":"abc"}',
    base64Encoded: false,
  });

  mock.debuggerEventEmitter.emit(
    { tabId: 101 },
    'Network.responseReceived',
    {
      requestId: 'req_matrix_1',
      request: {
        method: 'GET',
      },
      response: {
        url: 'https://matrix.redditspace.com/_matrix/client/v3/sync?since=xyz',
        status: 200,
        mimeType: 'application/json',
      },
    },
  );

  mock.debuggerEventEmitter.emit(
    { tabId: 101 },
    'Network.loadingFinished',
    {
      requestId: 'req_matrix_1',
    },
  );

  await flushMicrotasks();

  const updateMessage = mock.runtimeMessages.find(
    (entry) => entry.type === 'otto.listenerUpdate'
      && ((entry.payload as { requestId?: string }).requestId === 'sub_matrix'),
  );
  assert.ok(updateMessage);
  const payload = (updateMessage?.payload ?? {}) as {
    updateType?: string;
    data?: { url?: string; captureSource?: string };
  };
  assert.equal(payload.updateType, 'network.response');
  assert.equal(payload.data?.captureSource, 'network');
  assert.equal(payload.data?.url?.startsWith('https://matrix.redditspace.com/_matrix/client/v3/sync'), true);

  await manager.unsubscribe('sub_matrix');
});

test('network interception manager emits detached and clears subscription on tab removal', async () => {
  const mock = createMockChrome();
  const manager = createNetworkInterceptListenerManager(mock.chromeApi);

  await manager.subscribe('sub_removed', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    mode: 'network',
    includeBody: true,
  });

  mock.tabsRemovedEmitter.emit(101);
  await flushMicrotasks();

  const detachedUpdate = mock.runtimeMessages.find(
    (entry) => entry.type === 'otto.listenerUpdate'
      && ((entry.payload as { requestId?: string; updateType?: string }).requestId === 'sub_removed')
      && ((entry.payload as { requestId?: string; updateType?: string }).updateType === 'network.detached'),
  );
  assert.ok(detachedUpdate);

  const unsubscribed = await manager.unsubscribe('sub_removed');
  assert.equal(unsubscribed, false);
});

test('network interception manager emits websocket frame updates', async () => {
  const mock = createMockChrome();
  const manager = createNetworkInterceptListenerManager(mock.chromeApi);

  await manager.subscribe('sub_ws', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    mode: 'network',
    includeBody: true,
    urlPatterns: ['wss://ws.reddit.com/*'],
  });

  mock.debuggerEventEmitter.emit(
    { tabId: 101 },
    'Network.webSocketCreated',
    {
      requestId: 'ws_req_1',
      url: 'wss://ws.reddit.com/realtime',
    },
  );

  mock.debuggerEventEmitter.emit(
    { tabId: 101 },
    'Network.webSocketFrameReceived',
    {
      requestId: 'ws_req_1',
      response: {
        opcode: 1,
        payloadData: '{"type":"message"}',
      },
    },
  );

  await flushMicrotasks();

  const updateMessage = mock.runtimeMessages.find(
    (entry) => entry.type === 'otto.listenerUpdate'
      && ((entry.payload as { requestId?: string; updateType?: string }).requestId === 'sub_ws')
      && ((entry.payload as { requestId?: string; updateType?: string }).updateType === 'network.websocket_frame'),
  );
  assert.ok(updateMessage);
  const payload = (updateMessage?.payload ?? {}) as {
    data?: { url?: string; body?: string; captureSource?: string };
  };
  assert.equal(payload.data?.url, 'wss://ws.reddit.com/realtime');
  assert.equal(payload.data?.body, '{"type":"message"}');
  assert.equal(payload.data?.captureSource, 'network');

  await manager.unsubscribe('sub_ws');
});
