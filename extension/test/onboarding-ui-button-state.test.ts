import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Test suite for onboarding UI button state machine.
 * 
 * This test verifies that the Connect/Disconnect button properly tracks
 * pending action state using a local variable (not HTML dataset), so that
 * button state transitions work correctly even after sync() calls.
 * 
 * Regression: https://github.com/telepat-io/otto/issues/XXXX
 * Previous implementation stored pendingAction in refs.connectButton.dataset,
 * which lost type information at runtime and kept button disabled.
 */

/**
 * Mock the key parts of render() and button state logic
 * to verify the button state machine works correctly.
 */
function createButtonStateMock() {
  const button = {
    textContent: 'Connect',
    disabled: false,
    classList: new Set<string>(),
  };

  let pendingAction: 'connect' | 'disconnect' | null = null;

  const render = (state: string, currentPendingAction: 'connect' | 'disconnect' | null) => {
    const isConnected = state === 'authenticated_connected';
    const isConnecting = !isConnected && (currentPendingAction === 'connect' || state === 'authenticated_connecting');
    const isDisconnecting = currentPendingAction === 'disconnect';

    if (isDisconnecting) {
      button.textContent = 'Disconnecting...';
    } else if (isConnected) {
      button.textContent = 'Disconnect';
    } else if (isConnecting) {
      button.textContent = 'Connecting...';
    } else {
      button.textContent = 'Connect';
    }
    button.disabled = currentPendingAction !== null;
    if (isConnecting || isDisconnecting) {
      button.classList.add('is-loading');
    } else {
      button.classList.delete('is-loading');
    }
  };

  const setBusy = (action: 'connect' | 'disconnect' | null) => {
    pendingAction = action;
    if (action === 'connect') {
      button.textContent = 'Connecting...';
      button.classList.add('is-loading');
      button.disabled = true;
      return;
    }

    if (action === 'disconnect') {
      button.textContent = 'Disconnecting...';
      button.classList.add('is-loading');
      button.disabled = true;
      return;
    }

    button.classList.delete('is-loading');
    button.disabled = false;
  };

  const sync = (state: string) => {
    render(state, pendingAction);
  };

  return { button, setBusy, sync, getPendingAction: () => pendingAction };
}

test('button shows Connect when disconnected', () => {
  const { button, sync } = createButtonStateMock();
  sync('needs_relay_url');
  assert.equal(button.textContent, 'Connect');
  assert.equal(button.disabled, false);
});

test('button shows Connecting... and disables during connect action', () => {
  const { button, setBusy, sync } = createButtonStateMock();
  sync('needs_relay_url');
  
  setBusy('connect');
  assert.equal(button.textContent, 'Connecting...');
  assert.equal(button.disabled, true);
  assert.ok(button.classList.has('is-loading'));
});

test('button shows Disconnect and enables after connect completes and state is authenticated_connected', () => {
  const { button, setBusy, sync, getPendingAction } = createButtonStateMock();
  
  // Start connect
  setBusy('connect');
  assert.equal(button.textContent, 'Connecting...');
  assert.equal(button.disabled, true);
  
  // Simulate connection completing: clear pending and sync with connected state
  setBusy(null);
  sync('authenticated_connected');
  
  // Button should now show Disconnect and be enabled
  assert.equal(button.textContent, 'Disconnect');
  assert.equal(button.disabled, false);
  assert.ok(!button.classList.has('is-loading'));
  assert.equal(getPendingAction(), null);
});

test('button shows Disconnecting... during disconnect action', () => {
  const { button, setBusy, sync } = createButtonStateMock();
  
  // Start from connected state
  sync('authenticated_connected');
  assert.equal(button.textContent, 'Disconnect');
  assert.equal(button.disabled, false);
  
  // User clicks Disconnect
  setBusy('disconnect');
  assert.equal(button.textContent, 'Disconnecting...');
  assert.equal(button.disabled, true);
  assert.ok(button.classList.has('is-loading'));
});

test('button shows Connect and enables after disconnect completes', () => {
  const { button, setBusy, sync, getPendingAction } = createButtonStateMock();
  
  // Start from connected state
  sync('authenticated_connected');
  
  // User clicks Disconnect
  setBusy('disconnect');
  assert.equal(button.textContent, 'Disconnecting...');
  
  // Disconnect completes: clear pending and sync with authenticated_disconnected state
  setBusy(null);
  sync('authenticated_disconnected');
  
  // Button should show Connect and be enabled
  assert.equal(button.textContent, 'Connect');
  assert.equal(button.disabled, false);
  assert.ok(!button.classList.has('is-loading'));
  assert.equal(getPendingAction(), null);
});

test('button remains enabled after sync() call when no pending action', () => {
  const { button, setBusy, sync } = createButtonStateMock();
  
  // Connected state
  sync('authenticated_connected');
  setBusy(null);
  assert.equal(button.disabled, false);
  
  // Simulate storage update triggering sync without changing pending action
  // Button should stay enabled (not become disabled)
  sync('authenticated_connected');
  assert.equal(button.textContent, 'Disconnect');
  assert.equal(button.disabled, false);
});

test('pending action state survives sync calls and storage updates', () => {
  const { button, setBusy, sync, getPendingAction } = createButtonStateMock();
  
  // Start connecting
  setBusy('connect');
  assert.equal(getPendingAction(), 'connect');
  assert.equal(button.disabled, true);
  
  // Storage update during connection: sync is called but pending action should persist
  sync('authenticated_connecting');
  assert.equal(getPendingAction(), 'connect');
  assert.equal(button.textContent, 'Connecting...');
  assert.equal(button.disabled, true);
  
  // Connection completes: clear pending
  setBusy(null);
  assert.equal(getPendingAction(), null);
  assert.equal(button.disabled, false);
});
