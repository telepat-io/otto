import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeCheckLoginResult,
} from '../src/commands/reddit.com/check-login.js';
import {
  normalizeCommentOnPostInput,
  assertCommentOnPostInput,
  normalizeRedditPostUrl,
} from '../src/commands/reddit.com/comment-on-post.js';
import {
  normalizeId,
  normalizeProfileUrl,
  toIsoUtc,
  pickString,
  mapProfileToUser,
} from '../src/commands/reddit.com/get-user-info.js';

test('normalizeCheckLoginResult handles null authState', () => {
  const result = normalizeCheckLoginResult(null);
  assert.equal(result.authenticated, false);
  assert.equal(result.username, undefined);
  assert.equal(result.id, undefined);
  assert.equal(result.avatar, undefined);
  assert.equal(result.source, undefined);
});

test('normalizeCheckLoginResult handles non-object authState', () => {
  const result = normalizeCheckLoginResult('string');
  assert.equal(result.authenticated, false);
});

test('normalizeCheckLoginResult extracts all fields', () => {
  const result = normalizeCheckLoginResult({
    authenticated: true,
    username: 'alice',
    id: 't2_abc',
    avatar: 'https://example.com/avatar.png',
    source: 'api',
  });
  assert.equal(result.authenticated, true);
  assert.equal(result.username, 'alice');
  assert.equal(result.id, 't2_abc');
  assert.equal(result.avatar, 'https://example.com/avatar.png');
  assert.equal(result.source, 'api');
});

test('normalizeCheckLoginResult ignores non-string fields', () => {
  const result = normalizeCheckLoginResult({
    authenticated: 1,
    username: 123,
    id: {},
    avatar: null,
    source: true,
  });
  assert.equal(result.authenticated, true);
  assert.equal(result.username, undefined);
  assert.equal(result.id, undefined);
  assert.equal(result.avatar, undefined);
  assert.equal(result.source, undefined);
});

test('normalizeCommentOnPostInput trims strings', () => {
  const result = normalizeCommentOnPostInput({ postUrl: '  https://reddit.com  ', commentBody: ' hello ' });
  assert.equal(result.postUrl, 'https://reddit.com');
  assert.equal(result.commentBody, 'hello');
});

test('normalizeCommentOnPostInput defaults missing fields to empty string', () => {
  const result = normalizeCommentOnPostInput({});
  assert.equal(result.postUrl, '');
  assert.equal(result.commentBody, '');
});

test('assertCommentOnPostInput throws for missing postUrl', () => {
  assert.throws(() => assertCommentOnPostInput({ postUrl: '', commentBody: 'hi' }), /requires input.postUrl/);
});

test('assertCommentOnPostInput throws for missing commentBody', () => {
  assert.throws(() => assertCommentOnPostInput({ postUrl: 'https://reddit.com', commentBody: '' }), /requires input.commentBody/);
});

test('assertCommentOnPostInput passes for valid input', () => {
  assert.doesNotThrow(() => assertCommentOnPostInput({ postUrl: 'https://reddit.com', commentBody: 'hi' }));
});

test('normalizeRedditPostUrl normalizes reddit post URL', () => {
  const url = normalizeRedditPostUrl('http://old.reddit.com/r/test/comments/123/post?utm=1#hash');
  assert.equal(url, 'https://www.reddit.com/r/test/comments/123/post?utm=1');
});

test('normalizeRedditPostUrl throws for invalid URL', () => {
  assert.throws(() => normalizeRedditPostUrl('not-a-url'), /valid URL/);
});

test('normalizeRedditPostUrl throws for non-reddit host', () => {
  assert.throws(() => normalizeRedditPostUrl('https://example.com/comments/123'), /reddit.com URL/);
});

test('normalizeRedditPostUrl throws for missing comments path', () => {
  assert.throws(() => normalizeRedditPostUrl('https://www.reddit.com/r/test'), /comments URL/);
});

test('normalizeId adds t2_ prefix when missing', () => {
  assert.equal(normalizeId('abc'), 't2_abc');
});

test('normalizeId preserves existing t2_ prefix', () => {
  assert.equal(normalizeId('t2_abc'), 't2_abc');
});

test('normalizeProfileUrl returns undefined for non-string', () => {
  assert.equal(normalizeProfileUrl(123), undefined);
});

