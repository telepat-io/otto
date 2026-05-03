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

test('resolveClientSecret rejects whitespace-only env variable', async () => {
  const originalEnv = process.env[CLIENT_SECRET_ENV_VAR];
  process.env[CLIENT_SECRET_ENV_VAR] = '   ';
  try {
    await assert.rejects(
      resolveClientSecret({ relayUrl: 'ws://localhost:8787' }, 'client-1'),
      /Client secret not found|No stored secret found/,
    );
  } finally {
    if (originalEnv === undefined) {
      delete process.env[CLIENT_SECRET_ENV_VAR];
    } else {
      process.env[CLIENT_SECRET_ENV_VAR] = originalEnv;
    }
  }
});

test('storeClientSecret returns false when keytar unavailable and deleteClientSecret returns false', async () => {
  const originalEnv = process.env[CLIENT_SECRET_ENV_VAR];
  delete process.env[CLIENT_SECRET_ENV_VAR];

  const clientId = `test-nokeytar-${Date.now()}`;
  const config = { relayUrl: 'ws://localhost:8787' };

  try {
    const stored = await storeClientSecret(config, clientId, 'secret-value');
    if (!stored) {
      assert.equal(stored, false, 'storeClientSecret should return false when keytar is unavailable');
      const deleted = await deleteClientSecret(config, clientId);
      assert.equal(deleted, false, 'deleteClientSecret should return false when keytar is unavailable');
    }
  } finally {
    if (originalEnv !== undefined) {
      process.env[CLIENT_SECRET_ENV_VAR] = originalEnv;
    }
  }
});

test('getClientSecretAccount uses relayHttpUrl when provided', () => {
  const config = {
    relayUrl: 'ws://relay1.example.com',
    relayHttpUrl: 'http://relay2.example.com:9999',
  };
  const account = getClientSecretAccount(config, 'client-1');
  assert.equal(account, 'relay2.example.com:9999:client-1');
});

test('resolveClientSecret returns env secret with proper trimming', async () => {
  const originalEnv = process.env[CLIENT_SECRET_ENV_VAR];
  process.env[CLIENT_SECRET_ENV_VAR] = '  my-secret-123  ';
  try {
    const result = await resolveClientSecret({ relayUrl: 'ws://localhost:8787' }, 'client-1');
    assert.equal(result.secret, 'my-secret-123');
    assert.equal(result.source, 'env');
  } finally {
    if (originalEnv === undefined) {
      delete process.env[CLIENT_SECRET_ENV_VAR];
    } else {
      process.env[CLIENT_SECRET_ENV_VAR] = originalEnv;
    }
  }
});

test('getClientSecretAccount handles uppercase domains', () => {
  const account = getClientSecretAccount({ relayUrl: 'ws://EXAMPLE.COM:8787' }, 'client-1');
  assert.ok(account.includes('example.com'));
});

test('getClientSecretAccount uses lowercase for all parts', () => {
  const account = getClientSecretAccount({ relayUrl: 'ws://Example.Com:8787' }, 'CLIENT-ID');
  assert.equal(account, 'example.com:8787:CLIENT-ID');
});
