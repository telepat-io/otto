import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldAttemptAccessTokenRefreshOnAuthError } from '../src/auth/retry.js';

test('shouldAttemptAccessTokenRefreshOnAuthError returns true for retryable payload codes', () => {
  assert.equal(shouldAttemptAccessTokenRefreshOnAuthError(new Error('fail'), { category: 'auth', code: 'invalid_access_token' }), true);
  assert.equal(shouldAttemptAccessTokenRefreshOnAuthError(new Error('fail'), { category: 'auth', code: 'token_expired' }), true);
});

test('shouldAttemptAccessTokenRefreshOnAuthError returns false for non-retryable payload codes', () => {
  assert.equal(shouldAttemptAccessTokenRefreshOnAuthError(new Error('fail'), { category: 'auth', code: 'unauthorized' }), false);
  assert.equal(shouldAttemptAccessTokenRefreshOnAuthError(new Error('fail'), { category: 'routing', code: 'invalid_access_token' }), false);
});

test('shouldAttemptAccessTokenRefreshOnAuthError detects retryable codes in error message', () => {
  assert.equal(shouldAttemptAccessTokenRefreshOnAuthError(new Error('{"code":"invalid_access_token"}')), true);
  assert.equal(shouldAttemptAccessTokenRefreshOnAuthError(new Error('{"code":"token_expired"}')), true);
});

test('shouldAttemptAccessTokenRefreshOnAuthError returns false for non-retryable messages', () => {
  assert.equal(shouldAttemptAccessTokenRefreshOnAuthError(new Error('random error')), false);
  assert.equal(shouldAttemptAccessTokenRefreshOnAuthError('random error'), false);
});

test('shouldAttemptAccessTokenRefreshOnAuthError handles undefined error', () => {
  assert.equal(shouldAttemptAccessTokenRefreshOnAuthError(undefined), false);
});
