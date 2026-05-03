import assert from 'node:assert/strict';
import test from 'node:test';
import { Command } from 'commander';
import { registerObserveCommands } from '../src/cli/observe-commands.js';

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
