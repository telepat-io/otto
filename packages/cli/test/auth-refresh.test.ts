import assert from 'node:assert/strict';
import test from 'node:test';
import { type OttoConfig } from '../src/config.js';
import { refreshControllerAccessToken } from '../src/auth/refresh.js';

const baseConfig: OttoConfig = {
  relayUrl: 'ws://127.0.0.1:8787/?role=controller',
  relayHttpUrl: 'http://127.0.0.1:8787',
};

test('refreshControllerAccessToken returns null when refresh token missing', async () => {
  const tokens = await refreshControllerAccessToken(baseConfig);
  assert.equal(tokens, null);
});

test('refreshControllerAccessToken returns new access token on success', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({ accessToken: 'new_access_token' }),
    } as Response;
  }) as typeof fetch;

  try {
    const tokens = await refreshControllerAccessToken({
      ...baseConfig,
      controllerRefreshToken: 'refresh_abc',
    });
    assert.deepEqual(tokens, { accessToken: 'new_access_token', refreshToken: undefined });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshControllerAccessToken includes rotated refresh token when present', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({ accessToken: 'new_access_token', refreshToken: 'new_refresh_token' }),
    } as Response;
  }) as typeof fetch;

  try {
    const tokens = await refreshControllerAccessToken({
      ...baseConfig,
      controllerRefreshToken: 'refresh_abc',
    });
    assert.deepEqual(tokens, { accessToken: 'new_access_token', refreshToken: 'new_refresh_token' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshControllerAccessToken returns null on refresh rejection', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return {
      ok: false,
      status: 401,
      json: async () => ({ error: 'invalid_refresh_token' }),
    } as Response;
  }) as typeof fetch;

  try {
    const tokens = await refreshControllerAccessToken({
      ...baseConfig,
      controllerRefreshToken: 'refresh_abc',
    });
    assert.equal(tokens, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshControllerAccessToken throws when response shape is invalid', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({ accessToken: null }),
    } as Response;
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => refreshControllerAccessToken({ ...baseConfig, controllerRefreshToken: 'refresh_abc' }),
      /invalid accessToken/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('refreshControllerAccessToken derives HTTP URL from relayUrl when relayHttpUrl missing', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({ accessToken: 'token' }),
    } as Response;
  }) as typeof fetch;

  try {
    const tokens = await refreshControllerAccessToken({
      relayUrl: 'ws://127.0.0.1:8787/?role=controller',
      controllerRefreshToken: 'refresh_abc',
    });
    assert.equal(tokens?.accessToken, 'token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
