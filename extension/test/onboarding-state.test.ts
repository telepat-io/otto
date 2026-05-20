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

test('deriveOnboardingState returns authenticated_disconnected when token exists and socket is not connecting', () => {
  const view = deriveOnboardingState({
    relayUrl: 'ws://127.0.0.1:8787',
    nodeId: 'node_abc',
    nodeAccessToken: 'token',
    relayConnectionStatus: 'disconnected',
  });

  assert.equal(view.state, 'authenticated_disconnected');
  assert.equal(view.badgeText, 'SET');
  assert.match(view.detail, /click connect/i);
});

test('deriveOnboardingState returns authenticated_connected when auth socket status is connected', () => {
  const view = deriveOnboardingState({
    relayUrl: 'ws://127.0.0.1:8787?role=node',
    nodeId: 'node_abc',
    nodeAccessToken: 'token',
    relayConnectionStatus: 'authenticated_connected',
  });

  assert.equal(view.state, 'authenticated_connected');
  assert.equal(view.badgeText, '');
  assert.equal(view.chipText, 'OK');
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
  assert.equal(view.stateLabel, 'Extension update required');
  assert.equal(view.badgeText, 'UPDT');
  assert.match(view.detail, /otto extension update/i);
});

test('deriveOnboardingState returns version_mismatch with relay label when relay is older than extension', () => {
  const view = deriveOnboardingState({
    relayUrl: 'ws://127.0.0.1:8787?role=node',
    nodeId: 'node_abc',
    nodeAccessToken: 'token',
    relayConnectionStatus: 'authenticated_connected',
    relayVersion: '0.8.5',
    extensionVersion: '0.9.0',
  });

  assert.equal(view.state, 'version_mismatch');
  assert.equal(view.stateLabel, 'Relay update required');
  assert.equal(view.badgeText, 'UPDT');
  assert.match(view.detail, /npm i -g @telepat\/otto/i);
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

test('deriveOnboardingState uses default error detail when relayConnectionError is missing', () => {
  const view = deriveOnboardingState({
    relayUrl: 'ws://127.0.0.1:8787?role=node',
    nodeId: 'node_abc',
    relayConnectionStatus: 'error',
  });

  assert.equal(view.state, 'error');
  assert.equal(view.badgeText, 'ERR');
  assert.match(view.detail, /unable to reach relay/i);
});

test('deriveOnboardingState returns connected when only one version is defined', () => {
  const view = deriveOnboardingState({
    relayUrl: 'ws://127.0.0.1:8787?role=node',
    nodeId: 'node_abc',
    nodeAccessToken: 'token',
    relayConnectionStatus: 'authenticated_connected',
    relayVersion: '0.3.0',
  });

  assert.equal(view.state, 'authenticated_connected');
  assert.equal(view.badgeText, '');
  assert.equal(view.chipText, 'OK');
});

test('deriveOnboardingState returns requesting_pairing_code when no token or pairing code', () => {
  const view = deriveOnboardingState({
    relayUrl: 'ws://127.0.0.1:8787?role=node',
    nodeId: 'node_abc',
  });

  assert.equal(view.state, 'requesting_pairing_code');
  assert.equal(view.badgeText, 'PAIR');
});
