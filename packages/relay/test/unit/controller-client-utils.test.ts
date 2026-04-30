import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeControllerNameInput,
  normalizedControllerNameKey,
  deriveAvatarSeed,
  findControllerByNormalizedName,
  materializeControllerRecord,
  hashClientSecret,
  verifyClientSecret,
  canRegisterControllerClient,
} from '../../src/controller-client-utils.js';

test('normalizeControllerNameInput trims and collapses whitespace', () => {
  assert.equal(normalizeControllerNameInput('  hello   world  '), 'hello world');
  assert.equal(normalizeControllerNameInput('name'), 'name');
  assert.equal(normalizeControllerNameInput(''), '');
});

test('normalizedControllerNameKey lowercases and normalizes', () => {
  assert.equal(normalizedControllerNameKey('Hello World'), 'hello world');
  assert.equal(normalizedControllerNameKey('  HELLO   WORLD  '), 'hello world');
});

test('deriveAvatarSeed is deterministic for same input', () => {
  const seed1 = deriveAvatarSeed('My Controller');
  const seed2 = deriveAvatarSeed('My Controller');
  assert.equal(seed1, seed2);
  assert.equal(seed1.length, 16);
});

test('deriveAvatarSeed differs for different inputs', () => {
  const seed1 = deriveAvatarSeed('Controller A');
  const seed2 = deriveAvatarSeed('Controller B');
  assert.notEqual(seed1, seed2);
});

test('findControllerByNormalizedName returns matching non-revoked record', () => {
  const clients = new Map([
    ['c1', { clientId: 'c1', name: 'Alpha', description: '', normalizedName: 'alpha', avatarSeed: '', secretSalt: '', secretHash: '', createdAt: 0 }],
    ['c2', { clientId: 'c2', name: 'Beta', description: '', normalizedName: 'beta', avatarSeed: '', secretSalt: '', secretHash: '', createdAt: 0, revokedAt: 1 }],
  ]);

  const found = findControllerByNormalizedName(clients, 'alpha');
  assert.equal(found?.clientId, 'c1');

  const notFound = findControllerByNormalizedName(clients, 'beta');
  assert.equal(notFound, undefined);

  const missing = findControllerByNormalizedName(clients, 'gamma');
  assert.equal(missing, undefined);
});

test('materializeControllerRecord uses fallback label for name', () => {
  const raw = {
    clientId: 'c1',
    secretSalt: 'salt',
    secretHash: 'hash',
    createdAt: 0,
    label: 'Legacy Name',
  };

  const record = materializeControllerRecord(raw);
  assert.equal(record?.name, 'Legacy Name');
  assert.equal(record?.normalizedName, 'legacy name');
});

test('materializeControllerRecord returns null when name is unresolvable', () => {
  const raw = {
    clientId: 'c1',
    secretSalt: 'salt',
    secretHash: 'hash',
    createdAt: 0,
  };

  const record = materializeControllerRecord(raw);
  assert.equal(record, null);
});

test('materializeControllerRecord uses provided normalizedName and avatarSeed', () => {
  const raw = {
    clientId: 'c1',
    name: 'Custom Name',
    normalizedName: 'custom',
    avatarSeed: 'abcdef',
    secretSalt: 'salt',
    secretHash: 'hash',
    createdAt: 0,
  };

  const record = materializeControllerRecord(raw);
  assert.equal(record?.normalizedName, 'custom');
  assert.equal(record?.avatarSeed, 'abcdef');
});

test('materializeControllerRecord truncates avatarSeed to 64 chars', () => {
  const raw = {
    clientId: 'c1',
    name: 'Name',
    avatarSeed: 'a'.repeat(100),
    secretSalt: 'salt',
    secretHash: 'hash',
    createdAt: 0,
  };

  const record = materializeControllerRecord(raw);
  assert.equal(record?.avatarSeed.length, 64);
});

test('hashClientSecret and verifyClientSecret round-trip', () => {
  const secret = 'my-secret';
  const salt = 'my-salt';
  const hash = hashClientSecret(secret, salt);
  const record = {
    clientId: 'c1',
    name: 'Test',
    description: '',
    normalizedName: 'test',
    avatarSeed: '',
    secretSalt: salt,
    secretHash: hash,
    createdAt: 0,
  };

  assert.equal(verifyClientSecret(secret, record), true);
  assert.equal(verifyClientSecret('wrong-secret', record), false);
});

test('verifyClientSecret returns false for length mismatch', () => {
  const record = {
    clientId: 'c1',
    name: 'Test',
    description: '',
    normalizedName: 'test',
    avatarSeed: '',
    secretSalt: 'salt',
    secretHash: Buffer.from('short').toString('base64'),
    createdAt: 0,
  };

  assert.equal(verifyClientSecret('different', record), false);
});

test('canRegisterControllerClient allows loopback by default', () => {
  const req = { socket: { remoteAddress: '127.0.0.1' } } as import('node:http').IncomingMessage;
  assert.equal(canRegisterControllerClient(req, { allowRemoteControllerRegistration: false }), true);
});

test('canRegisterControllerClient rejects remote when not allowed', () => {
  const req = { socket: { remoteAddress: '192.168.1.1' } } as import('node:http').IncomingMessage;
  assert.equal(canRegisterControllerClient(req, { allowRemoteControllerRegistration: false }), false);
});

test('canRegisterControllerClient allows remote when allowed', () => {
  const req = { socket: { remoteAddress: '192.168.1.1' } } as import('node:http').IncomingMessage;
  assert.equal(canRegisterControllerClient(req, { allowRemoteControllerRegistration: true }), true);
});

test('canRegisterControllerClient checks registration secret when configured', () => {
  const req = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: {},
  } as import('node:http').IncomingMessage;

  assert.equal(canRegisterControllerClient(req, { allowRemoteControllerRegistration: false, controllerRegistrationSecret: 'secret' }), false);

  const reqWithSecret = {
    socket: { remoteAddress: '127.0.0.1' },
    headers: { 'x-otto-registration-secret': 'secret' },
  } as import('node:http').IncomingMessage;

  assert.equal(canRegisterControllerClient(reqWithSecret, { allowRemoteControllerRegistration: false, controllerRegistrationSecret: 'secret' }), true);
});

test('canRegisterControllerClient allows IPv6 loopback', () => {
  const req = { socket: { remoteAddress: '::1' } } as import('node:http').IncomingMessage;
  assert.equal(canRegisterControllerClient(req, { allowRemoteControllerRegistration: false }), true);
});

test('canRegisterControllerClient allows IPv4-mapped IPv6 loopback', () => {
  const req = { socket: { remoteAddress: '::ffff:127.0.0.1' } } as import('node:http').IncomingMessage;
  assert.equal(canRegisterControllerClient(req, { allowRemoteControllerRegistration: false }), true);
});
