import assert from 'node:assert/strict';
import test from 'node:test';
import { Command } from 'commander';
import {
  buildLogSearchParams,
  buildSubscribeNetworkOptions,
  filterCommandsBySite,
  normalizeEventType,
  registerObserveCommands,
} from '../src/cli/observe-commands.js';

test('filterCommandsBySite returns all commands when site is missing or blank', () => {
  const commands = [
    { id: 'a', site: 'reddit.com' },
    { id: 'b', site: 'news.ycombinator.com' },
  ];

  assert.equal(filterCommandsBySite(commands, undefined).length, 2);
  assert.equal(filterCommandsBySite(commands, '').length, 2);
  assert.equal(filterCommandsBySite(commands, '   ').length, 2);
});

test('filterCommandsBySite filters case-insensitively', () => {
  const commands = [
    { id: 'a', site: 'reddit.com' },
    { id: 'b', site: 'news.ycombinator.com' },
  ];

  const filtered = filterCommandsBySite(commands, 'REDDIT.COM');
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.id, 'a');
});

test('buildSubscribeNetworkOptions includes optional arrays only when present', () => {
  const withOptionals = buildSubscribeNetworkOptions({
    tabSession: 'tab_1',
    site: 'reddit.com',
    includeBody: true,
    includeHeaders: true,
    pattern: ['https://example.com/*'],
    requestHost: ['example.com'],
    mime: ['application/json'],
  }, 'hybrid', 123);

  assert.deepEqual(withOptionals, {
    tabSessionId: 'tab_1',
    site: 'reddit.com',
    mode: 'hybrid',
    includeBody: true,
    includeHeaders: true,
    maxBodyBytes: 123,
    urlPatterns: ['https://example.com/*'],
    requestHostAllowlist: ['example.com'],
    mimeTypes: ['application/json'],
  });

  const withoutOptionals = buildSubscribeNetworkOptions({
    tabSession: 'tab_2',
    site: 'news.ycombinator.com',
    includeBody: false,
    includeHeaders: false,
    pattern: [],
    requestHost: [],
    mime: [],
  }, 'network', 456);

  assert.deepEqual(withoutOptionals, {
    tabSessionId: 'tab_2',
    site: 'news.ycombinator.com',
    mode: 'network',
    includeBody: false,
    includeHeaders: false,
    maxBodyBytes: 456,
  });
});

test('buildLogSearchParams includes only valid filters', () => {
  const search = buildLogSearchParams(
    {
      since: '2026-01-01T00:00:00.000Z',
      nodeId: 'node_1',
      requestId: 'req_1',
    },
    'warn',
    'node',
    25,
  );
  assert.equal(search.get('since'), '2026-01-01T00:00:00.000Z');
  assert.equal(search.get('level'), 'warn');
  assert.equal(search.get('source'), 'node');
  assert.equal(search.get('latest'), '25');
  assert.equal(search.get('nodeId'), 'node_1');
  assert.equal(search.get('requestId'), 'req_1');

  const minimal = buildLogSearchParams(
    { since: '', nodeId: 42 as unknown as string, requestId: undefined },
    undefined,
    undefined,
    undefined,
  );
  assert.equal(minimal.toString(), '');
});

test('normalizeEventType trims valid strings and rejects non-strings', () => {
  assert.equal(normalizeEventType(' result '), 'result');
  assert.equal(normalizeEventType('   '), undefined);
  assert.equal(normalizeEventType(undefined), undefined);
  assert.equal(normalizeEventType(123), undefined);
});

