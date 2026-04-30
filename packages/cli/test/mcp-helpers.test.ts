import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeControllerRelayUrl, getRelayHttpBase } from '../src/mcp/otto-mcp-helpers.js';
import type { OttoConfig } from '../src/config.js';

test('normalizeControllerRelayUrl adds role=controller when missing', () => {
  const result = normalizeControllerRelayUrl('ws://localhost:8787');
  assert.ok(result.includes('role=controller'));
});

test('normalizeControllerRelayUrl preserves existing role=controller', () => {
  const result = normalizeControllerRelayUrl('ws://localhost:8787?role=controller');
  assert.ok(result.includes('role=controller'));
  // Should not have duplicate role params
  const url = new URL(result);
  assert.equal(url.searchParams.getAll('role').length, 1);
});

test('normalizeControllerRelayUrl rejects http protocol', () => {
  assert.throws(
    () => normalizeControllerRelayUrl('http://localhost:8787'),
    /relayUrl must use ws:\/\/ or wss:\/\//,
  );
});

test('normalizeControllerRelayUrl rejects https protocol', () => {
  assert.throws(
    () => normalizeControllerRelayUrl('https://localhost:8787'),
    /relayUrl must use ws:\/\/ or wss:\/\//,
  );
});

test('normalizeControllerRelayUrl accepts wss protocol', () => {
  const result = normalizeControllerRelayUrl('wss://relay.example.com');
  assert.ok(result.startsWith('wss://'));
  assert.ok(result.includes('role=controller'));
});

test('getRelayHttpBase uses relayHttpUrl when set', () => {
  const config: OttoConfig = {
    relayUrl: 'ws://localhost:8787?role=controller',
    relayHttpUrl: 'http://custom-host:9999',
  };
  assert.equal(getRelayHttpBase(config), 'http://custom-host:9999');
});

test('getRelayHttpBase derives http from ws when relayHttpUrl not set', () => {
  const config: OttoConfig = {
    relayUrl: 'ws://localhost:8787?role=controller',
  };
  const result = getRelayHttpBase(config);
  assert.ok(result.startsWith('http://'));
  assert.ok(result.includes('localhost:8787'));
});

test('getRelayHttpBase derives https from wss when relayHttpUrl not set', () => {
  const config: OttoConfig = {
    relayUrl: 'wss://relay.example.com/?role=controller',
  };
  const result = getRelayHttpBase(config);
  assert.ok(result.startsWith('https://'));
  assert.ok(result.includes('relay.example.com'));
});
