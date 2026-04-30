import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDebuggerFocusEmulationManager,
  DebuggerFocusEmulationError,
} from '../src/runtime/debugger-focus-emulation.js';

type DetachListener = (source: chrome.debugger.Debuggee, reason: string) => void;

type MockOptions = {
  disableDebugger?: boolean;
  attachError?: unknown;
  sendCommandErrorByMethod?: Record<string, unknown>;
};

type MockChrome = {
  chromeApi: typeof chrome;
  runtimeMessages: Array<{ type?: string; payload?: unknown }>;
  attachCalls: number;
  detachCalls: number;
  sendCommands: Array<{ method: string; params: unknown }>;
  emitDetach: (tabId: number, reason?: string) => void;
};

function createMockChrome(options: MockOptions = {}): MockChrome {
  const runtimeMessages: Array<{ type?: string; payload?: unknown }> = [];
  const sendCommands: Array<{ method: string; params: unknown }> = [];
  const detachListeners = new Set<DetachListener>();
  let attachCalls = 0;
  let detachCalls = 0;

  const debuggerApi = options.disableDebugger
    ? undefined
    : {
      onDetach: {
        addListener(listener: DetachListener) {
          detachListeners.add(listener);
        },
      },
      async attach() {
        attachCalls += 1;
        if (options.attachError !== undefined) {
          throw options.attachError;
        }
      },
      async detach() {
        detachCalls += 1;
      },
      async sendCommand(_target: chrome.debugger.Debuggee, method: string, params?: unknown) {
        sendCommands.push({ method, params });
        if (Object.prototype.hasOwnProperty.call(options.sendCommandErrorByMethod ?? {}, method)) {
          throw options.sendCommandErrorByMethod?.[method];
        }
        return {};
      },
    };

  const chromeApi = {
    runtime: {
      async sendMessage(message: { type?: string; payload?: unknown }) {
        runtimeMessages.push(message);
      },
    },
    debugger: debuggerApi,
  } as unknown as typeof chrome;

  return {
    chromeApi,
    runtimeMessages,
    get attachCalls() {
      return attachCalls;
    },
    get detachCalls() {
      return detachCalls;
    },
    sendCommands,
    emitDetach(tabId: number, reason = 'target_closed') {
      for (const listener of detachListeners) {
        listener({ tabId }, reason);
      }
    },
  };
}

function extractDebugTypes(messages: Array<{ type?: string; payload?: unknown }>): string[] {
  return messages
    .filter((entry) => entry.type === 'otto.extensionLog')
    .map((entry) => {
      const payload = entry.payload as { type?: unknown };
      return typeof payload?.type === 'string' ? payload.type : '';
    })
    .filter((value) => value.length > 0);
}

test('ensureForTab fails deterministically when debugger api is unavailable', async () => {
  const mock = createMockChrome({ disableDebugger: true });
  const manager = createDebuggerFocusEmulationManager(mock.chromeApi);

  await assert.rejects(
    () => manager.ensureForTab(101),
    (error: unknown) => {
      assert.ok(error instanceof DebuggerFocusEmulationError);
      assert.equal(error.code, 'debugger_focus_unavailable');
      assert.equal(error.retryable, false);
      return true;
    },
  );

  const debugTypes = extractDebugTypes(mock.runtimeMessages);
  assert.ok(debugTypes.includes('debugger_focus.unavailable'));
});

test('ensureForTab attaches and enables once per tab when owned', async () => {
  const mock = createMockChrome();
  const manager = createDebuggerFocusEmulationManager(mock.chromeApi);

  await manager.ensureForTab(101);
  await manager.ensureForTab(101);

  assert.equal(mock.attachCalls, 1);
  const enableCalls = mock.sendCommands.filter((entry) => entry.method === 'Emulation.setFocusEmulationEnabled');
  assert.equal(enableCalls.length, 1);
  assert.deepEqual(enableCalls[0]?.params, { enabled: true });

  const debugTypes = extractDebugTypes(mock.runtimeMessages);
  assert.ok(debugTypes.includes('debugger_focus.enabled'));
  assert.ok(debugTypes.includes('debugger_focus.ensure_skipped_already_attached'));
});

