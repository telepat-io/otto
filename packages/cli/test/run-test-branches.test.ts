import assert from 'node:assert/strict';
import test from 'node:test';
import type { Envelope } from '@telepat/otto-protocol';
import { runTestCommand } from '../src/cli/run-test.js';

test('runTestCommand throws on invalid authMode', async () => {
  const ws = {
    readyState: 1,
    close: () => {},
  };

  const deps = {
    loadConfig: () => ({ relayUrl: 'ws://127.0.0.1:8787?role=controller' }),
    saveConfig: () => {},
    deleteClientSecret: async () => true,
    maybeSelfRegisterControllerForTest: async () => ({
      config: { relayUrl: 'ws://127.0.0.1:8787?role=controller' },
      autoRegisteredClientId: undefined,
    }),
    removeControllerClientAtRelay: async () => {},
    resolveTargetNodeId: async () => 'node_1',
    parsePositiveNumberOption: (value: unknown) => Number(value),
    isJsonOutput: () => false,
    parseJsonObject: () => ({}),
    openControllerSocket: async () => ws as never,
    startControllerHeartbeat: () => () => {},
    runCommandWithSocket: async () => ({ messageType: 'result', payload: {} } as Envelope),
    runCommandOnce: async () => ({ messageType: 'result', payload: {} } as Envelope),
    showAclMissingGrantHint: () => {},
    showTestFailureFooterAlert: async () => {},
    sendCommandCancelWithSocket: async () => {},
    resolveTestInfo: async () => ({ openUrl: 'https://example.com' }),
    sendCommandWithSocket: () => ({
      requestId: 'req_1',
      response: Promise.resolve({ messageType: 'result', payload: {} } as Envelope),
    }),
    subscribeListenerAndFollow: async () => {},
  };

  await assert.rejects(
    runTestCommand(
      'reddit.com',
      'getFeed',
      {
        payload: '{}',
        timeout: '30000',
        authMode: 'invalid',
      },
      deps,
    ),
    /auth-mode must be one of/,
  );
});

test('runTestCommand handles open tab error', async () => {
  const previousExitCode = process.exitCode;
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = () => {};

  const ws = {
    readyState: 1,
    close: () => {},
  };

  const deps = {
    loadConfig: () => ({ relayUrl: 'ws://127.0.0.1:8787?role=controller' }),
    saveConfig: () => {},
    deleteClientSecret: async () => true,
    maybeSelfRegisterControllerForTest: async () => ({
      config: { relayUrl: 'ws://127.0.0.1:8787?role=controller' },
      autoRegisteredClientId: undefined,
    }),
    removeControllerClientAtRelay: async () => {},
    resolveTargetNodeId: async () => 'node_1',
    parsePositiveNumberOption: (value: unknown) => Number(value),
    isJsonOutput: () => false,
    parseJsonObject: () => ({}),
    openControllerSocket: async () => ws as never,
    startControllerHeartbeat: () => () => {},
    runCommandWithSocket: async (_ws: unknown, _targetNodeId: string, options: { action: string }) => {
      if (options.action === 'primitive.tab.open') {
        return {
          messageType: 'error',
          payload: { code: 'tab_open_failed', message: 'could not open' },
        } as Envelope;
      }
      return { messageType: 'result', payload: {} } as Envelope;
    },
    runCommandOnce: async () => ({ messageType: 'result', payload: {} } as Envelope),
    showAclMissingGrantHint: () => {},
    showTestFailureFooterAlert: async () => {},
    sendCommandCancelWithSocket: async () => {},
    resolveTestInfo: async () => ({ openUrl: 'https://www.reddit.com' }),
    sendCommandWithSocket: () => ({
      requestId: 'req_1',
      response: Promise.resolve({ messageType: 'result', payload: {} } as Envelope),
    }),
    subscribeListenerAndFollow: async () => {},
  };

  try {
    process.exitCode = undefined;
    await runTestCommand(
      'reddit.com',
      'getFeed',
      {
        payload: '{}',
        timeout: '30000',
        authMode: 'auto',
      },
      deps,
    );
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previousExitCode;
    console.log = originalLog;
    console.error = originalError;
  }
});

