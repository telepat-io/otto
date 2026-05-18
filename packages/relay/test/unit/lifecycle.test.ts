import assert from 'node:assert/strict';
import test from 'node:test';
import { handleRelayWsClose, handleRelayWsPreCommandMessage } from '../../src/ws-routes/lifecycle.js';

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

function createPreCommandCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const sent: Array<{ ws: unknown; payload: unknown }> = [];

  const ctx: Record<string, unknown> = {
    send: (ws: unknown, payload: unknown) => {
      sent.push({ ws, payload });
    },
    buildError: (requestId: string, _senderRole: string, payload: Record<string, unknown>) => ({
      messageType: 'error',
      requestId,
      payload,
    }),
    buildEnvelope: (messageType: string, _senderRole: string, requestId: string, payload: Record<string, unknown>) => ({
      messageType,
      requestId,
      payload,
    }),
    helloSchema: {
      safeParse: (payload: { role: 'node' | 'controller'; nodeId?: string }) => ({ success: true, data: payload }),
    },
    clients: new Map<string, unknown>(),
    nodeClients: new Map<string, unknown>(),
    CONTROLLER_HEARTBEAT_INTERVAL_MS: 15000,
    emitLog: () => undefined,
    verifyAccessToken: async () => ({ role: 'controller', scopes: ['command.run'] }),
    isRevokedControllerClient: () => false,
    controllerClients: new Map<string, unknown>(),
    markControllerHeartbeat: () => undefined,
    checkRateLimit: () => true,
    logsSubscribeSchema: {
      safeParse: () => ({ success: true, data: { source: 'node' } }),
    },
    extensionLogEventSchema: {
      safeParse: (payload: unknown) => ({
        success: true,
        data: {
          entry: {
            level: 'info',
            type: 'extension.info',
            requestId: 'entry_req',
            traceId: 'trace_1',
            action: 'noop',
            status: 'ok',
            timestamp: new Date().toISOString(),
            data: payload,
          },
        },
      }),
    },
    listenerUpdateEventSchema: {
      safeParse: () => ({
        success: true,
        data: {
          updateType: 'chat.message',
          emittedAt: new Date().toISOString(),
          data: { text: 'hello' },
        },
      }),
    },
    listenerSubscriptions: new Map<string, { controllerId: string; nodeId: string }>(),
    removeListenerSubscription: () => undefined,
    lockKey: (nodeId: string, tabSessionId: string) => `${nodeId}:${tabSessionId}`,
    locks: new Map<string, { controllerId: string; expiresAt: number }>(),
    __sent: sent,
  };

  return { ...ctx, ...overrides };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
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

test('handleRelayWsPreCommandMessage handles hello and registers node client', () => {
  const ws = { id: 'ws_hello' };
  const ctx = createPreCommandCtx();
  const msg = {
    messageType: 'hello',
    requestId: 'req_hello',
    payload: { role: 'node', nodeId: 'node_a', capabilities: [] },
  };

  const result = handleRelayWsPreCommandMessage({ msg, ws, client: undefined, clientId: 'client_1', ctx });
  const clients = ctx.clients as Map<string, { id: string }>;
  const nodeClients = ctx.nodeClients as Map<string, { id: string }>;
  const sent = ctx.__sent as Array<{ payload: { messageType: string; payload: { accepted: boolean } } }>;

  assert.equal(result.handled, true);
  assert.equal(clients.get('client_1')?.id, 'client_1');
  assert.equal(nodeClients.get('node_a')?.id, 'client_1');
  assert.equal(sent[0]?.payload.messageType, 'hello_ack');
  assert.equal(sent[0]?.payload.payload.accepted, true);
});

