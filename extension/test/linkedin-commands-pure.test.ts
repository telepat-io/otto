import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeCommentOnPostInput,
  assertCommentOnPostInput,
  normalizeLinkedInPostUrl,
} from '../src/commands/linkedin.com/comment-on-post.js';

test('normalizeCommentOnPostInput trims strings', () => {
  const result = normalizeCommentOnPostInput({ postUrl: '  https://linkedin.com/feed/update/urn:li:activity:1  ', commentBody: ' hello ' });
  assert.equal(result.postUrl, 'https://linkedin.com/feed/update/urn:li:activity:1');
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
  assert.throws(() => assertCommentOnPostInput({ postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:1', commentBody: '' }), /requires input.commentBody/);
});

test('assertCommentOnPostInput passes for valid input', () => {
  assert.doesNotThrow(() => assertCommentOnPostInput({ postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:1', commentBody: 'hi' }));
});

test('normalizeLinkedInPostUrl normalizes linkedin URL', () => {
  const url = normalizeLinkedInPostUrl('http://linkedin.com/feed/update/urn:li:activity:1?trk=abc#hash');
  assert.equal(url, 'https://www.linkedin.com/feed/update/urn:li:activity:1?trk=abc');
});

test('normalizeLinkedInPostUrl allows subdomain linkedin URL', () => {
  const url = normalizeLinkedInPostUrl('https://www.linkedin.com/posts/activity-1?foo=bar');
  assert.equal(url, 'https://www.linkedin.com/posts/activity-1?foo=bar');
});

test('normalizeLinkedInPostUrl throws for invalid URL', () => {
  assert.throws(() => normalizeLinkedInPostUrl('not-a-url'), /valid URL/);
});

test('normalizeLinkedInPostUrl throws for non-linkedin host', () => {
  assert.throws(() => normalizeLinkedInPostUrl('https://example.com/feed/update/urn:li:activity:1'), /linkedin.com URL/);
});
