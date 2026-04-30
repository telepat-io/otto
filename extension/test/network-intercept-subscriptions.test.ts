import assert from 'node:assert/strict';
import test from 'node:test';
import {
  tabRequiresFetch,
  buildFetchPatterns,
  matchingSubscriptions,
  matchingSubscriptionsForUrl,
} from '../src/runtime/network-intercept/subscriptions.js';

test('tabRequiresFetch returns false when no tab state', () => {
  assert.equal(tabRequiresFetch(new Map(), new Map(), 1), false);
});

test('tabRequiresFetch returns true for fetch mode subscription', () => {
  const tabStates = new Map([[1, { tabId: 1, attached: true, subscriptions: new Set(['sub-1']) }]]);
  const subscriptions = new Map([['sub-1', { requestId: 'sub-1', tabId: 1, tabSessionId: 't1', site: 'reddit.com', urlPatterns: [], requestHostAllowlist: [], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'fetch' as const, mimeTypes: [], emitToRelay: true }]]);
  assert.equal(tabRequiresFetch(tabStates, subscriptions, 1), true);
});

test('tabRequiresFetch returns true for hybrid mode', () => {
  const tabStates = new Map([[1, { tabId: 1, attached: true, subscriptions: new Set(['sub-1']) }]]);
  const subscriptions = new Map([['sub-1', { requestId: 'sub-1', tabId: 1, tabSessionId: 't1', site: 'reddit.com', urlPatterns: [], requestHostAllowlist: [], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'hybrid' as const, mimeTypes: [], emitToRelay: true }]]);
  assert.equal(tabRequiresFetch(tabStates, subscriptions, 1), true);
});

test('tabRequiresFetch returns false for network mode only', () => {
  const tabStates = new Map([[1, { tabId: 1, attached: true, subscriptions: new Set(['sub-1']) }]]);
  const subscriptions = new Map([['sub-1', { requestId: 'sub-1', tabId: 1, tabSessionId: 't1', site: 'reddit.com', urlPatterns: [], requestHostAllowlist: [], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'network' as const, mimeTypes: [], emitToRelay: true }]]);
  assert.equal(tabRequiresFetch(tabStates, subscriptions, 1), false);
});

test('buildFetchPatterns returns wildcard when no patterns', () => {
  const tabStates = new Map([[1, { tabId: 1, attached: true, subscriptions: new Set(['sub-1']) }]]);
  const subscriptions = new Map([['sub-1', { requestId: 'sub-1', tabId: 1, tabSessionId: 't1', site: 'reddit.com', urlPatterns: [], requestHostAllowlist: [], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'fetch' as const, mimeTypes: [], emitToRelay: true }]]);
  const patterns = buildFetchPatterns(tabStates, subscriptions, 1);
  assert.deepEqual(patterns, [{ urlPattern: '*', requestStage: 'Response' }]);
});

test('buildFetchPatterns returns unique patterns from subscriptions', () => {
  const tabStates = new Map([[1, { tabId: 1, attached: true, subscriptions: new Set(['sub-1', 'sub-2']) }]]);
  const subscriptions = new Map([
    ['sub-1', { requestId: 'sub-1', tabId: 1, tabSessionId: 't1', site: 'reddit.com', urlPatterns: ['https://a.com/*'], requestHostAllowlist: [], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'fetch' as const, mimeTypes: [], emitToRelay: true }],
    ['sub-2', { requestId: 'sub-2', tabId: 1, tabSessionId: 't1', site: 'reddit.com', urlPatterns: ['https://a.com/*', 'https://b.com/*'], requestHostAllowlist: [], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'hybrid' as const, mimeTypes: [], emitToRelay: true }],
  ]);
  const patterns = buildFetchPatterns(tabStates, subscriptions, 1);
  assert.equal(patterns.length, 2);
});