test('handleRelayWsPreCommandMessage rejects non-hello frames before initialization', () => {
  const ws = { id: 'ws_init' };
  const ctx = createPreCommandCtx();
  const msg = {
    messageType: 'event',
    requestId: 'req_not_initialized',
    payload: { type: 'logs_subscribe' },
  };

  const result = handleRelayWsPreCommandMessage({ msg, ws, client: undefined, clientId: 'client_2', ctx });
  const sent = ctx.__sent as Array<{ payload: { messageType: string; payload: { code: string } } }>;

  assert.equal(result.handled, true);
  assert.equal(sent[0]?.payload.messageType, 'error');
  assert.equal(sent[0]?.payload.payload.code, 'not_initialized');
});

test('handleRelayWsPreCommandMessage rejects auth without access token', () => {
  const ws = { id: 'ws_auth_missing' };
  const ctx = createPreCommandCtx();
  const client = {
    id: 'controller_1',
    role: 'controller',
    authenticated: false,
    subscriptions: new Set<string>(),
  };

  const result = handleRelayWsPreCommandMessage({
    msg: { messageType: 'auth', requestId: 'req_auth_missing', payload: {} },
    ws,
    client,
    clientId: 'controller_1',
    ctx,
  });

  const sent = ctx.__sent as Array<{ payload: { payload: { code: string } } }>;
  assert.equal(result.handled, true);
  assert.equal(sent[0]?.payload.payload.code, 'missing_access_token');
});

test('handleRelayWsPreCommandMessage accepts auth and marks client authenticated', async () => {
  const ws = { id: 'ws_auth_ok' };
  const client = {
    id: 'controller_auth',
    role: 'controller',
    authenticated: false,
    subscriptions: new Set<string>(),
    scopes: [] as string[],
  };
  const ctx = createPreCommandCtx({
    verifyAccessToken: async () => ({
      role: 'controller',
      controllerId: 'ctl_1',
      clientId: 'clt_1',
      scopes: ['command.run'],
    }),
  });

  const result = handleRelayWsPreCommandMessage({
    msg: { messageType: 'auth', requestId: 'req_auth_ok', payload: { accessToken: 'token_1' } },
    ws,
    client,
    clientId: client.id,
    ctx,
  });

  await flushMicrotasks();
  const sent = ctx.__sent as Array<{ payload: { messageType: string; payload: { accepted: boolean } } }>;

  assert.equal(result.handled, true);
  assert.equal(client.authenticated, true);
  assert.deepEqual(client.scopes, ['command.run']);
  assert.equal(sent[0]?.payload.messageType, 'auth_ack');
  assert.equal(sent[0]?.payload.payload.accepted, true);
});

test('handleRelayWsPreCommandMessage enforces auth and supports ping', () => {
  const ws = { id: 'ws_ping' };
  const ctx = createPreCommandCtx();
  const unauthClient = {
    id: 'controller_unauth',
    role: 'controller',
    authenticated: false,
    subscriptions: new Set<string>(),
  };

  const unauthResult = handleRelayWsPreCommandMessage({
    msg: { messageType: 'tab_lock', requestId: 'req_need_auth', payload: {} },
    ws,
    client: unauthClient,
    clientId: unauthClient.id,
    ctx,
  });
  const sent = ctx.__sent as Array<{ payload: { messageType: string; payload: { code: string } } }>;
  assert.equal(unauthResult.handled, true);
  assert.equal(sent[0]?.payload.payload.code, 'unauthenticated');

  const authClient = {
    id: 'controller_auth_ping',
    role: 'controller',
    authenticated: true,
    subscriptions: new Set<string>(),
  };
  const pingResult = handleRelayWsPreCommandMessage({
    msg: { messageType: 'ping', requestId: 'req_ping', payload: {} },
    ws,
    client: authClient,
    clientId: authClient.id,
    ctx,
  });
  assert.equal(pingResult.handled, true);
  assert.equal(sent[1]?.payload.messageType, 'pong');
});