test('ensureForTab reuses existing attachment on attach conflict when command routing works', async () => {
  const mock = createMockChrome({
    attachError: new Error('Another debugger is already attached to the tab'),
  });
  const manager = createDebuggerFocusEmulationManager(mock.chromeApi);

  await manager.ensureForTab(101);
  await manager.stopForTab(101);

  assert.equal(mock.attachCalls, 1);
  const enableCalls = mock.sendCommands.filter((entry) => entry.method === 'Emulation.setFocusEmulationEnabled');
  assert.equal(enableCalls.length, 2);
  assert.deepEqual(enableCalls[0]?.params, { enabled: true });
  assert.deepEqual(enableCalls[1]?.params, { enabled: false });
  assert.equal(mock.detachCalls, 0);

  const debugTypes = extractDebugTypes(mock.runtimeMessages);
  assert.ok(debugTypes.includes('debugger_focus.reused_existing_attachment'));
  assert.ok(debugTypes.includes('debugger_focus.detach_skipped_shared_attachment'));
});

test('ensureForTab returns conflict error when attach conflict cannot be reused', async () => {
  const mock = createMockChrome({
    attachError: new Error('Another debugger is already attached to the tab'),
    sendCommandErrorByMethod: {
      'Emulation.setFocusEmulationEnabled': new Error('Not attached'),
    },
  });
  const manager = createDebuggerFocusEmulationManager(mock.chromeApi);

  await assert.rejects(
    () => manager.ensureForTab(101),
    (error: unknown) => {
      assert.ok(error instanceof DebuggerFocusEmulationError);
      assert.equal(error.code, 'debugger_focus_conflict');
      assert.equal(error.retryable, false);
      return true;
    },
  );

  const debugTypes = extractDebugTypes(mock.runtimeMessages);
  assert.ok(debugTypes.includes('debugger_focus.attach_conflict_detected'));
  assert.ok(debugTypes.includes('debugger_focus.reuse_failed'));
});

test('ensureForTab classifies attach permission errors as non-retryable', async () => {
  const mock = createMockChrome({
    attachError: new Error('Cannot access a chrome:// URL'),
  });
  const manager = createDebuggerFocusEmulationManager(mock.chromeApi);

  await assert.rejects(
    () => manager.ensureForTab(101),
    (error: unknown) => {
      assert.ok(error instanceof DebuggerFocusEmulationError);
      assert.equal(error.code, 'debugger_focus_permission_denied');
      assert.equal(error.retryable, false);
      return true;
    },
  );
});

test('ensureForTab classifies generic attach failures as retryable', async () => {
  const mock = createMockChrome({
    attachError: new Error('Attach transport failed'),
  });
  const manager = createDebuggerFocusEmulationManager(mock.chromeApi);

  await assert.rejects(
    () => manager.ensureForTab(101),
    (error: unknown) => {
      assert.ok(error instanceof DebuggerFocusEmulationError);
      assert.equal(error.code, 'debugger_focus_attach_failed');
      assert.equal(error.retryable, true);
      return true;
    },
  );
});

test('ensureForTab detaches owned attachment when focus command fails', async () => {
  const mock = createMockChrome({
    sendCommandErrorByMethod: {
      'Emulation.setFocusEmulationEnabled': new Error('CDP command failed'),
    },
  });
  const manager = createDebuggerFocusEmulationManager(mock.chromeApi);

  await assert.rejects(
    () => manager.ensureForTab(101),
    (error: unknown) => {
      assert.ok(error instanceof DebuggerFocusEmulationError);
      assert.equal(error.code, 'debugger_focus_command_failed');
      assert.equal(error.retryable, true);
      return true;
    },
  );

  assert.equal(mock.detachCalls, 1);
  const debugTypes = extractDebugTypes(mock.runtimeMessages);
  assert.ok(debugTypes.includes('debugger_focus.detach_after_enable_failure'));
  assert.ok(debugTypes.includes('debugger_focus.enable_failed'));
});

test('stopForTab detaches owned attachment and clears tab state', async () => {
  const mock = createMockChrome();
  const manager = createDebuggerFocusEmulationManager(mock.chromeApi);

  await manager.ensureForTab(101);
  await manager.stopForTab(101);
  await manager.stopForTab(101);

  assert.equal(mock.detachCalls, 1);
  const enableCalls = mock.sendCommands.filter((entry) => entry.method === 'Emulation.setFocusEmulationEnabled');
  assert.equal(enableCalls.length, 2);
  assert.deepEqual(enableCalls[1]?.params, { enabled: false });

  const debugTypes = extractDebugTypes(mock.runtimeMessages);
  assert.ok(debugTypes.includes('debugger_focus.detached_owned_attachment'));
  assert.ok(debugTypes.includes('debugger_focus.stop_skipped_not_attached'));
});