test('commands list accepts --json and applies site filter', async () => {
  const program = new Command();
  let output = '';
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    output = args.join(' ');
  };

  try {
    registerObserveCommands({
      program,
      loadConfig: () => ({ relayUrl: 'ws://127.0.0.1:8787?role=controller' } as import('../src/config.js').OttoConfig),
      deriveHttpUrl: () => 'http://127.0.0.1:8787',
      resolveTargetNodeId: async () => 'node-1',
      runCommandOnce: async () => ({
        messageType: 'result',
        payload: {
          data: {
            commands: [
              { id: 'reddit.getFeed', site: 'reddit.com' },
              { id: 'hn.getFrontPage', site: 'news.ycombinator.com' },
            ],
          },
        },
      } as import('@telepat/otto-protocol').Envelope),
      parseMaybeNumber: () => 30_000,
      parsePositiveNumberOption: () => 1,
      parseNetworkMode: () => 'network',
      collectString: (value, previous) => [...previous, value],
      parseLogLevelOption: () => undefined,
      parseLogSourceOption: () => undefined,
      parseLatestOption: () => undefined,
      requestJson: async () => ({}),
      subscribeNetworkListenerAndFollow: async () => {},
      openControllerSocket: async () => {
        throw new Error('not used');
      },
      startControllerHeartbeat: () => () => {},
      runLogsFollowTui: async () => {},
      followLogsOnce: async () => {},
    });

    await program.parseAsync(['commands', 'list', '--json', '--site', 'reddit.com'], { from: 'user' });

    const parsed = JSON.parse(output) as {
      payload: {
        data: {
          commands: Array<{ id: string; site: string }>;
        };
      };
    };
    assert.equal(parsed.payload.data.commands.length, 1);
    assert.equal(parsed.payload.data.commands[0]?.site, 'reddit.com');
  } finally {
    console.log = originalLog;
  }
});

test('commands list sets exit code on error response', async () => {
  const program = new Command();
  const originalLog = console.log;
  const originalExitCode = process.exitCode;
  let output = '';
  console.log = (...args: unknown[]) => {
    output = args.join(' ');
  };

  try {
    registerObserveCommands({
      program,
      loadConfig: () => ({ relayUrl: 'ws://127.0.0.1:8787?role=controller' } as import('../src/config.js').OttoConfig),
      deriveHttpUrl: () => 'http://127.0.0.1:8787',
      resolveTargetNodeId: async () => 'node-1',
      runCommandOnce: async () => ({
        messageType: 'error',
        payload: { code: 'forbidden_action' },
      } as import('@telepat/otto-protocol').Envelope),
      parseMaybeNumber: () => 30_000,
      parsePositiveNumberOption: () => 1,
      parseNetworkMode: () => 'network',
      collectString: (value, previous) => [...previous, value],
      parseLogLevelOption: () => undefined,
      parseLogSourceOption: () => undefined,
      parseLatestOption: () => undefined,
      requestJson: async () => ({}),
      subscribeNetworkListenerAndFollow: async () => {},
      openControllerSocket: async () => { throw new Error('not used'); },
      startControllerHeartbeat: () => () => {},
      runLogsFollowTui: async () => {},
      followLogsOnce: async () => {},
    });

    await program.parseAsync(['commands', 'list', '--json'], { from: 'user' });

    assert.ok(output.includes('forbidden_action'));
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = originalExitCode;
    console.log = originalLog;
  }
});

test('commands list without site filter returns all commands', async () => {
  const program = new Command();
  const originalLog = console.log;
  let output = '';
  console.log = (...args: unknown[]) => {
    output = args.join(' ');
  };

  try {
    registerObserveCommands({
      program,
      loadConfig: () => ({ relayUrl: 'ws://127.0.0.1:8787?role=controller' } as import('../src/config.js').OttoConfig),
      deriveHttpUrl: () => 'http://127.0.0.1:8787',
      resolveTargetNodeId: async () => 'node-1',
      runCommandOnce: async () => ({
        messageType: 'result',
        payload: {
          data: {
            commands: [
              { id: 'reddit.getFeed', site: 'reddit.com' },
              { id: 'hn.getFrontPage', site: 'news.ycombinator.com' },
            ],
          },
        },
      } as import('@telepat/otto-protocol').Envelope),
      parseMaybeNumber: () => 30_000,
      parsePositiveNumberOption: () => 1,
      parseNetworkMode: () => 'network',
      collectString: (value, previous) => [...previous, value],
      parseLogLevelOption: () => undefined,
      parseLogSourceOption: () => undefined,
      parseLatestOption: () => undefined,
      requestJson: async () => ({}),
      subscribeNetworkListenerAndFollow: async () => {},
      openControllerSocket: async () => { throw new Error('not used'); },
      startControllerHeartbeat: () => () => {},
      runLogsFollowTui: async () => {},
      followLogsOnce: async () => {},
    });

    await program.parseAsync(['commands', 'list', '--json'], { from: 'user' });

    const parsed = JSON.parse(output) as {
      payload: {
        data: {
          commands: Array<{ id: string; site: string }>;
        };
      };
    };
    assert.equal(parsed.payload.data.commands.length, 2);
  } finally {
    console.log = originalLog;
  }
});