test('matchingSubscriptions filters by pattern, site, host, and mimeType', () => {
  const tabStates = new Map([[1, { tabId: 1, attached: true, subscriptions: new Set(['sub-1', 'sub-2', 'sub-3']) }]]);
  const subscriptions = new Map([
    ['sub-1', { requestId: 'sub-1', tabId: 1, tabSessionId: 't1', site: 'reddit.com', urlPatterns: ['https://reddit.com/*'], requestHostAllowlist: [], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'network' as const, mimeTypes: ['application/json'], emitToRelay: true }],
    ['sub-2', { requestId: 'sub-2', tabId: 1, tabSessionId: 't1', site: 'google.com', urlPatterns: ['https://reddit.com/*'], requestHostAllowlist: ['reddit.com'], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'network' as const, mimeTypes: ['application/json'], emitToRelay: true }],
    ['sub-3', { requestId: 'sub-3', tabId: 1, tabSessionId: 't1', site: 'reddit.com', urlPatterns: ['https://other.com/*'], requestHostAllowlist: [], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'network' as const, mimeTypes: ['application/json'], emitToRelay: true }],
  ]);

  const matches = matchingSubscriptions(tabStates, subscriptions, 1, {
    url: 'https://reddit.com/r/test',
    status: 200,
    mimeType: 'application/json',
  });

  assert.equal(matches.length, 2);
  assert.ok(matches.some((s) => s.requestId === 'sub-1'));
  assert.ok(matches.some((s) => s.requestId === 'sub-2'));
});

test('matchingSubscriptionsForUrl filters without mimeType check', () => {
  const tabStates = new Map([[1, { tabId: 1, attached: true, subscriptions: new Set(['sub-1', 'sub-2']) }]]);
  const subscriptions = new Map([
    ['sub-1', { requestId: 'sub-1', tabId: 1, tabSessionId: 't1', site: 'reddit.com', urlPatterns: ['https://reddit.com/*'], requestHostAllowlist: [], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'network' as const, mimeTypes: [], emitToRelay: true }],
    ['sub-2', { requestId: 'sub-2', tabId: 1, tabSessionId: 't1', site: 'google.com', urlPatterns: ['https://other.com/*'], requestHostAllowlist: [], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'network' as const, mimeTypes: [], emitToRelay: true }],
  ]);

  const matches = matchingSubscriptionsForUrl(tabStates, subscriptions, 1, 'https://reddit.com/r/test');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].requestId, 'sub-1');
});

test('matchingSubscriptionsForUrl returns empty when no tab state', () => {
  const matches = matchingSubscriptionsForUrl(new Map(), new Map(), 1, 'https://reddit.com/r/test');
  assert.equal(matches.length, 0);
});

test('matchingSubscriptionsForUrl skips missing subscriptions', () => {
  const tabStates = new Map([[1, { tabId: 1, attached: true, subscriptions: new Set(['sub-missing']) }]]);
  const matches = matchingSubscriptionsForUrl(tabStates, new Map(), 1, 'https://reddit.com/r/test');
  assert.equal(matches.length, 0);
});

test('matchingSubscriptionsForUrl filters by site and host allowlist', () => {
  const tabStates = new Map([[1, { tabId: 1, attached: true, subscriptions: new Set(['sub-1', 'sub-2']) }]]);
  const subscriptions = new Map([
    ['sub-1', { requestId: 'sub-1', tabId: 1, tabSessionId: 't1', site: 'google.com', urlPatterns: ['https://reddit.com/*'], requestHostAllowlist: [], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'network' as const, mimeTypes: [], emitToRelay: true }],
    ['sub-2', { requestId: 'sub-2', tabId: 1, tabSessionId: 't1', site: 'google.com', urlPatterns: ['https://reddit.com/*'], requestHostAllowlist: ['reddit.com'], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'network' as const, mimeTypes: [], emitToRelay: true }],
  ]);

  const matches = matchingSubscriptionsForUrl(tabStates, subscriptions, 1, 'https://reddit.com/r/test');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].requestId, 'sub-2');
});

