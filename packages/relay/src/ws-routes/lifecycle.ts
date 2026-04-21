/* eslint-disable @typescript-eslint/no-explicit-any */

import packageJson from '../../package.json' with { type: 'json' };

const RELAY_VERSION = packageJson.version;

export function handleRelayWsPreCommandMessage(params: {
  msg: any;
  ws: any;
  client: any;
  clientId: string;
  ctx: Record<string, unknown>;
}): { handled: boolean; client: any } {
  const { msg, ws, client, clientId, ctx } = params;
  const {
    send,
    buildError,
    helloSchema,
    clients,
    nodeClients,
    buildEnvelope,
    CONTROLLER_HEARTBEAT_INTERVAL_MS,
    emitLog,
    verifyAccessToken,
    isRevokedControllerClient,
    controllerClients,
    markControllerHeartbeat,
    checkRateLimit,
    logsSubscribeSchema,
    extensionLogEventSchema,
    listenerUpdateEventSchema,
    listenerSubscriptions,
    removeListenerSubscription,
    lockKey,
    locks,
  } = ctx as any;

  if (msg.messageType === 'hello') {
    const parsed = helloSchema.safeParse(msg.payload);
    if (!parsed.success) {
      send(ws, buildError(msg.requestId, 'relay', {
        category: 'validation',
        code: 'invalid_hello',
        message: parsed.error.message,
      }));
      return { handled: true, client };
    }

    const nextClient = {
      id: clientId,
      ws,
      role: parsed.data.role,
      nodeId: parsed.data.nodeId,
      scopes: [],
      authenticated: false,
      subscriptions: new Set<string>(),
      lastHeartbeatAtMs: Date.now(),
    };
    clients.set(nextClient.id, nextClient);
    if (nextClient.role === 'node' && nextClient.nodeId) {
      nodeClients.set(nextClient.nodeId, nextClient);
    }

    send(ws, buildEnvelope('hello_ack', 'relay', msg.requestId, {
      accepted: true,
      heartbeatIntervalMs: CONTROLLER_HEARTBEAT_INTERVAL_MS,
      relayVersion: RELAY_VERSION,
    }));
    return { handled: true, client: nextClient };
  }

  if (!client) {
    send(ws, buildError(msg.requestId, 'relay', {
      category: 'auth',
      code: 'not_initialized',
      message: 'Send hello first',
    }));
    return { handled: true, client };
  }

  if (msg.messageType === 'auth') {
    const payload = msg.payload as { accessToken?: string };
    if (!payload.accessToken) {
      emitLog({
        level: 'warn',
        source: 'relay',
        type: 'auth_rejected',
        requestId: msg.requestId,
        nodeId: client.nodeId,
        data: { reason: 'missing_access_token', role: client.role },
      });
      send(ws, buildError(msg.requestId, 'relay', {
        category: 'auth',
        code: 'missing_access_token',
        message: 'accessToken is required',
      }));
      return { handled: true, client };
    }

    verifyAccessToken(payload.accessToken)
      .then((token: any) => {
        if (token.role !== client?.role) {
          emitLog({
            level: 'warn',
            source: 'relay',
            type: 'auth_rejected',
            requestId: msg.requestId,
            nodeId: client?.nodeId,
            data: { reason: 'role_mismatch', role: client?.role, tokenRole: token.role },
          });
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'auth',
            code: 'role_mismatch',
            message: 'Token role mismatch',
          }));
          return;
        }
        if (client?.role === 'node' && client.nodeId && token.nodeId && client.nodeId !== token.nodeId) {
          emitLog({
            level: 'warn',
            source: 'relay',
            type: 'auth_rejected',
            requestId: msg.requestId,
            nodeId: client.nodeId,
            data: { reason: 'node_mismatch', tokenNodeId: token.nodeId },
          });
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'auth',
            code: 'node_mismatch',
            message: 'Token nodeId mismatch',
          }));
          return;
        }

        if (token.role === 'controller' && isRevokedControllerClient(controllerClients, token.clientId)) {
          emitLog({
            level: 'warn',
            source: 'relay',
            type: 'auth_rejected',
            requestId: msg.requestId,
            data: { reason: 'controller_revoked', clientId: token.clientId },
          });
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'auth',
            code: 'invalid_access_token',
            message: 'Controller client has been revoked',
            clientId: token.clientId,
          }));
          return;
        }

        if (client) {
          client.authenticated = true;
          client.nodeId = token.nodeId ?? client.nodeId;
          client.controllerId = token.controllerId;
          client.clientId = token.clientId;
          client.scopes = token.scopes;
        }

        send(ws, buildEnvelope('auth_ack', 'relay', msg.requestId, {
          accepted: true,
          role: token.role,
          nodeId: token.nodeId,
          controllerId: token.controllerId,
          scopes: token.scopes,
          relayVersion: RELAY_VERSION,
        }));
      })
      .catch(() => {
        emitLog({
          level: 'warn',
          source: 'relay',
          type: 'auth_rejected',
          requestId: msg.requestId,
          nodeId: client?.nodeId,
          data: { reason: 'invalid_access_token', role: client?.role },
        });
        send(ws, buildError(msg.requestId, 'relay', {
          category: 'auth',
          code: 'invalid_access_token',
          message: 'Access token verification failed',
        }));
      });
    return { handled: true, client };
  }

  if (!client.authenticated) {
    emitLog({
      level: 'warn',
      source: 'relay',
      type: 'unauthenticated_frame_rejected',
      requestId: msg.requestId,
      nodeId: client.nodeId,
      data: {
        role: client.role,
        messageType: msg.messageType,
      },
    });
    send(ws, buildError(msg.requestId, 'relay', {
      category: 'auth',
      code: 'unauthenticated',
      message: 'Authenticate before sending this frame type',
    }));
    return { handled: true, client };
  }

  markControllerHeartbeat(client);

  if (msg.messageType === 'ping') {
    send(ws, buildEnvelope('pong', 'relay', msg.requestId, {
      ok: true,
    }));
    return { handled: true, client };
  }

  if (msg.messageType === 'pong') {
    return { handled: true, client };
  }

  if (!checkRateLimit(client.id)) {
    send(ws, buildError(msg.requestId, 'relay', {
      category: 'auth',
      code: 'rate_limited',
      message: 'Rate limit exceeded for this session',
      retryable: true,
    }));
    return { handled: true, client };
  }

  if (msg.messageType === 'event') {
    const payload = msg.payload as { type?: string };
    if (client.role === 'controller' && payload.type === 'logs_subscribe') {
      const parsed = logsSubscribeSchema.safeParse(msg.payload);
      if (!parsed.success) {
        send(ws, buildError(msg.requestId, 'relay', {
          category: 'validation',
          code: 'invalid_logs_subscribe',
          message: parsed.error.message,
        }));
        return { handled: true, client };
      }

      const sourceFilter = parsed.data.source ?? 'all';
      client.subscriptions.add('logs');
      client.logSourceFilter = sourceFilter;
      send(ws, buildEnvelope('event', 'relay', msg.requestId, { type: 'logs_subscribed', source: sourceFilter }));
      return { handled: true, client };
    }

    if (client.role === 'node' && payload.type === 'extension_log') {
      const parsed = extensionLogEventSchema.safeParse(msg.payload);
      if (!parsed.success) {
        send(ws, buildError(msg.requestId, 'relay', {
          category: 'validation',
          code: 'invalid_extension_log',
          message: parsed.error.message,
        }));
        return { handled: true, client };
      }

      const entry = parsed.data.entry;
      emitLog({
        level: entry.level,
        source: 'node',
        type: entry.type,
        requestId: entry.requestId ?? msg.requestId,
        traceId: entry.traceId,
        nodeId: client.nodeId,
        action: entry.action,
        status: entry.status,
        data: {
          eventTimestamp: entry.timestamp,
          payload: entry.data,
        },
      });
    }

    if (client.role === 'node' && payload.type === 'listener_update') {
      const parsed = listenerUpdateEventSchema.safeParse(msg.payload);
      if (!parsed.success) {
        send(ws, buildError(msg.requestId, 'relay', {
          category: 'validation',
          code: 'invalid_listener_update',
          message: parsed.error.message,
        }));
        return { handled: true, client };
      }

      const subscription = listenerSubscriptions.get(msg.requestId);
      if (!subscription) {
        send(ws, buildError(msg.requestId, 'relay', {
          category: 'routing',
          code: 'listener_not_found',
          message: 'No active listener subscription for requestId',
        }));
        return { handled: true, client };
      }

      if (subscription.nodeId !== client.nodeId) {
        send(ws, buildError(msg.requestId, 'relay', {
          category: 'auth',
          code: 'listener_node_mismatch',
          message: 'Listener subscription does not belong to this node session',
          nodeId: client.nodeId,
        }));
        return { handled: true, client };
      }

      const owner = clients.get(subscription.controllerId);
      if (!owner || !owner.authenticated) {
        removeListenerSubscription(msg.requestId);
        send(ws, buildError(msg.requestId, 'relay', {
          category: 'routing',
          code: 'listener_owner_offline',
          message: 'Listener owner is no longer connected',
          nodeId: client.nodeId,
        }));
        return { handled: true, client };
      }

      send(owner.ws, buildEnvelope('event', 'relay', msg.requestId, {
        type: 'listener_update',
        data: parsed.data.data,
        updateType: parsed.data.updateType,
        emittedAt: parsed.data.emittedAt,
      }));
      emitLog({
        level: 'info',
        source: 'node',
        type: 'listener_update',
        requestId: msg.requestId,
        nodeId: client.nodeId,
        status: 'update',
        data: parsed.data,
      });
      return { handled: true, client };
    }
    return { handled: true, client };
  }

  if (msg.messageType === 'tab_lock') {
    if (client.role !== 'controller') {
      send(ws, buildError(msg.requestId, 'relay', {
        category: 'auth',
        code: 'forbidden_role',
        message: 'Only controllers can lock tabs',
      }));
      return { handled: true, client };
    }

    const payload = msg.payload as any;
    const key = lockKey(payload.targetNodeId, payload.tabSessionId);
    const current = locks.get(key);
    if (current && current.controllerId !== client.id) {
      send(ws, buildError(msg.requestId, 'relay', {
        category: 'lock_conflict',
        code: 'tab_locked',
        message: 'tabSessionId is locked by another controller',
        retryable: true,
        nodeId: payload.targetNodeId,
        tabSessionId: payload.tabSessionId,
      }));
      send(ws, buildEnvelope('event', 'relay', msg.requestId, {
        type: 'lock_conflict',
        targetNodeId: payload.targetNodeId,
        tabSessionId: payload.tabSessionId,
        lockOwnerControllerId: current.controllerId,
        lockExpiresAt: current.expiresAt,
      }));
      emitLog({
        level: 'warn',
        source: 'relay',
        type: 'lock_conflict',
        requestId: msg.requestId,
        nodeId: payload.targetNodeId,
        data: { tabSessionId: payload.tabSessionId },
      });
      return { handled: true, client };
    }

    if (current && current.controllerId === client.id) {
      const nextExpiresAt = Date.now() + (payload.lockLeaseMs ?? 30_000);
      current.expiresAt = nextExpiresAt;
      send(ws, buildEnvelope('event', 'relay', msg.requestId, {
        type: 'lock_renewed',
        targetNodeId: payload.targetNodeId,
        tabSessionId: payload.tabSessionId,
        lockOwnerControllerId: client.id,
        lockLeaseMs: payload.lockLeaseMs ?? 30_000,
        lockExpiresAt: nextExpiresAt,
      }));
      return { handled: true, client };
    }

    const lockExpiresAt = Date.now() + (payload.lockLeaseMs ?? 30_000);
    locks.set(key, {
      controllerId: client.id,
      expiresAt: lockExpiresAt,
    });

    send(ws, buildEnvelope('event', 'relay', msg.requestId, {
      type: 'lock_acquired',
      targetNodeId: payload.targetNodeId,
      tabSessionId: payload.tabSessionId,
      lockOwnerControllerId: client.id,
      lockLeaseMs: payload.lockLeaseMs ?? 30_000,
      lockExpiresAt,
    }));
    return { handled: true, client };
  }

  if (msg.messageType === 'tab_unlock') {
    const payload = msg.payload as any;
    const key = lockKey(payload.targetNodeId, payload.tabSessionId);
    const current = locks.get(key);
    if (current?.controllerId === client.id) {
      locks.delete(key);
    }
    send(ws, buildEnvelope('event', 'relay', msg.requestId, {
      type: 'lock_released',
      targetNodeId: payload.targetNodeId,
      tabSessionId: payload.tabSessionId,
    }));
    return { handled: true, client };
  }

  return { handled: false, client };
}