test('listener unsubscribe sends correct payload with targetRequestId', async () => {
  const program = new Command();
  let capturedPayload: unknown;
  const originalLog = console.log;
  console.log = () => {};

  try {
    registerObserveCommands({
      program,
      loadConfig: () => ({ relayUrl: 'ws://127.0.0.1:8787' } as import('../src/config.js').OttoConfig),
      deriveHttpUrl: () => 'http://127.0.0.1:8787',
      resolveTargetNodeId: async () => 'node-1',
      runCommandOnce: async (_, __, opts) => {
        capturedPayload = opts.payload;
        return {
          messageType: 'result',
          payload: { success: true },
        } as import('@telepat/otto-protocol').Envelope;
      },
      parseMaybeNumber: () => 30_000,
      parsePositiveNumberOption: () => 1,
      parseNetworkMode: () => 'network',
      collectString: (value, previous) => [...previous, value],
      parseLogLevelOption: () => undefined,
      parseLogSourceOption: () => undefined,
      parseLatestOption: () => undefined,
      requestJson: async () => ({}),
      subscribeNetworkListenerAndFollow: async () => {},
      openControllerSocket: async () => { throw new Error('not used'); },
      startControllerHeartbeat: () => () => {},
      runLogsFollowTui: async () => {},
      followLogsOnce: async () => {},
    });

    await program.parseAsync(['listener', 'unsubscribe', '--target-request-id', 'req-123'], { from: 'user' });

    assert.deepEqual(capturedPayload, { targetRequestId: 'req-123' });
  } finally {
    console.log = originalLog;
  }
});

test('listener unsubscribe error outputs error message', async () => {
  const program = new Command();
  let output = '';
  const originalLog = console.log;
  const originalExitCode = process.exitCode;
  
  console.log = (...args: unknown[]) => { output = args.join(' '); };

  try {
    registerObserveCommands({
      program,
      loadConfig: () => ({ relayUrl: 'ws://127.0.0.1:8787' } as import('../src/config.js').OttoConfig),
      deriveHttpUrl: () => 'http://127.0.0.1:8787',
      resolveTargetNodeId: async () => 'node-1',
      runCommandOnce: async () => ({
        messageType: 'error',
        payload: { code: 'target_not_found' },
      } as import('@telepat/otto-protocol').Envelope),
      parseMaybeNumber: () => 30_000,
      parsePositiveNumberOption: () => 1,
      parseNetworkMode: () => 'network',
      collectString: (value, previous) => [...previous, value],
      parseLogLevelOption: () => undefined,
      parseLogSourceOption: () => undefined,
      parseLatestOption: () => undefined,
      requestJson: async () => ({}),
      subscribeNetworkListenerAndFollow: async () => {},
      openControllerSocket: async () => { throw new Error('not used'); },
      startControllerHeartbeat: () => () => {},
      runLogsFollowTui: async () => {},
      followLogsOnce: async () => {},
    });

    await program.parseAsync(['listener', 'unsubscribe', '--target-request-id', 'req-123'], { from: 'user' });

    assert.ok(output.includes('target_not_found'));
    assert.equal(process.exitCode, 1);
  } finally {
    console.log = originalLog;
    process.exitCode = originalExitCode;
  }
});