test('handleRelayWsPreCommandMessage handles listener update for offline owner', () => {
  const ws = { id: 'ws_listener' };
  let removedRequestId = '';
  const listenerSubscriptions = new Map<string, { controllerId: string; nodeId: string }>();
  listenerSubscriptions.set('req_listener', { controllerId: 'controller_missing', nodeId: 'node_1' });

  const ctx = createPreCommandCtx({
    listenerSubscriptions,
    removeListenerSubscription: (requestId: string) => {
      removedRequestId = requestId;
      listenerSubscriptions.delete(requestId);
    },
    clients: new Map<string, { authenticated: boolean }>(),
  });
  const nodeClient = {
    id: 'node_client_1',
    role: 'node',
    nodeId: 'node_1',
    authenticated: true,
    subscriptions: new Set<string>(),
  };

  const result = handleRelayWsPreCommandMessage({
    msg: {
      messageType: 'event',
      requestId: 'req_listener',
      payload: { type: 'listener_update', updateType: 'chat.message', emittedAt: new Date().toISOString(), data: {} },
    },
    ws,
    client: nodeClient,
    clientId: nodeClient.id,
    ctx,
  });

  const sent = ctx.__sent as Array<{ payload: { payload: { code: string } } }>;
  assert.equal(result.handled, true);
  assert.equal(removedRequestId, 'req_listener');
  assert.equal(sent[0]?.payload.payload.code, 'listener_owner_offline');
});

test('handleRelayWsPreCommandMessage supports lock acquire, renew, conflict, and unlock', () => {
  const ws = { id: 'ws_lock' };
  const ctx = createPreCommandCtx();
  const locks = ctx.locks as Map<string, { controllerId: string; expiresAt: number }>;

  const controller = {
    id: 'controller_lock',
    role: 'controller',
    authenticated: true,
    subscriptions: new Set<string>(),
  };

  const acquire = handleRelayWsPreCommandMessage({
    msg: {
      messageType: 'tab_lock',
      requestId: 'req_lock_1',
      payload: { targetNodeId: 'node_1', tabSessionId: 'tab_1', lockLeaseMs: 5_000 },
    },
    ws,
    client: controller,
    clientId: controller.id,
    ctx,
  });
  assert.equal(acquire.handled, true);
  assert.equal(locks.has('node_1:tab_1'), true);

  const renew = handleRelayWsPreCommandMessage({
    msg: {
      messageType: 'tab_lock',
      requestId: 'req_lock_2',
      payload: { targetNodeId: 'node_1', tabSessionId: 'tab_1', lockLeaseMs: 6_000 },
    },
    ws,
    client: controller,
    clientId: controller.id,
    ctx,
  });
  assert.equal(renew.handled, true);

  const secondController = {
    id: 'controller_other',
    role: 'controller',
    authenticated: true,
    subscriptions: new Set<string>(),
  };
  const conflict = handleRelayWsPreCommandMessage({
    msg: {
      messageType: 'tab_lock',
      requestId: 'req_lock_3',
      payload: { targetNodeId: 'node_1', tabSessionId: 'tab_1', lockLeaseMs: 7_000 },
    },
    ws,
    client: secondController,
    clientId: secondController.id,
    ctx,
  });
  assert.equal(conflict.handled, true);

  const unlock = handleRelayWsPreCommandMessage({
    msg: {
      messageType: 'tab_unlock',
      requestId: 'req_unlock_1',
      payload: { targetNodeId: 'node_1', tabSessionId: 'tab_1' },
    },
    ws,
    client: controller,
    clientId: controller.id,
    ctx,
  });
  assert.equal(unlock.handled, true);
  assert.equal(locks.has('node_1:tab_1'), false);
});

