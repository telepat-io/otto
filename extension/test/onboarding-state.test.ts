import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveOnboardingState } from '../src/runtime/onboarding/state.js';

test('deriveOnboardingState returns needs_relay_url when relay URL is missing', () => {
  const view = deriveOnboardingState({
    nodeId: 'node_abc',
  });

  assert.equal(view.state, 'needs_relay_url');
  assert.equal(view.badgeText, 'SET');
});

test('deriveOnboardingState returns waiting_for_pair_approval when pairing code exists', () => {
  const view = deriveOnboardingState({
    relayUrl: 'ws://127.0.0.1:8787?role=node',
    nodeId: 'node_abc',
    pairingCode: '123-456',
  });

  assert.equal(view.state, 'waiting_for_pair_approval');
  assert.equal(view.pairingCode, '123-456');
  assert.equal(view.badgeText, 'PAIR');
});

test('deriveOnboardingState returns authenticated_connecting when token exists without connected socket', () => {
  const view = deriveOnboardingState({
    relayUrl: 'ws://127.0.0.1:8787?role=node',
    nodeId: 'node_abc',
    nodeAccessToken: 'token',
    relayConnectionStatus: 'connecting',
  });

  assert.equal(view.state, 'authenticated_connecting');
  assert.equal(view.badgeText, 'AUTH');
});

test('deriveOnboardingState returns authenticated_connected when auth socket status is connected', () => {
  const view = deriveOnboardingState({
    relayUrl: 'ws://127.0.0.1:8787?role=node',
    nodeId: 'node_abc',
    nodeAccessToken: 'token',
    relayConnectionStatus: 'authenticated_connected',
  });

  assert.equal(view.state, 'authenticated_connected');
  assert.equal(view.badgeText, 'OK');
});

test('deriveOnboardingState returns version_mismatch when relay and extension versions differ', () => {
  const view = deriveOnboardingState({
    relayUrl: 'ws://127.0.0.1:8787?role=node',
    nodeId: 'node_abc',
    nodeAccessToken: 'token',
    relayConnectionStatus: 'authenticated_connected',
    relayVersion: '0.3.0',
    extensionVersion: '0.2.0',
  });

  assert.equal(view.state, 'version_mismatch');
  assert.equal(view.badgeText, 'UPDT');
  assert.match(view.detail, /otto extension update/i);
});

test('deriveOnboardingState prioritizes error state when relay error exists', () => {
  const view = deriveOnboardingState({
    relayUrl: 'ws://127.0.0.1:8787?role=node',
    nodeId: 'node_abc',
    relayConnectionStatus: 'error',
    relayConnectionError: 'failed to connect',
    pairingCode: '123-456',
  });

  assert.equal(view.state, 'error');
  assert.equal(view.badgeText, 'ERR');
  assert.match(view.detail, /failed to connect/i);
});