test('logs list builds URL with filters', async () => {
  const program = new Command();
  let requestedUrl = '';
  const originalLog = console.log;
  console.log = () => {};

  try {
    registerObserveCommands({
      program,
      loadConfig: () => ({ relayUrl: 'ws://127.0.0.1:8787', relayHttpUrl: 'http://127.0.0.1:8787' } as import('../src/config.js').OttoConfig),
      deriveHttpUrl: () => 'http://127.0.0.1:8787',
      resolveTargetNodeId: async () => 'node-1',
      runCommandOnce: async () => ({ messageType: 'result' } as import('@telepat/otto-protocol').Envelope),
      parseMaybeNumber: () => 30_000,
      parsePositiveNumberOption: () => 1,
      parseNetworkMode: () => 'network',
      collectString: (value, previous) => [...previous, value],
      parseLogLevelOption: (v?: string) => (v === 'error' ? 'error' : undefined),
      parseLogSourceOption: (v?: string) => (v === 'node' ? 'node' : undefined),
      parseLatestOption: (v?: string) => (v ? Number(v) : undefined),
      requestJson: async (url: string) => {
        requestedUrl = url;
        return { logs: [] };
      },
      subscribeNetworkListenerAndFollow: async () => {},
      openControllerSocket: async () => { throw new Error('not used'); },
      startControllerHeartbeat: () => () => {},
      runLogsFollowTui: async () => {},
      followLogsOnce: async () => {},
    });

    await program.parseAsync([
      'logs', 'list',
      '--level', 'error',
      '--source', 'node',
      '--latest', '50',
    ], { from: 'user' });

    assert.ok(requestedUrl.includes('level=error'));
    assert.ok(requestedUrl.includes('source=node'));
    assert.ok(requestedUrl.includes('latest=50'));
  } finally {
    console.log = originalLog;
  }
});

test('logs status requests status endpoint and outputs result', async () => {
  const program = new Command();
  let output = '';
  let statusUrl = '';
  const originalLog = console.log;
  console.log = (...args: unknown[]) => { output = args.join(' '); };

  try {
    registerObserveCommands({
      program,
      loadConfig: () => ({ relayUrl: 'ws://127.0.0.1:8787', relayHttpUrl: 'http://127.0.0.1:8787' } as import('../src/config.js').OttoConfig),
      deriveHttpUrl: () => 'http://127.0.0.1:8787',
      resolveTargetNodeId: async () => 'node-1',
      runCommandOnce: async () => ({ messageType: 'result' } as import('@telepat/otto-protocol').Envelope),
      parseMaybeNumber: () => 30_000,
      parsePositiveNumberOption: () => 1,
      parseNetworkMode: () => 'network',
      collectString: (value, previous) => [...previous, value],
      parseLogLevelOption: () => undefined,
      parseLogSourceOption: () => undefined,
      parseLatestOption: () => undefined,
      requestJson: async (url: string) => {
        statusUrl = url;
        return { used: 1024, limit: 10240 };
      },
      subscribeNetworkListenerAndFollow: async () => {},
      openControllerSocket: async () => { throw new Error('not used'); },
      startControllerHeartbeat: () => () => {},
      runLogsFollowTui: async () => {},
      followLogsOnce: async () => {},
    });

    await program.parseAsync(['logs', 'status'], { from: 'user' });

    assert.ok(statusUrl.includes('/api/logs/status'));
    const parsed = JSON.parse(output) as { used: number; limit: number };
    assert.equal(parsed.used, 1024);
  } finally {
    console.log = originalLog;
  }
});

test('listener subscribe-network builds options and forwards to subscriber', async () => {
  const program = new Command();
  let call: { targetNodeId: string; options: unknown; timeoutMs: number } | undefined;
  const originalLog = console.log;
  console.log = () => {};

  try {
    registerObserveCommands({
      program,
      loadConfig: () => ({ relayUrl: 'ws://127.0.0.1:8787' } as import('../src/config.js').OttoConfig),
      deriveHttpUrl: () => 'http://127.0.0.1:8787',
      resolveTargetNodeId: async () => 'node-1',
      runCommandOnce: async () => ({ messageType: 'result' } as import('@telepat/otto-protocol').Envelope),
      parseMaybeNumber: () => 45_000,
      parsePositiveNumberOption: () => 512000,
      parseNetworkMode: () => 'hybrid',
      collectString: (value, previous) => [...previous, value],
      parseLogLevelOption: () => undefined,
      parseLogSourceOption: () => undefined,
      parseLatestOption: () => undefined,
      requestJson: async () => ({}),
      subscribeNetworkListenerAndFollow: async (_config, targetNodeId, options, timeoutMs) => {
        call = { targetNodeId, options, timeoutMs };
      },
      openControllerSocket: async () => { throw new Error('not used'); },
      startControllerHeartbeat: () => () => {},
      runLogsFollowTui: async () => {},
      followLogsOnce: async () => {},
    });

    await program.parseAsync([
      'listener',
      'subscribe-network',
      '--tab-session', 'tab_123',
      '--site', 'reddit.com',
      '--pattern', 'https://a.example/*',
      '--request-host', 'a.example',
      '--mode', 'hybrid',
      '--include-headers',
      '--max-body-bytes', '512000',
      '--mime', 'application/json',
      '--timeout', '45000',
    ], { from: 'user' });

    assert.equal(call?.targetNodeId, 'node-1');
    assert.equal(call?.timeoutMs, 45_000);
    assert.deepEqual(call?.options, {
      tabSessionId: 'tab_123',
      site: 'reddit.com',
      mode: 'hybrid',
      includeBody: true,
      includeHeaders: true,
      maxBodyBytes: 512000,
      urlPatterns: ['https://a.example/*'],
      requestHostAllowlist: ['a.example'],
      mimeTypes: ['application/json'],
    });
  } finally {
    console.log = originalLog;
  }
});

