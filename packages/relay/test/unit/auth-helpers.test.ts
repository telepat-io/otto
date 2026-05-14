import assert from 'node:assert/strict';
import test from 'node:test';
import {
  randomCode,
  issueAccessToken,
  verifyAccessToken,
  checkRateLimit,
  isActionAllowed,
  validateReplayWindow,
  deriveStatus,
} from '../../src/auth/helpers.js';

test('randomCode returns a string in expected format', () => {
  const code = randomCode();
  assert.equal(typeof code, 'string');
  assert.ok(/^\d{3}-\d{3}$/.test(code), `code ${code} does not match expected format`);
});

test('issueAccessToken creates a verifiable JWT', async () => {
  const token = await issueAccessToken({
    role: 'node',
    nodeId: 'n1',
    scopes: ['primitive.tab.open'],
    tokenSecret: 'secret',
    tokenIssuer: 'issuer',
    tokenAudience: 'audience',
    tokenTtlSeconds: 60,
  });
  assert.equal(typeof token, 'string');
  assert.ok(token.length > 0);
});

test('verifyAccessToken verifies a valid token', async () => {
  const token = await issueAccessToken({
    role: 'controller',
    controllerId: 'c1',
    clientId: 'client-1',
    scopes: ['command.run'],
    tokenSecret: 'my-secret',
    tokenIssuer: 'my-issuer',
    tokenAudience: 'my-audience',
    tokenTtlSeconds: 120,
  });

  const verified = await verifyAccessToken({
    token,
    tokenSecret: 'my-secret',
    tokenIssuer: 'my-issuer',
    tokenAudience: 'my-audience',
  });

  assert.equal(verified.role, 'controller');
  assert.equal(verified.controllerId, 'c1');
  assert.equal(verified.clientId, 'client-1');
  assert.deepEqual(verified.scopes, ['command.run']);
});

test('verifyAccessToken falls back to previous secret', async () => {
  const token = await issueAccessToken({
    role: 'node',
    nodeId: 'n2',
    tokenSecret: 'old-secret',
    tokenIssuer: 'issuer',
    tokenAudience: 'audience',
    tokenTtlSeconds: 60,
  });

  const verified = await verifyAccessToken({
    token,
    tokenSecret: 'new-secret',
    tokenPreviousSecret: 'old-secret',
    tokenIssuer: 'issuer',
    tokenAudience: 'audience',
  });

  assert.equal(verified.role, 'node');
  assert.equal(verified.nodeId, 'n2');
});

test('verifyAccessToken rejects invalid token', async () => {
  await assert.rejects(
    verifyAccessToken({
      token: 'not-a-jwt',
      tokenSecret: 'secret',
      tokenIssuer: 'issuer',
      tokenAudience: 'audience',
    }),
    /token_verification_failed/,
  );
});

