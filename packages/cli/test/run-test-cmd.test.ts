import assert from 'node:assert/strict';
import test from 'node:test';
import type { Envelope } from '@telepat/otto-protocol';
import { runCmdCommand } from '../src/cli/run-test.js';

test('runCmdCommand TTY delegates to runCommandTui', async () => {
  const originalIsTTY = process.stdout.isTTY;
  const originalStdinIsTTY = process.stdin.isTTY;
  (process.stdout as unknown as Record<string, unknown>).isTTY = true;
  (process.stdin as unknown as Record<string, unknown>).isTTY = true;

  let tuiCalled = false;
  const deps = {
    loadConfig: () => ({ relayUrl: 'ws://localhost:8787' }),
    resolveTargetNodeId: async () => 'node_1',
    runCommandTui: async () => { tuiCalled = true; },
    runCommandOnce: async () => ({ messageType: 'result', payload: {} } as Envelope),
    parseJsonObject: () => ({}),
    showAclMissingGrantHint: () => {},
  };

  try {
    await runCmdCommand({ action: 'primitive.tab.open', payload: '{}', timeout: '30000' }, deps);
    assert.equal(tuiCalled, true);
  } finally {
    (process.stdout as unknown as Record<string, unknown>).isTTY = originalIsTTY;
    (process.stdin as unknown as Record<string, unknown>).isTTY = originalStdinIsTTY;
  }
});

test('runCmdCommand non-TTY prints result', async () => {
  const originalIsTTY = process.stdout.isTTY;
  const originalStdinIsTTY = process.stdin.isTTY;
  (process.stdout as unknown as Record<string, unknown>).isTTY = false;
  (process.stdin as unknown as Record<string, unknown>).isTTY = false;

  const previousExitCode = process.exitCode;
  const originalLog = console.log;
  let output = '';
  console.log = (...args: unknown[]) => { output = args.join(' '); };

  const deps = {
    loadConfig: () => ({ relayUrl: 'ws://localhost:8787' }),
    resolveTargetNodeId: async () => 'node_1',
    runCommandTui: async () => {},
    runCommandOnce: async () => ({ messageType: 'result', payload: { ok: true } } as Envelope),
    parseJsonObject: () => ({}),
    showAclMissingGrantHint: () => {},
  };

  try {
    process.exitCode = undefined;
    await runCmdCommand({ action: 'primitive.tab.open', payload: '{}', timeout: '30000' }, deps);
    assert.ok(output.includes('ok'));
    assert.equal(process.exitCode, undefined);
  } finally {
    process.exitCode = previousExitCode;
    console.log = originalLog;
    (process.stdout as unknown as Record<string, unknown>).isTTY = originalIsTTY;
    (process.stdin as unknown as Record<string, unknown>).isTTY = originalStdinIsTTY;
  }
});

test('runCmdCommand non-TTY sets exit code on error with payload', async () => {
  const originalIsTTY = process.stdout.isTTY;
  const originalStdinIsTTY = process.stdin.isTTY;
  (process.stdout as unknown as Record<string, unknown>).isTTY = false;
  (process.stdin as unknown as Record<string, unknown>).isTTY = false;

  const previousExitCode = process.exitCode;
  const originalLog = console.log;
  console.log = () => {};

  let hintCalled = false;
  const deps = {
    loadConfig: () => ({ relayUrl: 'ws://localhost:8787' }),
    resolveTargetNodeId: async () => 'node_1',
    runCommandTui: async () => {},
    runCommandOnce: async () => ({ messageType: 'error', payload: { code: 'test_error', message: 'fail' } } as Envelope),
    parseJsonObject: () => ({}),
    showAclMissingGrantHint: () => { hintCalled = true; },
  };

  try {
    process.exitCode = undefined;
    await runCmdCommand({ action: 'primitive.tab.open', payload: '{}', timeout: '30000' }, deps);
    assert.equal(hintCalled, true);
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previousExitCode;
    console.log = originalLog;
    (process.stdout as unknown as Record<string, unknown>).isTTY = originalIsTTY;
    (process.stdin as unknown as Record<string, unknown>).isTTY = originalStdinIsTTY;
  }
});