test('handleRelayWsPreCommandMessage handles logs subscribe and default event path', () => {
  const ws = { id: 'ws_logs' };
  const ctx = createPreCommandCtx();
  const controller = {
    id: 'controller_logs',
    role: 'controller',
    authenticated: true,
    subscriptions: new Set<string>(),
  };

  const subscribe = handleRelayWsPreCommandMessage({
    msg: { messageType: 'event', requestId: 'req_logs_sub', payload: { type: 'logs_subscribe', source: 'relay' } },
    ws,
    client: controller,
    clientId: controller.id,
    ctx,
  });
  assert.equal(subscribe.handled, true);
  assert.equal(controller.subscriptions.has('logs'), true);

  const nodeClient = {
    id: 'node_ext_1',
    role: 'node',
    nodeId: 'node_ext_1',
    authenticated: true,
    subscriptions: new Set<string>(),
  };
  const extension = handleRelayWsPreCommandMessage({
    msg: { messageType: 'event', requestId: 'req_ext', payload: { type: 'extension_log', entry: { level: 'info' } } },
    ws,
    client: nodeClient,
    clientId: nodeClient.id,
    ctx,
  });
  assert.equal(extension.handled, true);

  const ignored = handleRelayWsPreCommandMessage({
    msg: { messageType: 'event', requestId: 'req_other_event', payload: { type: 'some_other_event' } },
    ws,
    client: controller,
    clientId: controller.id,
    ctx,
  });
  assert.equal(ignored.handled, true);
});

test('handleRelayWsPreCommandMessage rejects invalid hello payload', () => {
  const ws = { id: 'ws_bad_hello' };
  const ctx = createPreCommandCtx({
    helloSchema: {
      safeParse: () => ({ success: false, error: { message: 'bad hello' } }),
    },
  });

  const result = handleRelayWsPreCommandMessage({
    msg: { messageType: 'hello', requestId: 'req_bad_hello', payload: {} },
    ws,
    client: undefined,
    clientId: 'client_bad_hello',
    ctx,
  });

  const sent = ctx.__sent as Array<{ payload: { payload: { code: string } } }>;
  assert.equal(result.handled, true);
  assert.equal(sent[0]?.payload.payload.code, 'invalid_hello');
});

test('handleRelayWsPreCommandMessage rejects auth role mismatch', async () => {
  const ws = { id: 'ws_role_mismatch' };
  const client = {
    id: 'controller_role_mismatch',
    role: 'controller',
    authenticated: false,
    subscriptions: new Set<string>(),
  };
  const ctx = createPreCommandCtx({
    verifyAccessToken: async () => ({ role: 'node', scopes: ['*'] }),
  });

  const result = handleRelayWsPreCommandMessage({
    msg: { messageType: 'auth', requestId: 'req_role_mismatch', payload: { accessToken: 'tok' } },
    ws,
    client,
    clientId: client.id,
    ctx,
  });

  await flushMicrotasks();
  const sent = ctx.__sent as Array<{ payload: { payload: { code: string } } }>;
  assert.equal(result.handled, true);
  assert.equal(sent[0]?.payload.payload.code, 'role_mismatch');
});

test('handleRelayWsPreCommandMessage rejects node token mismatch and revoked controller token', async () => {
  const ws = { id: 'ws_mismatch_revoke' };

  const nodeClient = {
    id: 'node_client_mismatch',
    role: 'node',
    nodeId: 'node_a',
    authenticated: false,
    subscriptions: new Set<string>(),
  };
  const nodeCtx = createPreCommandCtx({
    verifyAccessToken: async () => ({ role: 'node', nodeId: 'node_b', scopes: ['*'] }),
  });
  handleRelayWsPreCommandMessage({
    msg: { messageType: 'auth', requestId: 'req_node_mismatch', payload: { accessToken: 'tok' } },
    ws,
    client: nodeClient,
    clientId: nodeClient.id,
    ctx: nodeCtx,
  });
  await flushMicrotasks();
  const nodeSent = nodeCtx.__sent as Array<{ payload: { payload: { code: string } } }>;
  assert.equal(nodeSent[0]?.payload.payload.code, 'node_mismatch');

  const controllerClient = {
    id: 'controller_revoked',
    role: 'controller',
    authenticated: false,
    subscriptions: new Set<string>(),
  };
  const controllerCtx = createPreCommandCtx({
    verifyAccessToken: async () => ({ role: 'controller', clientId: 'revoked_client', scopes: ['*'] }),
    isRevokedControllerClient: () => true,
  });
  handleRelayWsPreCommandMessage({
    msg: { messageType: 'auth', requestId: 'req_controller_revoked', payload: { accessToken: 'tok' } },
    ws,
    client: controllerClient,
    clientId: controllerClient.id,
    ctx: controllerCtx,
  });
  await flushMicrotasks();
  const controllerSent = controllerCtx.__sent as Array<{ payload: { payload: { code: string } } }>;
  assert.equal(controllerSent[0]?.payload.payload.code, 'invalid_access_token');
});

