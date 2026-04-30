import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadRefreshSessionsFromFile,
  loadControllerClientsFromFile,
  loadControllerAclFromFile,
} from '../../src/store-load-utils.js';

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'otto-relay-test-'));
}

test('loadRefreshSessionsFromFile returns zeros for missing file', () => {
  const dir = tempDir();
  try {
    const result = loadRefreshSessionsFromFile({
      filePath: join(dir, 'missing.jsonl'),
      refreshTokens: new Map(),
      parseEntry: (raw) => raw as { token: string; session: { role: 'controller'; expiresAt: number; scopes: string[] } },
      persistRefreshSessions: () => {},
    });
    assert.deepEqual(result, { loaded: 0, invalid: 0, expired: 0 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadRefreshSessionsFromFile loads valid entries and skips expired/invalid', () => {
  const dir = tempDir();
  const filePath = join(dir, 'refresh.jsonl');
  writeFileSync(filePath, [
    JSON.stringify({ token: 'rt_1', session: { role: 'controller', expiresAt: Date.now() + 60_000, scopes: [] } }),
    JSON.stringify({ token: 'rt_2', session: { role: 'controller', expiresAt: Date.now() - 1000, scopes: [] } }),
    'not-json',
    JSON.stringify({ token: 'rt_3', session: { role: 'controller', expiresAt: Date.now() + 60_000, scopes: [] } }),
  ].join('\n'));

  try {
    const refreshTokens = new Map();
    const result = loadRefreshSessionsFromFile({
      filePath,
      refreshTokens,
      parseEntry: (raw) => {
        const r = raw as { token?: string; session?: { role: string; expiresAt: number; scopes: string[] } };
        if (!r.token || !r.session) return null;
        return { token: r.token, session: r.session as { role: 'controller'; expiresAt: number; scopes: string[] } };
      },
      persistRefreshSessions: () => {},
    });

    assert.equal(result.loaded, 2);
    assert.equal(result.expired, 1);
    assert.equal(result.invalid, 1);
    assert.equal(refreshTokens.has('rt_1'), true);
    assert.equal(refreshTokens.has('rt_2'), false);
    assert.equal(refreshTokens.has('rt_3'), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadControllerClientsFromFile loads valid clients and skips invalid', () => {
  const dir = tempDir();
  const filePath = join(dir, 'clients.jsonl');
  writeFileSync(filePath, [
    JSON.stringify({ client: { clientId: 'c1', secretSalt: 's1', secretHash: 'h1', createdAt: 0, name: 'Alpha' } }),
    'bad-line',
    JSON.stringify({ client: { clientId: 'c2', secretSalt: 's2', secretHash: 'h2', createdAt: 0 } }),
  ].join('\n'));

  try {
    const clients = new Map();
    const result = loadControllerClientsFromFile({
      filePath,
      controllerClients: clients,
      parseClient: (raw) => {
        const r = raw as { client?: { clientId?: string; secretSalt?: string; secretHash?: string; createdAt?: number; name?: string } };
        if (!r.client?.clientId || !r.client.secretSalt || !r.client.secretHash) return null;
        return r.client as { clientId: string; secretSalt: string; secretHash: string; createdAt: number; name?: string };
      },
      materializeControllerRecord: (raw) => ({
        clientId: raw.clientId,
        name: raw.name || 'Unnamed',
        description: '',
        normalizedName: (raw.name || 'unnamed').toLowerCase(),
        avatarSeed: '',
        secretSalt: raw.secretSalt,
        secretHash: raw.secretHash,
        createdAt: raw.createdAt,
      }),
      persistControllerClients: () => {},
    });

    assert.equal(result.loaded, 2);
    assert.equal(result.invalid, 1);
    assert.equal(clients.has('c1'), true);
    assert.equal(clients.has('c2'), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadControllerAclFromFile loads valid grants and skips expired/invalid', () => {
  const dir = tempDir();
  const filePath = join(dir, 'acl.jsonl');
  writeFileSync(filePath, [
    JSON.stringify({ grant: { clientId: 'c1', nodeId: 'n1', grantedByNodeId: 'n1', grantedAt: 0, expiresAt: Date.now() + 60_000 } }),
    JSON.stringify({ grant: { clientId: 'c2', nodeId: 'n1', grantedByNodeId: 'n1', grantedAt: 0, expiresAt: Date.now() - 1000 } }),
    'bad',
    JSON.stringify({ grant: { clientId: 'c3', nodeId: 'n1', grantedByNodeId: 'n1', grantedAt: 0 } }),
  ].join('\n'));

  try {
    const acl = new Map();
    const result = loadControllerAclFromFile({
      filePath,
      controllerAcl: acl,
      parseGrant: (raw) => {
        const r = raw as { grant?: { clientId?: string; nodeId?: string; grantedByNodeId?: string; grantedAt?: number; expiresAt?: number } };
        if (!r.grant?.clientId || !r.grant?.nodeId || !r.grant?.grantedByNodeId) return null;
        return r.grant as { clientId: string; nodeId: string; grantedByNodeId: string; grantedAt: number; expiresAt?: number };
      },
      aclKey: (clientId, nodeId) => `${clientId}:${nodeId}`,
      persistControllerAcl: () => {},
    });

    assert.equal(result.loaded, 2);
    assert.equal(result.expired, 1);
    assert.equal(result.invalid, 1);
    assert.equal(acl.has('c1:n1'), true);
    assert.equal(acl.has('c2:n1'), false);
    assert.equal(acl.has('c3:n1'), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
