import test from 'node:test';
import assert from 'node:assert/strict';
import { executeCommand } from '../src/runtime/command-executor.js';
import { CommandExecutionError } from '../src/runtime/execution-error.js';
import { resetListenerManagersForTest } from '../src/runtime/listener-managers.js';
import type { CommandPayload } from '@telepat/otto-protocol';

type AnyRecord = Record<string, unknown>;

type MockOptions = {
  sessionSeed?: AnyRecord;
  disableDefaultKeepaliveSessionState?: boolean;
  tabIds?: number[];
  tabUrls?: Record<number, string>;
  tabUrlSequenceById?: Record<number, Array<string | null | undefined>>;
  defaultTabUrl?: string | null;
  scriptResults?: unknown[];
  initialActiveTabId?: number;
  invalidGroupIds?: number[];
  invalidGroupErrorValue?: unknown;
  invalidTabGroupUpdateIds?: number[];
  invalidTabGroupUpdateErrorValue?: unknown;
  debuggerAttachErrorValue?: unknown;
  disableDebugger?: boolean;
};

function createChromeMock(options: MockOptions = {}) {
  const sessionStore: AnyRecord = { ...(options.sessionSeed ?? {}) };
  if (!options.disableDefaultKeepaliveSessionState) {
    const seededTabSessions = (sessionStore.tabSessions as Record<string, unknown> | undefined) ?? {};
    const seededTabSessionModes = (sessionStore.tabSessionModes as Record<string, unknown> | undefined) ?? {};
    const seededTabSessionReadiness = (sessionStore.tabSessionReadiness as Record<string, unknown> | undefined) ?? {};
    for (const tabSessionId of Object.keys(seededTabSessions)) {
      if (!(tabSessionId in seededTabSessionModes)) {
        seededTabSessionModes[tabSessionId] = 'keepalive';
      }
      if (!(tabSessionId in seededTabSessionReadiness)) {
        seededTabSessionReadiness[tabSessionId] = 'keepalive_active';
      }
    }
    if (Object.keys(seededTabSessionModes).length > 0) {
      sessionStore.tabSessionModes = seededTabSessionModes;
    }
    if (Object.keys(seededTabSessionReadiness).length > 0) {
      sessionStore.tabSessionReadiness = seededTabSessionReadiness;
    }
  }
  const existingTabs = new Set<number>(options.tabIds ?? []);
  const tabUrls = { ...(options.tabUrls ?? {}) };
  const tabUrlSequenceById = Object.fromEntries(
    Object.entries(options.tabUrlSequenceById ?? {}).map(([tabId, sequence]) => [tabId, [...sequence]]),
  ) as Record<string, Array<string | null | undefined>>;
  const defaultTabUrl = options.defaultTabUrl === undefined ? 'https://www.reddit.com/' : options.defaultTabUrl;
  const scriptResults = [...(options.scriptResults ?? [])];
  let nextTabId = Math.max(0, ...(options.tabIds ?? [0])) + 1;
  let activeTabId = options.initialActiveTabId ?? (options.tabIds?.[0] ?? 1);
  let nextGroupId = 700;
  let groupCreateCount = 0;
  const invalidGroupIds = new Set<number>(options.invalidGroupIds ?? []);
  const invalidGroupErrorValue = options.invalidGroupErrorValue;
  const invalidTabGroupUpdateIds = new Set<number>(options.invalidTabGroupUpdateIds ?? []);
  const invalidTabGroupUpdateErrorValue = options.invalidTabGroupUpdateErrorValue;
  const debuggerAttachErrorValue = options.debuggerAttachErrorValue;
  const keepaliveEvents: Array<{ mode: 'start' | 'stop'; tabId: number; tabSessionId?: string }> = [];

  if (!existingTabs.has(activeTabId)) {
    existingTabs.add(activeTabId);
  }

  const tabGroupById = new Map<number, number>();

  const chromeApi = {
    storage: {
      session: {
        async get(keys: string[]) {
          const out: AnyRecord = {};
          for (const key of keys) out[key] = sessionStore[key];
          return out;
        },
        async set(values: AnyRecord) {
          Object.assign(sessionStore, values);
        },
      },
    },
    tabs: {
      async get(tabId: number) {
        if (!existingTabs.has(tabId)) {
          throw new Error(`No tab with id ${tabId}`);
        }

        const sequence = tabUrlSequenceById[String(tabId)];
        if (sequence && sequence.length > 0) {
          const next = sequence.shift();
          if (typeof next === 'string') {
            tabUrls[tabId] = next;
          } else {
            delete tabUrls[tabId];
          }
        }

        const resolvedUrl = Object.prototype.hasOwnProperty.call(tabUrls, tabId)
          ? tabUrls[tabId]
          : (defaultTabUrl ?? undefined);

        return {
          id: tabId,
          url: resolvedUrl,
          windowId: 1,
          groupId: tabGroupById.get(tabId) ?? -1,
        };
      },
      async create(details: { url?: string; active?: boolean }) {
        const tabId = nextTabId++;
        existingTabs.add(tabId);
        if (typeof details.url === 'string') {
          tabUrls[tabId] = details.url;
        }
        if (details.active) {
          activeTabId = tabId;
        }
        return { id: tabId, windowId: 1, url: tabUrls[tabId] ?? 'about:blank' };
      },
      async query(_query: { windowId?: number; active?: boolean; lastFocusedWindow?: boolean }) {
        void _query;
        const activeUrl = Object.prototype.hasOwnProperty.call(tabUrls, activeTabId)
          ? tabUrls[activeTabId]
          : (defaultTabUrl ?? undefined);
        return [{
          id: activeTabId,
          windowId: 1,
          url: activeUrl,
          groupId: tabGroupById.get(activeTabId) ?? -1,
        }];
      },
      async group(params: { groupId?: number; tabIds: [number] | number[] }) {
        const groupId = params.groupId ?? nextGroupId++;
        if (params.groupId !== undefined && invalidGroupIds.has(groupId)) {
          if (invalidGroupErrorValue !== undefined) {
            throw invalidGroupErrorValue;
          }
          throw new Error(`No group with id: ${groupId}.`);
        }
        if (params.groupId === undefined) {
          groupCreateCount += 1;
        }
        for (const tabId of params.tabIds) {
          tabGroupById.set(tabId, groupId);
        }
        return groupId;
      },
      async remove(tabId: number) {
        existingTabs.delete(tabId);
        tabGroupById.delete(tabId);
      },
      async update(tabId: number, changes: Record<string, unknown>) {
        if (!existingTabs.has(tabId)) {
          throw new Error(`No tab with id ${tabId}`);
        }
        if (typeof changes.url === 'string') {
          tabUrls[tabId] = changes.url;
        }
        return { id: tabId, ...changes };
      },
      onRemoved: {
        addListener() {
          return;
        },
      },
      onUpdated: {
        addListener() {
          return;
        },
      },
    },
    debugger: options.disableDebugger
      ? undefined as unknown as typeof chrome.debugger
      : {
        async attach() {
          if (debuggerAttachErrorValue !== undefined) {
            throw debuggerAttachErrorValue;
          }
        },
        async detach() {
          return;
        },
        async sendCommand() {
          return {};
        },
        onEvent: {
          addListener() {
            return;
          },
        },
        onDetach: {
          addListener() {
            return;
          },
        },
      },
    tabGroups: {
      async update(groupId: number, _changes: Record<string, unknown>) {
        void _changes;
        if (invalidTabGroupUpdateIds.has(groupId)) {
          if (invalidTabGroupUpdateErrorValue !== undefined) {
            throw invalidTabGroupUpdateErrorValue;
          }
          throw new Error(`No group with id: ${groupId}.`);
        }
        return { id: groupId };
      },
    },
    scripting: {
      async executeScript(details: { target?: { tabId?: number }; args?: unknown[] }) {
        const firstArg = Array.isArray(details.args) ? details.args[0] : undefined;
        const mode = firstArg && typeof firstArg === 'object'
          ? (firstArg as Record<string, unknown>).__ottoAudioKeepalive
          : undefined;
        if (mode === 'start' || mode === 'stop') {
          keepaliveEvents.push({
            mode,
            tabId: Number(details.target?.tabId ?? -1),
            tabSessionId: typeof (firstArg as Record<string, unknown>).tabSessionId === 'string'
              ? String((firstArg as Record<string, unknown>).tabSessionId)
              : undefined,
          });
          return [{ result: { active: mode === 'start' } }];
        }

        const next = scriptResults.shift();
        return [{ result: next ?? null }];
      },
    },
  } as unknown as typeof chrome;

  return {
    chromeApi,
    sessionStore,
    tabUrls,
    getGroupCreateCount: () => groupCreateCount,
    getKeepaliveEvents: () => keepaliveEvents.slice(),
  };
}

