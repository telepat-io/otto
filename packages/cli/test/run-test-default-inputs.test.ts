import assert from 'node:assert/strict';
import test from 'node:test';
import type { Envelope } from '@telepat/otto-protocol';
import { runTestCommand } from '../src/cli/run-test.js';

type CapturedSendPayload = {
  input?: Record<string, unknown>;
};

function createDeps(
  parseJsonObjectResult: Record<string, unknown>,
  captured: CapturedSendPayload,
) {
  const ws = {
    readyState: 1,
    close: () => {},
  };

  return {
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
    parseJsonObject: () => parseJsonObjectResult,
    openControllerSocket: async () => ws as never,
    startControllerHeartbeat: () => () => {},
    runCommandWithSocket: async () => ({ messageType: 'result', payload: {} } as Envelope),
    runCommandOnce: async () => ({ messageType: 'result', payload: {} } as Envelope),
    showAclMissingGrantHint: () => {},
    showTestFailureFooterAlert: async () => {},
    sendCommandCancelWithSocket: async () => {},
    resolveTestInfo: async () => ({ openUrl: 'https://www.reddit.com' }),
    sendCommandWithSocket: (_ws: unknown, _targetNodeId: string, options: {
      payload: {
        input?: Record<string, unknown>;
      };
    }) => {
      captured.input = options.payload.input;
      return {
        requestId: 'req_1',
        response: Promise.resolve({
          messageType: 'result',
          payload: {
            data: {},
          },
        } as Envelope),
      };
    },
    subscribeListenerAndFollow: async () => {},
  };
}

test('runTestCommand defaults reddit getPosts minReturnedPosts to 20 when missing', async () => {
  const captured: CapturedSendPayload = {};
  const previousExitCode = process.exitCode;

  try {
    process.exitCode = undefined;
    await runTestCommand(
      'reddit.com',
      'getPosts',
      {
        tabSession: 'tab_1',
        payload: '{}',
        timeout: '30000',
        authMode: 'auto',
      },
      createDeps({}, captured),
    );
  } finally {
    process.exitCode = previousExitCode;
  }

  assert.deepEqual(captured.input, { minReturnedPosts: 20 });
});

test('runTestCommand keeps explicit reddit getPosts minReturnedPosts value', async () => {
  const captured: CapturedSendPayload = {};
  const previousExitCode = process.exitCode;

  try {
    process.exitCode = undefined;
    await runTestCommand(
      'reddit.com',
      'getPosts',
      {
        tabSession: 'tab_1',
        payload: '{"minReturnedPosts":35}',
        timeout: '30000',
        authMode: 'auto',
      },
      createDeps({ minReturnedPosts: 35 }, captured),
    );
  } finally {
    process.exitCode = previousExitCode;
  }

  assert.deepEqual(captured.input, { minReturnedPosts: 35 });
});
