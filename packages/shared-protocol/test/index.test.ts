import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createEnvelope,
  PROTOCOL_VERSION,
} from '../src/index.js';

test('createEnvelope builds a valid envelope with required fields', () => {
  const envelope = createEnvelope('command', 'controller', 'req-1', { action: 'test' });
  assert.equal(envelope.protocolVersion, PROTOCOL_VERSION);
  assert.equal(envelope.messageType, 'command');
  assert.equal(envelope.requestId, 'req-1');
  assert.equal(envelope.senderRole, 'controller');
  assert.deepEqual(envelope.payload, { action: 'test' });
  assert.equal(typeof envelope.timestamp, 'string');
  assert.ok(envelope.timestamp.length > 0);
  assert.equal(envelope.traceId, undefined);
});

test('createEnvelope includes traceId when provided', () => {
  const envelope = createEnvelope('result', 'node', 'req-2', { ok: true }, 'trace-1');
  assert.equal(envelope.traceId, 'trace-1');
});

test('createEnvelope supports all message types', () => {
  const types = [
    'hello',
    'hello_ack',
    'auth',
    'auth_ack',
    'command',
    'result',
    'error',
    'event',
    'ping',
    'pong',
    'refresh',
    'refresh_ack',
    'tab_lock',
    'tab_unlock',
    'command_cancel',
  ] as const;

  for (const messageType of types) {
    const envelope = createEnvelope(messageType, 'relay', `req-${messageType}`, {});
    assert.equal(envelope.messageType, messageType);
  }
});

test('createEnvelope supports all sender roles', () => {
  const roles = ['controller', 'node', 'relay'] as const;
  for (const senderRole of roles) {
    const envelope = createEnvelope('ping', senderRole, `req-${senderRole}`, {});
    assert.equal(envelope.senderRole, senderRole);
  }
});

test('PROTOCOL_VERSION is 1.0', () => {
  assert.equal(PROTOCOL_VERSION, '1.0');
});