function buildCommand(action: string, payload: Record<string, unknown>): CommandPayload {
  return {
    targetNodeId: 'node_test',
    action,
    payload,
  };
}

test('primitive.tab.query returns current tab session map', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
  });

  const result = await executeCommand(chromeApi, buildCommand('primitive.tab.query', {}));
  assert.deepEqual(result.data, { tabSessions: { tab_alpha: 11 } });
});

test('navigate returns deterministic unknown_tab_session for missing mapping', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: { tabSessions: {} },
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('primitive.tab.navigate', { tabSessionId: 'missing', url: 'https://example.com' })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'unknown_tab_session');
      assert.equal(commandErr.stage, 'resolve_tab');
      assert.equal(commandErr.retryable, false);
      return true;
    },
  );
});

test('navigate prunes stale mapping and returns tab_session_closed when tab is gone', async () => {
  const { chromeApi, sessionStore } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        stale_tab: 99,
      },
    },
    tabIds: [],
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('primitive.tab.navigate', { tabSessionId: 'stale_tab', url: 'https://example.com' })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'tab_session_closed');
      assert.equal(commandErr.stage, 'resolve_tab');
      assert.equal(commandErr.retryable, true);
      return true;
    },
  );

  assert.deepEqual(sessionStore.tabSessions, {});
});

