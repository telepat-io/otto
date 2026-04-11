import test from 'node:test';
import assert from 'node:assert/strict';
import { createTabAudioKeepaliveManager } from '../src/runtime/tab-audio-keepalive.js';

type AnyRecord = Record<string, unknown>;

function createChromeMock(sessionSeed: AnyRecord = {}) {
  const sessionStore: AnyRecord = { ...sessionSeed };
  const calls: Array<{ mode: string; tabId: number; tabSessionId?: string }> = [];

  const chromeApi = {
    storage: {
      session: {
        async get(keys: string[]) {
          const out: AnyRecord = {};
          for (const key of keys) {
            out[key] = sessionStore[key];
          }
          return out;
        },
      },
    },
    tabs: {
      async get(tabId: number) {
        return { id: tabId, url: 'https://www.reddit.com/' };
      },
    },
    scripting: {
      async executeScript(details: { target?: { tabId?: number }; args?: unknown[] }) {
        const firstArg = Array.isArray(details.args) ? details.args[0] : undefined;
        const mode = firstArg && typeof firstArg === 'object'
          ? (firstArg as Record<string, unknown>).__ottoAudioKeepalive
          : undefined;
        calls.push({
          mode: typeof mode === 'string' ? mode : 'unknown',
          tabId: Number(details.target?.tabId ?? -1),
          tabSessionId: typeof (firstArg as Record<string, unknown> | undefined)?.tabSessionId === 'string'
            ? String((firstArg as Record<string, unknown>).tabSessionId)
            : undefined,
        });
        return [{ result: { active: mode === 'start' } }];
      },
    },
  } as unknown as typeof chrome;

  return {
    chromeApi,
    calls,
  };
}

test('startForManagedTab is safe to call repeatedly for same tab session', async () => {
  const { chromeApi, calls } = createChromeMock({
    tabSessions: {
      tab_alpha: 101,
    },
  });
  const manager = createTabAudioKeepaliveManager(chromeApi);

  const first = await manager.startForManagedTab('tab_alpha', 101);
  const second = await manager.startForManagedTab('tab_alpha', 101);

  assert.equal(first, true);
  assert.equal(second, true);
  assert.equal(calls.filter((call) => call.mode === 'start').length, 2);
});

test('ensureForTabId resolves managed tab session from storage and injects keepalive', async () => {
  const { chromeApi, calls } = createChromeMock({
    tabSessions: {
      tab_alpha: 77,
    },
  });
  const manager = createTabAudioKeepaliveManager(chromeApi);

  const ensured = await manager.ensureForTabId(77, { timeoutMs: 50 });

  assert.equal(ensured, true);
  assert.ok(calls.some((call) => call.mode === 'start' && call.tabId === 77 && call.tabSessionId === 'tab_alpha'));
});

test('stopByTabSessionId tears down keepalive for tracked managed tab', async () => {
  const { chromeApi, calls } = createChromeMock({
    tabSessions: {
      tab_alpha: 55,
    },
  });
  const manager = createTabAudioKeepaliveManager(chromeApi);

  await manager.startForManagedTab('tab_alpha', 55);
  const stopped = await manager.stopByTabSessionId('tab_alpha');

  assert.equal(stopped, true);
  assert.ok(calls.some((call) => call.mode === 'stop' && call.tabId === 55 && call.tabSessionId === 'tab_alpha'));
});
