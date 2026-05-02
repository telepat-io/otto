import assert from 'node:assert/strict';
import test from 'node:test';
import { OttoClient } from '../src/index.js';
import {
  OttoError,
  OttoAuthError,
  OttoTimeoutError,
  OttoCommandError,
} from '../src/errors.js';

test('OttoClient constructor accepts options', () => {
  const client = new OttoClient({
    relayUrl: 'wss://relay.example.com',
    clientId: 'clt_test',
    clientSecret: 'cs_test',
  });
  assert.ok(client);
});

test('OttoClient has sub-client getters', () => {
  const client = new OttoClient({
    relayUrl: 'wss://relay.example.com',
    clientId: 'clt_test',
    clientSecret: 'cs_test',
  });
  // Verify getters exist without calling them (commands/listeners require connection)
  assert.ok(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(client), 'nodes')?.get);
  assert.ok(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(client), 'commands')?.get);
  assert.ok(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(client), 'listeners')?.get);
  assert.ok(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(client), 'pairing')?.get);
});

test('OttoClient.isConnected returns false initially', () => {
  const client = new OttoClient({
    relayUrl: 'wss://relay.example.com',
    clientId: 'clt_test',
    clientSecret: 'cs_test',
  });
  assert.equal(client.isConnected(), false);
});

test('export OttoError error types', () => {
  assert.ok(OttoError);
  assert.ok(OttoAuthError);
  assert.ok(OttoTimeoutError);
  assert.ok(OttoCommandError);
});