test('command.run rejects site mismatch for current tab URL', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://news.ycombinator.com/' },
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      command: 'getFeed',
      input: {},
      authMode: 'auto',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'site_mismatch');
      return true;
    },
  );
});

test('command.run rejects keepalive-required command on normal tab mode', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
      tabSessionModes: {
        tab_alpha: 'normal',
      },
      tabSessionReadiness: {
        tab_alpha: 'ready',
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      command: 'getFeed',
      input: {},
      authMode: 'auto',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'keepalive_required_tab_mode_mismatch');
      return true;
    },
  );
});

test('command.run rejects keepalive-required command when tab mode is unknown', async () => {
  const { chromeApi } = createChromeMock({
    disableDefaultKeepaliveSessionState: true,
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
      tabSessionModes: {},
      tabSessionReadiness: {},
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      command: 'getFeed',
      input: {},
      authMode: 'auto',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'keepalive_required_tab_mode_mismatch');
      return true;
    },
  );
});

test('command.run waits for committed tab URL before site validation', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    defaultTabUrl: null,
    tabUrlSequenceById: {
      11: [undefined, undefined, 'https://www.reddit.com/'],
    },
    scriptResults: [{ authenticated: true }, { posts: [{ kind: 'content.post', id: 'post-ready', title: 'Ready', author: 'eve' }] }],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getFeed',
    input: {},
    authMode: 'auto',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getFeed',
    posts: [{ kind: 'content.post', id: 'post-ready', title: 'Ready', author: 'eve' }],
  });
});

test('command.run returns transient tab_url_not_ready when committed URL never appears', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    defaultTabUrl: null,
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      command: 'getFeed',
      input: {},
      authMode: 'auto',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'tab_url_not_ready');
      assert.equal(commandErr.stage, 'command.run');
      assert.equal(commandErr.retryable, true);
      return true;
    },
  );
});

test('command.run redirects to login when auth check fails in auto mode', async () => {
  const { chromeApi, tabUrls } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    scriptResults: [false],
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      command: 'getFeed',
      input: {},
      authMode: 'auto',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'manual_login_required');
      assert.equal(tabUrls[11], 'https://www.reddit.com/login/');
      return true;
    },
  );
});

test('command.run executes when authenticated and returns posts', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    scriptResults: [{ authenticated: true }, { posts: [{ kind: 'content.post', id: 'post-hello', title: 'Hello', author: 'alice' }] }],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getFeed',
    input: {},
    authMode: 'auto',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getFeed',
    posts: [{ kind: 'content.post', id: 'post-hello', title: 'Hello', author: 'alice' }],
  });
});

test('command.run ensures tab keepalive before command execution', async () => {
  resetListenerManagersForTest();
  const { chromeApi, getKeepaliveEvents } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
      tabSessionModes: {
        tab_alpha: 'keepalive',
      },
      tabSessionReadiness: {
        tab_alpha: 'keepalive_active',
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    scriptResults: [{ authenticated: true }, { posts: [] }],
  });

  await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getFeed',
    input: {},
    authMode: 'auto',
  }));

  const keepaliveEvents = getKeepaliveEvents();
  assert.ok(keepaliveEvents.some((event) => event.mode === 'start' && event.tabId === 11 && event.tabSessionId === 'tab_alpha'));
});

test('command.run getFeed accepts optional minReturnedPosts input', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    scriptResults: [{ authenticated: true }, { posts: [{ kind: 'content.post', id: 'post-min', title: 'Min', author: 'alice' }] }],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getFeed',
    input: { minReturnedPosts: 35 },
    authMode: 'auto',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getFeed',
    posts: [{ kind: 'content.post', id: 'post-min', title: 'Min', author: 'alice' }],
  });
});

test('legacy command.reddit_feed action is routed via command runtime', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    scriptResults: [{ authenticated: true }, { posts: [{ kind: 'content.post', id: 'post-legacy', title: 'Legacy', author: 'bob' }] }],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.reddit_feed', {
    tabSessionId: 'tab_alpha',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getFeed',
    posts: [{ kind: 'content.post', id: 'post-legacy', title: 'Legacy', author: 'bob' }],
  });
});

test('command.run sendChatMessage returns deterministic payload', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    scriptResults: [
      { authenticated: true },
      { sent: true, roomId: 'room_1', username: 'alice' },
    ],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'sendChatMessage',
    input: {
      username: 'alice',
      message: 'hello',
    },
    authMode: 'strict_fail',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'sendChatMessage',
    sent: true,
    roomId: 'room_1',
    username: 'alice',
  });
});

