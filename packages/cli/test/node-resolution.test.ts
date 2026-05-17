import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTargetNodeId, fetchConnectedNodeIds } from '../src/node-resolution.js';

test('resolveTargetNodeId returns explicit nodeId when provided', async () => {
  const result = await resolveTargetNodeId({} as unknown as import('../src/config.js').OttoConfig, 'explicit-node');
  assert.equal(result, 'explicit-node');
});

test('fetchConnectedNodeIds returns empty when no token', async () => {
  const result = await fetchConnectedNodeIds({ relayUrl: 'ws://localhost:8787' } as import('../src/config.js').OttoConfig);
  assert.deepEqual(result, []);
});

test('fetchConnectedNodeIds throws on non-ok non-auth response', async () => {
  const config = {
    controllerAccessToken: 'token',
    relayHttpUrl: 'http://localhost:8787',
  } as unknown as import('../src/config.js').OttoConfig;

  global.fetch = async () =>
    new Response('Error', { status: 500 }) as unknown as Response;

  await assert.rejects(fetchConnectedNodeIds(config), /Failed to query connected nodes/);

  delete (global as unknown as Record<string, unknown>).fetch;
});

test('fetchConnectedNodeIds throws auth-expired error on 403', async () => {
  const config = {
    controllerAccessToken: 'token',
    relayHttpUrl: 'http://localhost:8787',
  } as unknown as import('../src/config.js').OttoConfig;

  global.fetch = async () =>
    new Response('Forbidden', { status: 403 }) as unknown as Response;

  await assert.rejects(
    fetchConnectedNodeIds(config),
    /Controller access token expired\. Run `otto client login` to refresh\./,
  );

  delete (global as unknown as Record<string, unknown>).fetch;
});

test('fetchConnectedNodeIds deduplicates and filters empty nodeIds', async () => {
  const config = {
    controllerAccessToken: 'token',
    relayHttpUrl: 'http://localhost:8787',
  } as unknown as import('../src/config.js').OttoConfig;

  global.fetch = async () =>
    new Response(JSON.stringify({ nodes: [{ nodeId: 'a' }, { nodeId: 'a' }, { nodeId: '' }, { nodeId: 'b' }] }), { status: 200 }) as unknown as Response;

  const result = await fetchConnectedNodeIds(config);
  assert.deepEqual(result, ['a', 'b']);

  delete (global as unknown as Record<string, unknown>).fetch;
});

test('fetchConnectedNodeIds uses relayUrl when relayHttpUrl missing', async () => {
  const config = {
    controllerAccessToken: 'token',
    relayUrl: 'ws://localhost:8787',
  } as unknown as import('../src/config.js').OttoConfig;

  global.fetch = async () =>
    new Response(JSON.stringify({ nodes: [{ nodeId: 'a' }] }), { status: 200 }) as unknown as Response;

  const result = await fetchConnectedNodeIds(config);
  assert.deepEqual(result, ['a']);

  delete (global as unknown as Record<string, unknown>).fetch;
});

test('fetchConnectedNodeIds handles non-array nodes field', async () => {
  const config = {
    controllerAccessToken: 'token',
    relayHttpUrl: 'http://localhost:8787',
  } as unknown as import('../src/config.js').OttoConfig;

  global.fetch = async () =>
    new Response(JSON.stringify({ nodes: 'bad' }), { status: 200 }) as unknown as Response;

  const result = await fetchConnectedNodeIds(config);
  assert.deepEqual(result, []);

  delete (global as unknown as Record<string, unknown>).fetch;
});

test('resolveTargetNodeId returns configured nodeId when online', async () => {
  const config = {
    targetNodeId: 'configured-node',
    controllerAccessToken: 'token',
    relayHttpUrl: 'http://localhost:8787',
  } as unknown as import('../src/config.js').OttoConfig;

  global.fetch = async () =>
    new Response(JSON.stringify({ nodes: [{ nodeId: 'configured-node' }] }), { status: 200 }) as unknown as Response;

  const result = await resolveTargetNodeId(config);
  assert.equal(result, 'configured-node');

  delete (global as unknown as Record<string, unknown>).fetch;
});

