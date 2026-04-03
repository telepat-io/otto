import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getReplayResponse,
  rememberReplayResponse,
} from '../src/runtime/command-replay';
import { createEnvelope, type CommandPayload, type Envelope } from '@telepat/otto-protocol';

function createSessionStorageMock(initial: Record<string, unknown> = {}) {
  const state: Record<string, unknown> = { ...initial };

  return {
    storage: {
      async get(keys: string[]) {
        const out: Record<string, unknown> = {};
        for (const key of keys) out[key] = state[key];
        return out;
      },
      async set(values: Record<string, unknown>) {
        Object.assign(state, values);
      },
    },
    state,
  };
}

function buildCommand(requestId: string, idempotencyKey?: string): Envelope<CommandPayload> {
  return createEnvelope('command', 'controller', requestId, {
    targetNodeId: 'node_test',
    action: 'primitive.tab.query',
    payload: {},
    idempotencyKey,
  });
}

test('remember and replay response by idempotency key', async () => {
  const { storage } = createSessionStorageMock();
  const cmd1 = buildCommand('req_1', 'idem_1');
  const cmdReplay = buildCommand('req_2', 'idem_1');
  const response = createEnvelope('result', 'node', 'req_1', {
    ok: true,
    durationMs: 10,
    action: 'primitive.tab.query',
    data: { tabSessions: {} },
  });

  await rememberReplayResponse(storage, cmd1, response, 1_000);
  const hit = await getReplayResponse(storage, cmdReplay, 1_100);

  assert.deepEqual(hit, response);
});

test('fallback dedupe uses requestId when idempotency key missing', async () => {
  const { storage } = createSessionStorageMock();
  const cmd = buildCommand('req_same');
  const response = createEnvelope('error', 'node', 'req_same', {
    category: 'execution',
    code: 'command_failed',
    message: 'failed',
    action: 'primitive.tab.query',
  });

  await rememberReplayResponse(storage, cmd, response, 5_000);
  const hit = await getReplayResponse(storage, buildCommand('req_same'), 5_001);

  assert.deepEqual(hit, response);
});

test('stale replay entries are pruned by TTL', async () => {
  const { storage } = createSessionStorageMock();
  const cmd = buildCommand('req_old', 'idem_old');
  const response = createEnvelope('result', 'node', 'req_old', {
    ok: true,
    durationMs: 1,
    action: 'primitive.tab.query',
    data: {},
  });

  await rememberReplayResponse(storage, cmd, response, 1_000);
  const miss = await getReplayResponse(storage, buildCommand('req_new', 'idem_old'), 1_000 + 5 * 60 * 1000 + 1);

  assert.equal(miss, undefined);
});
