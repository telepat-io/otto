import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCommandAutoOpenUrl } from '../src/command-open-url.js';

test('resolveCommandAutoOpenUrl falls back to site URL when descriptor is missing', () => {
  const url = resolveCommandAutoOpenUrl('reddit.com', 'getChatMessages', []);
  assert.equal(url, 'https://reddit.com');
});

test('resolveCommandAutoOpenUrl uses preloadHost when descriptor matches site and command', () => {
  const url = resolveCommandAutoOpenUrl('reddit.com', 'getChatMessages', [
    {
      site: 'reddit.com',
      id: 'getChatMessages',
      preloadHost: 'chat.reddit.com',
    },
  ]);

  assert.equal(url, 'https://chat.reddit.com');
});

test('resolveCommandAutoOpenUrl handles preloadHost already provided as full URL', () => {
  const url = resolveCommandAutoOpenUrl('reddit.com', 'getChatMessages', [
    {
      site: 'reddit.com',
      id: 'getChatMessages',
      preloadHost: 'https://chat.reddit.com/threads',
    },
  ]);

  assert.equal(url, 'https://chat.reddit.com/threads');
});

test('resolveCommandAutoOpenUrl normalizes site host matching from URL arguments', () => {
  const url = resolveCommandAutoOpenUrl('https://www.reddit.com', 'getChatMessages', [
    {
      site: 'reddit.com',
      id: 'getChatMessages',
      preloadHost: 'chat.reddit.com',
    },
  ]);

  assert.equal(url, 'https://chat.reddit.com');
});

