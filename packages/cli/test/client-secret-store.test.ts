import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLIENT_SECRET_ENV_VAR,
  getClientSecretAccount,
  resolveClientSecret,
} from '../src/client-secret-store.js';
import type { OttoConfig } from '../src/config.js';

const baseConfig: OttoConfig = {
  relayUrl: 'ws://127.0.0.1:8787?role=controller',
  relayHttpUrl: 'http://127.0.0.1:8787',
};

test('getClientSecretAccount namespaces by relay host and client id', () => {
  const account = getClientSecretAccount(baseConfig, 'clt_abc');
  assert.equal(account, '127.0.0.1:8787:clt_abc');
});

test('resolveClientSecret prefers env var when present', async () => {
  const previous = process.env[CLIENT_SECRET_ENV_VAR];
  process.env[CLIENT_SECRET_ENV_VAR] = 'secret_from_env';

  try {
    const resolved = await resolveClientSecret(baseConfig, 'clt_abc');
    assert.equal(resolved.secret, 'secret_from_env');
    assert.equal(resolved.source, 'env');
  } finally {
    if (typeof previous === 'string') {
      process.env[CLIENT_SECRET_ENV_VAR] = previous;
    } else {
      delete process.env[CLIENT_SECRET_ENV_VAR];
    }
  }
});

test('resolveClientSecret throws when env missing and keychain unavailable', async () => {
  const previous = process.env[CLIENT_SECRET_ENV_VAR];
  delete process.env[CLIENT_SECRET_ENV_VAR];

  try {
    await assert.rejects(
      () => resolveClientSecret(baseConfig, 'clt_missing'),
      /keychain is unavailable|No stored secret found/i,
    );
  } finally {
    if (typeof previous === 'string') {
      process.env[CLIENT_SECRET_ENV_VAR] = previous;
    }
  }
});
