/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict';
import test from 'node:test';
import { CommandsClient } from '../src/commands.js';

test('CommandsClient.list sends command.list action', async () => {
  let sentEnvelope: any = null;

  const mockWsSession = {
    sendAndWaitForResponse: async (env: any) => {
      sentEnvelope = env;
      return {
        requestId: env.requestId,
        payload: { ok: true, data: [] },
      };
    },
  } as any;

  const client = new CommandsClient(mockWsSession);
  const commands = await client.list({ nodeId: 'node_1' });

  assert.ok(sentEnvelope);
  assert.equal(sentEnvelope.payload.action, 'command.list');
  assert.equal(sentEnvelope.payload.targetNodeId, 'node_1');
  assert.deepEqual(commands, []);
});

test('CommandsClient.run sends command.run action', async () => {
  let sentEnvelope: any = null;

  const mockWsSession = {
    sendAndWaitForResponse: async (env: any) => {
      sentEnvelope = env;
      return {
        requestId: env.requestId,
        payload: {
          ok: true,
          data: { result: 'test' },
          commandOutcome: 'completed',
          durationMs: 100,
        },
      };
    },
  } as any;

  const client = new CommandsClient(mockWsSession);
  const result = await client.run({
    nodeId: 'node_1',
    site: 'reddit',
    command: 'search',
    input: { query: 'test' },
  });

  assert.ok(sentEnvelope);
  assert.equal(sentEnvelope.payload.action, 'command.run');
  assert.equal(sentEnvelope.payload.targetNodeId, 'node_1');
  assert.equal(sentEnvelope.payload.payload.site, 'reddit');
  assert.equal(sentEnvelope.payload.payload.command, 'search');
  assert.ok(result.ok);
  assert.equal(result.commandOutcome, 'completed');
});

test('CommandsClient.run throws on failed outcome', async () => {
  const mockWsSession = {
    sendAndWaitForResponse: async (env: any) => ({
      requestId: env.requestId,
      payload: {
        ok: false,
        commandOutcome: 'failed',
        error: 'Test error',
      },
    }),
  } as any;

  const client = new CommandsClient(mockWsSession);

  try {
    await client.run({
      nodeId: 'node_1',
      site: 'reddit',
      command: 'search',
    });
    assert.fail('Should have thrown');
  } catch (err) {
    assert.ok(err instanceof Error);
  }
});
