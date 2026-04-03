import test from 'node:test';
import assert from 'node:assert/strict';
import {
  relayHttpFromWs,
  ensurePairingState,
  ensureOffscreenDocument,
  reconcileAutomationState,
  bootstrap,
} from '../src/runtime/background-bootstrap';

type AnyRecord = Record<string, unknown>;

type CreateChromeMockOptions = {
  initialSession?: AnyRecord;
  tabsById?: Record<number, { id: number; groupId?: number }>;
  existingGroupIds?: number[];
  failCreateDocumentCount?: number;
  initialOffscreenDocumentCreated?: boolean;
  forceEmptyOffscreenContexts?: boolean;
};

function createChromeMock(initialLocal: AnyRecord = {}, options: CreateChromeMockOptions = {}) {
  const localStore: AnyRecord = { ...initialLocal };
  const sessionStore: AnyRecord = { ...(options.initialSession ?? {}) };
  let createDocumentCalls = 0;
  let alarmCreateCalls = 0;
  let tabGroupUpdateCalls = 0;
  let remainingCreateFailures = options.failCreateDocumentCount ?? 0;
  let offscreenDocumentCreated = options.initialOffscreenDocumentCreated ?? false;
  let nextGroupId = 500;
  const tabsById = new Map<number, { id: number; groupId?: number }>(
    Object.entries(options.tabsById ?? {}).map(([id, tab]) => [Number(id), { ...tab }]),
  );
  const existingGroupIds = new Set<number>(options.existingGroupIds ?? []);
  const tabsGroupCalls: Array<{ groupId?: number; tabIds: number[] }> = [];

  const chromeApi = {
    storage: {
      local: {
        async get(keys: string[]) {
          const out: AnyRecord = {};
          for (const k of keys) out[k] = localStore[k];
          return out;
        },
        async set(values: AnyRecord) {
          Object.assign(localStore, values);
        },
        async remove(keys: string[]) {
          for (const k of keys) delete localStore[k];
        },
      },
      session: {
        async get(keys: string[]) {
          const out: AnyRecord = {};
          for (const k of keys) out[k] = sessionStore[k];
          return out;
        },
        async set(values: AnyRecord) {
          Object.assign(sessionStore, values);
        },
        async remove(keys: string[]) {
          for (const k of keys) delete sessionStore[k];
        },
      },
    },
    runtime: {
      ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
      getURL(path: string) {
        return `chrome-extension://test/${path}`;
      },
      async getContexts() {
        if (options.forceEmptyOffscreenContexts) {
          return [] as unknown[];
        }
        return offscreenDocumentCreated ? [{ contextType: 'OFFSCREEN_DOCUMENT' }] as unknown[] : [] as unknown[];
      },
    },
    offscreen: {
      Reason: { WORKERS: 'WORKERS' },
      async createDocument() {
        createDocumentCalls += 1;
        if (remainingCreateFailures > 0) {
          remainingCreateFailures -= 1;
          throw new Error('Transient createDocument failure');
        }
        if (offscreenDocumentCreated) {
          throw new Error('Only a single offscreen document may be created.');
        }
        offscreenDocumentCreated = true;
      },
    },
    alarms: {
      create() {
        alarmCreateCalls += 1;
      },
    },
    tabs: {
      async get(tabId: number) {
        const tab = tabsById.get(tabId);
        if (!tab) throw new Error(`No tab with id ${tabId}`);
        return { ...tab };
      },
      async group(params: { groupId?: number; tabIds: number[] }) {
        const resolvedGroupId = params.groupId ?? nextGroupId++;
        existingGroupIds.add(resolvedGroupId);
        tabsGroupCalls.push({ groupId: params.groupId, tabIds: [...params.tabIds] });
        for (const tabId of params.tabIds) {
          const tab = tabsById.get(tabId);
          if (tab) tab.groupId = resolvedGroupId;
        }
        return resolvedGroupId;
      },
    },
    tabGroups: {
      async get(groupId: number) {
        if (!existingGroupIds.has(groupId)) {
          throw new Error(`No tab group with id ${groupId}`);
        }
        return { id: groupId };
      },
      async update(groupId: number) {
        existingGroupIds.add(groupId);
        tabGroupUpdateCalls += 1;
        return { id: groupId };
      },
    },
  } as unknown as typeof chrome;

  return {
    chromeApi,
    localStore,
    sessionStore,
    getCreateDocumentCalls: () => createDocumentCalls,
    getAlarmCreateCalls: () => alarmCreateCalls,
    getTabGroupUpdateCalls: () => tabGroupUpdateCalls,
    getTabsGroupCalls: () => tabsGroupCalls,
  };
}

