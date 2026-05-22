import test from 'node:test';
import assert from 'node:assert/strict';
import { executeCommand } from '../src/runtime/command-executor.js';
import { CommandExecutionError } from '../src/runtime/execution-error.js';
import { resetListenerManagersForTest } from '../src/runtime/listener-managers.js';
import type { CommandPayload } from '@telepat/otto-protocol';

type AnyRecord = Record<string, unknown>;

type MockOptions = {
  sessionSeed?: AnyRecord;
  localSeed?: AnyRecord;
  tabIds?: number[];
  tabUrls?: Record<number, string | null>;
  tabUrlSequenceById?: Record<number, Array<string | null | undefined>>;
  documentReadyStateSequenceByTabId?: Record<number, Array<'loading' | 'interactive' | 'complete'>>;
  defaultTabUrl?: string | null;
  scriptResults?: unknown[];
  initialActiveTabId?: number;
  invalidGroupIds?: number[];
  invalidGroupErrorValue?: unknown;
  invalidTabGroupUpdateIds?: number[];
  invalidTabGroupUpdateErrorValue?: unknown;
  debuggerAttachErrorValue?: unknown;
  debuggerSendCommandErrorByMethod?: Record<string, unknown>;
  debuggerSendCommandResultByMethod?: Record<string, unknown>;
  debuggerSendCommandResultSequenceByMethod?: Record<string, unknown[]>;
  disableDebugger?: boolean;
};

function createChromeMock(options: MockOptions = {}) {
  const sessionStore: AnyRecord = { ...(options.sessionSeed ?? {}) };
  const localStore: AnyRecord = { ...(options.localSeed ?? {}) };
  const runtimeMessages: unknown[] = [];
  const existingTabs = new Set<number>(options.tabIds ?? []);
  const tabUrls = { ...(options.tabUrls ?? {}) };
  const tabUrlSequenceById = Object.fromEntries(
    Object.entries(options.tabUrlSequenceById ?? {}).map(([tabId, sequence]) => [tabId, [...sequence]]),
  ) as Record<string, Array<string | null | undefined>>;
  const documentReadyStateSequenceByTabId = Object.fromEntries(
    Object.entries(options.documentReadyStateSequenceByTabId ?? {}).map(([tabId, sequence]) => [tabId, [...sequence]]),
  ) as Record<string, Array<'loading' | 'interactive' | 'complete'>>;
  const defaultTabUrl = options.defaultTabUrl === undefined ? 'https://www.reddit.com/' : options.defaultTabUrl;
  const scriptResults = [...(options.scriptResults ?? [])];
  const executeScriptFunctionCalls: string[] = [];
  const executeScriptFiles: string[] = [];
  const createdTabIds: number[] = [];
  const removedTabIds: number[] = [];
  let nextTabId = Math.max(0, ...(options.tabIds ?? [0])) + 1;
  let activeTabId = options.initialActiveTabId ?? (options.tabIds?.[0] ?? 1);
  let nextGroupId = 700;
  let groupCreateCount = 0;
  const invalidGroupIds = new Set<number>(options.invalidGroupIds ?? []);
  const invalidGroupErrorValue = options.invalidGroupErrorValue;
  const invalidTabGroupUpdateIds = new Set<number>(options.invalidTabGroupUpdateIds ?? []);
  const invalidTabGroupUpdateErrorValue = options.invalidTabGroupUpdateErrorValue;
  const debuggerAttachErrorValue = options.debuggerAttachErrorValue;
  const debuggerSendCommandErrorByMethod = options.debuggerSendCommandErrorByMethod ?? {};
  const debuggerSendCommandResultByMethod = options.debuggerSendCommandResultByMethod ?? {};
  const debuggerSendCommandResultSequenceByMethod: Record<string, unknown[]> = {};
  for (const [method, seq] of Object.entries(options.debuggerSendCommandResultSequenceByMethod ?? {})) {
    debuggerSendCommandResultSequenceByMethod[method] = [...seq];
  }
  const debuggerCommands: Array<{ method: string; params: unknown }> = [];

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
      local: {
        async get(keys: string[]) {
          const out: AnyRecord = {};
          for (const key of keys) out[key] = localStore[key];
          return out;
        },
        async set(values: AnyRecord) {
          Object.assign(localStore, values);
        },
        async remove(keys: string[]) {
          for (const key of keys) {
            delete localStore[key];
          }
        },
      },
    },
    runtime: {
      async sendMessage(message: unknown) {
        runtimeMessages.push(message);
        return { ok: true };
      },
      getURL(path: string) {
        return `chrome-extension://test-extension/${path}`;
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
        createdTabIds.push(tabId);
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
        removedTabIds.push(tabId);
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
      async captureVisibleTab() {
        throw new Error('captureVisibleTab should not be called; all screenshot capture uses CDP');
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
        async sendCommand(_target: chrome.debugger.Debuggee, method: string, params?: unknown) {
          debuggerCommands.push({ method, params });
          if (Object.prototype.hasOwnProperty.call(debuggerSendCommandErrorByMethod, method)) {
            throw debuggerSendCommandErrorByMethod[method];
          }
          const seq = debuggerSendCommandResultSequenceByMethod[method];
          if (seq && seq.length > 0) {
            return seq.shift() as Record<string, unknown>;
          }
          if (Object.prototype.hasOwnProperty.call(debuggerSendCommandResultByMethod, method)) {
            return debuggerSendCommandResultByMethod[method] as Record<string, unknown>;
          }
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
      async executeScript(injection: chrome.scripting.ScriptInjection<unknown[], unknown>) {
        if (Array.isArray(injection.files) && injection.files.length > 0) {
          executeScriptFiles.push(...injection.files);
          return [{ result: null }];
        }

        executeScriptFunctionCalls.push(injection.func?.name ?? 'anonymous');
        if (injection.func?.name === 'installPageDomQueryHelpers') {
          return [{ result: null }];
        }
        if (injection.func?.name === 'isDocumentReadyForCommandPreload') {
          const tabId = injection.target.tabId;
          const sequence = documentReadyStateSequenceByTabId[String(tabId)];
          const state = sequence && sequence.length > 0 ? sequence.shift() : 'complete';
          return [{ result: state === 'complete' }];
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
    getRuntimeMessages: () => runtimeMessages.slice(),
    getGroupCreateCount: () => groupCreateCount,
    getDebuggerCommands: () => debuggerCommands.slice(),
    getExecuteScriptFunctionCalls: () => executeScriptFunctionCalls.slice(),
    getExecuteScriptFiles: () => executeScriptFiles.slice(),
    getCreatedTabIds: () => createdTabIds.slice(),
    getRemovedTabIds: () => removedTabIds.slice(),
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

test('primitive.dom.extract_html requires url or tabSessionId', async () => {
  const { chromeApi } = createChromeMock();

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('primitive.dom.extract_html', {})),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'missing_extraction_target');
      return true;
    },
  );
});

test('primitive.dom.extract_html uses temporary tab when url is provided', async () => {
  const { chromeApi, getCreatedTabIds, getRemovedTabIds } = createChromeMock({
    scriptResults: [{
      html: '<main>Hello</main>',
      sourceUrl: 'https://example.com/article',
      title: 'Example Article',
    }],
  });

  const result = await executeCommand(chromeApi, buildCommand('primitive.dom.extract_html', {
    url: 'https://example.com/article',
    selector: 'main',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: null,
    sourceUrl: 'https://example.com/article',
    title: 'Example Article',
    extractionMode: 'raw_html',
    selector: 'main',
    fallbackUsed: false,
    contentLength: 18,
    content: '<main>Hello</main>',
  });

  assert.equal(getCreatedTabIds().length, 1);
  assert.deepEqual(getRemovedTabIds(), getCreatedTabIds());
});

test('primitive.dom.extract_html keeps caller tab open when tabSessionId is provided', async () => {
  const { chromeApi, getCreatedTabIds, getRemovedTabIds } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    scriptResults: [{
      html: '<section>Body</section>',
      sourceUrl: 'https://example.com/page',
      title: 'Page',
    }],
  });

  const result = await executeCommand(chromeApi, buildCommand('primitive.dom.extract_html', {
    tabSessionId: 'tab_alpha',
    selector: 'section',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    sourceUrl: 'https://example.com/page',
    title: 'Page',
    extractionMode: 'raw_html',
    selector: 'section',
    fallbackUsed: false,
    contentLength: 23,
    content: '<section>Body</section>',
  });

  assert.deepEqual(getCreatedTabIds(), []);
  assert.deepEqual(getRemovedTabIds(), []);
});

test('primitive.dom.extract_clean_html uses temporary tab when url is provided', async () => {
  const { chromeApi, getCreatedTabIds, getRemovedTabIds } = createChromeMock({
    scriptResults: [{
      html: '<div><button>Click</button><p data-id="123">Clean</p></div>',
      sourceUrl: 'https://example.com/page',
      title: 'Clean Page',
    }],
  });

  const result = await executeCommand(chromeApi, buildCommand('primitive.dom.extract_clean_html', {
    url: 'https://example.com/page',
    selector: 'body',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: null,
    sourceUrl: 'https://example.com/page',
    title: 'Clean Page',
    extractionMode: 'clean_html',
    selector: 'body',
    fallbackUsed: false,
    contentLength: 59,
    content: '<div><button>Click</button><p data-id="123">Clean</p></div>',
  });

  assert.equal(getCreatedTabIds().length, 1);
  assert.deepEqual(getRemovedTabIds(), getCreatedTabIds());
});

test('primitive.dom.extract_clean_html keeps caller tab open when tabSessionId is provided', async () => {
  const { chromeApi, getCreatedTabIds, getRemovedTabIds } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    scriptResults: [{
      html: '<main><article role="article" data-testid="post"><h1>Title</h1></article></main>',
      sourceUrl: 'https://example.com/article',
      title: 'Article',
    }],
  });

  const result = await executeCommand(chromeApi, buildCommand('primitive.dom.extract_clean_html', {
    tabSessionId: 'tab_alpha',
    selector: 'main',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    sourceUrl: 'https://example.com/article',
    title: 'Article',
    extractionMode: 'clean_html',
    selector: 'main',
    fallbackUsed: false,
    contentLength: 80,
    content: '<main><article role="article" data-testid="post"><h1>Title</h1></article></main>',
  });

  // Verify semantic attributes are preserved
  assert.ok(result.data.content.includes('role="article"'), 'role attribute should be preserved');
  assert.ok(result.data.content.includes('data-testid="post"'), 'data-testid should be preserved');

  assert.deepEqual(getCreatedTabIds(), []);
  assert.deepEqual(getRemovedTabIds(), []);
});

test('primitive.dom.extract_clean_html requires url or tabSessionId', async () => {
  const { chromeApi } = createChromeMock();

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('primitive.dom.extract_clean_html', {})),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'missing_extraction_target');
      return true;
    },
  );
});