test('listener subscribe-network omits optional arrays when flags are absent', async () => {
  const program = new Command();
  let call: { options: unknown } | undefined;
  const originalLog = console.log;
  console.log = () => {};

  try {
    registerObserveCommands({
      program,
      loadConfig: () => ({ relayUrl: 'ws://127.0.0.1:8787' } as import('../src/config.js').OttoConfig),
      deriveHttpUrl: () => 'http://127.0.0.1:8787',
      resolveTargetNodeId: async () => 'node-1',
      runCommandOnce: async () => ({ messageType: 'result' } as import('@telepat/otto-protocol').Envelope),
      parseMaybeNumber: () => 30_000,
      parsePositiveNumberOption: () => 256000,
      parseNetworkMode: () => 'network',
      collectString: (value, previous) => [...previous, value],
      parseLogLevelOption: () => undefined,
      parseLogSourceOption: () => undefined,
      parseLatestOption: () => undefined,
      requestJson: async () => ({}),
      subscribeNetworkListenerAndFollow: async (_config, _targetNodeId, options) => {
        call = { options };
      },
      openControllerSocket: async () => { throw new Error('not used'); },
      startControllerHeartbeat: () => () => {},
      runLogsFollowTui: async () => {},
      followLogsOnce: async () => {},
    });

    await program.parseAsync([
      'listener',
      'subscribe-network',
      '--tab-session', 'tab_abc',
      '--site', 'example.com',
      '--no-include-body',
    ], { from: 'user' });

    assert.deepEqual(call?.options, {
      tabSessionId: 'tab_abc',
      site: 'example.com',
      mode: 'network',
      includeBody: false,
      includeHeaders: false,
      maxBodyBytes: 256000,
    });
  } finally {
    console.log = originalLog;
  }
});

test('logs follow uses TUI in interactive terminals and follows once in non-interactive mode', async () => {
  const program = new Command();
  let tuiCalls = 0;
  let onceCalls = 0;
  const originalIsTTYOut = process.stdout.isTTY;
  const originalIsTTYIn = process.stdin.isTTY;
  const originalLog = console.log;
  console.log = () => {};

  try {
    registerObserveCommands({
      program,
      loadConfig: () => ({ relayUrl: 'ws://127.0.0.1:8787' } as import('../src/config.js').OttoConfig),
      deriveHttpUrl: () => 'http://127.0.0.1:8787',
      resolveTargetNodeId: async () => 'node-1',
      runCommandOnce: async () => ({ messageType: 'result' } as import('@telepat/otto-protocol').Envelope),
      parseMaybeNumber: () => 30_000,
      parsePositiveNumberOption: () => 1,
      parseNetworkMode: () => 'network',
      collectString: (value, previous) => [...previous, value],
      parseLogLevelOption: (value?: string) => (value === 'warn' ? 'warn' : undefined),
      parseLogSourceOption: (value?: string) => (value === 'all' ? 'all' : undefined),
      parseLatestOption: () => undefined,
      requestJson: async () => ({}),
      subscribeNetworkListenerAndFollow: async () => {},
      openControllerSocket: async () => { throw new Error('not used'); },
      startControllerHeartbeat: () => () => {},
      runLogsFollowTui: async () => { tuiCalls += 1; },
      followLogsOnce: async () => { onceCalls += 1; },
    });

    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    await program.parseAsync(['logs', 'follow', '--level', 'warn', '--source', 'all'], { from: 'user' });

    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    await program.parseAsync(['logs', 'follow', '--level', 'warn', '--source', 'all', '--json'], { from: 'user' });

    assert.equal(tuiCalls, 1);
    assert.equal(onceCalls, 1);
  } finally {
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTYOut, configurable: true });
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTYIn, configurable: true });
    console.log = originalLog;
  }
});