test('runCmdCommand non-TTY handles error without object payload', async () => {
  const originalIsTTY = process.stdout.isTTY;
  const originalStdinIsTTY = process.stdin.isTTY;
  (process.stdout as unknown as Record<string, unknown>).isTTY = false;
  (process.stdin as unknown as Record<string, unknown>).isTTY = false;

  const previousExitCode = process.exitCode;
  const originalLog = console.log;
  console.log = () => {};

  const deps = {
    loadConfig: () => ({ relayUrl: 'ws://localhost:8787' }),
    resolveTargetNodeId: async () => 'node_1',
    runCommandTui: async () => {},
    runCommandOnce: async () => ({ messageType: 'error', payload: 'string-error' } as unknown as Envelope),
    parseJsonObject: () => ({}),
    showAclMissingGrantHint: () => {},
  };

  try {
    process.exitCode = undefined;
    await runCmdCommand({ action: 'primitive.tab.open', payload: '{}', timeout: '30000' }, deps);
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previousExitCode;
    console.log = originalLog;
    (process.stdout as unknown as Record<string, unknown>).isTTY = originalIsTTY;
    (process.stdin as unknown as Record<string, unknown>).isTTY = originalStdinIsTTY;
  }
});

test('runCmdCommand scales command.run timeout from descriptor policy when default timeout is used', async () => {
  const originalIsTTY = process.stdout.isTTY;
  const originalStdinIsTTY = process.stdin.isTTY;
  (process.stdout as unknown as Record<string, unknown>).isTTY = false;
  (process.stdin as unknown as Record<string, unknown>).isTTY = false;

  const originalLog = console.log;
  console.log = () => {};

  const observedCalls: Array<{ action: string; timeoutMs?: number }> = [];

  const deps = {
    loadConfig: () => ({ relayUrl: 'ws://localhost:8787' }),
    resolveTargetNodeId: async () => 'node_1',
    runCommandTui: async () => {},
    runCommandOnce: async (
      _config: unknown,
      _targetNodeId: string,
      options: { action: string; timeoutMs?: number },
    ) => {
      observedCalls.push({ action: options.action, timeoutMs: options.timeoutMs });
      if (options.action === 'command.list') {
        return {
          messageType: 'result',
          payload: {
            data: {
              commands: [
                {
                  site: 'linkedin.com',
                  id: 'getFeed',
                  timeoutPolicy: {
                    defaultMs: 60_000,
                    scaling: {
                      inputField: 'minReturnedPosts',
                      baseMs: 45_000,
                      perUnitMs: 4_000,
                      minMs: 45_000,
                      maxMs: 300_000,
                    },
                  },
                },
              ],
            },
          },
        } as Envelope;
      }

      return { messageType: 'result', payload: { ok: true } } as Envelope;
    },
    parseJsonObject: () => ({
      site: 'linkedin.com',
      command: 'getFeed',
      input: { minReturnedPosts: 15 },
    }),
    showAclMissingGrantHint: () => {},
  };

  try {
    await runCmdCommand({ action: 'command.run', payload: '{}', timeout: '30000' }, deps);
    assert.deepEqual(observedCalls.map((entry) => entry.action), ['command.list', 'command.run']);
    assert.equal(observedCalls[0]?.timeoutMs, 30_000);
    assert.equal(observedCalls[1]?.timeoutMs, 105_000);
  } finally {
    console.log = originalLog;
    (process.stdout as unknown as Record<string, unknown>).isTTY = originalIsTTY;
    (process.stdin as unknown as Record<string, unknown>).isTTY = originalStdinIsTTY;
  }
});

test('runCmdCommand keeps explicit non-default timeout for command.run', async () => {
  const originalIsTTY = process.stdout.isTTY;
  const originalStdinIsTTY = process.stdin.isTTY;
  (process.stdout as unknown as Record<string, unknown>).isTTY = false;
  (process.stdin as unknown as Record<string, unknown>).isTTY = false;

  const originalLog = console.log;
  console.log = () => {};

  const observedCalls: Array<{ action: string; timeoutMs?: number }> = [];

  const deps = {
    loadConfig: () => ({ relayUrl: 'ws://localhost:8787' }),
    resolveTargetNodeId: async () => 'node_1',
    runCommandTui: async () => {},
    runCommandOnce: async (
      _config: unknown,
      _targetNodeId: string,
      options: { action: string; timeoutMs?: number },
    ) => {
      observedCalls.push({ action: options.action, timeoutMs: options.timeoutMs });
      return { messageType: 'result', payload: { ok: true } } as Envelope;
    },
    parseJsonObject: () => ({
      site: 'linkedin.com',
      command: 'getFeed',
      input: { minReturnedPosts: 15 },
    }),
    showAclMissingGrantHint: () => {},
  };

  try {
    await runCmdCommand({ action: 'command.run', payload: '{}', timeout: '120000' }, deps);
    assert.deepEqual(observedCalls.map((entry) => entry.action), ['command.run']);
    assert.equal(observedCalls[0]?.timeoutMs, 120_000);
  } finally {
    console.log = originalLog;
    (process.stdout as unknown as Record<string, unknown>).isTTY = originalIsTTY;
    (process.stdin as unknown as Record<string, unknown>).isTTY = originalStdinIsTTY;
  }
});