test('handleRelayWsPreCommandMessage handles auth verification failure catch', async () => {
  const ws = { id: 'ws_auth_catch' };
  const client = {
    id: 'controller_auth_catch',
    role: 'controller',
    authenticated: false,
    subscriptions: new Set<string>(),
  };
  const ctx = createPreCommandCtx({
    verifyAccessToken: async () => {
      throw new Error('bad token');
    },
  });

  const result = handleRelayWsPreCommandMessage({
    msg: { messageType: 'auth', requestId: 'req_auth_catch', payload: { accessToken: 'tok' } },
    ws,
    client,
    clientId: client.id,
    ctx,
  });
  await flushMicrotasks();
  const sent = ctx.__sent as Array<{ payload: { payload: { code: string } } }>;
  assert.equal(result.handled, true);
  assert.equal(sent[0]?.payload.payload.code, 'invalid_access_token');
});

test('handleRelayWsPreCommandMessage handles pong, rate-limit reject, and forbidden role lock', () => {
  const ws = { id: 'ws_misc' };
  const sentCtx = createPreCommandCtx();
  const controller = {
    id: 'controller_misc',
    role: 'controller',
    authenticated: true,
    subscriptions: new Set<string>(),
  };

  const pong = handleRelayWsPreCommandMessage({
    msg: { messageType: 'pong', requestId: 'req_pong', payload: {} },
    ws,
    client: controller,
    clientId: controller.id,
    ctx: sentCtx,
  });
  assert.equal(pong.handled, true);

  const rateCtx = createPreCommandCtx({ checkRateLimit: () => false });
  const rateLimited = handleRelayWsPreCommandMessage({
    msg: { messageType: 'tab_unlock', requestId: 'req_rate_limited', payload: { targetNodeId: 'n', tabSessionId: 't' } },
    ws,
    client: controller,
    clientId: controller.id,
    ctx: rateCtx,
  });
  const rateSent = rateCtx.__sent as Array<{ payload: { payload: { code: string } } }>;
  assert.equal(rateLimited.handled, true);
  assert.equal(rateSent[0]?.payload.payload.code, 'rate_limited');

  const nodeCtx = createPreCommandCtx();
  const node = {
    id: 'node_misc',
    role: 'node',
    nodeId: 'node_misc',
    authenticated: true,
    subscriptions: new Set<string>(),
  };
  const forbidden = handleRelayWsPreCommandMessage({
    msg: { messageType: 'tab_lock', requestId: 'req_forbidden_role', payload: { targetNodeId: 'n', tabSessionId: 't' } },
    ws,
    client: node,
    clientId: node.id,
    ctx: nodeCtx,
  });
  const nodeSent = nodeCtx.__sent as Array<{ payload: { payload: { code: string } } }>;
  assert.equal(forbidden.handled, true);
  assert.equal(nodeSent[0]?.payload.payload.code, 'forbidden_role');
});

