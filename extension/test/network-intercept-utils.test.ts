import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeSite,
  normalizePatterns,
  normalizeHostAllowlist,
  normalizeMimeTypes,
  normalizeBodyLimit,
  headerArrayToRecord,
  getHeaderValue,
  redactHeaders,
  matchesAnyPattern,
  clampBody,
  shouldCaptureMimeType,
  matchesRequestHostAllowlist,
  normalizeMode,
} from '../src/runtime/network-intercept/utils.js';

test('normalizeSite lowercases and trims', () => {
  assert.equal(normalizeSite('  Reddit.COM  '), 'reddit.com');
});

test('normalizePatterns deduplicates and filters empty', () => {
  assert.deepEqual(normalizePatterns(['a', 'b', 'a', '', 123]), ['a', 'b']);
  assert.deepEqual(normalizePatterns(undefined), []);
  assert.deepEqual(normalizePatterns('not-array'), []);
});

test('normalizeHostAllowlist lowercases and deduplicates', () => {
  assert.deepEqual(normalizeHostAllowlist(['Reddit.COM', 'reddit.com', '']), ['reddit.com']);
  assert.deepEqual(normalizeHostAllowlist(undefined), []);
  assert.deepEqual(normalizeHostAllowlist(['EXAMPLE.COM', 123 as unknown as string, 'example.com']), ['example.com']);
});

test('normalizeMimeTypes returns defaults for empty input', () => {
  const defaults = normalizeMimeTypes(undefined);
  assert.ok(defaults.includes('application/json'));
  assert.deepEqual(normalizeMimeTypes(['text/plain', 'text/plain']), ['text/plain']);
  assert.deepEqual(normalizeMimeTypes([123 as unknown as string, '']), defaults);
});

test('headerArrayToRecord converts header array', () => {
  assert.deepEqual(headerArrayToRecord([{ name: 'Content-Type', value: 'application/json' }, { name: '', value: 'x' }]), {
    'Content-Type': 'application/json',
  });
  assert.deepEqual(headerArrayToRecord(undefined), {});
  assert.deepEqual(headerArrayToRecord([{ name: 'X-Custom', value: 42 as unknown as string }]), {
    'X-Custom': '',
  });
  assert.deepEqual(headerArrayToRecord([{ value: 'no-name' } as { name?: string; value?: string }]), {});
});

test('normalizeMimeTypes returns defaults for empty input', () => {
  const defaults = normalizeMimeTypes(undefined);
  assert.ok(defaults.includes('application/json'));
  assert.deepEqual(normalizeMimeTypes(['text/plain', 'text/plain']), ['text/plain']);
});

test('normalizeBodyLimit clamps value', () => {
  assert.equal(normalizeBodyLimit(undefined), 256_000);
  assert.equal(normalizeBodyLimit(500), 1_024);
  assert.equal(normalizeBodyLimit(5_000_000), 2_000_000);
  assert.equal(normalizeBodyLimit(100_000), 100_000);
});

test('headerArrayToRecord converts header array', () => {
  assert.deepEqual(headerArrayToRecord([{ name: 'Content-Type', value: 'application/json' }, { name: '', value: 'x' }]), {
    'Content-Type': 'application/json',
  });
  assert.deepEqual(headerArrayToRecord(undefined), {});
});

test('getHeaderValue performs case-insensitive lookup', () => {
  assert.equal(getHeaderValue({ 'content-type': 'json' }, 'Content-Type'), 'json');
  assert.equal(getHeaderValue({}, 'missing'), undefined);
});

test('redactHeaders redacts sensitive headers', () => {
  const result = redactHeaders({
    'Authorization': 'Bearer token',
    'Cookie': 'session=abc',
    'Content-Type': 'json',
  });
  assert.equal(result?.['Authorization'], '<redacted>');
  assert.equal(result?.['Cookie'], '<redacted>');
  assert.equal(result?.['Content-Type'], 'json');
});

test('redactHeaders returns undefined for undefined input', () => {
  assert.equal(redactHeaders(undefined), undefined);
});

test('matchesAnyPattern matches wildcard patterns', () => {
  assert.equal(matchesAnyPattern('https://example.com/path', ['https://example.com/*']), true);
  assert.equal(matchesAnyPattern('https://example.com/path', []), true);
  assert.equal(matchesAnyPattern('https://example.com/path', ['https://other.com/*']), false);
});

test('clampBody does not truncate small body', () => {
  const result = clampBody('hello', false, 1_000_000);
  assert.equal(result.body, 'hello');
  assert.equal(result.truncated, false);
});

test('clampBody truncates base64 body', () => {
  const longBody = 'a'.repeat(10_000);
  const result = clampBody(longBody, true, 1_024);
  assert.equal(result.truncated, true);
  assert.ok(result.body.length < longBody.length);
});

test('clampBody truncates utf8 body', () => {
  const longBody = 'a'.repeat(10_000);
  const result = clampBody(longBody, false, 1_024);
  assert.equal(result.truncated, true);
  assert.ok(result.body.length < longBody.length);
});

test('shouldCaptureMimeType checks allowed types', () => {
  assert.equal(shouldCaptureMimeType('application/json', ['application/json']), true);
  assert.equal(shouldCaptureMimeType('application/json; charset=utf-8', ['application/json']), true);
  assert.equal(shouldCaptureMimeType('image/png', ['application/json']), false);
  assert.equal(shouldCaptureMimeType(undefined, ['application/json']), false);
});

test('matchesRequestHostAllowlist checks hostname', () => {
  assert.equal(matchesRequestHostAllowlist('https://www.reddit.com/path', ['reddit.com']), true);
  assert.equal(matchesRequestHostAllowlist('https://reddit.com/path', ['reddit.com']), true);
  assert.equal(matchesRequestHostAllowlist('https://evil.com/path', ['reddit.com']), false);
  assert.equal(matchesRequestHostAllowlist('not-a-url', ['reddit.com']), false);
  assert.equal(matchesRequestHostAllowlist('https://reddit.com', []), false);
});

test('normalizeMode defaults to network', () => {
  assert.equal(normalizeMode('fetch'), 'fetch');
  assert.equal(normalizeMode('hybrid'), 'hybrid');
  assert.equal(normalizeMode('network'), 'network');
  assert.equal(normalizeMode(undefined), 'network');
  assert.equal(normalizeMode('invalid'), 'network');
});