test('command.run getChatMessages normalizes matrix events', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://chat.reddit.com/' },
    scriptResults: [
      { authenticated: true },
      {
        chunk: [
          {
            type: 'm.room.message',
            event_id: 'evt_1',
            sender: '@t2_abc:reddit.com',
            origin_server_ts: 1710000000000,
            content: { body: 'hi there' },
          },
          {
            type: 'm.typing',
            content: { user_ids: ['@t2_abc:reddit.com'] },
          },
        ],
      },
    ],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getChatMessages',
    input: {
      roomId: 'room_1',
      limit: 20,
    },
    authMode: 'strict_fail',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getChatMessages',
    scope: 'room',
    roomId: 'room_1',
    totalCount: 1,
    roomCount: 1,
    rooms: [
      {
        roomId: 'room_1',
        count: 1,
        messages: [
          {
            eventId: 'evt_1',
            roomId: 'room_1',
            text: 'hi there',
            sender: '@t2_abc:reddit.com',
            createdAt: '2024-03-09T16:00:00.000Z',
          },
        ],
      },
    ],
  });
});

test('command.run getChatMessages fetches across rooms when roomId is omitted', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://chat.reddit.com/' },
    scriptResults: [
      { authenticated: true },
      {
        scope: 'all_rooms',
        chunk: [
          {
            type: 'm.room.message',
            event_id: 'evt_1',
            sender: '@t2_abc:reddit.com',
            origin_server_ts: 1710000000000,
            roomId: 'room_1',
            content: { body: 'hello room 1' },
          },
          {
            type: 'm.room.message',
            event_id: 'evt_2',
            sender: '@t2_def:reddit.com',
            origin_server_ts: 1710000001000,
            roomId: 'room_2',
            content: { body: 'hello room 2' },
          },
        ],
      },
    ],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getChatMessages',
    input: {
      limit: 20,
    },
    authMode: 'strict_fail',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getChatMessages',
    scope: 'all_rooms',
    roomId: undefined,
    totalCount: 2,
    roomCount: 2,
    rooms: [
      {
        roomId: 'room_1',
        count: 1,
        messages: [
          {
            eventId: 'evt_1',
            roomId: 'room_1',
            text: 'hello room 1',
            sender: '@t2_abc:reddit.com',
            createdAt: '2024-03-09T16:00:00.000Z',
          },
        ],
      },
      {
        roomId: 'room_2',
        count: 1,
        messages: [
          {
            eventId: 'evt_2',
            roomId: 'room_2',
            text: 'hello room 2',
            sender: '@t2_def:reddit.com',
            createdAt: '2024-03-09T16:00:01.000Z',
          },
        ],
      },
    ],
  });
});

test('command.run getChatMessages falls back to formatted_body when body is missing', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://chat.reddit.com/' },
    scriptResults: [
      { authenticated: true },
      {
        chunk: [
          {
            type: 'm.room.message',
            event_id: 'evt_3',
            sender: '@t2_xyz:reddit.com',
            origin_server_ts: 1710000002000,
            content: { formatted_body: '<p>hello html</p>' },
          },
          {
            type: 'm.room.message',
            event_id: 'evt_4',
            sender: '@t2_xyz:reddit.com',
            origin_server_ts: 1710000003000,
            content: { body: '   ' },
          },
        ],
      },
    ],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getChatMessages',
    input: {
      roomId: 'room_1',
      limit: 20,
    },
    authMode: 'strict_fail',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getChatMessages',
    scope: 'room',
    roomId: 'room_1',
    totalCount: 1,
    roomCount: 1,
    rooms: [
      {
        roomId: 'room_1',
        count: 1,
        messages: [
          {
            eventId: 'evt_3',
            roomId: 'room_1',
            text: '<p>hello html</p>',
            sender: '@t2_xyz:reddit.com',
            createdAt: '2024-03-09T16:00:02.000Z',
          },
        ],
      },
    ],
  });
});

test('command.test getChatMessages returns stream listener metadata', async () => {
  resetListenerManagersForTest();
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://chat.reddit.com/' },
    scriptResults: [
      { authenticated: true },
      { ready: true },
    ],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.test', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getChatMessages',
    input: {
      roomId: 'room_1',
      limit: 20,
    },
    authMode: 'strict_fail',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getChatMessages',
    ready: true,
    roomId: 'room_1',
    fallback: {
      enabled: true,
      mode: 'poll',
      strategy: 'command_poll',
      intervalMs: 7_000,
      maxPolls: 4,
      roomId: 'room_1',
    },
    stream: {
      listeners: [
        {
          listener: 'network.http_intercept',
          options: {
            tabSessionId: 'tab_alpha',
            site: 'reddit.com',
            streamAdapter: 'reddit.chat.v1',
            mode: 'fetch',
            includeBody: true,
            includeHeaders: false,
            urlPatterns: ['https://matrix.redditspace.com/_matrix/client/v3/sync*'],
            requestHostAllowlist: ['matrix.redditspace.com'],
            mimeTypes: ['application/json', 'text/plain'],
            maxBodyBytes: 1_000_000,
          },
        },
      ],
    },
  });
});