test('logs follow normalizes blank --type to undefined', async () => {
  const program = new Command();
  let capturedType: string | undefined;
  const originalIsTTYOut = process.stdout.isTTY;
  const originalIsTTYIn = process.stdin.isTTY;
  const originalLog = console.log;
  console.log = () => {};

  try {
    registerObserveCommands({
      program,
      loadConfig: () => ({ relayUrl: 'ws://127.0.0.1:8787' } as import('../src/config.js').OttoConfig),
      deriveHttpUrl: () => 'http://127.0.0.1:8787',
      resolveTargetNodeId: async () => 'node-1',
      runCommandOnce: async () => ({ messageType: 'result' } as import('@telepat/otto-protocol').Envelope),
      parseMaybeNumber: () => 30_000,
      parsePositiveNumberOption: () => 1,
      parseNetworkMode: () => 'network',
      collectString: (value, previous) => [...previous, value],
      parseLogLevelOption: () => undefined,
      parseLogSourceOption: () => undefined,
      parseLatestOption: () => undefined,
      requestJson: async () => ({}),
      subscribeNetworkListenerAndFollow: async () => {},
      openControllerSocket: async () => { throw new Error('not used'); },
      startControllerHeartbeat: () => () => {},
      runLogsFollowTui: async () => {},
      followLogsOnce: async (_config, _source, _jsonOutput, _level, eventType) => {
        capturedType = eventType;
      },
    });

    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    await program.parseAsync(['logs', 'follow', '--type', '   '], { from: 'user' });

    assert.equal(capturedType, undefined);
  } finally {
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTYOut, configurable: true });
    Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTYIn, configurable: true });
    console.log = originalLog;
  }
});

test('logs export prints NDJSON and throws on non-ok responses', async () => {
  const program = new Command();
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  let output = '';
  console.log = (...args: unknown[]) => {
    output = args.join(' ');
  };

  try {
    registerObserveCommands({
      program,
      loadConfig: () => ({ relayUrl: 'ws://127.0.0.1:8787', relayHttpUrl: 'http://127.0.0.1:8787' } as import('../src/config.js').OttoConfig),
      deriveHttpUrl: () => 'http://127.0.0.1:8787',
      resolveTargetNodeId: async () => 'node-1',
      runCommandOnce: async () => ({ messageType: 'result' } as import('@telepat/otto-protocol').Envelope),
      parseMaybeNumber: () => 30_000,
      parsePositiveNumberOption: () => 1,
      parseNetworkMode: () => 'network',
      collectString: (value, previous) => [...previous, value],
      parseLogLevelOption: (value?: string) => (value === 'info' ? 'info' : undefined),
      parseLogSourceOption: (value?: string) => (value === 'relay' ? 'relay' : undefined),
      parseLatestOption: (value?: string) => (value ? Number(value) : undefined),
      requestJson: async () => ({}),
      subscribeNetworkListenerAndFollow: async () => {},
      openControllerSocket: async () => { throw new Error('not used'); },
      startControllerHeartbeat: () => () => {},
      runLogsFollowTui: async () => {},
      followLogsOnce: async () => {},
    });

    globalThis.fetch = (async () =>
      new Response('{"a":1}\n{"b":2}', { status: 200 })) as typeof fetch;

    await program.parseAsync(['logs', 'export', '--level', 'info', '--source', 'relay', '--latest', '2'], { from: 'user' });
    assert.ok(output.includes('{"a":1}'));

    globalThis.fetch = (async () =>
      new Response('', { status: 500 })) as typeof fetch;

    await assert.rejects(
      () => program.parseAsync(['logs', 'export', '--latest', '2'], { from: 'user' }),
      /Failed to export logs: 500/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }
});