test('runTestCommand throws when tabSessionId missing after open', async () => {
  const ws = {
    readyState: 1,
    close: () => {},
  };

  const deps = {
    loadConfig: () => ({ relayUrl: 'ws://127.0.0.1:8787?role=controller' }),
    saveConfig: () => {},
    deleteClientSecret: async () => true,
    maybeSelfRegisterControllerForTest: async () => ({
      config: { relayUrl: 'ws://127.0.0.1:8787?role=controller' },
      autoRegisteredClientId: undefined,
    }),
    removeControllerClientAtRelay: async () => {},
    resolveTargetNodeId: async () => 'node_1',
    parsePositiveNumberOption: (value: unknown) => Number(value),
    isJsonOutput: () => false,
    parseJsonObject: () => ({}),
    openControllerSocket: async () => ws as never,
    startControllerHeartbeat: () => () => {},
    runCommandWithSocket: async (_ws: unknown, _targetNodeId: string, options: { action: string }) => {
      if (options.action === 'primitive.tab.open') {
        return {
          messageType: 'result',
          payload: { data: {} },
        } as Envelope;
      }
      return { messageType: 'result', payload: {} } as Envelope;
    },
    runCommandOnce: async () => ({ messageType: 'result', payload: {} } as Envelope),
    showAclMissingGrantHint: () => {},
    showTestFailureFooterAlert: async () => {},
    sendCommandCancelWithSocket: async () => {},
    resolveTestInfo: async () => ({ openUrl: 'https://www.reddit.com' }),
    sendCommandWithSocket: () => ({
      requestId: 'req_1',
      response: Promise.resolve({ messageType: 'result', payload: {} } as Envelope),
    }),
    subscribeListenerAndFollow: async () => {},
  };

  await assert.rejects(
    runTestCommand(
      'reddit.com',
      'getFeed',
      {
        payload: '{}',
        timeout: '30000',
        authMode: 'auto',
      },
      deps,
    ),
    /did not return tabSessionId/,
  );
});