test('command.test getChatMessages returns buffered polling fallback when interception is unavailable', async () => {
  resetListenerManagersForTest();
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://chat.reddit.com/' },
      disableDebugger: true,
    scriptResults: [
      { authenticated: true },
      { ready: true },
      {
        scope: 'room',
        chunk: [
          {
            type: 'm.room.message',
            event_id: 'evt_fb_1',
            roomId: 'room_1',
            sender: '@t2_peer:reddit.com',
            origin_server_ts: 1710000000000,
            content: { body: 'fallback message' },
          },
        ],
      },
    ],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.test', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getChatMessages',
    input: {
      roomId: 'room_1',
      limit: 20,
    },
    authMode: 'strict_fail',
  }));

  const payload = result.data as Record<string, unknown>;
  assert.equal(payload.command, 'getChatMessages');
  assert.equal((payload.fallback as { engaged?: boolean }).engaged, true);
  assert.equal((payload.fallback as { reason?: string }).reason, 'intercept_probe_unavailable');
  assert.ok(!('stream' in payload));

  const bufferedResult = payload.bufferedResult as { totalCount?: number };
  assert.equal(bufferedResult.totalCount, 1);
});

test('command.run rejects unexpected input fields before execute', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      command: 'getFeed',
      input: { unexpected: true },
      authMode: 'auto',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'unexpected_command_input');
      return true;
    },
  );
});

test('command.run rejects missing required input fields before execute', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      command: 'sendChatMessage',
      input: { username: 'alice' },
      authMode: 'auto',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'missing_command_input');
      return true;
    },
  );
});

test('command.run rejects invalid input field types before execute', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      command: 'sendChatMessage',
      input: { username: 'alice', message: 1 },
      authMode: 'auto',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'invalid_command_input_type');
      return true;
    },
  );
});

test('command.run rejects non-number getFeed minReturnedPosts before execute', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      command: 'getFeed',
      input: { minReturnedPosts: '20' },
      authMode: 'auto',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'invalid_command_input_type');
      return true;
    },
  );
});

test('command.run enforces inputAtLeastOneOf metadata before execute', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      command: 'getUserInfo',
      input: {},
      authMode: 'strict_fail',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'missing_command_input_one_of');
      return true;
    },
  );
});

test('command.run auto-navigates to preloadHost before execute', async () => {
  const { chromeApi, tabUrls } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    scriptResults: [{ authenticated: true }, { chunk: [] }],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getChatMessages',
    input: { roomId: 'room_1' },
    authMode: 'strict_fail',
  }));

  assert.equal(tabUrls[11], 'https://chat.reddit.com');
  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getChatMessages',
    scope: 'room',
    roomId: 'room_1',
    totalCount: 0,
    roomCount: 0,
    rooms: [],
  });
});

test('command.test falls back to execute when command test hook is absent', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    scriptResults: [{ authenticated: true }, { posts: [{ kind: 'content.post', id: 'post-fallback', title: 'Fallback', author: 'zoe' }] }],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.test', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getFeed',
    input: {},
    authMode: 'auto',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getFeed',
    posts: [{ kind: 'content.post', id: 'post-fallback', title: 'Fallback', author: 'zoe' }],
  });
});

test('command.test falls back to execute and honors preloadHost compatibility', async () => {
  const { chromeApi, tabUrls } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://chat.reddit.com/threads' },
    scriptResults: [
      { authenticated: true },
      { posts: [{ kind: 'content.post', id: 'post-fallback-2', title: 'from fallback execute', author: 'otto' }] },
    ],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.test', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getFeed',
    input: {},
    authMode: 'strict_fail',
  }));

  assert.equal(tabUrls[11], 'https://chat.reddit.com/threads');
  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getFeed',
    posts: [{ kind: 'content.post', id: 'post-fallback-2', title: 'from fallback execute', author: 'otto' }],
  });
});

test('command.test uses sendChatMessage test hook for non-side-effect readiness checks', async () => {
  const { chromeApi, tabUrls } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    scriptResults: [
      { authenticated: true },
      { ready: true, mode: 'create-room' },
    ],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.test', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'sendChatMessage',
    input: {
      username: 'alice',
      message: 'hello',
    },
    authMode: 'strict_fail',
  }));

  assert.equal(tabUrls[11], 'https://chat.reddit.com/');
  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'sendChatMessage',
    ready: true,
    mode: 'create-room',
    username: 'alice',
    roomId: undefined,
  });
});

test('primitive.tab.open initializes automation group without grouping active user tab', async () => {
  const { chromeApi } = createChromeMock({
    tabIds: [1],
    initialActiveTabId: 1,
    tabUrls: { 1: 'https://example.com/user-page' },
  });

  const result = await executeCommand(chromeApi, buildCommand('primitive.tab.open', { url: 'https://www.reddit.com/' }));
  const openedTabId = (result.data as { tabId: number }).tabId;

  const activeTab = await chromeApi.tabs.get(1);
  const openedTab = await chromeApi.tabs.get(openedTabId);

  assert.equal(activeTab.groupId, -1);
  assert.notEqual(openedTab.groupId, -1);
});

