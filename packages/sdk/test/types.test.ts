import assert from 'node:assert/strict';
import test from 'node:test';
import type { Node, CommandDescriptor, CommandResult, PairingChallenge } from '../src/types.js';

test('Node type has required fields', () => {
  const node: Node = {
    nodeId: 'node_abc123',
  };
  assert.equal(node.nodeId, 'node_abc123');
});

test('CommandDescriptor type has all fields', () => {
  const desc: CommandDescriptor = {
    site: 'reddit',
    id: 'cmd_123',
    displayName: 'Search Posts',
    description: 'Search for posts on Reddit',
    tags: ['search', 'reddit'],
    requiresAuth: true,
    inputFields: [
      { name: 'query', type: 'string', required: true, description: 'Search query' },
    ],
  };
  assert.equal(desc.site, 'reddit');
  assert.equal(desc.displayName, 'Search Posts');
  assert.equal(desc.inputFields.length, 1);
});

test('CommandResult type with success', () => {
  const result: CommandResult = {
    ok: true,
    data: { posts: [] },
    commandOutcome: 'completed',
    durationMs: 150,
  };
  assert.equal(result.ok, true);
  assert.equal(result.commandOutcome, 'completed');
  assert.equal(result.durationMs, 150);
});

test('CommandResult type with failure', () => {
  const result: CommandResult = {
    ok: false,
    commandOutcome: 'failed',
    error: 'Authentication failed',
    durationMs: 50,
  };
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Authentication failed');
});

test('PairingChallenge type', () => {
  const challenge: PairingChallenge = {
    challengeId: 'ch_xyz789',
    code: '123456',
    nodeId: 'node_abc123',
    status: 'pending',
    expiresAt: new Date().toISOString(),
  };
  assert.equal(challenge.code, '123456');
  assert.equal(challenge.status, 'pending');
});