test('handleRelayWsPreCommandMessage validates logs and listener event payload variants', () => {
  const ws = { id: 'ws_event_validation' };
  const controller = {
    id: 'controller_validate_logs',
    role: 'controller',
    authenticated: true,
    subscriptions: new Set<string>(),
  };

  const badLogsCtx = createPreCommandCtx({
    logsSubscribeSchema: {
      safeParse: () => ({ success: false, error: { message: 'bad logs subscribe' } }),
    },
  });
  handleRelayWsPreCommandMessage({
    msg: { messageType: 'event', requestId: 'req_bad_logs', payload: { type: 'logs_subscribe' } },
    ws,
    client: controller,
    clientId: controller.id,
    ctx: badLogsCtx,
  });
  const badLogsSent = badLogsCtx.__sent as Array<{ payload: { payload: { code: string } } }>;
  assert.equal(badLogsSent[0]?.payload.payload.code, 'invalid_logs_subscribe');

  const node = {
    id: 'node_validate_events',
    role: 'node',
    nodeId: 'node_validate_events',
    authenticated: true,
    subscriptions: new Set<string>(),
  };
  const badExtensionCtx = createPreCommandCtx({
    extensionLogEventSchema: {
      safeParse: () => ({ success: false, error: { message: 'bad extension event' } }),
    },
  });
  handleRelayWsPreCommandMessage({
    msg: { messageType: 'event', requestId: 'req_bad_extension', payload: { type: 'extension_log' } },
    ws,
    client: node,
    clientId: node.id,
    ctx: badExtensionCtx,
  });
  const badExtensionSent = badExtensionCtx.__sent as Array<{ payload: { payload: { code: string } } }>;
  assert.equal(badExtensionSent[0]?.payload.payload.code, 'invalid_extension_log');

  const badListenerCtx = createPreCommandCtx({
    listenerUpdateEventSchema: {
      safeParse: () => ({ success: false, error: { message: 'bad listener update' } }),
    },
  });
  handleRelayWsPreCommandMessage({
    msg: { messageType: 'event', requestId: 'req_bad_listener', payload: { type: 'listener_update' } },
    ws,
    client: node,
    clientId: node.id,
    ctx: badListenerCtx,
  });
  const badListenerSent = badListenerCtx.__sent as Array<{ payload: { payload: { code: string } } }>;
  assert.equal(badListenerSent[0]?.payload.payload.code, 'invalid_listener_update');
});

test('handleRelayWsPreCommandMessage handles listener_update not found, node mismatch, and success forward', () => {
  const ws = { id: 'ws_listener_variants' };
  const node = {
    id: 'node_listener_variants',
    role: 'node',
    nodeId: 'node_1',
    authenticated: true,
    subscriptions: new Set<string>(),
  };

  const notFoundCtx = createPreCommandCtx({
    listenerSubscriptions: new Map<string, { controllerId: string; nodeId: string }>(),
  });
  handleRelayWsPreCommandMessage({
    msg: { messageType: 'event', requestId: 'req_listener_not_found', payload: { type: 'listener_update' } },
    ws,
    client: node,
    clientId: node.id,
    ctx: notFoundCtx,
  });
  const notFoundSent = notFoundCtx.__sent as Array<{ payload: { payload: { code: string } } }>;
  assert.equal(notFoundSent[0]?.payload.payload.code, 'listener_not_found');

  const mismatchSubs = new Map<string, { controllerId: string; nodeId: string }>();
  mismatchSubs.set('req_listener_mismatch', { controllerId: 'controller_1', nodeId: 'node_2' });
  const mismatchCtx = createPreCommandCtx({ listenerSubscriptions: mismatchSubs });
  handleRelayWsPreCommandMessage({
    msg: { messageType: 'event', requestId: 'req_listener_mismatch', payload: { type: 'listener_update' } },
    ws,
    client: node,
    clientId: node.id,
    ctx: mismatchCtx,
  });
  const mismatchSent = mismatchCtx.__sent as Array<{ payload: { payload: { code: string } } }>;
  assert.equal(mismatchSent[0]?.payload.payload.code, 'listener_node_mismatch');

  const successSubs = new Map<string, { controllerId: string; nodeId: string }>();
  successSubs.set('req_listener_success', { controllerId: 'controller_ok', nodeId: 'node_1' });
  const ownerWs = { id: 'owner_ws' };
  const successCtx = createPreCommandCtx({
    listenerSubscriptions: successSubs,
    clients: new Map<string, { authenticated: boolean; ws: unknown }>([
      ['controller_ok', { authenticated: true, ws: ownerWs }],
    ]),
  });
  const success = handleRelayWsPreCommandMessage({
    msg: { messageType: 'event', requestId: 'req_listener_success', payload: { type: 'listener_update' } },
    ws,
    client: node,
    clientId: node.id,
    ctx: successCtx,
  });
  const successSent = successCtx.__sent as Array<{ ws: unknown; payload: { messageType: string } }>;
  assert.equal(success.handled, true);
  assert.equal(successSent[0]?.ws, ownerWs);
  assert.equal(successSent[0]?.payload.messageType, 'event');
});