test('primitive.dom.extract_distilled_html defaults to readability', async () => {
  const { chromeApi } = createChromeMock({
    scriptResults: [{
      html: '<article>Readable</article>',
      sourceUrl: 'https://example.com/article',
      title: 'Readable Title',
    }],
  });

  const result = await executeCommand(chromeApi, buildCommand('primitive.dom.extract_distilled_html', {
    url: 'https://example.com/article',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: null,
    sourceUrl: 'https://example.com/article',
    title: 'Readable Title',
    extractionMode: 'readability',
    fallbackUsed: false,
    contentLength: 27,
    content: '<article>Readable</article>',
  });
});

test('primitive.dom.extract_markdown falls back to readability when dom-distiller fails', async () => {
  const { chromeApi } = createChromeMock({
    scriptResults: [
      null,
      {
        html: '<article><h1>Fallback</h1><p>works</p></article>',
        sourceUrl: 'https://example.com/article',
        title: 'Fallback Title',
      },
      '# Fallback\n\nworks',
    ],
  });

  const result = await executeCommand(chromeApi, buildCommand('primitive.dom.extract_markdown', {
    url: 'https://example.com/article',
    mode: 'dom-distiller',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: null,
    sourceUrl: 'https://example.com/article',
    title: 'Fallback Title',
    extractionMode: 'readability',
    fallbackUsed: true,
    contentLength: 17,
    content: '# Fallback\n\nworks',
  });
});

test('primitive.dom.extract_markdown includes readability failure details', async () => {
  const { chromeApi } = createChromeMock({
    scriptResults: [
      { kind: 'failure', reason: 'Readability parse() produced no article content' },
    ],
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('primitive.dom.extract_markdown', {
      url: 'https://example.com/empty',
      mode: 'readability',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'readability_failed');
      assert.match(commandErr.message, /details=readability: Readability parse\(\) produced no article content/);
      return true;
    },
  );
});

test('primitive.dom.extract_markdown passes converter output through as content', async () => {
  const { chromeApi } = createChromeMock({
    scriptResults: [
      {
        kind: 'success',
        html: '<article><h1>Title</h1><p>Hello <a href="https://example.com">world</a>.</p></article>',
        sourceUrl: 'https://example.com/article',
        title: 'Title',
      },
      '# Title\n\nHello [world](https://example.com).',
    ],
  });

  const result = await executeCommand(chromeApi, buildCommand('primitive.dom.extract_markdown', {
    url: 'https://example.com/article',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: null,
    sourceUrl: 'https://example.com/article',
    title: 'Title',
    extractionMode: 'readability',
    fallbackUsed: false,
    contentLength: 44,
    content: '# Title\n\nHello [world](https://example.com).',
  });
});

test('primitive.dom.extract_markdown falls back to plain text when converter returns null', async () => {
  const { chromeApi } = createChromeMock({
    scriptResults: [
      {
        kind: 'success',
        html: '<article><p>Some content</p></article>',
        sourceUrl: 'https://example.com/article',
        title: 'Article',
      },
      null,
      'Some content',
    ],
  });

  const result = await executeCommand(chromeApi, buildCommand('primitive.dom.extract_markdown', {
    url: 'https://example.com/article',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: null,
    sourceUrl: 'https://example.com/article',
    title: 'Article',
    extractionMode: 'readability',
    fallbackUsed: false,
    contentLength: 12,
    content: 'Some content',
  });
});

test('primitive.dom.extract_markdown throws when converter and plain text fallback both fail', async () => {
  const { chromeApi } = createChromeMock({
    scriptResults: [
      {
        kind: 'success',
        html: '<article><p>Content</p></article>',
        sourceUrl: 'https://example.com/article',
        title: 'Article',
      },
      null,
      null,
    ],
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('primitive.dom.extract_markdown', {
      url: 'https://example.com/article',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'markdown_conversion_failed');
      return true;
    },
  );
});

test('primitive.page.screenshot captures viewport image for tabSessionId target', async () => {
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
  const { chromeApi, getDebuggerCommands } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: {
      11: 'https://example.com/page',
    },
    debuggerSendCommandResultByMethod: {
      'Page.captureScreenshot': { data: pngBase64 },
    },
  });

  const result = await executeCommand(chromeApi, buildCommand('primitive.page.screenshot', {
    tabSessionId: 'tab_alpha',
    mode: 'viewport',
    format: 'png',
  }));

  const methods = getDebuggerCommands().map((c) => c.method);
  assert.ok(methods.includes('Page.captureScreenshot'));
  assert.ok(!methods.includes('Page.getLayoutMetrics'), 'viewport should not call getLayoutMetrics');
  assert.equal((result.data as { tabSessionId?: unknown }).tabSessionId, 'tab_alpha');
  assert.equal((result.data as { mode?: unknown }).mode, 'viewport');
  assert.equal((result.data as { format?: unknown }).format, 'png');
  assert.equal((result.data as { mimeType?: unknown }).mimeType, 'image/png');
  assert.equal((result.data as { downscaled?: unknown }).downscaled, false);
  assert.equal(typeof (result.data as { contentBase64?: unknown }).contentBase64, 'string');
});

test('primitive.page.screenshot uses temporary tab for url target and cleans up', async () => {
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
  const { chromeApi, getCreatedTabIds, getRemovedTabIds } = createChromeMock({
    tabUrlSequenceById: {
      1: ['https://example.com/page'],
    },
    debuggerSendCommandResultByMethod: {
      'Page.captureScreenshot': { data: pngBase64 },
    },
  });

  const result = await executeCommand(chromeApi, buildCommand('primitive.page.screenshot', {
    url: 'https://example.com/page',
  }));

  assert.equal((result.data as { tabSessionId?: unknown }).tabSessionId, null);
  assert.equal(getCreatedTabIds().length, 1);
  assert.deepEqual(getRemovedTabIds(), getCreatedTabIds());
});

test('primitive.page.screenshot full_page uses CDP capture', async () => {
  const { chromeApi, getDebuggerCommands } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    debuggerSendCommandResultByMethod: {
      'Page.getLayoutMetrics': {
        contentSize: {
          width: 100,
          height: 200,
        },
      },
      'Page.captureScreenshot': {
        data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
      },
    },
  });

  const result = await executeCommand(chromeApi, buildCommand('primitive.page.screenshot', {
    tabSessionId: 'tab_alpha',
    mode: 'full_page',
    format: 'png',
  }));

  const methods = getDebuggerCommands().map((entry) => entry.method);
  assert.ok(methods.includes('Page.getLayoutMetrics'));
  assert.ok(methods.includes('Page.captureScreenshot'));
  assert.equal((result.data as { mode?: unknown }).mode, 'full_page');
  assert.equal((result.data as { mimeType?: unknown }).mimeType, 'image/png');
});

test('primitive.page.screenshot reports deterministic debugger conflict errors', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    debuggerAttachErrorValue: new Error('Another debugger is already attached to the tab'),
    debuggerSendCommandErrorByMethod: {
      'Page.getLayoutMetrics': new Error('CDP unavailable for shared attachment'),
    },
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('primitive.page.screenshot', {
      tabSessionId: 'tab_alpha',
      mode: 'full_page',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      assert.equal((err as CommandExecutionError).code, 'screenshot_capture_failed');
      return true;
    },
  );
});

test('primitive.page.screenshot downscales jpeg quality when payload is oversized', async () => {
  const oversized = 'A'.repeat(3_500_000);
  const reduced = 'A'.repeat(80_000);

  const { chromeApi, getDebuggerCommands } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    debuggerSendCommandResultSequenceByMethod: {
      'Page.captureScreenshot': [
        { data: oversized },
        { data: reduced },
      ],
    },
  });

  const result = await executeCommand(chromeApi, buildCommand('primitive.page.screenshot', {
    tabSessionId: 'tab_alpha',
    mode: 'viewport',
    format: 'jpeg',
    quality: 90,
    maxBytes: 100_000,
  }));

  const screenshotCalls = getDebuggerCommands().filter((c) => c.method === 'Page.captureScreenshot');
  assert.equal(screenshotCalls.length, 2);
  assert.equal((screenshotCalls[0]?.params as { quality?: number } | undefined)?.quality, 90);
  assert.equal((screenshotCalls[1]?.params as { quality?: number } | undefined)?.quality, 75);
  assert.equal((result.data as { downscaled?: unknown }).downscaled, true);
  assert.ok(((result.data as { byteLength?: unknown }).byteLength as number) <= 100_000);
});