test('concurrent primitive.tab.open calls initialize automation group once', async () => {
  const { chromeApi, sessionStore, getGroupCreateCount } = createChromeMock({
    tabIds: [11],
    initialActiveTabId: 11,
  });

  const [a, b] = await Promise.all([
    executeCommand(chromeApi, buildCommand('primitive.tab.open', { url: 'https://example.com/a' })),
    executeCommand(chromeApi, buildCommand('primitive.tab.open', { url: 'https://example.com/b' })),
  ]);

  const dataA = a.data as { tabSessionId?: string };
  const dataB = b.data as { tabSessionId?: string };
  assert.equal(typeof sessionStore.automationGroupId, 'number');
  assert.ok(dataA.tabSessionId);
  assert.ok(dataB.tabSessionId);
  assert.equal(getGroupCreateCount(), 1);
});

test('primitive.tab.open recovers when stored automation group id is stale', async () => {
  const staleGroupId = 1060980695;
  const { chromeApi, sessionStore, getGroupCreateCount } = createChromeMock({
    sessionSeed: {
      automationGroupId: staleGroupId,
    },
    tabIds: [11],
    invalidGroupIds: [staleGroupId],
  });

  const result = await executeCommand(chromeApi, buildCommand('primitive.tab.open', { url: 'https://www.reddit.com/' }));
  const data = result.data as { tabId?: number; tabSessionId?: string };

  assert.equal(typeof data.tabId, 'number');
  assert.ok(data.tabSessionId);
  assert.equal(typeof sessionStore.automationGroupId, 'number');
  assert.notEqual(sessionStore.automationGroupId, staleGroupId);
  assert.equal(getGroupCreateCount(), 1);
});

test('primitive.tab.open recovers when stale group error is non-Error value', async () => {
  const staleGroupId = 1060980695;
  const { chromeApi, sessionStore, getGroupCreateCount } = createChromeMock({
    sessionSeed: {
      automationGroupId: staleGroupId,
    },
    tabIds: [11],
    invalidGroupIds: [staleGroupId],
    invalidGroupErrorValue: `No group with id: ${staleGroupId}.`,
  });

  const result = await executeCommand(chromeApi, buildCommand('primitive.tab.open', { url: 'https://www.reddit.com/' }));
  const data = result.data as { tabId?: number; tabSessionId?: string };

  assert.equal(typeof data.tabId, 'number');
  assert.ok(data.tabSessionId);
  assert.equal(typeof sessionStore.automationGroupId, 'number');
  assert.notEqual(sessionStore.automationGroupId, staleGroupId);
  assert.equal(getGroupCreateCount(), 1);
});

test('primitive.tab.open recovers when tab group update throws nested lastError object', async () => {
  const staleGroupId = 1060980695;
  const { chromeApi, sessionStore, getGroupCreateCount } = createChromeMock({
    sessionSeed: {
      automationGroupId: staleGroupId,
    },
    tabIds: [11],
    invalidTabGroupUpdateIds: [staleGroupId],
    invalidTabGroupUpdateErrorValue: {
      lastError: {
        message: `No group with id: ${staleGroupId}.`,
      },
    },
  });

  const result = await executeCommand(chromeApi, buildCommand('primitive.tab.open', { url: 'https://www.reddit.com/' }));
  const data = result.data as { tabId?: number; tabSessionId?: string };

  assert.equal(typeof data.tabId, 'number');
  assert.ok(data.tabSessionId);
  assert.equal(typeof sessionStore.automationGroupId, 'number');
  assert.notEqual(sessionStore.automationGroupId, staleGroupId);
  assert.equal(getGroupCreateCount(), 1);
});

test('primitive.tab.open succeeds when tab grouping is unavailable in non-normal windows', async () => {
  const { chromeApi } = createChromeMock({
    tabIds: [11],
    invalidGroupIds: [700],
    invalidGroupErrorValue: 'Tabs can only be moved to and from normal windows.',
  });

  const result = await executeCommand(chromeApi, buildCommand('primitive.tab.open', { url: 'https://www.reddit.com/' }));
  const data = result.data as { tabId?: number; tabSessionId?: string };

  assert.equal(typeof data.tabId, 'number');
  assert.ok(data.tabSessionId);
});

test('primitive.tab.open stores owner metadata from relay-injected controller client id', async () => {
  const { chromeApi, sessionStore } = createChromeMock({
    tabIds: [11],
  });

  const result = await executeCommand(chromeApi, buildCommand('primitive.tab.open', {
    url: 'https://www.reddit.com/',
    __controllerClientId: 'cli_123',
  }));
  const data = result.data as { tabSessionId?: string };
  assert.ok(data.tabSessionId);
  const owners = (sessionStore.tabSessionOwners ?? {}) as Record<string, unknown>;
  assert.equal(owners[data.tabSessionId!], 'cli_123');
});

