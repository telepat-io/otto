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

function createMockChrome() {
  const runtimeMessages: RuntimeMessage[] = [];
  const sessionStore: Record<string, unknown> = {
    tabSessions: {
      tab_alpha: 101,
    },
  };

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
        return { id: tabId, url: 'https://www.reddit.com/' };
      },
      async create() {
        return { id: 404, url: 'https://chat.reddit.com/threads' };
      },
      async remove() {
        return;
      },
    },
    scripting: {
      async executeScript() {
        return [{ result: { ok: true, events: [] } }];
      },
    },
  } as unknown as typeof chrome;

  return {
    chromeApi,
    runtimeMessages,
  };
}

function createMockNetworkManager() {
  const updateHandlerByRequestId = new Map<string, (updateType: string, data: unknown) => void | Promise<void>>();

  return {
    async subscribe(requestId: string, _options: Record<string, unknown>, hooks: NetworkSubscribeHooks = {}) {
      if (hooks.onUpdate) {
        updateHandlerByRequestId.set(requestId, hooks.onUpdate);
      }
      return {
        tabId: 101,
        mode: 'hybrid',
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

test('reddit chat listener parses CRLF length-prefixed matrix sync chunks', async () => {
  const mockChrome = createMockChrome();
  const mockNetwork = createMockNetworkManager();
  const manager = createRedditChatListenerManager(mockChrome.chromeApi, mockNetwork as never);

  const toChunk = (value: Record<string, unknown>): string => {
    const json = JSON.stringify(value);
    return `${json.length.toString(16)}\r\n${json}\r\n`;
  };

  const body = `${toChunk({
    next_batch: 'n1',
    rooms: { join: { '!room:reddit.com': { state: { events: [] }, timeline: { events: [] }, ephemeral: { events: [] } } } },
  })}${toChunk({
    next_batch: 'n2',
    rooms: {
      join: {
        '!room:reddit.com': {
          state: { events: [] },
          timeline: {
            events: [
              {
                type: 'm.room.message',
                event_id: 'evt1',
                sender: '@t2_peer:reddit.com',
                origin_server_ts: 1710000000000,
                content: { body: 'yaya' },
              },
            ],
          },
          ephemeral: { events: [] },
        },
      },
    },
  })}`;

  await manager.subscribe('req_chunked', { tabSessionId: 'tab_alpha' });
  await mockNetwork.emit('reddit_network_req_chunked', 'network.response', { body, base64Encoded: false });
  await flushMicrotasks();

  const update = mockChrome.runtimeMessages.find((entry) => {
    return entry.type === 'otto.listenerUpdate'
      && entry.payload?.requestId === 'req_chunked'
      && entry.payload?.updateType === 'new_message';
  });

  assert.ok(update);
  const data = (update?.payload?.data ?? {}) as { text?: string; senderId?: string };
  assert.equal(data.text, 'yaya');
  assert.equal(data.senderId, 'peer');

  await manager.unsubscribe('req_chunked');
});