test('primitive.dom.extract_markdown respects maxChars limit on output', async () => {
  const longContent = '# Title\n\n' + 'x'.repeat(5000);
  const { chromeApi } = createChromeMock({
    scriptResults: [
      {
        kind: 'success',
        html: '<article><h1>Title</h1></article>',
        sourceUrl: 'https://example.com/article',
        title: 'Title',
      },
      longContent,
    ],
  });

  const result = await executeCommand(chromeApi, buildCommand('primitive.dom.extract_markdown', {
    url: 'https://example.com/article',
    maxChars: 1000,
  }));

  const data = result.data as { contentLength: number; content: string };
  assert.equal(data.contentLength, 1000);
  assert.equal(data.content.length, 1000);
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
      command: 'getPosts',
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
    command: 'getPosts',
    input: {},
    authMode: 'auto',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getPosts',
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
      command: 'getPosts',
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
      command: 'getPosts',
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
    command: 'getPosts',
    input: {},
    authMode: 'auto',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getPosts',
    posts: [{ kind: 'content.post', id: 'post-hello', title: 'Hello', author: 'alice' }],
  });
});

test('command.run enables debugger focus emulation for opted-in commands', async () => {
  const { chromeApi, getDebuggerCommands } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    scriptResults: [{ authenticated: true }, { posts: [] }],
  });

  await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getPosts',
    input: {},
    authMode: 'auto',
  }));

  const debuggerCommands = getDebuggerCommands();
  assert.ok(
    debuggerCommands.some((entry) => entry.method === 'Emulation.setFocusEmulationEnabled'),
  );
});

test('command.run enables debugger focus emulation for getChatMessages', async () => {
  const { chromeApi, getDebuggerCommands } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://chat.reddit.com/' },
    scriptResults: [{ authenticated: true }, { chunk: [] }],
  });

  await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getChatMessages',
    input: {
      roomId: 'room_1',
      limit: 20,
    },
    authMode: 'strict_fail',
  }));

  const debuggerCommands = getDebuggerCommands();
  assert.ok(
    debuggerCommands.some((entry) => entry.method === 'Emulation.setFocusEmulationEnabled'),
  );
});

test('command.run fails deterministically when debugger API is unavailable for opted-in commands', async () => {
  const { chromeApi } = createChromeMock({
    disableDebugger: true,
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
      command: 'getPosts',
      input: {},
      authMode: 'auto',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'debugger_focus_unavailable');
      assert.equal(commandErr.retryable, false);
      return true;
    },
  );
});