test('primitive.tab.open does not start keepalive when keepAlive is omitted', async () => {
  resetListenerManagersForTest();
  const { chromeApi, getKeepaliveEvents } = createChromeMock({
    tabIds: [11],
  });

  await executeCommand(chromeApi, buildCommand('primitive.tab.open', {
    url: 'https://www.reddit.com/',
  }));

  const keepaliveEvents = getKeepaliveEvents();
  assert.equal(keepaliveEvents.some((event) => event.mode === 'start'), false);
});

test('primitive.tab.open starts tab keepalive for managed tab session', async () => {
  resetListenerManagersForTest();
  const { chromeApi, getKeepaliveEvents } = createChromeMock({
    tabIds: [11],
    scriptResults: [true],
  });

  const result = await executeCommand(chromeApi, buildCommand('primitive.tab.open', {
    url: 'https://www.reddit.com/',
    keepAlive: true,
  }));
  const data = result.data as { tabId: number; tabSessionId: string };

  const keepaliveEvents = getKeepaliveEvents();
  assert.ok(keepaliveEvents.some((event) => event.mode === 'start' && event.tabId === data.tabId && event.tabSessionId === data.tabSessionId));
});

test('primitive.tab.close stops keepalive for managed tab session', async () => {
  resetListenerManagersForTest();
  const { chromeApi, getKeepaliveEvents } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
      tabSessionOwners: {
        tab_alpha: 'cli_a',
      },
    },
    tabIds: [11],
  });

  const result = await executeCommand(chromeApi, buildCommand('primitive.tab.close', {
    tabSessionId: 'tab_alpha',
  }));

  assert.deepEqual(result.data, {
    closed: true,
    tabSessionId: 'tab_alpha',
  });
  const keepaliveEvents = getKeepaliveEvents();
  assert.ok(keepaliveEvents.some((event) => event.mode === 'stop' && event.tabId === 11 && event.tabSessionId === 'tab_alpha'));
});

test('primitive.tab.close_owned closes only tabs owned by target controller', async () => {
  resetListenerManagersForTest();
  const { chromeApi, sessionStore, getKeepaliveEvents } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_a: 11,
        tab_b: 12,
        tab_c: 13,
      },
      tabSessionOwners: {
        tab_a: 'cli_a',
        tab_b: 'cli_b',
        tab_c: 'cli_a',
      },
    },
    tabIds: [11, 12, 13],
  });

  const result = await executeCommand(chromeApi, buildCommand('primitive.tab.close_owned', {
    controllerClientId: 'cli_a',
  }));

  assert.deepEqual(result.data, {
    controllerClientId: 'cli_a',
    closedCount: 2,
    missingCount: 0,
    totalOwnedSessions: 2,
  });
  assert.deepEqual(sessionStore.tabSessions, {
    tab_b: 12,
  });
  assert.deepEqual(sessionStore.tabSessionOwners, {
    tab_b: 'cli_b',
  });

  const keepaliveEvents = getKeepaliveEvents();
  assert.ok(keepaliveEvents.some((event) => event.mode === 'stop' && event.tabId === 11 && event.tabSessionId === 'tab_a'));
  assert.ok(keepaliveEvents.some((event) => event.mode === 'stop' && event.tabId === 13 && event.tabSessionId === 'tab_c'));
});

test('listener.subscribe returns deterministic subscribed payload', async () => {
  const { chromeApi } = createChromeMock();

  const result = await executeCommand(chromeApi, buildCommand('listener.subscribe', {
    listener: 'reddit.chat.messages',
    options: {
      pollIntervalMs: 15000,
      includeUnreadOnly: true,
    },
  }));

  assert.deepEqual(result.data, {
    listener: 'reddit.chat.messages',
    subscribed: true,
    options: {
      pollIntervalMs: 15000,
      includeUnreadOnly: true,
    },
  });
});

test('listener.subscribe normalizes network interception options', async () => {
  const { chromeApi } = createChromeMock();

  const result = await executeCommand(chromeApi, buildCommand('listener.subscribe', {
    listener: 'network.http_intercept',
    options: {
      tabSessionId: 'tab_alpha',
      site: 'Reddit.com',
      mode: 'hybrid',
      maxBodyBytes: 12345,
      requestHostAllowlist: [' Matrix.RedditSpace.com ', 'matrix.redditspace.com'],
    },
  }));

  assert.deepEqual(result.data, {
    listener: 'network.http_intercept',
    subscribed: true,
    options: {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      mode: 'hybrid',
      maxBodyBytes: 12345,
      requestHostAllowlist: ['matrix.redditspace.com'],
    },
  });
});