test('matchingSubscriptions filters by mimeType', () => {
  const tabStates = new Map([[1, { tabId: 1, attached: true, subscriptions: new Set(['sub-1', 'sub-2']) }]]);
  const subscriptions = new Map([
    ['sub-1', { requestId: 'sub-1', tabId: 1, tabSessionId: 't1', site: 'reddit.com', urlPatterns: ['https://reddit.com/*'], requestHostAllowlist: [], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'network' as const, mimeTypes: ['application/json'], emitToRelay: true }],
    ['sub-2', { requestId: 'sub-2', tabId: 1, tabSessionId: 't1', site: 'reddit.com', urlPatterns: ['https://reddit.com/*'], requestHostAllowlist: [], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'network' as const, mimeTypes: ['text/html'], emitToRelay: true }],
  ]);

  const matches = matchingSubscriptions(tabStates, subscriptions, 1, {
    url: 'https://reddit.com/r/test',
    status: 200,
    mimeType: 'application/json',
  });

  assert.equal(matches.length, 1);
  assert.equal(matches[0].requestId, 'sub-1');
});

test('buildFetchPatterns skips network mode subscriptions', () => {
  const tabStates = new Map([[1, { tabId: 1, attached: true, subscriptions: new Set(['sub-1', 'sub-2']) }]]);
  const subscriptions = new Map([
    ['sub-1', { requestId: 'sub-1', tabId: 1, tabSessionId: 't1', site: 'reddit.com', urlPatterns: ['https://a.com/*'], requestHostAllowlist: [], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'network' as const, mimeTypes: [], emitToRelay: true }],
    ['sub-2', { requestId: 'sub-2', tabId: 1, tabSessionId: 't1', site: 'reddit.com', urlPatterns: ['https://b.com/*'], requestHostAllowlist: [], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'fetch' as const, mimeTypes: [], emitToRelay: true }],
  ]);

  const patterns = buildFetchPatterns(tabStates, subscriptions, 1);
  assert.equal(patterns.length, 1);
  assert.equal(patterns[0]?.urlPattern, 'https://b.com/*');
});

test('matchingSubscriptions returns empty when no tab state', () => {
  const matches = matchingSubscriptions(new Map(), new Map(), 1, {
    url: 'https://reddit.com/r/test',
    status: 200,
    mimeType: 'application/json',
  });
  assert.equal(matches.length, 0);
});

test('matchingSubscriptions skips missing subscriptions', () => {
  const tabStates = new Map([[1, { tabId: 1, attached: true, subscriptions: new Set(['sub-missing']) }]]);
  const matches = matchingSubscriptions(tabStates, new Map(), 1, {
    url: 'https://reddit.com/r/test',
    status: 200,
    mimeType: 'application/json',
  });
  assert.equal(matches.length, 0);
});

test('matchingSubscriptions filters by site and host allowlist', () => {
  const tabStates = new Map([[1, { tabId: 1, attached: true, subscriptions: new Set(['sub-1', 'sub-2']) }]]);
  const subscriptions = new Map([
    ['sub-1', { requestId: 'sub-1', tabId: 1, tabSessionId: 't1', site: 'google.com', urlPatterns: ['https://reddit.com/*'], requestHostAllowlist: [], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'network' as const, mimeTypes: ['application/json'], emitToRelay: true }],
    ['sub-2', { requestId: 'sub-2', tabId: 1, tabSessionId: 't1', site: 'google.com', urlPatterns: ['https://reddit.com/*'], requestHostAllowlist: ['reddit.com'], includeBody: false, includeHeaders: false, maxBodyBytes: 1024, mode: 'network' as const, mimeTypes: ['application/json'], emitToRelay: true }],
  ]);

  const matches = matchingSubscriptions(tabStates, subscriptions, 1, {
    url: 'https://reddit.com/r/test',
    status: 200,
    mimeType: 'application/json',
  });

  assert.equal(matches.length, 1);
  assert.equal(matches[0].requestId, 'sub-2');
});