test('handleRelayWsPreCommandMessage unlocks only when lock owner matches and returns false for unhandled types', () => {
  const ws = { id: 'ws_unlock_mismatch' };
  const ctx = createPreCommandCtx();
  const locks = ctx.locks as Map<string, { controllerId: string; expiresAt: number }>;
  locks.set('node_u:tab_u', { controllerId: 'controller_a', expiresAt: Date.now() + 10_000 });

  const controllerB = {
    id: 'controller_b',
    role: 'controller',
    authenticated: true,
    subscriptions: new Set<string>(),
  };
  const unlock = handleRelayWsPreCommandMessage({
    msg: { messageType: 'tab_unlock', requestId: 'req_unlock_mismatch', payload: { targetNodeId: 'node_u', tabSessionId: 'tab_u' } },
    ws,
    client: controllerB,
    clientId: controllerB.id,
    ctx,
  });
  assert.equal(unlock.handled, true);
  assert.equal(locks.has('node_u:tab_u'), true);

  const unhandled = handleRelayWsPreCommandMessage({
    msg: { messageType: 'other_type', requestId: 'req_unhandled', payload: {} },
    ws,
    client: controllerB,
    clientId: controllerB.id,
    ctx,
  });
  assert.equal(unhandled.handled, false);
});

test('handleRelayWsClose handles null client and performs node/controller cleanup paths', () => {
  const nullCtx = createCloseCtx();
  handleRelayWsClose({ client: undefined, ctx: nullCtx });

  const events: string[] = [];
  const sent: Array<{ ws: unknown; payload: unknown }> = [];
  const ownerWs = { id: 'owner_ws_close' };
  const nodeClient = { id: 'node_close_1', role: 'node', nodeId: 'node_close' };
  const controllerClient = { id: 'controller_close_1', role: 'controller' };

  const closeCtx = createCloseCtx();
  const clients = closeCtx.clients as Map<string, unknown>;
  const nodeClients = closeCtx.nodeClients as Map<string, unknown>;
  const replayState = closeCtx.replayState as Map<string, unknown>;
  const commandTestStreamSessions = closeCtx.commandTestStreamSessions as Map<string, unknown>;
  const pendingCommands = closeCtx.pendingCommands as Map<string, {
    nodeId: string;
    controllerId: string;
    timeoutHandle: ReturnType<typeof setTimeout>;
    tabKey: string;
    action?: string;
  }>;
  const locks = closeCtx.locks as Map<string, { controllerId: string; expiresAt: number }>;

  closeCtx.send = (ws: unknown, payload: unknown) => {
    sent.push({ ws, payload });
  };
  closeCtx.buildEnvelope = (messageType: string, _senderRole: string, requestId: string, payload: Record<string, unknown>) => ({
    messageType,
    requestId,
    payload,
  });
  closeCtx.buildError = (requestId: string, _senderRole: string, payload: Record<string, unknown>) => ({
    messageType: 'error',
    requestId,
    payload,
  });
  closeCtx.removeListenerSubscriptionsForNode = () => events.push('removeListenerSubscriptionsForNode');
  closeCtx.clearCommandTestStreamSessionsForNode = () => events.push('clearCommandTestStreamSessionsForNode');
  closeCtx.clearInflightAndRunNext = () => events.push('clearInflightAndRunNext');
  closeCtx.removeListenerSubscriptionsForController = () => events.push('removeListenerSubscriptionsForController');
  closeCtx.clearCommandTestStreamSessionsForController = () => events.push('clearCommandTestStreamSessionsForController');
  closeCtx.removeQueuedCommandsForController = () => events.push('removeQueuedCommandsForController');
  closeCtx.requestOwnedTabCleanupForController = () => events.push('requestOwnedTabCleanupForController');

  clients.set('owner_controller', { id: 'owner_controller', authenticated: true, ws: ownerWs });
  clients.set(nodeClient.id, nodeClient);
  nodeClients.set('node_close', nodeClient);
  replayState.set(nodeClient.id, { nonce: 'x' });
  commandTestStreamSessions.set('stream_match', {
    nodeId: 'node_close',
    controllerId: 'owner_controller',
    createdAt: Date.now() - 20,
    action: 'command.test',
  });
  commandTestStreamSessions.set('stream_other', {
    nodeId: 'other_node',
    controllerId: 'owner_controller',
    createdAt: Date.now() - 20,
    action: 'command.test',
  });
  pendingCommands.set('pending_match', {
    nodeId: 'node_close',
    controllerId: 'owner_controller',
    timeoutHandle: setTimeout(() => undefined, 1000),
    tabKey: 'tab_key_1',
    action: 'primitive.tab.open',
  });
  pendingCommands.set('pending_other', {
    nodeId: 'other_node',
    controllerId: 'owner_controller',
    timeoutHandle: setTimeout(() => undefined, 1000),
    tabKey: 'tab_key_2',
    action: 'primitive.tab.open',
  });

  locks.set('node_close:tab_a', { controllerId: 'controller_close_1', expiresAt: Date.now() + 10_000 });
  locks.set('node_close:tab_b', { controllerId: 'someone_else', expiresAt: Date.now() + 10_000 });

  handleRelayWsClose({ client: nodeClient, ctx: closeCtx });

  assert.equal(nodeClients.has('node_close'), false);
  assert.equal(replayState.has(nodeClient.id), false);
  assert.equal(commandTestStreamSessions.has('stream_match'), true);
  assert.equal(pendingCommands.has('pending_match'), false);
  assert.equal(pendingCommands.has('pending_other'), true);
  assert.ok(events.includes('removeListenerSubscriptionsForNode'));
  assert.ok(events.includes('clearCommandTestStreamSessionsForNode'));
  assert.ok(events.includes('clearInflightAndRunNext'));
  assert.equal(sent.length >= 2, true);

  clients.set(controllerClient.id, controllerClient);
  replayState.set(controllerClient.id, { nonce: 'y' });
  handleRelayWsClose({ client: controllerClient, ctx: closeCtx });

  assert.ok(events.includes('removeListenerSubscriptionsForController'));
  assert.ok(events.includes('clearCommandTestStreamSessionsForController'));
  assert.ok(events.includes('removeQueuedCommandsForController'));
  assert.ok(events.includes('requestOwnedTabCleanupForController'));
  assert.equal(locks.has('node_close:tab_a'), false);
  assert.equal(locks.has('node_close:tab_b'), true);

  const timeout = pendingCommands.get('pending_other')?.timeoutHandle;
  if (timeout) {
    clearTimeout(timeout);
  }
});
