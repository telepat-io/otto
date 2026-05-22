import assert from 'node:assert/strict';
import test from 'node:test';
import { isSiteMatch, listCommandDescriptors, findSiteBundle, findSiteCommand } from '../src/commands/index.js';

test('isSiteMatch returns true for exact hostname match', () => {
  assert.equal(isSiteMatch('https://reddit.com/r/test', 'reddit.com'), true);
});

test('isSiteMatch returns true for www prefix', () => {
  assert.equal(isSiteMatch('https://www.reddit.com/r/test', 'reddit.com'), true);
});

test('isSiteMatch returns true for subdomain match', () => {
  assert.equal(isSiteMatch('https://chat.reddit.com', 'reddit.com'), true);
});

test('isSiteMatch returns false for different domain', () => {
  assert.equal(isSiteMatch('https://evil.com', 'reddit.com'), false);
});

test('isSiteMatch returns false for null/undefined URL', () => {
  assert.equal(isSiteMatch(null, 'reddit.com'), false);
  assert.equal(isSiteMatch(undefined, 'reddit.com'), false);
});

test('isSiteMatch returns false for invalid URL', () => {
  assert.equal(isSiteMatch('not-a-url', 'reddit.com'), false);
});

test('listCommandDescriptors returns commands from all bundles', () => {
  const descriptors = listCommandDescriptors();
  assert.ok(descriptors.length > 0);
  const ids = descriptors.map((d) => d.id);
  assert.ok(ids.includes('getPosts'));
  assert.ok(ids.includes('getSearchResults'));
  assert.ok(ids.includes('getFrontPage'));
});

test('findSiteBundle returns bundle for known site', () => {
  const bundle = findSiteBundle('reddit.com');
  assert.ok(bundle);
  assert.equal(bundle?.site, 'reddit.com');
});

test('findSiteBundle returns undefined for unknown site', () => {
  const bundle = findSiteBundle('unknown.com');
  assert.equal(bundle, undefined);
});

test('findSiteCommand returns command by id', () => {
  const bundle = findSiteBundle('reddit.com')!;
  const command = findSiteCommand(bundle, 'getPosts');
  assert.ok(command);
  assert.equal(command.metadata.id, 'getPosts');
});

test('findSiteCommand returns undefined for unknown command', () => {
  const bundle = findSiteBundle('reddit.com')!;
  const command = findSiteCommand(bundle, 'unknown');
  assert.equal(command, undefined);
});
