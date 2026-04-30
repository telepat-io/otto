import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getClientSecretAccount,
  resolveClientSecret,
  storeClientSecret,
  deleteClientSecret,
  CLIENT_SECRET_ENV_VAR,
} from '../src/client-secret-store.js';

test('getClientSecretAccount uses hostname from relayUrl', () => {
  const account = getClientSecretAccount({ relayUrl: 'ws://localhost:8787?role=controller' }, 'client-1');
  assert.equal(account, 'localhost:8787:client-1');
});

test('getClientSecretAccount falls back to relayHttpUrl', () => {
  const account = getClientSecretAccount({ relayUrl: 'ws://localhost:8787', relayHttpUrl: 'http://relay.example.com' }, 'client-1');
  assert.equal(account, 'relay.example.com:client-1');
});

test('getClientSecretAccount lowercases invalid URL', () => {
  const account = getClientSecretAccount({ relayUrl: 'not-a-url' }, 'client-1');
  assert.equal(account, 'not-a-url:client-1');
});

test('resolveClientSecret returns env secret when set', async () => {
  const originalEnv = process.env[CLIENT_SECRET_ENV_VAR];
  process.env[CLIENT_SECRET_ENV_VAR] = 'env-secret';
  try {
    const result = await resolveClientSecret({ relayUrl: 'ws://localhost:8787' }, 'client-1');
    assert.equal(result.secret, 'env-secret');
    assert.equal(result.source, 'env');
  } finally {
    if (originalEnv === undefined) {
      delete process.env[CLIENT_SECRET_ENV_VAR];
    } else {
      process.env[CLIENT_SECRET_ENV_VAR] = originalEnv;
    }
  }
});

test('resolveClientSecret trims env secret', async () => {
  const originalEnv = process.env[CLIENT_SECRET_ENV_VAR];
  process.env[CLIENT_SECRET_ENV_VAR] = '  secret  ';
  try {
    const result = await resolveClientSecret({ relayUrl: 'ws://localhost:8787' }, 'client-1');
    assert.equal(result.secret, 'secret');
  } finally {
    if (originalEnv === undefined) {
      delete process.env[CLIENT_SECRET_ENV_VAR];
    } else {
      process.env[CLIENT_SECRET_ENV_VAR] = originalEnv;
    }
  }
});

test('resolveClientSecret throws when env empty and no stored secret', async () => {
  const originalEnv = process.env[CLIENT_SECRET_ENV_VAR];
  delete process.env[CLIENT_SECRET_ENV_VAR];
  try {
    await assert.rejects(resolveClientSecret({ relayUrl: 'ws://localhost:8787' }, 'client-1'), /Client secret not found|No stored secret found/);
  } finally {
    if (originalEnv !== undefined) {
      process.env[CLIENT_SECRET_ENV_VAR] = originalEnv;
    }
  }
});

test('storeClientSecret and deleteClientSecret round-trip with keychain', async () => {
  const config = { relayUrl: 'ws://localhost:8787' };
  const clientId = `test-client-${Date.now()}`;

  const stored = await storeClientSecret(config, clientId, 'secret-value');
  if (!stored) {
    // keytar unavailable on this platform; skip round-trip assertions
    return;
  }

  const resolved = await resolveClientSecret(config, clientId);
  assert.equal(resolved.secret, 'secret-value');
  assert.equal(resolved.source, 'keychain');

  const deleted = await deleteClientSecret(config, clientId);
  assert.equal(deleted, true);

  await assert.rejects(resolveClientSecret(config, clientId), /No stored secret found/);
});