test('command.run fails deterministically when debugger attach conflicts for opted-in commands', async () => {
  const { chromeApi } = createChromeMock({
    debuggerAttachErrorValue: new Error('Another debugger is already attached to the tab'),
    debuggerSendCommandErrorByMethod: {
      'Emulation.setFocusEmulationEnabled': new Error('Not attached to this tab by current extension session'),
    },
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
      command: 'getPosts',
      input: {},
      authMode: 'auto',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'debugger_focus_conflict');
      assert.equal(commandErr.retryable, false);
      return true;
    },
  );
});

test('command.run getPosts accepts optional minReturnedPosts input', async () => {
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
    command: 'getPosts',
    input: { minReturnedPosts: 35 },
    authMode: 'auto',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getPosts',
    posts: [{ kind: 'content.post', id: 'post-min', title: 'Min', author: 'alice' }],
  });
});

test('legacy command.reddit_posts action is routed via command runtime', async () => {
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

  const result = await executeCommand(chromeApi, buildCommand('command.reddit_posts', {
    tabSessionId: 'tab_alpha',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getPosts',
    posts: [{ kind: 'content.post', id: 'post-legacy', title: 'Legacy', author: 'bob' }],
  });
});

test('command.run sendChatMessage returns deterministic payload', async () => {
  const { chromeApi, getDebuggerCommands } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    tabUrlSequenceById: {
      11: [
        'https://www.reddit.com/',
        'https://www.reddit.com/',
        'https://chat.reddit.com/room/room_1',
      ],
    },
    scriptResults: [
      { authenticated: true },
      { roomId: 'room_1', finalPath: '/room/room_1', openedExistingRoom: false },
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
    attempts: 1,
    roomId: 'room_1',
    username: 'alice',
  });

  const debuggerCommands = getDebuggerCommands();
  assert.equal(
    debuggerCommands.some((entry) => entry.method === 'Emulation.setFocusEmulationEnabled'),
    true,
  );
});

test('command.run sendChatMessage emits command script debug logs by default', async () => {
  const { chromeApi, getRuntimeMessages } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    tabUrlSequenceById: {
      11: [
        'https://www.reddit.com/',
        'https://www.reddit.com/',
        'https://chat.reddit.com/room/room_1',
      ],
    },
    scriptResults: [
      { authenticated: true },
      { roomId: 'room_1', finalPath: '/room/room_1', openedExistingRoom: false },
      { sent: true, roomId: 'room_1', username: 'alice' },
    ],
  });

  await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'sendChatMessage',
    input: {
      username: 'alice',
      message: 'hello',
    },
    authMode: 'strict_fail',
  }));

  const debugMessages = getRuntimeMessages().filter((entry) => {
    if (!entry || typeof entry !== 'object') {
      return false;
    }
    const envelope = entry as { type?: unknown; payload?: { type?: unknown } };
    return envelope.type === 'otto.extensionLog' && envelope.payload?.type === 'command.script_debug';
  });

  assert.ok(debugMessages.length > 0);
});

test('command.run sendChatMessage returns missing_result_payload diagnostics when create room payload is empty', async () => {
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
      null,
    ],
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      command: 'sendChatMessage',
      input: {
        username: 'alice',
        message: 'hello',
      },
      authMode: 'strict_fail',
    })),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /reddit_chat_create_submit_unconfirmed:missing_result_payload/);
      assert.match(error.message, /tabUrl/);
      return true;
    },
  );
});

test('command.run commentOnPost returns deterministic payload', async () => {
  const { chromeApi, tabUrls, getDebuggerCommands } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    tabUrlSequenceById: {
      11: [
        'https://www.reddit.com/',
        'https://www.reddit.com/',
        'https://www.reddit.com/r/test/comments/abc123/example/',
      ],
    },
    scriptResults: [
      { authenticated: true },
      { sent: true, postUrl: 'https://www.reddit.com/r/test/comments/abc123/example/' },
    ],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'commentOnPost',
    input: {
      postUrl: 'https://www.reddit.com/r/test/comments/abc123/example/',
      commentBody: 'Hello from Otto',
    },
    authMode: 'strict_fail',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'commentOnPost',
    sent: true,
    postUrl: 'https://www.reddit.com/r/test/comments/abc123/example/',
  });

  assert.equal(tabUrls[11], 'https://www.reddit.com/r/test/comments/abc123/example/');

  const debuggerCommands = getDebuggerCommands();
  assert.equal(
    debuggerCommands.some((entry) => entry.method === 'Emulation.setFocusEmulationEnabled'),
    true,
  );
});

test('command.run commentOnPost rejects missing required input fields before execute', async () => {
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
      command: 'commentOnPost',
      input: { postUrl: 'https://www.reddit.com/r/test/comments/abc123/example/' },
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

test('command.run commentOnPost returns missing_result_payload diagnostics when send payload is empty', async () => {
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
      null,
    ],
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      command: 'commentOnPost',
      input: {
        postUrl: 'https://www.reddit.com/r/test/comments/abc123/example/',
        commentBody: 'Hello from Otto',
      },
      authMode: 'strict_fail',
    })),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /reddit_post_comment_send_unconfirmed:missing_result_payload/);
      assert.match(error.message, /currentUrl/);
      return true;
    },
  );
});

test('command.run commentOnPost surfaces serialized in-page composer error', async () => {
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
      {
        __ottoSerializedCommandError: true,
        code: 'reddit_post_comment_composer_missing',
        message: 'reddit_post_comment_composer_missing:{"path":"/r/test/comments/abc123/example/","hasComposer":false}',
      },
    ],
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      command: 'commentOnPost',
      input: {
        postUrl: 'https://www.reddit.com/r/test/comments/abc123/example/',
        commentBody: 'Hello from Otto',
      },
      authMode: 'strict_fail',
    })),
    (error: unknown) => {
      assert.ok(error instanceof CommandExecutionError);
      assert.equal(error.code, 'reddit_post_comment_composer_missing');
      assert.match(error.message, /reddit_post_comment_composer_missing/);
      return true;
    },
  );
});

test('command.run commentOnPost ignores malformed serialized marker payloads', async () => {
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
      {
        __ottoSerializedCommandError: true,
        // Invalid marker payload: code must be a string.
        code: 42,
        message: 'reddit_post_comment_composer_missing:{"path":"/r/test/comments/abc123/example/"}',
      },
    ],
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      command: 'commentOnPost',
      input: {
        postUrl: 'https://www.reddit.com/r/test/comments/abc123/example/',
        commentBody: 'Hello from Otto',
      },
      authMode: 'strict_fail',
    })),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /reddit_post_comment_send_unconfirmed:missing_result_payload/);
      return true;
    },
  );
});

