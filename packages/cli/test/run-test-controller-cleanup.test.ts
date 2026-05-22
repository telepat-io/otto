import assert from 'node:assert/strict';
import test from 'node:test';
import type { Envelope } from '@telepat/otto-protocol';
import { runTestCommand } from '../src/cli/run-test.js';
import { MOCK_SITE, MOCK_COMMAND_ID } from './test-command-mock.js';
import { createSocketClosedWhileWaitingError } from '../src/cli/socket-errors.js';

type SpyCalls = {
  removeControllerClientAtRelay: string[];
  deleteClientSecret: string[];
};

function createDeps(spy: SpyCalls) {
  const ws = {
    readyState: 1,
    close: () => {},
  };

  return {
    loadConfig: () => ({ relayUrl: 'ws://127.0.0.1:8787?role=controller' }),
    saveConfig: () => {},
    deleteClientSecret: async (_config: unknown, clientId: string) => {
      spy.deleteClientSecret.push(clientId);
      return true;
    },
    maybeSelfRegisterControllerForTest: async () => ({
      config: { relayUrl: 'ws://127.0.0.1:8787?role=controller' },
      autoRegisteredClientId: 'clt_tester_1',
    }),
    removeControllerClientAtRelay: async (_config: unknown, clientId: string) => {
      spy.removeControllerClientAtRelay.push(clientId);
    },
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
      response: Promise.resolve({
        messageType: 'error',
        payload: { code: 'expected_test_error' },
      } as Envelope),
    }),
    subscribeListenerAndFollow: async () => {},
  };
}

function createSocketCloseDeps(alertCalls: Array<{ title?: string; payload?: { message?: string; code?: string; action?: string } }>) {
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
    parseJsonObject: () => ({}),
    openControllerSocket: async () => ws as never,
    startControllerHeartbeat: () => () => {},
    runCommandWithSocket: async () => {
      throw createSocketClosedWhileWaitingError('primitive.tab.open');
    },
    runCommandOnce: async () => ({ messageType: 'result', payload: {} } as Envelope),
    showAclMissingGrantHint: () => {},
    showTestFailureFooterAlert: async (payload?: { message?: string; code?: string; action?: string }, title?: string) => {
      alertCalls.push({ title, payload });
    },
    sendCommandCancelWithSocket: async () => {},
    resolveTestInfo: async () => ({ openUrl: 'https://example.com' }),
    sendCommandWithSocket: () => ({
      requestId: 'req_1',
      response: Promise.resolve({ messageType: 'result', payload: { data: {} } } as Envelope),
    }),
    subscribeListenerAndFollow: async () => {},
  };
}

test('runTestCommand keeps auto-registered controller by default', async () => {
  const previousExitCode = process.exitCode;
  const spy: SpyCalls = {
    removeControllerClientAtRelay: [],
    deleteClientSecret: [],
  };

  try {
    process.exitCode = undefined;
    await runTestCommand(
      MOCK_SITE,
      'getChatMessages',
      {
        tabSession: 'tab_1',
        payload: '{}',
        timeout: '30000',
        authMode: 'auto',
      },
      createDeps(spy),
    );
  } finally {
    process.exitCode = previousExitCode;
  }

  assert.deepEqual(spy.removeControllerClientAtRelay, []);
  assert.deepEqual(spy.deleteClientSecret, []);
});

test('runTestCommand removes auto-registered controller when cleanup flag is enabled', async () => {
  const previousExitCode = process.exitCode;
  const spy: SpyCalls = {
    removeControllerClientAtRelay: [],
    deleteClientSecret: [],
  };

  try {
    process.exitCode = undefined;
    await runTestCommand(
      MOCK_SITE,
      'getChatMessages',
      {
        tabSession: 'tab_1',
        payload: '{}',
        timeout: '30000',
        authMode: 'auto',
        cleanupTestController: true,
      },
      createDeps(spy),
    );
  } finally {
    process.exitCode = previousExitCode;
  }

  assert.deepEqual(spy.removeControllerClientAtRelay, ['clt_tester_1']);
  assert.deepEqual(spy.deleteClientSecret, ['clt_tester_1']);
});

test('runTestCommand shows friendly alert when socket closes before response', async () => {
  const previousExitCode = process.exitCode;
  const alertCalls: Array<{ title?: string; payload?: { message?: string; code?: string; action?: string } }> = [];

  try {
    process.exitCode = undefined;
    await runTestCommand(
      MOCK_SITE,
      'getChatMessages',
      {
        payload: '{}',
        timeout: '30000',
        authMode: 'auto',
      },
      createSocketCloseDeps(alertCalls),
    );
  } finally {
    process.exitCode = previousExitCode;
  }

  assert.equal(alertCalls.length, 1);
  assert.equal(alertCalls[0]?.title, 'otto test interrupted before command response');
  assert.equal(alertCalls[0]?.payload?.code, 'socket_closed');
  assert.equal(alertCalls[0]?.payload?.action, 'primitive.tab.open');
  assert.match(String(alertCalls[0]?.payload?.message), /Controller connection closed/);
});

