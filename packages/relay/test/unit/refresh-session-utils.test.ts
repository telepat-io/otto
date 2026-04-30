import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cleanupRefreshSessions,
  revokeRefreshSessionsByClientId,
  issueRefreshToken,
  resolveRefreshSession,
  revokeRefreshToken,
} from '../../src/refresh-session-utils.js';

test('cleanupRefreshSessions removes expired sessions', () => {
  const tokens = new Map();
  tokens.set('rt_old', { role: 'controller' as const, expiresAt: Date.now() - 1000, scopes: [] });
  tokens.set('rt_new', { role: 'controller' as const, expiresAt: Date.now() + 60_000, scopes: [] });

  let persisted = false;
  const result = cleanupRefreshSessions(tokens, () => { persisted = true; });

  assert.equal(result.removed, 1);
  assert.equal(tokens.has('rt_old'), false);
  assert.equal(tokens.has('rt_new'), true);
  assert.equal(persisted, true);
});

test('cleanupRefreshSessions does not persist when nothing removed', () => {
  const tokens = new Map();
  tokens.set('rt_new', { role: 'controller' as const, expiresAt: Date.now() + 60_000, scopes: [] });

  let persisted = false;
  const result = cleanupRefreshSessions(tokens, () => { persisted = true; });

  assert.equal(result.removed, 0);
  assert.equal(persisted, false);
});

test('revokeRefreshSessionsByClientId removes matching sessions', () => {
  const tokens = new Map();
  tokens.set('rt_a', { role: 'controller' as const, clientId: 'c1', expiresAt: Date.now() + 60_000, scopes: [] });
  tokens.set('rt_b', { role: 'controller' as const, clientId: 'c2', expiresAt: Date.now() + 60_000, scopes: [] });

  let persisted = false;
  const result = revokeRefreshSessionsByClientId(tokens, () => { persisted = true; }, 'c1');

  assert.equal(result, 1);
  assert.equal(tokens.has('rt_a'), false);
  assert.equal(tokens.has('rt_b'), true);
  assert.equal(persisted, true);
});

test('issueRefreshToken creates and stores a token', () => {
  const tokens = new Map();
  let persisted = false;

  const token = issueRefreshToken(tokens, () => { persisted = true; }, 3600, 'node', 'n1', undefined, ['primitive.tab.open'], 'c1');

  assert.ok(token.startsWith('rt_'));
  assert.equal(tokens.has(token), true);
  const session = tokens.get(token);
  assert.equal(session.role, 'node');
  assert.equal(session.nodeId, 'n1');
  assert.equal(session.clientId, 'c1');
  assert.deepEqual(session.scopes, ['primitive.tab.open']);
  assert.ok(session.expiresAt > Date.now());
  assert.equal(persisted, true);
});

test('resolveRefreshSession returns undefined for missing token', () => {
  const tokens = new Map();
  const result = resolveRefreshSession(tokens, () => {}, 'rt_missing');
  assert.equal(result, undefined);
});

test('resolveRefreshSession removes and returns undefined for expired token', () => {
  const tokens = new Map();
  tokens.set('rt_expired', { role: 'controller' as const, expiresAt: Date.now() - 1000, scopes: [] });

  let persisted = false;
  const result = resolveRefreshSession(tokens, () => { persisted = true; }, 'rt_expired');

  assert.equal(result, undefined);
  assert.equal(tokens.has('rt_expired'), false);
  assert.equal(persisted, true);
});

test('resolveRefreshSession returns valid session', () => {
  const tokens = new Map();
  const expected = { role: 'controller' as const, expiresAt: Date.now() + 60_000, scopes: ['command.run'] };
  tokens.set('rt_valid', expected);

  const result = resolveRefreshSession(tokens, () => {}, 'rt_valid');
  assert.deepEqual(result, expected);
});

test('revokeRefreshToken removes token and persists', () => {
  const tokens = new Map();
  tokens.set('rt_1', { role: 'controller' as const, expiresAt: Date.now() + 60_000, scopes: [] });

  let persisted = false;
  const result = revokeRefreshToken(tokens, () => { persisted = true; }, 'rt_1');

  assert.equal(result, true);
  assert.equal(tokens.has('rt_1'), false);
  assert.equal(persisted, true);
});

test('revokeRefreshToken returns false for missing token', () => {
  const tokens = new Map();
  let persisted = false;
  const result = revokeRefreshToken(tokens, () => { persisted = true; }, 'rt_missing');

  assert.equal(result, false);
  assert.equal(persisted, false);
});
