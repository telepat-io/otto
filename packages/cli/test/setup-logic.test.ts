import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldReuseCachedInstall } from '../src/setup-logic.js';

test('shouldReuseCachedInstall returns false when force is true', () => {
  assert.equal(shouldReuseCachedInstall({ relayUrl: '' } as import('../src/config.js').OttoConfig, '1.0.0', true, () => true), false);
});

test('shouldReuseCachedInstall returns false when version mismatch', () => {
  assert.equal(shouldReuseCachedInstall({ extension: { version: '0.9.0' } } as import('../src/config.js').OttoConfig, '1.0.0', false, () => true), false);
});

test('shouldReuseCachedInstall returns false when unpackedPath missing', () => {
  assert.equal(shouldReuseCachedInstall({ extension: { version: '1.0.0' } } as import('../src/config.js').OttoConfig, '1.0.0', false, () => true), false);
});

test('shouldReuseCachedInstall returns false when unpackedPath empty', () => {
  assert.equal(shouldReuseCachedInstall({ extension: { version: '1.0.0', unpackedPath: '' } } as import('../src/config.js').OttoConfig, '1.0.0', false, () => true), false);
});

test('shouldReuseCachedInstall returns false when source is build', () => {
  assert.equal(shouldReuseCachedInstall({ extension: { version: '1.0.0', unpackedPath: '/ext', source: 'build' } } as import('../src/config.js').OttoConfig, '1.0.0', false, () => true), false);
});

test('shouldReuseCachedInstall returns true when valid and exists', () => {
  assert.equal(shouldReuseCachedInstall({ extension: { version: '1.0.0', unpackedPath: '/ext', source: 'download' } } as import('../src/config.js').OttoConfig, '1.0.0', false, () => true), true);
});

test('shouldReuseCachedInstall returns false when valid but not exists', () => {
  assert.equal(shouldReuseCachedInstall({ extension: { version: '1.0.0', unpackedPath: '/ext', source: 'download' } } as import('../src/config.js').OttoConfig, '1.0.0', false, () => false), false);
});

test('deriveRelayPortFromUrl defaults to 443 for wss without port', async () => {
  const { deriveRelayPortFromUrl } = await import('../src/setup-logic.js');
  assert.equal(deriveRelayPortFromUrl('wss://relay.example.com'), 443);
});

test('deriveRelayPortFromUrl defaults to 80 for ws without port', async () => {
  const { deriveRelayPortFromUrl } = await import('../src/setup-logic.js');
  assert.equal(deriveRelayPortFromUrl('ws://relay.example.com'), 80);
});