test('runTestCommand waits for interrupt on command.test error when wait-for-interrupt is enabled', async () => {
  const previousExitCode = process.exitCode;
  const closeActions: string[] = [];
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
          payload: { data: { tabSessionId: 'tab_wait_1' } },
        } as Envelope;
      }

      if (options.action === 'primitive.tab.close') {
        closeActions.push('primitive.tab.close');
        return {
          messageType: 'result',
          payload: { data: { closed: true, tabSessionId: 'tab_wait_1' } },
        } as Envelope;
      }

      return { messageType: 'result', payload: {} } as Envelope;
    },
    runCommandOnce: async () => ({ messageType: 'result', payload: {} } as Envelope),
    showAclMissingGrantHint: () => {},
    showTestFailureFooterAlert: async () => {},
    sendCommandCancelWithSocket: async () => {},
    resolveTestInfo: async () => ({ openUrl: 'https://www.example.com' }),
    sendCommandWithSocket: () => ({
      requestId: 'req_1',
      response: Promise.resolve({
        messageType: 'error',
        payload: {
          code: 'manual_login_required',
          action: 'command.test',
          message: 'Manual login required for example.com; complete login and rerun sample-cmd',
        },
      } as Envelope),
    }),
    subscribeListenerAndFollow: async () => {},
  };

  let settled = false;

  try {
    process.exitCode = undefined;
    const runPromise = runTestCommand(
      MOCK_SITE,
      MOCK_COMMAND_ID,
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
    assert.deepEqual(closeActions, []);

    process.emit('SIGINT');
    await runPromise;

    assert.deepEqual(closeActions, ['primitive.tab.close']);
  } finally {
    process.exitCode = previousExitCode;
  }
});

test('runTestCommand cleans up config when auto-registered clientId matches', async () => {
  const previousExitCode = process.exitCode;
  let savedConfig: Record<string, unknown> | undefined;
  const ws = {
    readyState: 1,
    close: () => {},
  };

  const deps = {
    loadConfig: () => ({
      relayUrl: 'ws://127.0.0.1:8787?role=controller',
      controllerClientId: 'clt_tester_2',
    }),
    saveConfig: (config: Record<string, unknown>) => { savedConfig = config; },
    deleteClientSecret: async () => true,
    maybeSelfRegisterControllerForTest: async () => ({
      config: { relayUrl: 'ws://127.0.0.1:8787?role=controller' },
      autoRegisteredClientId: 'clt_tester_2',
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
      response: Promise.resolve({
        messageType: 'error',
        payload: { code: 'expected_test_error' },
      } as Envelope),
    }),
    subscribeListenerAndFollow: async () => {},
  };

  try {
    process.exitCode = undefined;
    await runTestCommand(
      MOCK_SITE,
      'getChatMessages',
      {
        tabSession: 'tab_1',
        payload: '{}',
        timeout: '30000',
        authMode: 'auto',
        cleanupTestController: true,
      },
      deps,
    );
  } finally {
    process.exitCode = previousExitCode;
  }

  assert.equal(savedConfig?.controllerClientId, undefined);
  assert.equal(savedConfig?.controllerName, undefined);
});

test('runTestCommand logs cleanup failure without throwing', async () => {
  const previousExitCode = process.exitCode;
  const originalError = console.error;
  let errorOutput = '';
  console.error = (...args: unknown[]) => { errorOutput += args.join(' ') + '\n'; };

  const ws = {
    readyState: 1,
    close: () => {},
  };

  const deps = {
    loadConfig: () => ({
      relayUrl: 'ws://127.0.0.1:8787?role=controller',
      controllerClientId: 'clt_tester_3',
    }),
    saveConfig: () => {},
    deleteClientSecret: async () => true,
    maybeSelfRegisterControllerForTest: async () => ({
      config: { relayUrl: 'ws://127.0.0.1:8787?role=controller' },
      autoRegisteredClientId: 'clt_tester_3',
    }),
    removeControllerClientAtRelay: async () => { throw new Error('relay down'); },
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
      response: Promise.resolve({
        messageType: 'error',
        payload: { code: 'expected_test_error' },
      } as Envelope),
    }),
    subscribeListenerAndFollow: async () => {},
  };

  try {
    process.exitCode = undefined;
    await runTestCommand(
      MOCK_SITE,
      'getChatMessages',
      {
        tabSession: 'tab_1',
        payload: '{}',
        timeout: '30000',
        authMode: 'auto',
        cleanupTestController: true,
      },
      deps,
    );
    assert.ok(errorOutput.includes('relay down'));
  } finally {
    process.exitCode = previousExitCode;
    console.error = originalError;
  }
});

test('runTestCommand prints forbidden_action hint for command.test scope error', async () => {
  const previousExitCode = process.exitCode;
  const originalLog = console.log;
  const originalError = console.error;
  let errorOutput = '';
  console.log = () => {};
  console.error = (...args: unknown[]) => { errorOutput += args.join(' ') + '\n'; };

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
          payload: { data: { tabSessionId: 'tab_1' } },
        } as Envelope;
      }
      return { messageType: 'result', payload: {} } as Envelope;
    },
    runCommandOnce: async () => ({ messageType: 'result', payload: {} } as Envelope),
    showAclMissingGrantHint: () => {},
    showTestFailureFooterAlert: async () => {},
    sendCommandCancelWithSocket: async () => {},
    resolveTestInfo: async () => ({ openUrl: 'https://www.example.com' }),
    sendCommandWithSocket: () => ({
      requestId: 'req_1',
      response: Promise.resolve({
        messageType: 'error',
        payload: {
          code: 'forbidden_action',
          action: 'command.test',
          nodeId: 'node_1',
          message: 'Missing scope',
        },
      } as Envelope),
    }),
    subscribeListenerAndFollow: async () => {},
  };

  try {
    process.exitCode = undefined;
    await runTestCommand(
      MOCK_SITE,
      MOCK_COMMAND_ID,
      {
        tabSession: 'tab_1',
        payload: '{}',
        timeout: '30000',
        authMode: 'auto',
      },
      deps,
    );
    assert.equal(process.exitCode, 1);
    assert.ok(errorOutput.includes('command.test scope'));
    assert.ok(errorOutput.includes('otto client login'));
  } finally {
    process.exitCode = previousExitCode;
    console.log = originalLog;
    console.error = originalError;
  }
});