test('relayHttpFromWs converts websocket URLs to http(s)', () => {
  assert.equal(relayHttpFromWs('ws://127.0.0.1:8787?role=node'), 'http://127.0.0.1:8787');
  assert.equal(relayHttpFromWs('wss://relay.example.com/path?role=node'), 'https://relay.example.com/path');
});

test('ensurePairingState stores pairing challenge when node is unpaired', async () => {
  const { chromeApi, localStore } = createChromeMock({
    nodeId: 'node_test_bootstrap',
    relayUrl: 'ws://127.0.0.1:8787?role=node',
  });

  const fetchCalls: string[] = [];
  const fetchImpl = (async (url: string) => {
    fetchCalls.push(url);
    return {
      ok: true,
      async json() {
        return {
          challengeId: 'ch_1',
          code: '111-222',
          expiresAt: Date.now() + 300_000,
        };
      },
    };
  }) as typeof fetch;

  await ensurePairingState(chromeApi, fetchImpl, () => undefined);

  assert.equal(fetchCalls.length, 1);
  assert.equal(localStore.pairingChallengeId, 'ch_1');
  assert.equal(localStore.pairingCode, '111-222');
});

test('bootstrap keeps runtime alive via pairing check, offscreen doc, and keepwarm alarm', async () => {
  const { chromeApi, localStore, getCreateDocumentCalls, getAlarmCreateCalls } = createChromeMock({
    nodeId: 'node_test_bootstrap_2',
    relayUrl: 'ws://127.0.0.1:8787?role=node',
    pairingChallengeId: 'ch_2',
    pairingCode: '222-333',
    pairingExpiresAt: Date.now() + 300_000,
  });

  const fetchImpl = (async (url: string) => {
    if (url.includes('/api/pairing/status')) {
      return {
        ok: true,
        async json() {
          return {
            status: 'approved',
            nodeAccessToken: 'node_access',
            nodeRefreshToken: 'node_refresh',
          };
        },
      };
    }

    return {
      ok: true,
      async json() {
        return {
          challengeId: 'ch_2',
          code: '222-333',
          expiresAt: Date.now() + 300_000,
        };
      },
    };
  }) as typeof fetch;

  await bootstrap(chromeApi, fetchImpl, () => undefined);

  assert.equal(localStore.nodeAccessToken, 'node_access');
  assert.equal(localStore.nodeRefreshToken, 'node_refresh');
  assert.equal(localStore.pairingChallengeId, undefined);
  assert.equal(getCreateDocumentCalls(), 1);
  assert.equal(getAlarmCreateCalls(), 1);
});

test('ensureOffscreenDocument coalesces concurrent callers into one creation attempt', async () => {
  const { chromeApi, getCreateDocumentCalls } = createChromeMock();

  await Promise.all([
    ensureOffscreenDocument(chromeApi),
    ensureOffscreenDocument(chromeApi),
    ensureOffscreenDocument(chromeApi),
  ]);

  assert.equal(getCreateDocumentCalls(), 1);
});

test('ensureOffscreenDocument retries successfully after transient createDocument failure', async () => {
  const { chromeApi, getCreateDocumentCalls } = createChromeMock({}, {
    failCreateDocumentCount: 1,
  });

  await assert.rejects(
    () => ensureOffscreenDocument(chromeApi),
    /Transient createDocument failure/,
  );

  await ensureOffscreenDocument(chromeApi);
  assert.equal(getCreateDocumentCalls(), 2);
});

test('ensureOffscreenDocument ignores duplicate-create race errors', async () => {
  const { chromeApi, getCreateDocumentCalls } = createChromeMock({}, {
    initialOffscreenDocumentCreated: true,
    forceEmptyOffscreenContexts: true,
  });

  await ensureOffscreenDocument(chromeApi);
  assert.equal(getCreateDocumentCalls(), 1);
});

