import assert from 'node:assert/strict';
import test from 'node:test';
import { OttoClient } from '../src/index.js';

test('OttoClient.nodes returns NodesClient', () => {
  const client = new OttoClient({
    relayUrl: 'wss://relay.example.com',
    clientId: 'clt_test',
    clientSecret: 'cs_test',
  });

  const nodes = client.nodes;
  assert.ok(nodes);
  assert.ok(typeof nodes.list === 'function');
});

test('OttoClient.pairing returns PairingClient', () => {
  const client = new OttoClient({
    relayUrl: 'wss://relay.example.com',
    clientId: 'clt_test',
    clientSecret: 'cs_test',
  });

  const pairing = client.pairing;
  assert.ok(pairing);
  assert.ok(typeof pairing.approve === 'function');
  assert.ok(typeof pairing.listPending === 'function');
});

test('OttoClient disconnect before connect', async () => {
  const client = new OttoClient({
    relayUrl: 'wss://relay.example.com',
    clientId: 'clt_test',
    clientSecret: 'cs_test',
  });

  // Should not throw
  await client.disconnect();
  assert.equal(client.isConnected(), false);
});
