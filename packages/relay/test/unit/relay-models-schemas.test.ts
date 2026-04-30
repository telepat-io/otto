import assert from 'node:assert/strict';
import test from 'node:test';
import {
  helloSchema,
  logLevelSchema,
  logSourceSchema,
  logsSubscribeSchema,
  extensionLogEventSchema,
  listenerUpdateEventSchema,
  refreshSessionSchema,
  controllerClientSchema,
  controllerAclGrantSchema,
  refreshStoreEntrySchema,
  controllerClientStoreEntrySchema,
  controllerAclStoreEntrySchema,
} from '../../src/relay-models-schemas.js';

test('helloSchema validates valid hello payload', () => {
  const result = helloSchema.parse({ role: 'node', capabilities: ['tab'], nodeId: 'n1' });
  assert.equal(result.role, 'node');
  assert.deepEqual(result.capabilities, ['tab']);
  assert.equal(result.nodeId, 'n1');
});

test('helloSchema defaults capabilities to empty array', () => {
  const result = helloSchema.parse({ role: 'controller' });
  assert.deepEqual(result.capabilities, []);
});

test('helloSchema rejects invalid role', () => {
  assert.throws(() => helloSchema.parse({ role: 'invalid' }));
});

test('logLevelSchema validates valid levels', () => {
  assert.equal(logLevelSchema.parse('debug'), 'debug');
  assert.equal(logLevelSchema.parse('info'), 'info');
  assert.equal(logLevelSchema.parse('warn'), 'warn');
  assert.equal(logLevelSchema.parse('error'), 'error');
});

test('logLevelSchema rejects invalid level', () => {
  assert.throws(() => logLevelSchema.parse('verbose'));
});

test('logSourceSchema validates valid sources', () => {
  assert.equal(logSourceSchema.parse('relay'), 'relay');
  assert.equal(logSourceSchema.parse('all'), 'all');
});

test('logsSubscribeSchema validates logs subscribe event', () => {
  const result = logsSubscribeSchema.parse({ type: 'logs_subscribe', source: 'node' });
  assert.equal(result.type, 'logs_subscribe');
  assert.equal(result.source, 'node');
});

test('logsSubscribeSchema allows missing source', () => {
  const result = logsSubscribeSchema.parse({ type: 'logs_subscribe' });
  assert.equal(result.source, undefined);
});

test('logsSubscribeSchema rejects wrong type', () => {
  assert.throws(() => logsSubscribeSchema.parse({ type: 'other' }));
});

test('extensionLogEventSchema validates extension log', () => {
  const result = extensionLogEventSchema.parse({
    type: 'extension_log',
    entry: { level: 'info', type: 'test.event' },
  });
  assert.equal(result.entry.level, 'info');
});

test('extensionLogEventSchema defaults level to debug', () => {
  const result = extensionLogEventSchema.parse({
    type: 'extension_log',
    entry: { type: 'test.event' },
  });
  assert.equal(result.entry.level, 'debug');
});

test('extensionLogEventSchema rejects empty type', () => {
  assert.throws(() => extensionLogEventSchema.parse({
    type: 'extension_log',
    entry: { type: '' },
  }));
});

test('listenerUpdateEventSchema validates listener update', () => {
  const result = listenerUpdateEventSchema.parse({
    type: 'listener_update',
    data: { foo: 1 },
    updateType: 'new_message',
  });
  assert.equal(result.updateType, 'new_message');
});

test('refreshSessionSchema validates refresh session', () => {
  const result = refreshSessionSchema.parse({
    role: 'controller',
    controllerId: 'c1',
    scopes: ['command.run'],
    expiresAt: Date.now() + 60_000,
  });
  assert.equal(result.role, 'controller');
});

test('refreshSessionSchema rejects missing scopes', () => {
  assert.throws(() => refreshSessionSchema.parse({ role: 'node', expiresAt: 0 }));
});

test('controllerClientSchema validates client record', () => {
  const result = controllerClientSchema.parse({
    clientId: 'c1',
    secretSalt: 'salt',
    secretHash: 'hash',
    createdAt: 0,
  });
  assert.equal(result.clientId, 'c1');
});

test('controllerClientSchema accepts legacy label field', () => {
  const result = controllerClientSchema.parse({
    clientId: 'c1',
    label: 'Legacy',
    secretSalt: 'salt',
    secretHash: 'hash',
    createdAt: 0,
  });
  assert.equal(result.label, 'Legacy');
});

test('controllerAclGrantSchema validates grant', () => {
  const result = controllerAclGrantSchema.parse({
    clientId: 'c1',
    nodeId: 'n1',
    grantedByNodeId: 'n1',
    grantedAt: 0,
    expiresAt: Date.now() + 60_000,
  });
  assert.equal(result.clientId, 'c1');
});

test('refreshStoreEntrySchema validates entry', () => {
  const result = refreshStoreEntrySchema.parse({
    token: 'rt_1',
    session: {
      role: 'node',
      scopes: [],
      expiresAt: Date.now() + 60_000,
    },
  });
  assert.equal(result.token, 'rt_1');
});

test('controllerClientStoreEntrySchema validates entry', () => {
  const result = controllerClientStoreEntrySchema.parse({
    client: {
      clientId: 'c1',
      secretSalt: 'salt',
      secretHash: 'hash',
      createdAt: 0,
    },
  });
  assert.equal(result.client.clientId, 'c1');
});

test('controllerAclStoreEntrySchema validates entry', () => {
  const result = controllerAclStoreEntrySchema.parse({
    grant: {
      clientId: 'c1',
      nodeId: 'n1',
      grantedByNodeId: 'n1',
      grantedAt: 0,
    },
  });
  assert.equal(result.grant.clientId, 'c1');
});
