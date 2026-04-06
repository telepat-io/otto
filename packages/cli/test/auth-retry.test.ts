import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldAttemptAccessTokenRefreshOnAuthError } from '../src/auth-retry.js';

test('refresh retry is enabled for invalid_access_token auth payload', () => {
  assert.equal(
    shouldAttemptAccessTokenRefreshOnAuthError(new Error('x'), {
      category: 'auth',
      code: 'invalid_access_token',
      message: 'Access token verification failed',
    }),
    true,
  );
});

test('refresh retry is enabled for token_expired auth payload', () => {
  assert.equal(
    shouldAttemptAccessTokenRefreshOnAuthError(new Error('x'), {
      category: 'auth',
      code: 'token_expired',
      message: 'Token has expired',
    }),
    true,
  );
});

test('refresh retry is disabled for non-retryable auth payload code', () => {
  assert.equal(
    shouldAttemptAccessTokenRefreshOnAuthError(new Error('x'), {
      category: 'auth',
      code: 'forbidden_action',
      message: 'Controller token does not allow this action',
    }),
    false,
  );
});

test('refresh retry uses error message fallback when payload is unavailable', () => {
  const error = new Error('Auth failed: {"category":"auth","code":"invalid_access_token","message":"Access token verification failed"}');
  assert.equal(
    shouldAttemptAccessTokenRefreshOnAuthError(error),
    true,
  );
});

test('refresh retry is disabled when neither payload nor message indicates token issue', () => {
  assert.equal(
    shouldAttemptAccessTokenRefreshOnAuthError(new Error('network timeout')),
    false,
  );
});