test('command.run commentOnPost surfaces serialized in-page error retryable flag', async () => {
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
      {
        __ottoSerializedCommandError: true,
        code: 'reddit_post_comment_composer_missing',
        message: 'reddit_post_comment_composer_missing:{"path":"/r/test/comments/abc123/example/","hasComposer":false}',
        retryable: true,
      },
    ],
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      command: 'commentOnPost',
      input: {
        postUrl: 'https://www.reddit.com/r/test/comments/abc123/example/',
        commentBody: 'Hello from Otto',
      },
      authMode: 'strict_fail',
    })),
    (error: unknown) => {
      assert.ok(error instanceof CommandExecutionError);
      assert.equal(error.code, 'reddit_post_comment_composer_missing');
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

test('command.test commentOnPost also rethrows serialized in-page errors', async () => {
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
      {
        __ottoSerializedCommandError: true,
        code: 'reddit_post_comment_composer_missing',
        message: 'reddit_post_comment_composer_missing:{"path":"/r/test/comments/abc123/example/","hasComposer":false}',
      },
    ],
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.test', {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      command: 'commentOnPost',
      input: {
        postUrl: 'https://www.reddit.com/r/test/comments/abc123/example/',
        commentBody: 'Hello from Otto',
      },
      authMode: 'strict_fail',
    })),
    (error: unknown) => {
      assert.ok(error instanceof CommandExecutionError);
      assert.equal(error.code, 'reddit_post_comment_composer_missing');
      assert.equal(error.stage, 'command.test');
      return true;
    },
  );
});

test('command.run commentOnPost installs DOM helpers before script execution', async () => {
  const { chromeApi, getExecuteScriptFunctionCalls } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    scriptResults: [
      { authenticated: true },
      { sent: true, postUrl: 'https://www.reddit.com/r/test/comments/abc123/example/' },
    ],
  });

  await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'commentOnPost',
    input: {
      postUrl: 'https://www.reddit.com/r/test/comments/abc123/example/',
      commentBody: 'Hello from Otto',
    },
    authMode: 'strict_fail',
  }));

  const functionCalls = getExecuteScriptFunctionCalls();
  const installHelperIndex = functionCalls.lastIndexOf('installPageDomQueryHelpers');
  assert.ok(installHelperIndex >= 0);
  assert.ok(installHelperIndex < functionCalls.length - 1);
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
    debuggerSendCommandErrorByMethod: {
      'Network.enable': new Error('forced interception init failure'),
    },
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

// ── google.com getSearchResults ──────────────────────────────────────────────

test('command.run getSearchResults returns results for a valid query', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: { tab_alpha: 11 },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.google.com/' },
    scriptResults: [
      [
        { kind: 'content.search_result', id: '1', title: 'Steel Purchasing Guide', url: 'https://example.com/steel', description: 'How to buy steel.', links: undefined, image: null, rank: 1, isAd: false },
        { kind: 'content.search_result', id: '2', title: 'Buy Steel Online', url: 'https://steel.example.com', description: null, links: undefined, image: null, rank: 2, isAd: true },
      ],
    ],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'google.com',
    command: 'getSearchResults',
    input: { query: 'steel purchasing' },
    authMode: 'skip',
  }));

  const data = result.data as Record<string, unknown>;
  assert.equal(data.site, 'google.com');
  assert.equal(data.command, 'getSearchResults');
  assert.equal(data.query, 'steel purchasing');
  const results = data.results as unknown[];
  assert.equal(results.length, 2);
  assert.equal((results[0] as { kind: string }).kind, 'content.search_result');
  assert.equal((results[0] as { rank: number }).rank, 1);
  assert.equal((results[1] as { isAd: boolean }).isAd, true);
});

test('command.run getSearchResults rejects missing required query', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: { tab_alpha: 11 },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.google.com/' },
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'google.com',
      command: 'getSearchResults',
      input: {},
      authMode: 'skip',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      assert.equal(err.code, 'missing_command_input');
      return true;
    },
  );
});

test('command.run getSearchResults rejects unexpected input fields', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: { tab_alpha: 11 },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.google.com/' },
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'google.com',
      command: 'getSearchResults',
      input: { query: 'test', unknownField: true },
      authMode: 'skip',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      assert.equal(err.code, 'unexpected_command_input');
      return true;
    },
  );
});

test('command.run getSearchResults rejects invalid type for limit', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: { tab_alpha: 11 },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.google.com/' },
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'google.com',
      command: 'getSearchResults',
      input: { query: 'test', limit: 'ten' },
      authMode: 'skip',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      assert.equal(err.code, 'invalid_command_input_type');
      return true;
    },
  );
});

test('command.run getSearchResults rejects invalid type for pages', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: { tab_alpha: 11 },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.google.com/' },
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'google.com',
      command: 'getSearchResults',
      input: { query: 'test', pages: 'two' },
      authMode: 'skip',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      assert.equal(err.code, 'invalid_command_input_type');
      return true;
    },
  );
});

test('command.run getSearchResults rejects site mismatch', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: { tab_alpha: 11 },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'google.com',
      command: 'getSearchResults',
      input: { query: 'test' },
      authMode: 'skip',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      assert.equal(err.code, 'site_mismatch');
      return true;
    },
  );
});

test('command.run getSearchResults fetches multiple pages and accumulates results', async () => {
  const { chromeApi, tabUrls } = createChromeMock({
    sessionSeed: {
      tabSessions: { tab_alpha: 11 },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.google.com/' },
    scriptResults: [
      [
        { kind: 'content.search_result', id: '1', title: 'Result 1', url: 'https://a.com', description: null, links: undefined, image: null, rank: 1, isAd: false },
        { kind: 'content.search_result', id: '2', title: 'Result 2', url: 'https://b.com', description: null, links: undefined, image: null, rank: 2, isAd: false },
      ],
      [
        { kind: 'content.search_result', id: '11', title: 'Result 11', url: 'https://c.com', description: null, links: undefined, image: null, rank: 11, isAd: false },
      ],
    ],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'google.com',
    command: 'getSearchResults',
    input: { query: 'multi page', pages: 2 },
    authMode: 'skip',
  }));

  const data = result.data as Record<string, unknown>;
  const results = data.results as unknown[];
  assert.equal(results.length, 3);
  assert.equal((results[0] as { rank: number }).rank, 1);
  assert.equal((results[2] as { rank: number }).rank, 11);
  // Second page URL should have been navigated to
  assert.ok(tabUrls[11]?.includes('start=10'));
});

test('command.run getSearchResults stops early when page returns no results', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: { tab_alpha: 11 },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.google.com/' },
    scriptResults: [
      [
        { kind: 'content.search_result', id: '1', title: 'Only Result', url: 'https://a.com', description: null, links: undefined, image: null, rank: 1, isAd: false },
      ],
      [],
    ],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'google.com',
    command: 'getSearchResults',
    input: { query: 'rare query', pages: 2 },
    authMode: 'skip',
  }));

  const data = result.data as Record<string, unknown>;
  const results = data.results as unknown[];
  assert.equal(results.length, 1);
});

test('command.run getSearchResults respects limit across pages', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: { tab_alpha: 11 },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.google.com/' },
    scriptResults: [
      [
        { kind: 'content.search_result', id: '1', title: 'R1', url: 'https://a.com', description: null, links: undefined, image: null, rank: 1, isAd: false },
        { kind: 'content.search_result', id: '2', title: 'R2', url: 'https://b.com', description: null, links: undefined, image: null, rank: 2, isAd: false },
      ],
    ],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'google.com',
    command: 'getSearchResults',
    input: { query: 'test', limit: 1, pages: 3 },
    authMode: 'skip',
  }));

  const data = result.data as Record<string, unknown>;
  // limit=1 reached after page 1 first result, loop exits; second scriptResult never consumed
  assert.ok((data.results as unknown[]).length <= 1);
});

test('command.run getSearchResults returns empty results when page script returns empty array', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: { tab_alpha: 11 },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.google.com/' },
    scriptResults: [[]],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'google.com',
    command: 'getSearchResults',
    input: { query: 'unparseable query' },
    authMode: 'skip',
  }));

  const data = result.data as Record<string, unknown>;
  assert.deepEqual(data.results, []);
  assert.equal(data.query, 'unparseable query');
});

