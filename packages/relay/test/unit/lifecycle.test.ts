import assert from 'node:assert/strict';
import test from 'node:test';
import { handleRelayWsClose } from '../../src/ws-routes/lifecycle.js';

type ClientLike = {
  id: string;
  role: 'node' | 'controller';
  nodeId?: string;
};

function createCloseCtx(): Record<string, unknown> {
  return {
    clients: new Map<string, ClientLike>(),
    replayState: new Map<string, unknown>(),
    nodeClients: new Map<string, ClientLike>(),
    removeListenerSubscriptionsForNode: () => undefined,
    commandTestStreamSessions: new Map<string, unknown>(),
    send: () => undefined,
    buildEnvelope: () => ({}) as unknown,
    clearCommandTestStreamSessionsForNode: () => undefined,
    pendingCommands: new Map<string, {
      nodeId: string;
      controllerId: string;
      timeoutHandle: ReturnType<typeof setTimeout>;
      tabKey: string;
      action?: string;
    }>(),
    buildError: () => ({}) as unknown,
    clearInflightAndRunNext: () => undefined,
    removeListenerSubscriptionsForController: () => undefined,
    clearCommandTestStreamSessionsForController: () => undefined,
    removeQueuedCommandsForController: () => undefined,
    requestOwnedTabCleanupForController: () => undefined,
    locks: new Map<string, { controllerId: string; expiresAt: number }>(),
  };
}

test('handleRelayWsClose keeps replacement node session for same nodeId', () => {
  const ctx = createCloseCtx();
  const nodeClients = ctx.nodeClients as Map<string, ClientLike>;
  const clients = ctx.clients as Map<string, ClientLike>;

  const staleClient: ClientLike = { id: 'node-old', role: 'node', nodeId: 'node_1' };
  const replacementClient: ClientLike = { id: 'node-new', role: 'node', nodeId: 'node_1' };

  nodeClients.set('node_1', replacementClient);
  clients.set(staleClient.id, staleClient);
  clients.set(replacementClient.id, replacementClient);

  handleRelayWsClose({ client: staleClient, ctx });

  assert.equal(nodeClients.get('node_1')?.id, 'node-new');
});

test('handleRelayWsClose removes node when closing active node session', () => {
  const ctx = createCloseCtx();
  const nodeClients = ctx.nodeClients as Map<string, ClientLike>;
  const clients = ctx.clients as Map<string, ClientLike>;

  const activeClient: ClientLike = { id: 'node-active', role: 'node', nodeId: 'node_2' };

  nodeClients.set('node_2', activeClient);
  clients.set(activeClient.id, activeClient);

  handleRelayWsClose({ client: activeClient, ctx });

  assert.equal(nodeClients.has('node_2'), false);
});
