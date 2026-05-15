import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRelayInputUrl, normalizeRelaySocketUrl } from '../src/runtime/relay-url.js';

test('normalizeRelayInputUrl keeps query params untouched while normalizing protocol', () => {
  assert.equal(
    normalizeRelayInputUrl('https://relay.example.com/path?token=abc'),
    'wss://relay.example.com/path?token=abc',
  );
  assert.equal(
    normalizeRelayInputUrl('ws://127.0.0.1:8787'),
    'ws://127.0.0.1:8787/',
  );
});

test('normalizeRelayInputUrl rejects unsupported protocols', () => {
  assert.throws(
    () => normalizeRelayInputUrl('ftp://relay.example.com'),
    /Relay URL must use ws:\/\/ or wss:\/\//,
  );
});

test('normalizeRelaySocketUrl appends role=node only when role is missing', () => {
  assert.equal(
    normalizeRelaySocketUrl('wss://relay.example.com/socket'),
    'wss://relay.example.com/socket?role=node',
  );
  assert.equal(
    normalizeRelaySocketUrl('wss://relay.example.com/socket?role=controller'),
    'wss://relay.example.com/socket?role=controller',
  );
});