test('command.run get-posts filters out invalid post objects', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: { tab_alpha: 11 },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    scriptResults: [{ authenticated: true }, { posts: [
      { kind: 'content.post', id: 'valid', title: 'Valid' },
      null,
      { kind: 'content.post', id: 123, title: 'Invalid id type' },
      { kind: 'other.kind', id: 'other', title: 'Other' },
      { kind: 'content.post', id: 'valid2', title: 'Valid 2' },
    ] }],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getPosts',
    input: {},
    authMode: 'auto',
  }));

  const data = result.data as Record<string, unknown>;
  const posts = data.posts as Array<Record<string, unknown>>;
  assert.equal(posts.length, 2);
  assert.equal(posts[0]?.id, 'valid');
  assert.equal(posts[1]?.id, 'valid2');
});

test('command.run sendChatMessage rejects missing message', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: { tabSessions: { tab_alpha: 11 } },
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
      assert.equal((err as CommandExecutionError).code, 'missing_command_input');
      return true;
    },
  );
});

test('command.run sendChatMessage resolves roomId from string roomSeed', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: { tabSessions: { tab_alpha: 11 } },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    tabUrlSequenceById: {
      11: [
        'https://www.reddit.com/',
        'https://www.reddit.com/',
        'https://chat.reddit.com/room/room_str',
      ],
    },
    scriptResults: [
      { authenticated: true },
      'room_str',
      { sent: true, roomId: 'room_str', username: 'alice' },
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
    attempts: 1,
    roomId: 'room_str',
    username: 'alice',
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

test('command.run rejects unknown site', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: { tabSessions: { tab_alpha: 11 } },
    tabIds: [11],
    tabUrls: { 11: 'https://unknown.com/' },
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'unknown.com',
      command: 'getPosts',
      input: {},
      authMode: 'skip',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      assert.equal(err.code, 'unknown_site');
      return true;
    },
  );
});

test('command.run rejects unknown command', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: { tabSessions: { tab_alpha: 11 } },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      command: 'unknownCommand',
      input: {},
      authMode: 'skip',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      assert.equal(err.code, 'unknown_command');
      return true;
    },
  );
});

test('command.run surfaces generic debugger focus errors', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: { tabSessions: { tab_alpha: 11 } },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    debuggerAttachErrorValue: new Error('Some random attach failure'),
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      command: 'getPosts',
      input: {},
      authMode: 'auto',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      assert.equal(err.code, 'debugger_focus_attach_failed');
      return true;
    },
  );
});

test('listener.subscribe rejects invalid includeHeaders type', async () => {
  const { chromeApi } = createChromeMock();

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('listener.subscribe', {
      listener: 'network.http_intercept',
      options: {
        tabSessionId: 'tab_alpha',
        site: 'reddit.com',
        includeHeaders: 'yes',
      },
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      assert.equal(err.code, 'invalid_listener_include_headers');
      return true;
    },
  );
});

test('listener.subscribe rejects non-array urlPatterns', async () => {
  const { chromeApi } = createChromeMock();

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('listener.subscribe', {
      listener: 'network.http_intercept',
      options: {
        tabSessionId: 'tab_alpha',
        site: 'reddit.com',
        urlPatterns: 'https://example.com/*',
      },
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      assert.equal(err.code, 'invalid_listener_url_patterns');
      return true;
    },
  );
});

test('listener.subscribe rejects non-array requestHostAllowlist', async () => {
  const { chromeApi } = createChromeMock();

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('listener.subscribe', {
      listener: 'network.http_intercept',
      options: {
        tabSessionId: 'tab_alpha',
        site: 'reddit.com',
        requestHostAllowlist: 'reddit.com',
      },
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      assert.equal(err.code, 'invalid_listener_request_hosts');
      return true;
    },
  );
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
      command: 'getPosts',
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

test('command.run rejects non-number get-posts minReturnedPosts before execute', async () => {
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
      command: 'getPosts',
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
      command: 'sendChatMessage',
      input: { message: 'hello' },
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

test('command.run getUserInfo defaults to logged-in user when input is empty', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    scriptResults: [{
      name: 'gabidobo',
      id: '14f0tp',
      verified: true,
      created_utc: 1484353734,
      total_karma: 127,
      link_karma: 96,
      comment_karma: 31,
      snoovatar_img: 'https://i.redd.it/snoovatar/avatars/example.png',
      subreddit: {
        display_name_prefixed: 'u/gabidobo',
        url: '/user/gabidobo/',
        subscribers: 2,
      },
    }],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getUserInfo',
    input: {},
    authMode: 'strict_fail',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getUserInfo',
    user: {
      kind: 'entity.user',
      id: 't2_14f0tp',
      platform: 'reddit',
      username: 'gabidobo',
      displayName: 'u/gabidobo',
      profileUrl: 'https://www.reddit.com/user/gabidobo/',
      avatarUrl: 'https://i.redd.it/snoovatar/avatars/example.png',
      bio: undefined,
      isVerified: true,
      createdAt: '2017-01-14T00:28:54.000Z',
      flags: undefined,
      stats: {
        followers: 2,
        reputation: 127,
        posts: 96,
        comments: 31,
      },
      originalEntity: {
        name: 'gabidobo',
        id: '14f0tp',
        verified: true,
        created_utc: 1484353734,
        total_karma: 127,
        link_karma: 96,
        comment_karma: 31,
        snoovatar_img: 'https://i.redd.it/snoovatar/avatars/example.png',
        subreddit: {
          display_name_prefixed: 'u/gabidobo',
          url: '/user/gabidobo/',
          subscribers: 2,
        },
      },
    },
    lookup: {
      username: undefined,
      id: undefined,
    },
  });
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

test('command.run waits for preload document readiness before execute', async () => {
  const { chromeApi, getExecuteScriptFunctionCalls } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    documentReadyStateSequenceByTabId: {
      11: ['loading', 'complete'],
    },
    scriptResults: [{ authenticated: true }, { chunk: [] }],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getChatMessages',
    input: { roomId: 'room_1' },
    authMode: 'strict_fail',
  }));

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

  const readinessCalls = getExecuteScriptFunctionCalls().filter((name) => name === 'isDocumentReadyForCommandPreload');
  assert.equal(readinessCalls.length, 2);
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
    command: 'getPosts',
    input: {},
    authMode: 'auto',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getPosts',
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
    command: 'getPosts',
    input: {},
    authMode: 'strict_fail',
  }));

  assert.equal(tabUrls[11], 'https://chat.reddit.com/threads');
  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getPosts',
    posts: [{ kind: 'content.post', id: 'post-fallback-2', title: 'from fallback execute', author: 'otto' }],
  });
});

test('command.test can execute from a blank tab when preloadHost is missing', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: null },
    scriptResults: [
      {
        user: {
          kind: 'entity.user',
          id: 'reddit:otto',
          username: 'otto',
          platform: 'reddit',
        },
        lookup: {
          username: 'otto',
        },
      },
    ],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.test', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getUserInfo',
    input: { username: 'otto' },
    authMode: 'strict_fail',
  }));

  const data = result.data as Record<string, unknown>;
  assert.equal(data.tabSessionId, 'tab_alpha');
  assert.equal(data.site, 'reddit.com');
  assert.equal(data.command, 'getUserInfo');

  const user = data.user as Record<string, unknown>;
  assert.equal(user.kind, 'entity.user');
  assert.equal(user.id, 'reddit:otto');
  assert.equal(user.username, 'otto');
  assert.equal(user.platform, 'reddit');

  assert.deepEqual(data.lookup, {
    username: 'otto',
    id: undefined,
  });
});

