import assert from 'node:assert/strict';
import test from 'node:test';
import type { Envelope } from '@telepat/otto-protocol';
import type { OttoConfig } from '../src/config.js';
import { runExtractContentHandler } from '../src/cli/extract-content-handler.js';

const fakeConfig: OttoConfig = { relayUrl: 'ws://localhost:8787' };

function makeDeps(runCommandOnce: (config: OttoConfig, nodeId: string, opts: { action: string; tabSession?: string; payload: Record<string, unknown>; timeoutMs?: number }) => Promise<Envelope>) {
  return {
    loadConfig: () => fakeConfig,
    resolveTargetNodeId: async () => 'node_1',
    runCommandOnce,
  };
}

test('runExtractContentHandler: markdown format with tabSession returns correct action', async () => {
  const calls: string[] = [];

  const deps = makeDeps(async (_config, _nodeId, opts) => {
    calls.push(opts.action);
    return {
      messageType: 'result',
      payload: { data: { markdown: '# Hello\nWorld' } },
    } as Envelope;
  });

  const result = await runExtractContentHandler(
    { format: 'markdown', tabSession: 'tab_abc', maxChars: 5000 },
    deps,
  );

  assert.equal(result.format, 'markdown');
  assert.equal(result.action, 'primitive.dom.extract_markdown');
  assert.equal(result.response.messageType, 'result');
  assert.deepEqual(calls, ['primitive.dom.extract_markdown']);
});

test('runExtractContentHandler: distilled_html format with tabSession', async () => {
  const calls: string[] = [];

  const deps = makeDeps(async (_config, _nodeId, opts) => {
    calls.push(opts.action);
    return {
      messageType: 'result',
      payload: { data: { html: '<article>Hello</article>' } },
    } as Envelope;
  });

  const result = await runExtractContentHandler(
    { format: 'distilled_html', tabSession: 'tab_abc' },
    deps,
  );

  assert.equal(result.format, 'distilled_html');
  assert.equal(result.action, 'primitive.dom.extract_distilled_html');
  assert.deepEqual(calls, ['primitive.dom.extract_distilled_html']);
});

test('runExtractContentHandler: raw_html format with tabSession', async () => {
  const calls: string[] = [];

  const deps = makeDeps(async (_config, _nodeId, opts) => {
    calls.push(opts.action);
    return {
      messageType: 'result',
      payload: { data: { html: '<html><body>Hello</body></html>' } },
    } as Envelope;
  });

  const result = await runExtractContentHandler(
    { format: 'raw_html', tabSession: 'tab_abc', selector: '#main' },
    deps,
  );

  assert.equal(result.format, 'raw_html');
  assert.equal(result.action, 'primitive.dom.extract_html');
  assert.deepEqual(calls, ['primitive.dom.extract_html']);
});

test('runExtractContentHandler: text format with tabSession (no temp tab)', async () => {
  const calls: string[] = [];

  const deps = makeDeps(async (_config, _nodeId, opts) => {
    calls.push(opts.action);
    return {
      messageType: 'result',
      payload: { data: { text: 'Hello world' } },
    } as Envelope;
  });

  const result = await runExtractContentHandler(
    { format: 'text', tabSession: 'tab_abc' },
    deps,
  );

  assert.equal(result.format, 'text');
  assert.equal(result.action, 'primitive.dom.extract_text');
  // No primitive.tab.open or close — tabSession was provided
  assert.deepEqual(calls, ['primitive.dom.extract_text']);
});

test('runExtractContentHandler: text format with URL opens/closes temporary tab', async () => {
  const calls: string[] = [];

  const deps = makeDeps(async (_config, _nodeId, opts) => {
    calls.push(opts.action);
    if (opts.action === 'primitive.tab.open') {
      return {
        messageType: 'result',
        payload: { data: { tabSessionId: 'temp_tab_xyz' } },
      } as Envelope;
    }
    return {
      messageType: 'result',
      payload: { data: { text: 'Hello world' } },
    } as Envelope;
  });

  const result = await runExtractContentHandler(
    { format: 'text', url: 'https://example.com' },
    deps,
  );

  assert.equal(result.format, 'text');
  assert.equal(result.action, 'primitive.dom.extract_text');
  assert.deepEqual(calls, ['primitive.tab.open', 'primitive.dom.extract_text', 'primitive.tab.close']);
});

test('runExtractContentHandler: temp tab close is attempted even if extract fails', async () => {
  const calls: string[] = [];

  const deps = makeDeps(async (_config, _nodeId, opts) => {
    calls.push(opts.action);
    if (opts.action === 'primitive.tab.open') {
      return {
        messageType: 'result',
        payload: { data: { tabSessionId: 'temp_tab_xyz' } },
      } as Envelope;
    }
    if (opts.action === 'primitive.dom.extract_text') {
      throw new Error('extract failure');
    }
    return { messageType: 'result', payload: {} } as Envelope;
  });

  await assert.rejects(
    runExtractContentHandler({ format: 'text', url: 'https://example.com' }, deps),
    /extract failure/,
  );

  // close must still have been called
  assert.ok(calls.includes('primitive.tab.close'), 'primitive.tab.close should be called for cleanup');
});

test('runExtractContentHandler: throws if primitive.tab.open returns error', async () => {
  const deps = makeDeps(async (_config, _nodeId, opts) => {
    if (opts.action === 'primitive.tab.open') {
      return {
        messageType: 'error',
        payload: { code: 'tab_open_failed', message: 'Could not open tab' },
      } as Envelope;
    }
    return { messageType: 'result', payload: {} } as Envelope;
  });

  await assert.rejects(
    runExtractContentHandler({ format: 'text', url: 'https://example.com' }, deps),
    /primitive\.tab\.open failed/,
  );
});

test('runExtractContentHandler: throws if neither url nor tabSession provided', async () => {
  const deps = makeDeps(async () => ({ messageType: 'result', payload: {} } as Envelope));

  await assert.rejects(
    runExtractContentHandler({ format: 'markdown' }, deps),
    /Provide a URL argument or --tab-session/,
  );
});

test('runExtractContentHandler: default format is markdown when omitted', async () => {
  const calls: string[] = [];

  const deps = makeDeps(async (_config, _nodeId, opts) => {
    calls.push(opts.action);
    return { messageType: 'result', payload: {} } as Envelope;
  });

  const result = await runExtractContentHandler({ tabSession: 'tab_abc' }, deps);

  assert.equal(result.format, 'markdown');
  assert.equal(result.action, 'primitive.dom.extract_markdown');
});
