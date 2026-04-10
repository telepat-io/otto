import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSocketCloseReasonSummary,
  createSocketClosedWhileWaitingError,
  isSocketClosedWhileWaitingError,
  toSocketCloseAlertPayload,
} from '../src/cli/socket-errors.js';

test('createSocketClosedWhileWaitingError returns friendly coded error', () => {
  const error = createSocketClosedWhileWaitingError('primitive.tab.open') as Error & {
    code?: string;
    action?: string;
  };

  assert.equal(error.name, 'SocketClosedBeforeResponseError');
  assert.equal(error.code, 'socket_closed');
  assert.equal(error.action, 'primitive.tab.open');
  assert.match(error.message, /Controller connection closed while waiting for primitive\.tab\.open response/);
  assert.match(error.message, /relay, network, or extension node may have disconnected/);
});

test('toSocketCloseAlertPayload supports legacy socket-close errors', () => {
  const legacy = new Error('Socket closed while waiting for primitive.tab.open response');
  const payload = toSocketCloseAlertPayload(legacy);

  assert.equal(payload?.code, 'socket_closed');
  assert.equal(payload?.action, 'primitive.tab.open');
  assert.match(String(payload?.message), /Controller connection closed while waiting for primitive\.tab\.open response/);
});

test('isSocketClosedWhileWaitingError distinguishes unrelated errors', () => {
  assert.equal(isSocketClosedWhileWaitingError(new Error('Socket closed while waiting for command.run response')), true);
  assert.equal(isSocketClosedWhileWaitingError(new Error('Timed out waiting for terminal response')), false);
});

test('buildSocketCloseReasonSummary handles missing action', () => {
  const summary = buildSocketCloseReasonSummary();
  assert.match(summary, /^Controller connection closed\./);
  assert.match(summary, /otto status/);
});