test('runTestCommand waits for interrupt when no stream and waitForInterrupt enabled', async () => {
  const previousExitCode = process.exitCode;
  const ws = {
    readyState: 1,
    close: () => {},
  };

  const deps = {
    loadConfig: () => ({ relayUrl: 'ws://127.0.0.1:8787?role=controller' }),
    saveConfig: () => {},
    deleteClientSecret: async () => true,
    maybeSelfRegisterControllerForTest: async () => ({
      config: { relayUrl: 'ws://127.0.0.1:8787?role=controller' },
      autoRegisteredClientId: undefined,
    }),
    removeControllerClientAtRelay: async () => {},
    resolveTargetNodeId: async () => 'node_1',
    parsePositiveNumberOption: (value: unknown) => Number(value),
    isJsonOutput: () => false,
    parseJsonObject: () => ({}),
    openControllerSocket: async () => ws as never,
    startControllerHeartbeat: () => () => {},
    runCommandWithSocket: async (_ws: unknown, _targetNodeId: string, options: { action: string }) => {
      if (options.action === 'primitive.tab.open') {
        return {
          messageType: 'result',
          payload: { data: { tabSessionId: 'tab_wait_2' } },
        } as Envelope;
      }
      return { messageType: 'result', payload: {} } as Envelope;
    },
    runCommandOnce: async () => ({ messageType: 'result', payload: {} } as Envelope),
    showAclMissingGrantHint: () => {},
    showTestFailureFooterAlert: async () => {},
    sendCommandCancelWithSocket: async () => {},
    resolveTestInfo: async () => ({ openUrl: 'https://www.reddit.com' }),
    sendCommandWithSocket: () => ({
      requestId: 'req_1',
      response: Promise.resolve({
        messageType: 'result',
        payload: { data: { stream: { listeners: [] } } },
      } as Envelope),
    }),
    subscribeListenerAndFollow: async () => {},
  };

  let settled = false;

  try {
    process.exitCode = undefined;
    const runPromise = runTestCommand(
      'reddit.com',
      'getFeed',
      {
        payload: '{}',
        timeout: '30000',
        authMode: 'auto',
        waitForInterrupt: true,
      },
      deps,
    ).then(() => {
      settled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(settled, false);

    process.emit('SIGINT');
    await runPromise;
    assert.equal(settled, true);
  } finally {
    process.exitCode = previousExitCode;
  }
});

test('runTestCommand handles non-socket error', async () => {
  const previousExitCode = process.exitCode;
  const ws = {
    readyState: 1,
    close: () => {},
  };

  const deps = {
    loadConfig: () => ({ relayUrl: 'ws://127.0.0.1:8787?role=controller' }),
    saveConfig: () => {},
    deleteClientSecret: async () => true,
    maybeSelfRegisterControllerForTest: async () => ({
      config: { relayUrl: 'ws://127.0.0.1:8787?role=controller' },
      autoRegisteredClientId: undefined,
    }),
    removeControllerClientAtRelay: async () => {},
    resolveTargetNodeId: async () => 'node_1',
    parsePositiveNumberOption: (value: unknown) => Number(value),
    isJsonOutput: () => false,
    parseJsonObject: () => ({}),
    openControllerSocket: async () => ws as never,
    startControllerHeartbeat: () => () => {},
    runCommandWithSocket: async () => { throw new Error('random error'); },
    runCommandOnce: async () => ({ messageType: 'result', payload: {} } as Envelope),
    showAclMissingGrantHint: () => {},
    showTestFailureFooterAlert: async () => {},
    sendCommandCancelWithSocket: async () => {},
    resolveTestInfo: async () => ({ openUrl: 'https://www.reddit.com' }),
    sendCommandWithSocket: () => ({
      requestId: 'req_1',
      response: Promise.resolve({ messageType: 'result', payload: {} } as Envelope),
    }),
    subscribeListenerAndFollow: async () => {},
  };

  try {
    process.exitCode = undefined;
    await assert.rejects(
      runTestCommand(
        'reddit.com',
        'getFeed',
        {
          payload: '{}',
          timeout: '30000',
          authMode: 'auto',
        },
        deps,
      ),
      /random error/,
    );
  } finally {
    process.exitCode = previousExitCode;
  }
});

test('runTestCommand uses jsonOutput from config', async () => {
  const previousExitCode = process.exitCode;
  const originalLog = console.log;
  let logOutput = '';
  console.log = (...args: unknown[]) => { logOutput += args.join(' ') + '\n'; };

  const ws = {
    readyState: 1,
    close: () => {},
  };

  const deps = {
    loadConfig: () => ({ relayUrl: 'ws://127.0.0.1:8787?role=controller', outputFormat: 'json' } as import('../src/config.js').OttoConfig),
    saveConfig: () => {},
    deleteClientSecret: async () => true,
    maybeSelfRegisterControllerForTest: async () => ({
      config: { relayUrl: 'ws://127.0.0.1:8787?role=controller', outputFormat: 'json' } as import('../src/config.js').OttoConfig,
      autoRegisteredClientId: undefined,
    }),
    removeControllerClientAtRelay: async () => {},
    resolveTargetNodeId: async () => 'node_1',
    parsePositiveNumberOption: (value: unknown) => Number(value),
    isJsonOutput: (config: { outputFormat?: string }) => config.outputFormat === 'json',
    parseJsonObject: () => ({}),
    openControllerSocket: async () => ws as never,
    startControllerHeartbeat: () => () => {},
    runCommandWithSocket: async (_ws: unknown, _targetNodeId: string, options: { action: string }) => {
      if (options.action === 'primitive.tab.open') {
        return {
          messageType: 'result',
          payload: { data: { tabSessionId: 'tab_json_1' } },
        } as Envelope;
      }
      return { messageType: 'result', payload: {} } as Envelope;
    },
    runCommandOnce: async () => ({ messageType: 'result', payload: {} } as Envelope),
    showAclMissingGrantHint: () => {},
    showTestFailureFooterAlert: async () => {},
    sendCommandCancelWithSocket: async () => {},
    resolveTestInfo: async () => ({ openUrl: 'https://www.reddit.com' }),
    sendCommandWithSocket: () => ({
      requestId: 'req_1',
      response: Promise.resolve({ messageType: 'result', payload: {} } as Envelope),
    }),
    subscribeListenerAndFollow: async () => {},
  };

  try {
    process.exitCode = undefined;
    await runTestCommand(
      'reddit.com',
      'getFeed',
      {
        tabSession: 'tab_json_1',
        payload: '{}',
        timeout: '30000',
        authMode: 'auto',
      },
      deps,
    );
    // When jsonOutput is true, renderCommandResponse returns JSON lines
    assert.ok(logOutput.includes('"messageType"'));
  } finally {
    process.exitCode = previousExitCode;
    console.log = originalLog;
  }
});

test('runTestCommand stream with default options and no probe', async () => {
  const previousExitCode = process.exitCode;
  const ws = {
    readyState: 1,
    close: () => {},
  };

  const subscribeArgs: {
    options: Record<string, unknown>;
    followMs?: number;
    probe?: () => Promise<void>;
  }[] = [];

  const deps = {
    loadConfig: () => ({ relayUrl: 'ws://127.0.0.1:8787?role=controller' }),
    saveConfig: () => {},
    deleteClientSecret: async () => true,
    maybeSelfRegisterControllerForTest: async () => ({
      config: { relayUrl: 'ws://127.0.0.1:8787?role=controller' },
      autoRegisteredClientId: undefined,
    }),
    removeControllerClientAtRelay: async () => {},
    resolveTargetNodeId: async () => 'node_1',
    parsePositiveNumberOption: (value: unknown) => Number(value),
    isJsonOutput: () => false,
    parseJsonObject: () => ({}),
    openControllerSocket: async () => ws as never,
    startControllerHeartbeat: () => () => {},
    runCommandWithSocket: async () => ({ messageType: 'result', payload: {} } as Envelope),
    runCommandOnce: async () => ({ messageType: 'result', payload: {} } as Envelope),
    showAclMissingGrantHint: () => {},
    showTestFailureFooterAlert: async () => {},
    sendCommandCancelWithSocket: async () => {},
    resolveTestInfo: async () => ({ openUrl: 'https://www.reddit.com' }),
    sendCommandWithSocket: () => ({
      requestId: 'req_1',
      response: Promise.resolve({
        messageType: 'result',
        payload: {
          data: {
            stream: {
              listeners: [
                {
                  listener: 'network.http_intercept',
                  options: 'bad',
                },
              ],
            },
          },
        },
      } as Envelope),
    }),
    subscribeListenerAndFollow: async (
      _ws: unknown,
      _targetNodeId: string,
      _site: string,
      _command: string,
      _listener: string,
      options: Record<string, unknown>,
      _timeoutMs: number,
      _jsonOutput: boolean,
      followMs?: number,
      probe?: () => Promise<void>,
    ) => {
      subscribeArgs.push({ options, followMs, probe });
    },
  };

  try {
    process.exitCode = undefined;
    await runTestCommand(
      'reddit.com',
      'getChatMessages',
      {
        tabSession: 'tab_default_1',
        payload: '{}',
        timeout: '30000',
        authMode: 'auto',
      },
      deps,
    );
    assert.equal(subscribeArgs.length, 1);
    assert.deepEqual(subscribeArgs[0].options, {});
    assert.equal(subscribeArgs[0].followMs, undefined);
    assert.equal(subscribeArgs[0].probe, undefined);
  } finally {
    process.exitCode = previousExitCode;
  }
});

test('runTestCommand reconnects for tab close when socket not open', async () => {
  const previousExitCode = process.exitCode;
  const originalLog = console.log;
  const originalError = console.error;
  let logOutput = '';
  let errorOutput = '';
  console.log = (...args: unknown[]) => { logOutput += args.join(' ') + '\n'; };
  console.error = (...args: unknown[]) => { errorOutput += args.join(' ') + '\n'; };

  const ws = {
    readyState: 2, // CLOSING, not OPEN
    close: () => {},
  };

  const deps = {
    loadConfig: () => ({ relayUrl: 'ws://127.0.0.1:8787?role=controller' }),
    saveConfig: () => {},
    deleteClientSecret: async () => true,
    maybeSelfRegisterControllerForTest: async () => ({
      config: { relayUrl: 'ws://127.0.0.1:8787?role=controller' },
      autoRegisteredClientId: undefined,
    }),
    removeControllerClientAtRelay: async () => {},
    resolveTargetNodeId: async () => 'node_1',
    parsePositiveNumberOption: (value: unknown) => Number(value),
    isJsonOutput: () => false,
    parseJsonObject: () => ({}),
    openControllerSocket: async () => ws as never,
    startControllerHeartbeat: () => () => {},
    runCommandWithSocket: async (_ws: unknown, _targetNodeId: string, options: { action: string }) => {
      if (options.action === 'primitive.tab.open') {
        return {
          messageType: 'result',
          payload: { data: { tabSessionId: 'tab_reconnect_1' } },
        } as Envelope;
      }
      return { messageType: 'result', payload: {} } as Envelope;
    },
    runCommandOnce: async (_config: unknown, _targetNodeId: string, options: { action: string }) => {
      if (options.action === 'primitive.tab.close') {
        return {
          messageType: 'error',
          payload: { code: 'close_err', message: 'close failed' },
        } as Envelope;
      }
      return { messageType: 'result', payload: {} } as Envelope;
    },
    showAclMissingGrantHint: () => {},
    showTestFailureFooterAlert: async () => {},
    sendCommandCancelWithSocket: async () => {},
    resolveTestInfo: async () => ({ openUrl: 'https://www.reddit.com' }),
    sendCommandWithSocket: () => ({
      requestId: 'req_1',
      response: Promise.resolve({
        messageType: 'error',
        payload: { code: 'test_err', message: 'test failed' },
      } as Envelope),
    }),
    subscribeListenerAndFollow: async () => {},
  };

  try {
    process.exitCode = undefined;
    await runTestCommand(
      'reddit.com',
      'getFeed',
      {
        payload: '{}',
        timeout: '30000',
        authMode: 'auto',
      },
      deps,
    );
    assert.equal(process.exitCode, 1);
    assert.ok(errorOutput.includes('close failed') || logOutput.includes('close failed'));
  } finally {
    process.exitCode = previousExitCode;
    console.log = originalLog;
    console.error = originalError;
  }
});
