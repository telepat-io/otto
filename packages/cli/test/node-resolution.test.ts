import assert from 'node:assert/strict';
import test from 'node:test';
import type { OttoConfig } from '../src/config.js';
import { resolveTargetNodeId } from '../src/node-resolution.js';

const baseConfig: OttoConfig = {
  relayUrl: 'ws://127.0.0.1:8787/?role=controller',
  relayHttpUrl: 'http://127.0.0.1:8787',
  controllerAccessToken: 'token_test',
};

test('resolveTargetNodeId prefers explicit node id override', async () => {
  const resolved = await resolveTargetNodeId(baseConfig, 'node_explicit');
  assert.equal(resolved, 'node_explicit');
});

test('resolveTargetNodeId auto-picks single connected node when config is stale', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({ nodes: [{ nodeId: 'node_live' }] }),
    } as Response;
  }) as typeof fetch;

  try {
    const resolved = await resolveTargetNodeId({ ...baseConfig, targetNodeId: 'node_stale' });
    assert.equal(resolved, 'node_live');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resolveTargetNodeId errors when multiple nodes connected and config is stale', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({ nodes: [{ nodeId: 'node_a' }, { nodeId: 'node_b' }] }),
    } as Response;
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => resolveTargetNodeId({ ...baseConfig, targetNodeId: 'node_stale' }),
      /configured targetNodeId .* is offline/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resolveTargetNodeId errors when missing node id and multiple nodes connected', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({ nodes: [{ nodeId: 'node_a' }, { nodeId: 'node_b' }] }),
    } as Response;
  }) as typeof fetch;

  try {
    await assert.rejects(
      () => resolveTargetNodeId(baseConfig),
      /Missing targetNodeId\. Multiple nodes are connected/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