export function handleRelayWsClose(params: {
  client: any;
  ctx: Record<string, unknown>;
}): void {
  const { client, ctx } = params;
  const {
    clients,
    replayState,
    nodeClients,
    removeListenerSubscriptionsForNode,
    commandTestStreamSessions,
    send,
    buildEnvelope,
    clearCommandTestStreamSessionsForNode,
    pendingCommands,
    buildError,
    clearInflightAndRunNext,
    removeListenerSubscriptionsForController,
    clearCommandTestStreamSessionsForController,
    removeQueuedCommandsForController,
    requestOwnedTabCleanupForController,
    locks,
  } = ctx as any;

  if (!client) {
    return;
  }

  clients.delete(client.id);
  replayState.delete(client.id);
  if (client.role === 'node' && client.nodeId) {
    nodeClients.delete(client.nodeId);
    removeListenerSubscriptionsForNode(client.nodeId);

    for (const [sessionRequestId, session] of commandTestStreamSessions.entries()) {
      if (session.nodeId !== client.nodeId) {
        continue;
      }
      const owner = clients.get(session.controllerId);
      if (owner) {
        send(owner.ws, buildEnvelope('result', 'relay', sessionRequestId, {
          ok: true,
          durationMs: Date.now() - session.createdAt,
          action: session.action,
          commandOutcome: 'failed',
          data: {
            streamFailed: true,
            reason: 'node_disconnected',
          },
        }));
      }
    }
    clearCommandTestStreamSessionsForNode(client.nodeId);

    for (const [requestId, pending] of pendingCommands.entries()) {
      if (pending.nodeId === client.nodeId) {
        const owner = clients.get(pending.controllerId);
        if (owner) {
          send(owner.ws, buildError(requestId, 'relay', {
            category: 'execution',
            code: 'node_disconnected',
            message: 'Node disconnected during in-flight command',
            retryable: true,
            nodeId: pending.nodeId,
            action: pending.action,
          }));
        }
        clearTimeout(pending.timeoutHandle);
        pendingCommands.delete(requestId);
        clearInflightAndRunNext(pending.tabKey);
      }
    }
  }

  if (client.role === 'controller') {
    removeListenerSubscriptionsForController(client.id);
    clearCommandTestStreamSessionsForController(client.id);
    removeQueuedCommandsForController(client.id);
    requestOwnedTabCleanupForController(client);
  }

  for (const [key, lock] of locks.entries()) {
    if (lock.controllerId === client.id) {
      locks.delete(key);
    }
  }
}