test('ensurePairingState re-enters pairing flow immediately after expiry', async () => {
  const { chromeApi, localStore } = createChromeMock({
    nodeId: 'node_test_bootstrap_expiry',
    relayUrl: 'ws://127.0.0.1:8787?role=node',
    pairingChallengeId: 'ch_expired',
    pairingCode: '000-000',
    pairingExpiresAt: Date.now() - 5_000,
  });

  const fetchCalls: string[] = [];
  const fetchImpl = (async (url: string) => {
    fetchCalls.push(url);

    if (url.includes('/api/pairing/status')) {
      return {
        ok: true,
        async json() {
          return { status: 'expired' };
        },
      };
    }

    return {
      ok: true,
      async json() {
        return {
          challengeId: 'ch_new',
          code: '123-456',
          expiresAt: Date.now() + 300_000,
        };
      },
    };
  }) as typeof fetch;

  await ensurePairingState(chromeApi, fetchImpl, () => undefined);
  assert.equal(localStore.pairingChallengeId, 'ch_new');
  assert.equal(localStore.pairingCode, '123-456');
  assert.equal(fetchCalls.filter((x) => x.includes('/api/pairing/status')).length, 0);
  assert.equal(fetchCalls.filter((x) => x.includes('/api/pairing/request')).length, 1);
});

test('ensurePairingState resets orphaned challenge state when pairing code is missing', async () => {
  const { chromeApi, localStore } = createChromeMock({
    nodeId: 'node_test_orphaned',
    relayUrl: 'ws://127.0.0.1:8787?role=node',
    pairingChallengeId: 'ch_orphaned',
    pairingExpiresAt: Date.now() + 300_000,
  });

  const fetchCalls: string[] = [];
  const fetchImpl = (async (url: string) => {
    fetchCalls.push(url);
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          challengeId: 'ch_reissued',
          code: '654-321',
          expiresAt: Date.now() + 300_000,
        };
      },
    };
  }) as typeof fetch;

  await ensurePairingState(chromeApi, fetchImpl, () => undefined);

  assert.equal(localStore.pairingChallengeId, 'ch_reissued');
  assert.equal(localStore.pairingCode, '654-321');
  assert.equal(fetchCalls.filter((x) => x.includes('/api/pairing/status')).length, 0);
  assert.equal(fetchCalls.filter((x) => x.includes('/api/pairing/request')).length, 1);
});

test('ensurePairingState requests a fresh challenge when relay no longer has challenge id', async () => {
  const { chromeApi, localStore } = createChromeMock({
    nodeId: 'node_test_status_404',
    relayUrl: 'ws://127.0.0.1:8787?role=node',
    pairingChallengeId: 'ch_missing_remote',
    pairingCode: '111-111',
    pairingExpiresAt: Date.now() + 300_000,
  });

  const fetchCalls: string[] = [];
  const fetchImpl = (async (url: string) => {
    fetchCalls.push(url);
    if (url.includes('/api/pairing/status')) {
      return {
        ok: false,
        status: 404,
        async json() {
          return {};
        },
      };
    }

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          challengeId: 'ch_reissued_after_404',
          code: '222-333',
          expiresAt: Date.now() + 300_000,
        };
      },
    };
  }) as typeof fetch;

  await ensurePairingState(chromeApi, fetchImpl, () => undefined);

  assert.equal(localStore.pairingChallengeId, 'ch_reissued_after_404');
  assert.equal(localStore.pairingCode, '222-333');
  assert.equal(fetchCalls.filter((x) => x.includes('/api/pairing/status')).length, 1);
  assert.equal(fetchCalls.filter((x) => x.includes('/api/pairing/request')).length, 1);
});

test('ensurePairingState retries non-OK status and recovers by reissuing challenge', async () => {
  const { chromeApi, localStore } = createChromeMock({
    nodeId: 'node_test_status_retry',
    relayUrl: 'ws://127.0.0.1:8787?role=node',
    pairingChallengeId: 'ch_retry',
    pairingCode: '333-333',
    pairingExpiresAt: Date.now() + 300_000,
  });

  const fetchCalls: string[] = [];
  let statusCallCount = 0;
  const fetchImpl = (async (url: string) => {
    fetchCalls.push(url);
    if (url.includes('/api/pairing/status')) {
      statusCallCount += 1;
      return {
        ok: false,
        status: 503,
        async json() {
          return {};
        },
      };
    }

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          challengeId: 'ch_after_retry_failure',
          code: '999-000',
          expiresAt: Date.now() + 300_000,
        };
      },
    };
  }) as typeof fetch;

  await ensurePairingState(chromeApi, fetchImpl, () => undefined);

  assert.equal(statusCallCount, 3);
  assert.equal(localStore.pairingChallengeId, 'ch_after_retry_failure');
  assert.equal(localStore.pairingCode, '999-000');
  assert.equal(fetchCalls.filter((x) => x.includes('/api/pairing/request')).length, 1);
});

