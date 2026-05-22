import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveCommandAutoOpenUrl,
  resolveCommandDescriptor,
  normalizeHostLike,
  toHttpsUrl,
} from '../src/command-open-url.js';
import { MOCK_SITE, MOCK_COMMAND_ID, MOCK_PRELOAD_HOST } from './test-command-mock.js';

test('resolveCommandAutoOpenUrl returns host when descriptor has no preloadHost', () => {
  const result = resolveCommandAutoOpenUrl(MOCK_SITE, MOCK_COMMAND_ID, []);
  assert.equal(result, 'https://example.com');
});

test('resolveCommandAutoOpenUrl uses preloadHost when available', () => {
  const result = resolveCommandAutoOpenUrl(MOCK_SITE, MOCK_COMMAND_ID, [
    { site: MOCK_SITE, id: MOCK_COMMAND_ID, preloadHost: MOCK_PRELOAD_HOST },
  ]);
  assert.equal(result, 'https://old.example.com');
});

test('resolveCommandAutoOpenUrl returns about:blank when no preloadHost is present even for bare host', () => {
  const result = resolveCommandAutoOpenUrl('example.com', 'test', []);
  assert.equal(result, 'https://example.com');
});

test('resolveCommandDescriptor finds matching descriptor', () => {
  const descriptors = [
    { site: MOCK_SITE, id: MOCK_COMMAND_ID },
    { site: 'google.com', id: 'search' },
  ];
  const result = resolveCommandDescriptor(MOCK_SITE, MOCK_COMMAND_ID, descriptors);
  assert.ok(result);
  assert.equal(result?.site, MOCK_SITE);
});

test('resolveCommandDescriptor normalizes www prefix', () => {
  const descriptors = [{ site: MOCK_SITE, id: MOCK_COMMAND_ID }];
  const result = resolveCommandDescriptor('www.example.com', MOCK_COMMAND_ID, descriptors);
  assert.ok(result);
});

test('resolveCommandDescriptor returns undefined for missing command', () => {
  const result = resolveCommandDescriptor(MOCK_SITE, 'missing', []);
  assert.equal(result, undefined);
});

test('resolveCommandDescriptor returns undefined when site matches but id does not', () => {
  const descriptors = [{ site: MOCK_SITE, id: MOCK_COMMAND_ID }];
  const result = resolveCommandDescriptor(MOCK_SITE, 'search', descriptors);
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
  const descriptors = [{ id: MOCK_COMMAND_ID } as { site?: string; id?: string }];
  const result = resolveCommandDescriptor(MOCK_SITE, MOCK_COMMAND_ID, descriptors);
  assert.equal(result, undefined);
});

test('resolveCommandDescriptor matches descriptor with undefined id', () => {
  const descriptors = [{ site: MOCK_SITE } as { site?: string; id?: string }];
  const result = resolveCommandDescriptor(MOCK_SITE, MOCK_COMMAND_ID, descriptors);
  assert.equal(result, undefined);
});

test('resolveCommandDescriptor returns undefined for empty descriptors', () => {
  const result = resolveCommandDescriptor(MOCK_SITE, MOCK_COMMAND_ID, []);
  assert.equal(result, undefined);
});

test('resolveCommandAutoOpenUrl returns host when descriptor has no preloadHost and descriptor array provided', () => {
  const result = resolveCommandAutoOpenUrl(MOCK_SITE, MOCK_COMMAND_ID, [{ site: MOCK_SITE, id: MOCK_COMMAND_ID }]);
  assert.equal(result, 'https://example.com');
});

test('normalizeHostLike strips www prefix from bare hostname', () => {
  assert.equal(normalizeHostLike('www.example.com'), MOCK_SITE);
});