test('verifyAccessToken rejects token with missing role', async () => {
  const { SignJWT } = await import('jose');
  const token = await new SignJWT({ nodeId: 'n3' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('issuer')
    .setAudience('audience')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode('secret'));

  await assert.rejects(
    verifyAccessToken({
      token,
      tokenSecret: 'secret',
      tokenIssuer: 'issuer',
      tokenAudience: 'audience',
    }),
    /missing_role/,
  );
});

test('checkRateLimit allows first request and enforces limit', () => {
  const rateLimit = new Map<string, { windowStartMs: number; count: number }>();
  const clientId = 'client-a';
  const perMinute = 3;

  assert.equal(checkRateLimit(rateLimit, clientId, perMinute), true);
  assert.equal(checkRateLimit(rateLimit, clientId, perMinute), true);
  assert.equal(checkRateLimit(rateLimit, clientId, perMinute), true);
  assert.equal(checkRateLimit(rateLimit, clientId, perMinute), false);
});

test('checkRateLimit resets window after 60 seconds', () => {
  const rateLimit = new Map<string, { windowStartMs: number; count: number }>();
  const clientId = 'client-b';

  rateLimit.set(clientId, { windowStartMs: Date.now() - 61_000, count: 100 });
  assert.equal(checkRateLimit(rateLimit, clientId, 10), true);
  assert.equal(rateLimit.get(clientId)?.count, 1);
});

test('isActionAllowed with wildcard scope', () => {
  assert.equal(isActionAllowed(['*'], 'anything'), true);
});

test('isActionAllowed with explicit scope', () => {
  assert.equal(isActionAllowed(['primitive.tab.open'], 'primitive.tab.open'), true);
  assert.equal(isActionAllowed(['primitive.tab.open'], 'primitive.tab.close'), false);
});


test('isActionAllowed with wildcard pattern scope', () => {
  // Single wildcard pattern
  assert.equal(isActionAllowed(['primitive.dom.*'], 'primitive.dom.extract_clean_html'), true);
  assert.equal(isActionAllowed(['primitive.dom.*'], 'primitive.dom.extract_html'), true);
  assert.equal(isActionAllowed(['primitive.dom.*'], 'primitive.dom.extract_text'), true);
  // Pattern should not match actions outside the prefix
  assert.equal(isActionAllowed(['primitive.dom.*'], 'primitive.tab.open'), false);
  assert.equal(isActionAllowed(['primitive.dom.*'], 'command.run'), false);
});

test('isActionAllowed with multiple wildcard patterns', () => {
  const scopes = ['primitive.tab.*', 'primitive.dom.*', 'command.*'];
  assert.equal(isActionAllowed(scopes, 'primitive.tab.open'), true);
  assert.equal(isActionAllowed(scopes, 'primitive.dom.extract_clean_html'), true);
  assert.equal(isActionAllowed(scopes, 'command.run'), true);
  assert.equal(isActionAllowed(scopes, 'listener.subscribe'), false);
});

test('isActionAllowed with nested wildcard pattern', () => {
  assert.equal(isActionAllowed(['primitive.*'], 'primitive.dom.extract_clean_html'), true);
  assert.equal(isActionAllowed(['primitive.*'], 'primitive.tab.open'), true);
  assert.equal(isActionAllowed(['primitive.*'], 'primitive.page.reload'), true);
  assert.equal(isActionAllowed(['primitive.*'], 'command.run'), false);
});

test('isActionAllowed mixed exact and wildcard scopes', () => {
  const scopes = ['primitive.tab.open', 'primitive.dom.*', 'command.run'];
  // Exact matches
  assert.equal(isActionAllowed(scopes, 'primitive.tab.open'), true);
  assert.equal(isActionAllowed(scopes, 'command.run'), true);
  // Wildcard pattern match
  assert.equal(isActionAllowed(scopes, 'primitive.dom.extract_clean_html'), true);
  // Non-matching
  assert.equal(isActionAllowed(scopes, 'primitive.tab.close'), false);
  assert.equal(isActionAllowed(scopes, 'command.test'), false);
});

test('isActionAllowed pattern matching is prefix-based', () => {
  const scopes = ['primitive.dom.*'];
  // Should match because 'primitive.dom.' is the prefix
  assert.equal(isActionAllowed(scopes, 'primitive.dom.extract_clean_html'), true);
  // Should not match actions that don't have the separator after prefix
  assert.equal(isActionAllowed(scopes, 'primitive.domain_extraction'), false);
  assert.equal(isActionAllowed(scopes, 'primitive.do'), false);
});

test('validateReplayWindow rejects missing nonce', () => {
  const result = validateReplayWindow({
    replayState: new Map(),
    replayWindowMs: 60_000,
    clientId: 'c1',
    timestampIso: new Date().toISOString(),
  });
  assert.equal(result.ok, false);
  assert.equal((result as { ok: false; code: string }).code, 'missing_replay_nonce');
});

test('validateReplayWindow rejects invalid timestamp', () => {
  const result = validateReplayWindow({
    replayState: new Map(),
    replayWindowMs: 60_000,
    clientId: 'c1',
    timestampIso: 'not-a-date',
    replayNonce: 'nonce-1',
  });
  assert.equal(result.ok, false);
  assert.equal((result as { ok: false; code: string }).code, 'invalid_timestamp');
});

test('validateReplayWindow rejects timestamp outside window', () => {
  const result = validateReplayWindow({
    replayState: new Map(),
    replayWindowMs: 60_000,
    clientId: 'c1',
    timestampIso: new Date(Date.now() - 120_000).toISOString(),
    replayNonce: 'nonce-1',
  });
  assert.equal(result.ok, false);
  assert.equal((result as { ok: false; code: string }).code, 'timestamp_out_of_window');
});

test('validateReplayWindow accepts valid nonce and cleans up old entries', () => {
  const replayState = new Map();
  const clientId = 'c1';
  const now = Date.now();

  replayState.set(clientId, {
    nonceSeenAtMs: new Map([['old-nonce', now - 120_000]]),
  });

  const result = validateReplayWindow({
    replayState,
    replayWindowMs: 60_000,
    clientId,
    timestampIso: new Date(now).toISOString(),
    replayNonce: 'nonce-2',
  });

  assert.equal(result.ok, true);
  const state = replayState.get(clientId);
  assert.equal(state.nonceSeenAtMs.has('old-nonce'), false);
  assert.equal(state.nonceSeenAtMs.has('nonce-2'), true);
});

test('validateReplayWindow rejects replayed nonce', () => {
  const replayState = new Map();
  const clientId = 'c1';

  validateReplayWindow({
    replayState,
    replayWindowMs: 60_000,
    clientId,
    timestampIso: new Date().toISOString(),
    replayNonce: 'nonce-3',
  });

  const result = validateReplayWindow({
    replayState,
    replayWindowMs: 60_000,
    clientId,
    timestampIso: new Date().toISOString(),
    replayNonce: 'nonce-3',
  });

  assert.equal(result.ok, false);
  assert.equal((result as { ok: false; code: string }).code, 'replay_rejected');
});

test('deriveStatus expires pending challenge', () => {
  const challenge = {
    challengeId: 'ch-1',
    code: '123-456',
    nodeId: 'n1',
    status: 'pending' as const,
    expiresAt: Date.now() - 1000,
  };

  const result = deriveStatus(challenge);
  assert.equal(result.status, 'expired');
});

test('deriveStatus leaves non-pending challenge unchanged', () => {
  const challenge = {
    challengeId: 'ch-1',
    code: '123-456',
    nodeId: 'n1',
    status: 'approved' as const,
    expiresAt: Date.now() - 1000,
    approvedAt: Date.now(),
  };

  const result = deriveStatus(challenge);
  assert.equal(result.status, 'approved');
});

test('deriveStatus leaves pending challenge unchanged if not expired', () => {
  const challenge = {
    challengeId: 'ch-1',
    code: '123-456',
    nodeId: 'n1',
    status: 'pending' as const,
    expiresAt: Date.now() + 60_000,
  };

  const result = deriveStatus(challenge);
  assert.equal(result.status, 'pending');
});