test('ensurePairingState clears invalid stored node tokens and re-enters pairing', async () => {
  const { chromeApi, localStore } = createChromeMock({
    nodeId: 'node_test_token_reset',
    relayUrl: 'ws://127.0.0.1:8787?role=node',
    nodeAccessToken: 'stale_access',
    nodeRefreshToken: 'stale_refresh',
  });

  const fetchCalls: string[] = [];
  const fetchImpl = (async (url: string) => {
    fetchCalls.push(url);

    if (url.includes('/api/auth/refresh')) {
      return {
        ok: false,
        status: 401,
        async json() {
          return { error: 'invalid_refresh_token' };
        },
      };
    }

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          challengeId: 'ch_after_invalid_tokens',
          code: '414-141',
          expiresAt: Date.now() + 300_000,
        };
      },
    };
  }) as typeof fetch;

  await ensurePairingState(chromeApi, fetchImpl, () => undefined);

  assert.equal(localStore.nodeAccessToken, undefined);
  assert.equal(localStore.nodeRefreshToken, undefined);
  assert.equal(localStore.pairingChallengeId, 'ch_after_invalid_tokens');
  assert.equal(localStore.pairingCode, '414-141');
  assert.equal(fetchCalls.filter((x) => x.includes('/api/auth/refresh')).length, 1);
  assert.equal(fetchCalls.filter((x) => x.includes('/api/pairing/request')).length, 1);
});

test('ensurePairingState refreshes stored node access token and skips pairing when refresh succeeds', async () => {
  const { chromeApi, localStore } = createChromeMock({
    nodeId: 'node_test_token_refresh',
    relayUrl: 'ws://127.0.0.1:8787?role=node',
    nodeAccessToken: 'old_access',
    nodeRefreshToken: 'valid_refresh',
  });

  const fetchCalls: string[] = [];
  const fetchImpl = (async (url: string) => {
    fetchCalls.push(url);

    return {
      ok: true,
      status: 200,
      async json() {
        return { accessToken: 'new_access_token' };
      },
    };
  }) as typeof fetch;

  await ensurePairingState(chromeApi, fetchImpl, () => undefined);

  assert.equal(localStore.nodeAccessToken, 'new_access_token');
  assert.equal(localStore.nodeRefreshToken, 'valid_refresh');
  assert.equal(localStore.pairingChallengeId, undefined);
  assert.equal(localStore.pairingCode, undefined);
  assert.equal(fetchCalls.filter((x) => x.includes('/api/auth/refresh')).length, 1);
  assert.equal(fetchCalls.filter((x) => x.includes('/api/pairing/request')).length, 0);
});

test('reconcileAutomationState prunes stale tab sessions after restart', async () => {
  const { chromeApi, sessionStore } = createChromeMock({}, {
    initialSession: {
      automationGroupId: 42,
      tabSessions: {
        alive_tab: 11,
        stale_tab: 22,
      },
    },
    tabsById: {
      11: { id: 11, groupId: 42 },
    },
    existingGroupIds: [42],
  });

  await reconcileAutomationState(chromeApi, () => undefined);

  assert.deepEqual(sessionStore.tabSessions, { alive_tab: 11 });
  assert.equal(sessionStore.automationGroupId, 42);
});

test('reconcileAutomationState rebuilds missing automation group and reattaches tracked tabs', async () => {
  const { chromeApi, sessionStore, getTabsGroupCalls, getTabGroupUpdateCalls } = createChromeMock({}, {
    initialSession: {
      automationGroupId: 99,
      tabSessions: {
        tab_a: 31,
        tab_b: 32,
      },
    },
    tabsById: {
      31: { id: 31, groupId: -1 },
      32: { id: 32, groupId: -1 },
    },
    existingGroupIds: [],
  });

  await reconcileAutomationState(chromeApi, () => undefined);

  assert.equal(typeof sessionStore.automationGroupId, 'number');
  assert.notEqual(sessionStore.automationGroupId, 99);
  assert.equal(getTabGroupUpdateCalls(), 1);

  const calls = getTabsGroupCalls();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.tabIds.slice().sort((a, b) => a - b), [31, 32]);
});