test('stopForTab still detaches owned attachment when disable command fails', async () => {
  const mock = createMockChrome();
  const manager = createDebuggerFocusEmulationManager(mock.chromeApi);

  await manager.ensureForTab(101);

  const originalSendCommand = (mock.chromeApi.debugger as unknown as {
    sendCommand: (target: chrome.debugger.Debuggee, method: string, params?: unknown) => Promise<unknown>;
  }).sendCommand;

  (mock.chromeApi.debugger as unknown as {
    sendCommand: (target: chrome.debugger.Debuggee, method: string, params?: unknown) => Promise<unknown>;
  }).sendCommand = async (target, method, params) => {
    if (method === 'Emulation.setFocusEmulationEnabled' && (params as { enabled?: boolean })?.enabled === false) {
      throw new Error('Disable failed');
    }
    return originalSendCommand(target, method, params);
  };

  await manager.stopForTab(101);

  assert.equal(mock.detachCalls, 1);
});

test('onDetach listener clears state and prevents extra detach on stopForTab', async () => {
  const mock = createMockChrome();
  const manager = createDebuggerFocusEmulationManager(mock.chromeApi);

  await manager.ensureForTab(101);
  mock.emitDetach(101, 'target_closed');
  await manager.stopForTab(101);

  assert.equal(mock.detachCalls, 0);
  const debugTypes = extractDebugTypes(mock.runtimeMessages);
  assert.ok(debugTypes.includes('debugger_focus.stop_skipped_not_attached'));
});

test('stopForTab handles unavailable debugger API', async () => {
  const mock = createMockChrome({ disableDebugger: true });
  const manager = createDebuggerFocusEmulationManager(mock.chromeApi);

  await manager.ensureForTab(101).catch(() => undefined);
  await manager.stopForTab(101);

  const debugTypes = extractDebugTypes(mock.runtimeMessages);
  assert.ok(debugTypes.includes('debugger_focus.stop_without_debugger_api'));
});

test('stopForTab ignores detach failures for closed tabs', async () => {
  const mock = createMockChrome();
  const manager = createDebuggerFocusEmulationManager(mock.chromeApi);

  await manager.ensureForTab(101);

  const originalDetach = (mock.chromeApi.debugger as unknown as {
    detach: (target: chrome.debugger.Debuggee) => Promise<void>;
  }).detach;

  (mock.chromeApi.debugger as unknown as {
    detach: (target: chrome.debugger.Debuggee) => Promise<void>;
  }).detach = async () => {
    throw new Error('detach failed');
  };

  await manager.stopForTab(101);

  const debugTypes = extractDebugTypes(mock.runtimeMessages);
  assert.ok(debugTypes.includes('debugger_focus.detach_skipped_shared_attachment') || debugTypes.includes('debugger_focus.stopped'));

  (mock.chromeApi.debugger as unknown as {
    detach: (target: chrome.debugger.Debuggee) => Promise<void>;
  }).detach = originalDetach;
});

test('ensureForTab detaches owned attachment when focus command fails and detach also fails', async () => {
  const mock = createMockChrome({
    sendCommandErrorByMethod: {
      'Emulation.setFocusEmulationEnabled': new Error('CDP command failed'),
    },
  });

  const originalDetach = (mock.chromeApi.debugger as unknown as {
    detach: (target: chrome.debugger.Debuggee) => Promise<void>;
  }).detach;

  (mock.chromeApi.debugger as unknown as {
    detach: (target: chrome.debugger.Debuggee) => Promise<void>;
  }).detach = async () => {
    throw new Error('detach failed');
  };

  const manager = createDebuggerFocusEmulationManager(mock.chromeApi);

  await assert.rejects(
    () => manager.ensureForTab(101),
    (error: unknown) => {
      assert.ok(error instanceof DebuggerFocusEmulationError);
      assert.equal(error.code, 'debugger_focus_command_failed');
      return true;
    },
  );

  // Restore detach for cleanup
  (mock.chromeApi.debugger as unknown as {
    detach: (target: chrome.debugger.Debuggee) => Promise<void>;
  }).detach = originalDetach;
});