test('normalizeProfileUrl returns undefined for empty string', () => {
  assert.equal(normalizeProfileUrl('   '), undefined);
});

test('normalizeProfileUrl returns absolute URL as-is', () => {
  assert.equal(normalizeProfileUrl('https://reddit.com/user/alice'), 'https://reddit.com/user/alice');
});

test('normalizeProfileUrl converts relative path to absolute', () => {
  assert.equal(normalizeProfileUrl('/user/alice'), 'https://www.reddit.com/user/alice');
});

test('normalizeProfileUrl returns undefined for non-http non-relative', () => {
  assert.equal(normalizeProfileUrl('ftp://example.com'), undefined);
});

test('toIsoUtc returns ISO string for valid seconds', () => {
  assert.equal(toIsoUtc(0), '1970-01-01T00:00:00.000Z');
});

test('toIsoUtc returns undefined for non-number', () => {
  assert.equal(toIsoUtc('123'), undefined);
});

test('toIsoUtc returns undefined for NaN', () => {
  assert.equal(toIsoUtc(NaN), undefined);
});

test('pickString returns first non-empty string', () => {
  assert.equal(pickString('', '  ', 'alice'), 'alice');
});

test('pickString skips non-string values', () => {
  assert.equal(pickString(123, null, 'bob'), 'bob');
});

test('pickString returns undefined when all empty', () => {
  assert.equal(pickString('', '  ', 123), undefined);
});

test('mapProfileToUser builds minimal user', () => {
  const user = mapProfileToUser({ name: 'alice' }, 'alice', '');
  assert.equal(user.kind, 'entity.user');
  assert.equal(user.platform, 'reddit');
  assert.equal(user.username, 'alice');
  assert.equal(user.id, 'reddit:alice');
  assert.equal(user.flags, undefined);
  assert.ok(user.stats);
  assert.equal(user.stats.reputation, undefined);
});

test('mapProfileToUser uses provided id fallback', () => {
  const user = mapProfileToUser({ name: 'alice' }, 'alice', 'xyz');
  assert.equal(user.id, 't2_xyz');
});

test('mapProfileToUser sets flags when true', () => {
  const user = mapProfileToUser({
    name: 'alice',
    is_employee: true,
    is_mod: true,
    is_blocked: true,
    is_friend: true,
  }, 'alice', '');
  assert.deepEqual(user.flags, ['employee', 'moderator', 'blocked', 'friend']);
});

test('mapProfileToUser computes karma stats', () => {
  const user = mapProfileToUser({
    name: 'alice',
    total_karma: 100,
    link_karma: 40,
    comment_karma: 60,
  }, 'alice', '');
  assert.ok(user.stats);
  assert.equal(user.stats.reputation, 100);
  assert.equal(user.stats.posts, 40);
  assert.equal(user.stats.comments, 60);
});

test('mapProfileToUser falls back to link+comment karma when total missing', () => {
  const user = mapProfileToUser({
    name: 'alice',
    link_karma: 10,
    comment_karma: 20,
  }, 'alice', '');
  assert.ok(user.stats);
  assert.equal(user.stats.reputation, 30);
});

test('mapProfileToUser extracts subreddit fields', () => {
  const user = mapProfileToUser({
    name: 'alice',
    subreddit: {
      title: 'Alice Profile',
      display_name_prefixed: 'u/alice',
      url: '/user/alice',
      subscribers: 500,
      public_description: 'Hello world',
    },
  }, 'alice', '');
  assert.equal(user.displayName, 'Alice Profile');
  assert.equal(user.profileUrl, 'https://www.reddit.com/user/alice');
  assert.equal(user.bio, 'Hello world');
  assert.ok(user.stats);
  assert.equal(user.stats.followers, 500);
});

test('mapProfileToUser prefers snoovatar over icon', () => {
  const user = mapProfileToUser({
    name: 'alice',
    snoovatar_img: 'snoovatar.png',
    icon_img: 'icon.png',
  }, 'alice', '');
  assert.equal(user.avatarUrl, 'snoovatar.png');
});

test('mapProfileToUser sets isVerified and createdAt', () => {
  const user = mapProfileToUser({
    name: 'alice',
    verified: true,
    created_utc: 0,
  }, 'alice', '');
  assert.equal(user.isVerified, true);
  assert.equal(user.createdAt, '1970-01-01T00:00:00.000Z');
});