test('command.run can execute from a blank tab when preloadHost is missing', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: null },
    scriptResults: [
      {
        user: {
          kind: 'entity.user',
          id: 'reddit:otto',
          username: 'otto',
          platform: 'reddit',
        },
        lookup: {
          username: 'otto',
        },
      },
    ],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.run', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getUserInfo',
    input: { username: 'otto' },
    authMode: 'strict_fail',
  }));

  const data = result.data as Record<string, unknown>;
  assert.equal(data.tabSessionId, 'tab_alpha');
  assert.equal(data.site, 'reddit.com');
  assert.equal(data.command, 'getUserInfo');

  const user = data.user as Record<string, unknown>;
  assert.equal(user.kind, 'entity.user');
  assert.equal(user.id, 'reddit:otto');
  assert.equal(user.username, 'otto');
  assert.equal(user.platform, 'reddit');

  assert.deepEqual(data.lookup, {
    username: 'otto',
    id: undefined,
  });
});

test('command.test waits for preload document readiness before execute fallback', async () => {
  const { chromeApi, getExecuteScriptFunctionCalls } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    documentReadyStateSequenceByTabId: {
      11: ['loading', 'complete'],
    },
    scriptResults: [
      { authenticated: true },
      { posts: [{ kind: 'content.post', id: 'post-ready-test', title: 'Ready in test', author: 'otto' }] },
    ],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.test', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getPosts',
    input: {},
    authMode: 'strict_fail',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'getPosts',
    posts: [{ kind: 'content.post', id: 'post-ready-test', title: 'Ready in test', author: 'otto' }],
  });

  const readinessCalls = getExecuteScriptFunctionCalls().filter((name) => name === 'isDocumentReadyForCommandPreload');
  assert.equal(readinessCalls.length, 2);
});

test('command.test uses sendChatMessage test hook to execute mocked send flow', async () => {
  const { chromeApi, tabUrls } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
    tabUrlSequenceById: {
      11: [
        'https://www.reddit.com/',
        'https://www.reddit.com/',
        'https://chat.reddit.com/room/room_1',
      ],
    },
    scriptResults: [
      { authenticated: true },
      { roomId: 'room_1', finalPath: '/room/room_1', openedExistingRoom: false },
      { sent: true, roomId: 'room_1', username: 'alice', attempts: 1 },
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

  assert.ok(
    tabUrls[11] === 'https://chat.reddit.com/' || tabUrls[11] === 'https://chat.reddit.com/room/room_1',
  );
  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'sendChatMessage',
    sent: true,
    attempts: 1,
    username: 'alice',
    roomId: 'room_1',
  });
});

test('command.test sendChatMessage with roomId opens direct room URL using mocked send flow', async () => {
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
      { sent: true, roomId: 'room_99', attempts: 1 },
    ],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.test', {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'sendChatMessage',
    input: {
      roomId: 'room_99',
      message: 'hello from test',
    },
    authMode: 'strict_fail',
  }));

  assert.equal(tabUrls[11], 'https://reddit.com/chat/room/room_99');
  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'reddit.com',
    command: 'sendChatMessage',
    sent: true,
    roomId: 'room_99',
    attempts: 1,
  });
});

test('command.test supports running checkLogin helper command', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.google.com/' },
    scriptResults: [true],
  });

  const result = await executeCommand(chromeApi, buildCommand('command.test', {
    tabSessionId: 'tab_alpha',
    site: 'google.com',
    command: 'checkLogin',
    input: {},
    authMode: 'strict_fail',
  }));

  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'google.com',
    command: 'checkLogin',
    authenticated: true,
  });
});