test('listener.subscribe rejects network interception invalid request host allowlist', async () => {
  const { chromeApi } = createChromeMock();

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('listener.subscribe', {
      listener: 'network.http_intercept',
      options: {
        tabSessionId: 'tab_alpha',
        site: 'reddit.com',
        requestHostAllowlist: ['matrix.redditspace.com', 42],
      },
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'invalid_listener_request_hosts');
      return true;
    },
  );
});

test('listener.subscribe rejects network interception missing site', async () => {
  const { chromeApi } = createChromeMock();

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('listener.subscribe', {
      listener: 'network.http_intercept',
      options: {
        tabSessionId: 'tab_alpha',
      },
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'missing_site');
      assert.equal(commandErr.stage, 'validation');
      return true;
    },
  );
});

test('listener.subscribe rejects network interception invalid mode', async () => {
  const { chromeApi } = createChromeMock();

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('listener.subscribe', {
      listener: 'network.http_intercept',
      options: {
        tabSessionId: 'tab_alpha',
        site: 'reddit.com',
        mode: 'all',
      },
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'invalid_listener_mode');
      return true;
    },
  );
});

test('listener.subscribe rejects network interception invalid mimeTypes', async () => {
  const { chromeApi } = createChromeMock();

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('listener.subscribe', {
      listener: 'network.http_intercept',
      options: {
        tabSessionId: 'tab_alpha',
        site: 'reddit.com',
        mimeTypes: ['application/json', 7],
      },
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'invalid_listener_mime_types');
      return true;
    },
  );
});

test('listener.subscribe normalizes network interception mode and list options', async () => {
  const { chromeApi } = createChromeMock();

  const result = await executeCommand(chromeApi, buildCommand('listener.subscribe', {
    listener: 'network.http_intercept',
    options: {
      tabSessionId: 'tab_alpha',
      site: ' Reddit.com ',
      mode: ' HYBRID ',
      urlPatterns: [' https://www.reddit.com/api/* ', 'https://www.reddit.com/api/*'],
      mimeTypes: [' Application/JSON ', 'application/json'],
      includeBody: true,
      includeHeaders: false,
      maxBodyBytes: '12345',
      streamAdapter: ' reddit.chat.v1 ',
      selfUserId: ' self_user ',
    },
  }));

  assert.deepEqual(result.data, {
    listener: 'network.http_intercept',
    subscribed: true,
    options: {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      mode: 'hybrid',
      urlPatterns: ['https://www.reddit.com/api/*'],
      mimeTypes: ['application/json'],
      includeBody: true,
      includeHeaders: false,
      maxBodyBytes: 12345,
      streamAdapter: 'reddit.chat.v1',
      selfUserId: 'self_user',
    },
  });
});

test('listener.subscribe rejects network interception invalid streamAdapter type', async () => {
  const { chromeApi } = createChromeMock();

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('listener.subscribe', {
      listener: 'network.http_intercept',
      options: {
        tabSessionId: 'tab_alpha',
        site: 'reddit.com',
        streamAdapter: 7,
      },
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'invalid_listener_stream_adapter');
      return true;
    },
  );
});

test('listener.subscribe rejects network interception invalid selfUserId type', async () => {
  const { chromeApi } = createChromeMock();

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('listener.subscribe', {
      listener: 'network.http_intercept',
      options: {
        tabSessionId: 'tab_alpha',
        site: 'reddit.com',
        selfUserId: { id: 'self' },
      },
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'invalid_listener_self_user_id');
      return true;
    },
  );
});

test('listener.subscribe rejects network interception invalid includeBody type', async () => {
  const { chromeApi } = createChromeMock();

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('listener.subscribe', {
      listener: 'network.http_intercept',
      options: {
        tabSessionId: 'tab_alpha',
        site: 'reddit.com',
        includeBody: 'yes',
      },
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'invalid_listener_include_body');
      return true;
    },
  );
});

test('command.run getUserInfo maps reddit profile payload', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    scriptResults: [{
      name: 'alice',
      id: 'abc123',
      icon_img: 'https://example.com/avatar.png',
      created_utc: 123,
      is_blocked: false,
      is_mod: false,
      is_employee: false,
      accept_chats: true,
    }],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getUserInfo',
    input: { username: 'alice' },
    authMode: 'strict_fail',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getUserInfo',
    username: 'alice',
    id: 't2_abc123',
    avatar: 'https://example.com/avatar.png',
    createdUtc: 123,
    isBlocked: false,
    isMod: false,
    isEmployee: false,
    acceptChats: true,
    raw: {
      name: 'alice',
      id: 'abc123',
      icon_img: 'https://example.com/avatar.png',
      created_utc: 123,
      is_blocked: false,
      is_mod: false,
      is_employee: false,
      accept_chats: true,
    },
  });
});

test('listener.unsubscribe requires targetRequestId', async () => {
  const { chromeApi } = createChromeMock();

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('listener.unsubscribe', {})),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'missing_listener_target_request');
      assert.equal(commandErr.stage, 'validation');
      assert.equal(commandErr.retryable, false);
      return true;
    },
  );
});