test('resolveTargetNodeId auto-selects when one node connected and no config', async () => {
  const config = {
    controllerAccessToken: 'token',
    relayHttpUrl: 'http://localhost:8787',
  } as unknown as import('../src/config.js').OttoConfig;

  global.fetch = async () =>
    new Response(JSON.stringify({ nodes: [{ nodeId: 'auto-node' }] }), { status: 200 }) as unknown as Response;

  const result = await resolveTargetNodeId(config);
  assert.equal(result, 'auto-node');

  delete (global as unknown as Record<string, unknown>).fetch;
});

test('resolveTargetNodeId throws when multiple nodes and no config', async () => {
  const config = {
    controllerAccessToken: 'token',
    relayHttpUrl: 'http://localhost:8787',
  } as unknown as import('../src/config.js').OttoConfig;

  global.fetch = async () =>
    new Response(JSON.stringify({ nodes: [{ nodeId: 'a' }, { nodeId: 'b' }] }), { status: 200 }) as unknown as Response;

  await assert.rejects(resolveTargetNodeId(config), /Missing targetNodeId/);

  delete (global as unknown as Record<string, unknown>).fetch;
});

test('resolveTargetNodeId throws when configured node offline and multiple online', async () => {
  const config = {
    targetNodeId: 'offline',
    controllerAccessToken: 'token',
    relayHttpUrl: 'http://localhost:8787',
  } as unknown as import('../src/config.js').OttoConfig;

  global.fetch = async () =>
    new Response(JSON.stringify({ nodes: [{ nodeId: 'a' }, { nodeId: 'b' }] }), { status: 200 }) as unknown as Response;

  await assert.rejects(resolveTargetNodeId(config), /offline/);

  delete (global as unknown as Record<string, unknown>).fetch;
});

test('resolveTargetNodeId auto-selects single online when configured offline', async () => {
  const config = {
    targetNodeId: 'offline',
    controllerAccessToken: 'token',
    relayHttpUrl: 'http://localhost:8787',
  } as unknown as import('../src/config.js').OttoConfig;

  global.fetch = async () =>
    new Response(JSON.stringify({ nodes: [{ nodeId: 'only-online' }] }), { status: 200 }) as unknown as Response;

  const result = await resolveTargetNodeId(config);
  assert.equal(result, 'only-online');

  delete (global as unknown as Record<string, unknown>).fetch;
});

test('resolveTargetNodeId throws when no nodes and no config', async () => {
  const config = {
    controllerAccessToken: 'token',
    relayHttpUrl: 'http://localhost:8787',
  } as unknown as import('../src/config.js').OttoConfig;

  global.fetch = async () =>
    new Response(JSON.stringify({ nodes: [] }), { status: 200 }) as unknown as Response;

  await assert.rejects(resolveTargetNodeId(config), /Missing targetNodeId/);

  delete (global as unknown as Record<string, unknown>).fetch;
});

test('resolveTargetNodeId throws auth-expired error for auth failures', async () => {
  const config = {
    controllerAccessToken: 'token',
    relayHttpUrl: 'http://localhost:8787',
  } as unknown as import('../src/config.js').OttoConfig;

  global.fetch = async () =>
    new Response('Unauthorized', { status: 401 }) as unknown as Response;

  await assert.rejects(
    resolveTargetNodeId(config),
    /Controller access token expired\. Run `otto client login` to refresh\./,
  );

  delete (global as unknown as Record<string, unknown>).fetch;
});

test('fetchConnectedNodeIds filters undefined nodeIds', async () => {
  const config = {
    controllerAccessToken: 'token',
    relayHttpUrl: 'http://localhost:8787',
  } as unknown as import('../src/config.js').OttoConfig;

  global.fetch = async () =>
    new Response(JSON.stringify({ nodes: [{ nodeId: 'a' }, { nodeId: undefined }, { nodeId: 'b' }] }), { status: 200 }) as unknown as Response;

  const result = await fetchConnectedNodeIds(config);
  assert.deepEqual(result, ['a', 'b']);

  delete (global as unknown as Record<string, unknown>).fetch;
});
