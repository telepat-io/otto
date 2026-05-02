/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from 'node:assert/strict';
import test from 'node:test';
import { PairingClient, NodesClient } from '../src/pairing.js';

test('PairingClient.approve validates code length', async () => {
  const mockHttpClient = {
    approvePairing: async () => {},
  } as any;

  const client = new PairingClient(mockHttpClient);

  try {
    await client.approve({ code: '12345' });
    assert.fail('Should have thrown error for short code');
  } catch (err) {
    assert.ok(err instanceof Error);
    assert.match((err as Error).message, /6 digits/);
  }
});

test('PairingClient.approve calls httpClient with code', async () => {
  let approvedCode = '';

  const mockHttpClient = {
    approvePairing: async (code: string) => {
      approvedCode = code;
    },
  } as any;

  const client = new PairingClient(mockHttpClient);
  await client.approve({ code: '123456' });

  assert.equal(approvedCode, '123456');
});

test('NodesClient.list calls httpClient.listConnectedNodes', async () => {
  let listCalled = false;

  const mockHttpClient = {
    listConnectedNodes: async () => {
      listCalled = true;
      return [{ nodeId: 'node_1' }];
    },
  } as any;

  const client = new NodesClient(mockHttpClient);
  const nodes = await client.list();

  assert.equal(listCalled, true);
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].nodeId, 'node_1');
});
