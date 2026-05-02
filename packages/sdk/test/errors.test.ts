import assert from 'node:assert/strict';
import test from 'node:test';
import {
  OttoError,
  OttoAuthError,
  OttoTimeoutError,
  OttoCommandError,
} from '../src/errors.js';

test('OttoError is an Error', () => {
  const err = new OttoError('Test error');
  assert.ok(err instanceof Error);
  assert.equal(err.message, 'Test error');
  assert.equal(err.name, 'OttoError');
});

test('OttoAuthError extends OttoError', () => {
  const err = new OttoAuthError('Auth failed');
  assert.ok(err instanceof OttoError);
  assert.ok(err instanceof Error);
  assert.equal(err.message, 'Auth failed');
  assert.equal(err.name, 'OttoAuthError');
});

test('OttoTimeoutError extends OttoError', () => {
  const err = new OttoTimeoutError('Timeout');
  assert.ok(err instanceof OttoError);
  assert.equal(err.message, 'Timeout');
  assert.equal(err.name, 'OttoTimeoutError');
});

test('OttoCommandError extends OttoError with outcome', () => {
  const err = new OttoCommandError('Command failed', 'timed_out');
  assert.ok(err instanceof OttoError);
  assert.equal(err.message, 'Command failed');
  assert.equal(err.commandOutcome, 'timed_out');
  assert.equal(err.name, 'OttoCommandError');
});
