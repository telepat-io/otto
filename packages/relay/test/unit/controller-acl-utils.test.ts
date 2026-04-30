import assert from 'node:assert/strict';
import test from 'node:test';
import {
  aclKey,
  cleanupControllerAcl,
  listAclForNode,
  revokeControllerAclByClientId,
  isControllerAllowedNode,
} from '../../src/controller-acl-utils.js';

test('aclKey concatenates clientId and nodeId', () => {
  assert.equal(aclKey('client-a', 'node-1'), 'client-a:node-1');
});

test('cleanupControllerAcl removes expired grants', () => {
  const grants = new Map([
    ['c1:n1', { clientId: 'c1', nodeId: 'n1', grantedByNodeId: 'n1', grantedAt: 0, expiresAt: Date.now() - 1000 }],
    ['c2:n1', { clientId: 'c2', nodeId: 'n1', grantedByNodeId: 'n1', grantedAt: 0, expiresAt: Date.now() + 60_000 }],
    ['c3:n1', { clientId: 'c3', nodeId: 'n1', grantedByNodeId: 'n1', grantedAt: 0 }],
  ]);

  let persisted = false;
  const result = cleanupControllerAcl(grants, () => { persisted = true; });

  assert.equal(result.removed, 1);
  assert.equal(grants.has('c1:n1'), false);
  assert.equal(grants.has('c2:n1'), true);
  assert.equal(grants.has('c3:n1'), true);
  assert.equal(persisted, true);
});

test('cleanupControllerAcl does not persist when nothing removed', () => {
  const grants = new Map([
    ['c1:n1', { clientId: 'c1', nodeId: 'n1', grantedByNodeId: 'n1', grantedAt: 0, expiresAt: Date.now() + 60_000 }],
  ]);

  let persisted = false;
  const result = cleanupControllerAcl(grants, () => { persisted = true; });

  assert.equal(result.removed, 0);
  assert.equal(persisted, false);
});

test('listAclForNode returns sorted entries with grant info', () => {
  const clients = new Map([
    ['c1', { clientId: 'c1', name: 'Alpha', description: '', avatarSeed: '', createdAt: 0 }],
    ['c2', { clientId: 'c2', name: 'Beta', description: '', avatarSeed: '', createdAt: 0, revokedAt: 1 }],
  ]);

  const grants = new Map([
    ['c1:n1', { clientId: 'c1', nodeId: 'n1', grantedByNodeId: 'n1', grantedAt: 0, expiresAt: Date.now() + 60_000 }],
  ]);

  const result = listAclForNode(clients, grants, 'n1');
  assert.equal(result.length, 2);
  assert.equal(result[0].clientId, 'c1');
  assert.equal(result[0].granted, true);
  assert.equal(result[0].revoked, false);
  assert.ok(result[0].grantExpiresAt);
  assert.equal(result[1].clientId, 'c2');
  assert.equal(result[1].granted, false);
  assert.equal(result[1].revoked, true);
});

test('revokeControllerAclByClientId removes all grants for client', () => {
  const grants = new Map([
    ['c1:n1', { clientId: 'c1', nodeId: 'n1', grantedByNodeId: 'n1', grantedAt: 0 }],
    ['c1:n2', { clientId: 'c1', nodeId: 'n2', grantedByNodeId: 'n2', grantedAt: 0 }],
    ['c2:n1', { clientId: 'c2', nodeId: 'n1', grantedByNodeId: 'n1', grantedAt: 0 }],
  ]);

  let persisted = false;
  const removed = revokeControllerAclByClientId(grants, () => { persisted = true; }, 'c1');

  assert.equal(removed, 2);
  assert.equal(grants.has('c1:n1'), false);
  assert.equal(grants.has('c1:n2'), false);
  assert.equal(grants.has('c2:n1'), true);
  assert.equal(persisted, true);
});

test('isControllerAllowedNode returns true when clientId is undefined', () => {
  const grants = new Map();
  assert.equal(isControllerAllowedNode(grants, () => {}, undefined, 'n1'), true);
});

test('isControllerAllowedNode returns false when grant missing', () => {
  const grants = new Map();
  assert.equal(isControllerAllowedNode(grants, () => {}, 'c1', 'n1'), false);
});

test('isControllerAllowedNode returns false and cleans up expired grant', () => {
  const grants = new Map([
    ['c1:n1', { clientId: 'c1', nodeId: 'n1', grantedByNodeId: 'n1', grantedAt: 0, expiresAt: Date.now() - 1000 }],
  ]);

  let persisted = false;
  assert.equal(isControllerAllowedNode(grants, () => { persisted = true; }, 'c1', 'n1'), false);
  assert.equal(grants.has('c1:n1'), false);
  assert.equal(persisted, true);
});

test('isControllerAllowedNode returns true for valid grant', () => {
  const grants = new Map([
    ['c1:n1', { clientId: 'c1', nodeId: 'n1', grantedByNodeId: 'n1', grantedAt: 0, expiresAt: Date.now() + 60_000 }],
  ]);

  assert.equal(isControllerAllowedNode(grants, () => {}, 'c1', 'n1'), true);
});
