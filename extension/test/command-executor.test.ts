import test from 'node:test';
import assert from 'node:assert/strict';
import { executeCommand } from '../src/runtime/command-executor';
import { CommandExecutionError } from '../src/runtime/execution-error';
import type { CommandPayload } from '@telepat/otto-protocol';

type AnyRecord = Record<string, unknown>;

type MockOptions = {
  sessionSeed?: AnyRecord;
  tabIds?: number[];
  tabUrls?: Record<number, string>;
  scriptResults?: unknown[];
  initialActiveTabId?: number;
};

function createChromeMock(options: MockOptions = {}) {
  const sessionStore: AnyRecord = { ...(options.sessionSeed ?? {}) };
  const existingTabs = new Set<number>(options.tabIds ?? []);
  const tabUrls = { ...(options.tabUrls ?? {}) };
  const scriptResults = [...(options.scriptResults ?? [])];
  let nextTabId = Math.max(0, ...(options.tabIds ?? [0])) + 1;
  let activeTabId = options.initialActiveTabId ?? (options.tabIds?.[0] ?? 1);
  let nextGroupId = 700;
  let groupCreateCount = 0;

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
        return {
          id: tabId,
          url: tabUrls[tabId] ?? 'https://www.reddit.com/',
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
      async query(_query: { windowId?: number; active?: boolean }) {
        void _query;
        return [{
          id: activeTabId,
          windowId: 1,
          url: tabUrls[activeTabId] ?? 'https://www.reddit.com/',
          groupId: tabGroupById.get(activeTabId) ?? -1,
        }];
      },
      async group(params: { groupId?: number; tabIds: [number] | number[] }) {
        const groupId = params.groupId ?? nextGroupId++;
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
    },
    tabGroups: {
      async update(groupId: number, _changes: Record<string, unknown>) {
        void _changes;
        return { id: groupId };
      },
    },
    scripting: {
      async executeScript() {
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

test('recipe.run rejects site mismatch for current tab URL', async () => {
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
    () => executeCommand(chromeApi, buildCommand('recipe.run', {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      recipe: 'getFeed',
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

test('recipe.run redirects to login when auth check fails in auto mode', async () => {
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
    () => executeCommand(chromeApi, buildCommand('recipe.run', {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      recipe: 'getFeed',
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

test('recipe.run executes when authenticated and returns posts', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    scriptResults: [true, [{ title: 'Hello', author: 'alice' }]],
  });

  const result = await executeCommand(chromeApi, buildCommand('recipe.run', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    recipe: 'getFeed',
    input: {},
    authMode: 'auto',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    recipe: 'getFeed',
    posts: [{ title: 'Hello', author: 'alice' }],
  });
});

test('legacy recipe.reddit_feed action is routed via recipe runtime', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    scriptResults: [true, [{ title: 'Legacy', author: 'bob' }]],
  });

  const result = await executeCommand(chromeApi, buildCommand('recipe.reddit_feed', {
    tabSessionId: 'tab_alpha',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    recipe: 'getFeed',
    posts: [{ title: 'Legacy', author: 'bob' }],
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
