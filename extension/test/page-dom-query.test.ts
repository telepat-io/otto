import assert from 'node:assert/strict';
import test from 'node:test';
import { installPageDomQueryHelpers } from '../src/runtime/page-dom-query.js';

test('installPageDomQueryHelpers installs functions on window', () => {
  const mockWindow = {} as unknown as Window & Record<string, unknown>;
  (global as unknown as Record<string, unknown>).window = mockWindow;

  installPageDomQueryHelpers();

  assert.equal(typeof mockWindow.__ottoDeepQuerySelector, 'function');
  assert.equal(typeof mockWindow.__ottoDeepQuerySelectorAll, 'function');
  assert.equal(typeof mockWindow.__ottoSerializeScriptError, 'function');

  delete (global as unknown as Record<string, unknown>).window;
});

test('installPageDomQueryHelpers is idempotent', () => {
  const mockWindow = {} as unknown as Window & Record<string, unknown>;
  (global as unknown as Record<string, unknown>).window = mockWindow;

  installPageDomQueryHelpers();
  const first = mockWindow.__ottoDeepQuerySelector;
  installPageDomQueryHelpers();
  const second = mockWindow.__ottoDeepQuerySelector;

  assert.equal(first, second);

  delete (global as unknown as Record<string, unknown>).window;
});

test('__ottoSerializeScriptError extracts Error message with colon prefix as code', () => {
  const mockWindow = {} as unknown as Window & Record<string, unknown>;
  (global as unknown as Record<string, unknown>).window = mockWindow;

  installPageDomQueryHelpers();
  const result = (mockWindow.__ottoSerializeScriptError as (error: unknown, fallback: string) => Record<string, unknown>)(new Error('ERR_FAIL: something broke'), 'fallback');
  assert.equal(result.__ottoSerializedCommandError, true);
  assert.equal(result.code, 'ERR_FAIL');
  assert.equal(result.message, 'ERR_FAIL: something broke');

  delete (global as unknown as Record<string, unknown>).window;
});

test('__ottoSerializeScriptError uses string error directly with colon prefix', () => {
  const mockWindow = {} as unknown as Window & Record<string, unknown>;
  (global as unknown as Record<string, unknown>).window = mockWindow;

  installPageDomQueryHelpers();
  const result = (mockWindow.__ottoSerializeScriptError as (error: unknown, fallback: string) => Record<string, unknown>)('ERR_FAIL: plain string error', 'fallback');
  assert.equal(result.code, 'ERR_FAIL');
  assert.equal(result.message, 'ERR_FAIL: plain string error');

  delete (global as unknown as Record<string, unknown>).window;
});

test('__ottoSerializeScriptError falls back for unknown error', () => {
  const mockWindow = {} as unknown as Window & Record<string, unknown>;
  (global as unknown as Record<string, unknown>).window = mockWindow;

  installPageDomQueryHelpers();
  const result = (mockWindow.__ottoSerializeScriptError as (error: unknown, fallback: string) => Record<string, unknown>)(12345, 'fallback');
  assert.equal(result.code, 'fallback');
  assert.equal(result.message, 'fallback');

  delete (global as unknown as Record<string, unknown>).window;
});

test('__ottoSerializeScriptError extracts code prefix from message', () => {
  const mockWindow = {} as unknown as Window & Record<string, unknown>;
  (global as unknown as Record<string, unknown>).window = mockWindow;

  installPageDomQueryHelpers();
  const result = (mockWindow.__ottoSerializeScriptError as (error: unknown, fallback: string) => Record<string, unknown>)(new Error('ERR_TIMEOUT: connection failed'), 'fallback');
  assert.equal(result.code, 'ERR_TIMEOUT');
  assert.ok((result.message as string).includes('connection failed'));

  delete (global as unknown as Record<string, unknown>).window;
});

test('__ottoSerializeScriptError includes diagnostics', () => {
  const mockWindow = {} as unknown as Window & Record<string, unknown>;
  (global as unknown as Record<string, unknown>).window = mockWindow;

  installPageDomQueryHelpers();
  const diagnostics = { step: 3 };
  const result = (mockWindow.__ottoSerializeScriptError as (error: unknown, fallback: string, diagnostics?: unknown) => Record<string, unknown>)(new Error('fail'), 'fallback', diagnostics);
  assert.deepEqual(result.diagnostics, diagnostics);

  delete (global as unknown as Record<string, unknown>).window;
});