test('command.test supports running gotoLogin helper command', async () => {
  const { chromeApi, tabUrls } = createChromeMock({
    sessionSeed: {
      tabSessions: {
        tab_alpha: 11,
      },
    },
    tabIds: [11],
    tabUrls: { 11: 'https://www.google.com/' },
  });

  const result = await executeCommand(chromeApi, buildCommand('command.test', {
    tabSessionId: 'tab_alpha',
    site: 'google.com',
    command: 'gotoLogin',
    input: {},
    authMode: 'strict_fail',
  }));

  assert.equal(tabUrls[11], 'https://accounts.google.com/ServiceLogin');
  assert.deepEqual(result.data, {
    tabSessionId: 'tab_alpha',
    site: 'google.com',
    command: 'gotoLogin',
    loginUrl: 'https://accounts.google.com/ServiceLogin',
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

test('primitive.tab.close_owned closes only tabs owned by target controller', async () => {
  const { chromeApi, sessionStore } = createChromeMock({
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
    user: {
      kind: 'entity.user',
      id: 't2_abc123',
      platform: 'reddit',
      username: 'alice',
      displayName: undefined,
      profileUrl: undefined,
      avatarUrl: 'https://example.com/avatar.png',
      bio: undefined,
      isVerified: false,
      createdAt: '1970-01-01T00:02:03.000Z',
      flags: undefined,
      stats: {
        followers: undefined,
        reputation: undefined,
        posts: undefined,
        comments: undefined,
      },
      originalEntity: {
        name: 'alice',
        id: 'abc123',
        icon_img: 'https://example.com/avatar.png',
        created_utc: 123,
        is_blocked: false,
        is_mod: false,
        is_employee: false,
        accept_chats: true,
      },
    },
    lookup: {
      username: 'alice',
      id: undefined,
    },
  });
});

test('listener.subscribe rejects empty streamAdapter string', async () => {
  const { chromeApi } = createChromeMock();

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('listener.subscribe', {
      listener: 'network.http_intercept',
      options: {
        tabSessionId: 'tab_alpha',
        site: 'reddit.com',
        streamAdapter: '  ',
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

test('listener.unsubscribe returns unsubscribed payload', async () => {
  const { chromeApi } = createChromeMock();

  const result = await executeCommand(chromeApi, buildCommand('listener.unsubscribe', {
    targetRequestId: 'req_123',
  }));

  assert.deepEqual(result.data, {
    targetRequestId: 'req_123',
    unsubscribed: true,
  });
});

test('unsupported action throws deterministic error', async () => {
  const { chromeApi } = createChromeMock();

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('primitive.unknown.action', {})),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'unsupported_action');
      assert.equal(commandErr.stage, 'validation');
      assert.equal(commandErr.retryable, false);
      return true;
    },
  );
});

test('primitive.dom.extract_distilled_html throws when dom-distiller and readability both fail', async () => {
  const { chromeApi } = createChromeMock({
    scriptResults: [
      { kind: 'failure', reason: 'DomDistiller.apply is unavailable in page context' },
      { kind: 'failure', reason: 'Readability constructor is unavailable in page context' },
    ],
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('primitive.dom.extract_distilled_html', {
      url: 'https://example.com/article',
      mode: 'dom-distiller',
      fallbackToReadability: false,
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'distiller_unavailable');
      return true;
    },
  );
});

test('primitive.page.screenshot rejects invalid format', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: { tabSessions: { tab_alpha: 11 } },
    tabIds: [11],
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('primitive.page.screenshot', {
      tabSessionId: 'tab_alpha',
      format: 'gif',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      const commandErr = err as CommandExecutionError;
      assert.equal(commandErr.code, 'invalid_screenshot_format');
      return true;
    },
  );
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

test('command.run rejects empty site', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: { tabSessions: { tab_alpha: 11 } },
    tabIds: [11],
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: '',
      command: 'getPosts',
      input: {},
      authMode: 'skip',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      assert.equal(err.code, 'missing_site');
      return true;
    },
  );
});

test('command.run rejects empty command', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: { tabSessions: { tab_alpha: 11 } },
    tabIds: [11],
    tabUrls: { 11: 'https://www.reddit.com/' },
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('command.run', {
      tabSessionId: 'tab_alpha',
      site: 'reddit.com',
      command: '',
      input: {},
      authMode: 'skip',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      assert.equal(err.code, 'missing_command');
      return true;
    },
  );
});

test('primitive.page.screenshot reports debugger permission denied for chrome URLs', async () => {
  const { chromeApi } = createChromeMock({
    sessionSeed: { tabSessions: { tab_alpha: 11 } },
    tabIds: [11],
    debuggerAttachErrorValue: new Error('Cannot access a chrome:// URL'),
  });

  await assert.rejects(
    () => executeCommand(chromeApi, buildCommand('primitive.page.screenshot', {
      tabSessionId: 'tab_alpha',
      mode: 'viewport',
    })),
    (err: unknown) => {
      assert.ok(err instanceof CommandExecutionError);
      assert.equal((err as CommandExecutionError).code, 'screenshot_debugger_permission_denied');
      return true;
    },
  );
});

test('primitive.tab.open recovers when tab group update throws nested cause object', async () => {
  const staleGroupId = 1060980695;
  const { chromeApi, sessionStore, getGroupCreateCount } = createChromeMock({
    sessionSeed: {
      automationGroupId: staleGroupId,
    },
    tabIds: [11],
    invalidTabGroupUpdateIds: [staleGroupId],
    invalidTabGroupUpdateErrorValue: {
      cause: {
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

  test('primitive.dom.extract_clean_html preserves data attributes', async () => {
    const { chromeApi } = createChromeMock({
      scriptResults: [{
        html: '<div data-id="123" data-testid="main" data-value="test"><p>Content</p></div>',
        sourceUrl: 'https://example.com',
        title: 'Test',
      }],
    });

    const result = await executeCommand(chromeApi, buildCommand('primitive.dom.extract_clean_html', {
      url: 'https://example.com',
    }));

    const content = (result.data as { content: string }).content;
    assert.ok(content.includes('data-id="123"'), 'data-id attribute should be preserved');
    assert.ok(content.includes('data-testid="main"'), 'data-testid attribute should be preserved');
    assert.ok(content.includes('data-value="test"'), 'data-value attribute should be preserved');
  });

  test('primitive.dom.extract_clean_html preserves aria attributes', async () => {
    const { chromeApi } = createChromeMock({
      scriptResults: [{
        html: '<div aria-label="Main content" aria-hidden="false"><button aria-pressed="true">Button</button></div>',
        sourceUrl: 'https://example.com',
        title: 'Test',
      }],
    });

    const result = await executeCommand(chromeApi, buildCommand('primitive.dom.extract_clean_html', {
      url: 'https://example.com',
    }));

    const content = (result.data as { content: string }).content;
    assert.ok(content.includes('aria-label="Main content"'), 'aria-label should be preserved');
    assert.ok(content.includes('aria-hidden="false"'), 'aria-hidden should be preserved');
    assert.ok(content.includes('aria-pressed="true"'), 'aria-pressed should be preserved');
  });

  test('primitive.dom.extract_clean_html preserves role attributes', async () => {
    const { chromeApi } = createChromeMock({
      scriptResults: [{
        html: '<div role="main"><article role="article"><nav role="navigation">Nav</nav></article></div>',
        sourceUrl: 'https://example.com',
        title: 'Test',
      }],
    });

    const result = await executeCommand(chromeApi, buildCommand('primitive.dom.extract_clean_html', {
      url: 'https://example.com',
    }));

    const content = (result.data as { content: string }).content;
    assert.ok(content.includes('role="main"'), 'role=main should be preserved');
    assert.ok(content.includes('role="article"'), 'role=article should be preserved');
    assert.ok(content.includes('role="navigation"'), 'role=navigation should be preserved');
  });

  test('primitive.dom.extract_clean_html handles selector targeting', async () => {
    const { chromeApi } = createChromeMock({
      scriptResults: [{
        html: '<header><h1>Title</h1></header><main id="main"><p>Main content</p></main><footer>Footer</footer>',
        sourceUrl: 'https://example.com',
        title: 'Test',
      }],
    });

    const result = await executeCommand(chromeApi, buildCommand('primitive.dom.extract_clean_html', {
      url: 'https://example.com',
      selector: '#main',
    }));

    assert.equal((result.data as { selector: string }).selector, '#main');
  });

  test('primitive.dom.extract_clean_html removes obfuscated classes', async () => {
    const { chromeApi } = createChromeMock({
      scriptResults: [{
        html: '<div class="component"><p class="_a0b _x1 jss-1">Text with obfuscated classes</p></div>',
        sourceUrl: 'https://example.com',
        title: 'Test',
      }],
    });

    const result = await executeCommand(chromeApi, buildCommand('primitive.dom.extract_clean_html', {
      url: 'https://example.com',
    }));

    const content = (result.data as { content: string }).content;
    // The p element should still exist but obfuscated classes might be removed
    assert.ok(content.includes('<p'), 'p tag should be preserved');
    assert.ok(content.includes('Text with obfuscated classes'), 'Text content should be preserved');
  });

  test('primitive.dom.extract_clean_html with complex nested structure preserves semantic meaning', async () => {
    const { chromeApi } = createChromeMock({
      scriptResults: [{
        html: `
          <article data-id="123" role="main">
            <header data-section="header">
              <h1 aria-label="Article Title">Title</h1>
            </header>
            <div role="region" aria-label="Article Content">
              <p data-testid="intro">Introduction</p>
              <section data-subsection="details">
                <h2>Details</h2>
                <p>Details content</p>
              </section>
            </div>
            <footer data-section="footer">Footer</footer>
          </article>
        `,
        sourceUrl: 'https://example.com',
        title: 'Complex Article',
      }],
    });

    const result = await executeCommand(chromeApi, buildCommand('primitive.dom.extract_clean_html', {
      url: 'https://example.com',
    }));

    const content = (result.data as { content: string }).content;
    // Verify semantic structure
    assert.ok(content.includes('data-id="123"'), 'data-id preserved');
    assert.ok(content.includes('role="main"'), 'role=main preserved');
    assert.ok(content.includes('aria-label="Article Title"'), 'aria-label preserved');
    assert.ok(content.includes('data-testid="intro"'), 'data-testid preserved');
    assert.ok(content.includes('role="region"'), 'role=region preserved');
    // Verify structure
    assert.ok(content.includes('<article'), 'article tag preserved');
    assert.ok(content.includes('<header'), 'header tag preserved');
    assert.ok(content.includes('<section'), 'section tag preserved');
});
