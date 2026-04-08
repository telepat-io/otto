import assert from 'node:assert/strict';
import test from 'node:test';
import { createRedditChatListenerManager } from '../src/runtime/reddit-chat-listener.js';

type RuntimeMessage = {
  type?: string;
  payload?: {
    requestId?: string;
    updateType?: string;
    data?: unknown;
  };
};

type NetworkSubscribeHooks = {
  emitToRelay?: boolean;
  onUpdate?: (updateType: string, data: unknown) => void | Promise<void>;
};

function createMockChrome(scriptResults: unknown[] = []) {
  const runtimeMessages: RuntimeMessage[] = [];
  const sessionStore: Record<string, unknown> = {
    tabSessions: {
      tab_alpha: 101,
    },
  };
  const queue = [...scriptResults];

  const chromeApi = {
    runtime: {
      async sendMessage(message: RuntimeMessage) {
        runtimeMessages.push(message);
      },
    },
    storage: {
      session: {
        async get(keys: string[]) {
          const out: Record<string, unknown> = {};
          for (const key of keys) {
            out[key] = sessionStore[key];
          }
          return out;
        },
        async set(values: Record<string, unknown>) {
          Object.assign(sessionStore, values);
        },
      },
    },
    tabs: {
      async get(tabId: number) {
        return {
          id: tabId,
          url: 'https://www.reddit.com/',
        };
      },
      async create() {
        return {
          id: 404,
          url: 'https://chat.reddit.com/threads',
        };
      },
      async remove() {
        return;
      },
    },
    scripting: {
      async executeScript() {
        const next = queue.shift();
        return [{ result: next ?? { ok: true, events: [] } }];
      },
    },
  } as unknown as typeof chrome;

  return {
    chromeApi,
    runtimeMessages,
    sessionStore,
  };
}

function createMockNetworkManager(shouldThrowOnSubscribe = false) {
  const updateHandlerByRequestId = new Map<string, (updateType: string, data: unknown) => void | Promise<void>>();
  const subscribeCalls: Array<{ requestId: string; options: Record<string, unknown> }> = [];

  return {
    subscribeCalls,
    async subscribe(requestId: string, options: Record<string, unknown>, hooks: NetworkSubscribeHooks = {}) {
      if (shouldThrowOnSubscribe) {
        throw new Error('network_listener_attach_failed');
      }
      subscribeCalls.push({ requestId, options });
      if (hooks.onUpdate) {
        updateHandlerByRequestId.set(requestId, hooks.onUpdate);
      }
      return {
        tabId: 101,
        mode: 'fetch',
        source: 'network.http_intercept',
      };
    },
    async unsubscribe(requestId: string) {
      updateHandlerByRequestId.delete(requestId);
      return true;
    },
    async unsubscribeAll() {
      updateHandlerByRequestId.clear();
    },
    async emit(requestId: string, updateType: string, data: unknown) {
      const handler = updateHandlerByRequestId.get(requestId);
      if (!handler) {
        return;
      }
      await handler(updateType, data);
    },
  };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

test('reddit chat listener parses sync payload lines prefixed with data:', async () => {
  const mockChrome = createMockChrome();
  const mockNetwork = createMockNetworkManager();
  const manager = createRedditChatListenerManager(mockChrome.chromeApi, mockNetwork as never);

  await manager.subscribe('req_chat', {
    tabSessionId: 'tab_alpha',
  });

  await mockNetwork.emit('reddit_network_req_chat', 'network.response', {
    body: 'data: {"next_batch":"next_1","rooms":{"join":{"!room:reddit.com":{"timeline":{"events":[{"type":"m.room.message","event_id":"evt_1","sender":"@t2_peer:reddit.com","origin_server_ts":1710000000000,"content":{"body":"hello"}}]}}}}}',
    base64Encoded: false,
  });

  await flushMicrotasks();

  const update = mockChrome.runtimeMessages.find((entry) => {
    return entry.type === 'otto.listenerUpdate'
      && entry.payload?.requestId === 'req_chat'
      && entry.payload?.updateType === 'new_message';
  });

  assert.ok(update);
  const data = (update?.payload?.data ?? {}) as { text?: string; senderId?: string };
  assert.equal(data.text, 'hello');
  assert.equal(data.senderId, 'peer');

  await manager.unsubscribe('req_chat');
});

test('reddit chat listener falls back to polling after repeated interception errors', async () => {
  const mockChrome = createMockChrome([
    {
      ok: true,
      nextBatch: 'cursor_1',
      selfUserId: 'self',
      events: [],
    },
  ]);
  const mockNetwork = createMockNetworkManager();
  const manager = createRedditChatListenerManager(mockChrome.chromeApi, mockNetwork as never);

  await manager.subscribe('req_fallback', {
    tabSessionId: 'tab_alpha',
  });

  await mockNetwork.emit('reddit_network_req_fallback', 'network.error', {
    error: 'response_body_unavailable',
  });
  await mockNetwork.emit('reddit_network_req_fallback', 'network.error', {
    error: 'response_body_unavailable',
  });
  await mockNetwork.emit('reddit_network_req_fallback', 'network.error', {
    error: 'response_body_unavailable',
  });

  await flushMicrotasks();

  const fallbackEvents = mockChrome.runtimeMessages.filter((entry) => {
    return entry.type === 'otto.listenerUpdate'
      && entry.payload?.requestId === 'req_fallback'
      && entry.payload?.updateType === 'mode_fallback';
  });

  assert.equal(fallbackEvents.length, 1);
  await manager.unsubscribe('req_fallback');
});

test('reddit chat listener uses polling when interception is unavailable', async () => {
  const mockChrome = createMockChrome([
    {
      ok: true,
      nextBatch: 'cursor_2',
      selfUserId: 'self',
      events: [
        {
          kind: 'new_message',
          eventId: 'evt_poll_1',
          roomId: '!room:reddit.com',
          sender: '@t2_peer:reddit.com',
          text: 'from-poll',
          originServerTs: 1710000001000,
        },
      ],
    },
  ]);
  const mockNetwork = createMockNetworkManager(true);
  const manager = createRedditChatListenerManager(mockChrome.chromeApi, mockNetwork as never);

  await manager.subscribe('req_poll', {
    tabSessionId: 'tab_alpha',
  });

  await flushMicrotasks();

  const fallback = mockChrome.runtimeMessages.find((entry) => {
    return entry.type === 'otto.listenerUpdate'
      && entry.payload?.requestId === 'req_poll'
      && entry.payload?.updateType === 'mode_fallback';
  });
  assert.ok(fallback);

  const messageEvent = mockChrome.runtimeMessages.find((entry) => {
    return entry.type === 'otto.listenerUpdate'
      && entry.payload?.requestId === 'req_poll'
      && entry.payload?.updateType === 'new_message';
  });
  assert.ok(messageEvent);

  await manager.unsubscribe('req_poll');
}
);