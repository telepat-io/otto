import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveCommandAutoOpenUrl,
  resolveCommandDescriptor,
  normalizeHostLike,
  toHttpsUrl,
} from '../src/command-open-url.js';

test('resolveCommandAutoOpenUrl returns default https URL', () => {
  const result = resolveCommandAutoOpenUrl('reddit.com', 'getFeed', []);
  assert.equal(result, 'https://reddit.com');
});

test('resolveCommandAutoOpenUrl uses preloadHost when available', () => {
  const result = resolveCommandAutoOpenUrl('reddit.com', 'getFeed', [
    { site: 'reddit.com', id: 'getFeed', preloadHost: 'old.reddit.com' },
  ]);
  assert.equal(result, 'https://old.reddit.com');
});

test('resolveCommandAutoOpenUrl adds https to bare host', () => {
  const result = resolveCommandAutoOpenUrl('example.com', 'test', []);
  assert.equal(result, 'https://example.com');
});

test('resolveCommandDescriptor finds matching descriptor', () => {
  const descriptors = [
    { site: 'reddit.com', id: 'getFeed' },
    { site: 'google.com', id: 'search' },
  ];
  const result = resolveCommandDescriptor('reddit.com', 'getFeed', descriptors);
  assert.ok(result);
  assert.equal(result?.site, 'reddit.com');
});

test('resolveCommandDescriptor normalizes www prefix', () => {
  const descriptors = [{ site: 'reddit.com', id: 'getFeed' }];
  const result = resolveCommandDescriptor('www.reddit.com', 'getFeed', descriptors);
  assert.ok(result);
});

test('resolveCommandDescriptor returns undefined for missing command', () => {
  const result = resolveCommandDescriptor('reddit.com', 'missing', []);
  assert.equal(result, undefined);
});

test('resolveCommandDescriptor returns undefined when site matches but id does not', () => {
  const descriptors = [{ site: 'reddit.com', id: 'getFeed' }];
  const result = resolveCommandDescriptor('reddit.com', 'search', descriptors);
  assert.equal(result, undefined);
});

test('normalizeHostLike returns empty for empty string', () => {
  assert.equal(normalizeHostLike(''), '');
});

test('normalizeHostLike returns empty for whitespace', () => {
  assert.equal(normalizeHostLike('   '), '');
});

test('normalizeHostLike normalizes URL hostname', () => {
  assert.equal(normalizeHostLike('https://WWW.Example.COM'), 'example.com');
});

test('normalizeHostLike lowercases invalid URL', () => {
  assert.equal(normalizeHostLike('NotAUrl'), 'notaurl');
});

test('toHttpsUrl leaves https unchanged', () => {
  assert.equal(toHttpsUrl('https://example.com'), 'https://example.com');
});

test('toHttpsUrl leaves http unchanged', () => {
  assert.equal(toHttpsUrl('http://example.com'), 'http://example.com');
});

test('toHttpsUrl adds https to bare host', () => {
  assert.equal(toHttpsUrl('example.com'), 'https://example.com');
});

test('resolveCommandDescriptor matches descriptor with undefined site', () => {
  const descriptors = [{ id: 'getFeed' } as { site?: string; id?: string }];
  const result = resolveCommandDescriptor('reddit.com', 'getFeed', descriptors);
  assert.equal(result, undefined);
});

test('resolveCommandDescriptor matches descriptor with undefined id', () => {
  const descriptors = [{ site: 'reddit.com' } as { site?: string; id?: string }];
  const result = resolveCommandDescriptor('reddit.com', 'getFeed', descriptors);
  assert.equal(result, undefined);
});

test('resolveCommandDescriptor returns undefined for empty descriptors', () => {
  const result = resolveCommandDescriptor('reddit.com', 'getFeed', []);
  assert.equal(result, undefined);
});

test('resolveCommandAutoOpenUrl returns default url when descriptor has no preloadHost', () => {
  const result = resolveCommandAutoOpenUrl('reddit.com', 'getFeed', [{ site: 'reddit.com', id: 'getFeed' }]);
  assert.equal(result, 'https://reddit.com');
});

test('normalizeHostLike strips www prefix from bare hostname', () => {
  assert.equal(normalizeHostLike('www.reddit.com'), 'reddit.com');
});
