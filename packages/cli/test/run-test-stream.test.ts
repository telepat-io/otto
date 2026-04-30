import assert from 'node:assert/strict';
import test from 'node:test';
import type { Envelope } from '@telepat/otto-protocol';
import { runTestCommand } from '../src/cli/run-test.js';

test('runTestCommand subscribes stream listener with options and probe', async () => {
  const previousExitCode = process.exitCode;
  const originalLog = console.log;
  console.log = () => {};

  const ws = {
    readyState: 1,
    close: () => {},
  };

  const probeActions: string[] = [];
  const subscribeArgs: {
    listener: string;
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
    runCommandWithSocket: async (_ws: unknown, _targetNodeId: string, options: { action: string }) => {
      if (options.action === 'primitive.tab.open') {
        return {
          messageType: 'result',
          payload: { data: { tabSessionId: 'tab_stream_1' } },
        } as Envelope;
      }
      if (options.action === 'command.run') {
        probeActions.push('probe');
        return { messageType: 'result', payload: {} } as Envelope;
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
        payload: {
          data: {
            stream: {
              listeners: [
                {
                  listener: 'network.http_intercept',
                  options: { mode: 'network' },
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
      listener: string,
      options: Record<string, unknown>,
      _timeoutMs: number,
      _jsonOutput: boolean,
      followMs?: number,
      probe?: () => Promise<void>,
    ) => {
      subscribeArgs.push({ listener, options, followMs, probe });
      if (probe) {
        await probe();
      }
    },
  };

  try {
    process.exitCode = undefined;
    await runTestCommand(
      'reddit.com',
      'getChatMessages',
      {
        payload: '{}',
        timeout: '30000',
        authMode: 'auto',
        streamFollowMs: '5000',
        streamPollIntervalMs: '1000',
        streamListenerMode: 'fetch',
        streamProbe: true,
      },
      deps,
    );
    assert.equal(subscribeArgs.length, 1);
    assert.equal(subscribeArgs[0].listener, 'network.http_intercept');
    assert.equal(subscribeArgs[0].options.mode, 'fetch');
    assert.equal(subscribeArgs[0].options.pollIntervalMs, 1000);
    assert.equal(subscribeArgs[0].followMs, 5000);
    assert.equal(probeActions.length, 1);
  } finally {
    process.exitCode = previousExitCode;
    console.log = originalLog;
  }
});

test('runTestCommand throws when multiple listeners returned', async () => {
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
          payload: { data: { tabSessionId: 'tab_multi_1' } },
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
        payload: {
          data: {
            stream: {
              listeners: [
                { listener: 'l1' },
                { listener: 'l2' },
              ],
            },
          },
        },
      } as Envelope),
    }),
    subscribeListenerAndFollow: async () => {},
  };

  try {
    process.exitCode = undefined;
    await assert.rejects(
      runTestCommand(
        'reddit.com',
        'getChatMessages',
        {
          tabSession: 'tab_multi_1',
          payload: '{}',
          timeout: '30000',
          authMode: 'auto',
        },
        deps,
      ),
      /exactly one listener/,
    );
  } finally {
    process.exitCode = previousExitCode;
  }
});

test('runTestCommand throws when listener name is missing', async () => {
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
          payload: { data: { tabSessionId: 'tab_missing_1' } },
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
        payload: {
          data: {
            stream: {
              listeners: [{}],
            },
          },
        },
      } as Envelope),
    }),
    subscribeListenerAndFollow: async () => {},
  };

  try {
    process.exitCode = undefined;
    await assert.rejects(
      runTestCommand(
        'reddit.com',
        'getChatMessages',
        {
          tabSession: 'tab_missing_1',
          payload: '{}',
          timeout: '30000',
          authMode: 'auto',
        },
        deps,
      ),
      /requires stream.listeners\[0\].listener/,
    );
  } finally {
    process.exitCode = previousExitCode;
  }
});
