import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRecipeAutoOpenUrl } from '../src/recipe-open-url.js';

test('resolveRecipeAutoOpenUrl falls back to site URL when descriptor is missing', () => {
  const url = resolveRecipeAutoOpenUrl('reddit.com', 'getChatMessages', []);
  assert.equal(url, 'https://reddit.com');
});

test('resolveRecipeAutoOpenUrl uses preloadHost when descriptor matches site and recipe', () => {
  const url = resolveRecipeAutoOpenUrl('reddit.com', 'getChatMessages', [
    {
      site: 'reddit.com',
      id: 'getChatMessages',
      preloadHost: 'chat.reddit.com',
    },
  ]);

  assert.equal(url, 'https://chat.reddit.com');
});

test('resolveRecipeAutoOpenUrl handles preloadHost already provided as full URL', () => {
  const url = resolveRecipeAutoOpenUrl('reddit.com', 'getChatMessages', [
    {
      site: 'reddit.com',
      id: 'getChatMessages',
      preloadHost: 'https://chat.reddit.com/threads',
    },
  ]);

  assert.equal(url, 'https://chat.reddit.com/threads');
});

test('resolveRecipeAutoOpenUrl normalizes site host matching from URL arguments', () => {
  const url = resolveRecipeAutoOpenUrl('https://www.reddit.com', 'getChatMessages', [
    {
      site: 'reddit.com',
      id: 'getChatMessages',
      preloadHost: 'chat.reddit.com',
    },
  ]);

  assert.equal(url, 'https://chat.reddit.com');
});

