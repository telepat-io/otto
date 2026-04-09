/* eslint-disable @typescript-eslint/no-explicit-any */

export function handleRelayWsNonCommandFrames(params: {
  msg: any;
  ws: any;
  client: any;
  ctx: Record<string, unknown>;
}): boolean {
  const { msg, ws, client, ctx } = params;
  const {
    send,
    buildError,
    buildEnvelope,
    clients,
    nodeClients,
    queuedByTab,
    commandTestStreamSessions,
    clearCommandTestStreamSession,
    pendingCommands,
    clearInflightAndRunNext,
    removeListenerSubscription,
    listenerToCommandStreamSession,
    listenerSubscriptions,
    extractCommandStreamListeners,
    emitLog,
    resolveRefreshSession,
    refreshTokens,
    persistRefreshSessions,
    issueAccessToken,
    nanoid,
  } = ctx as any;

  if (msg.messageType === 'command_cancel') {
    if (client.role !== 'controller') {
      send(ws, buildError(msg.requestId, 'relay', {
        category: 'auth',
        code: 'forbidden_role',
        message: 'Only controller can cancel commands',
      }));
      return true;
    }

    const payload = msg.payload as { targetRequestId?: string };
    if (!payload.targetRequestId) {
      send(ws, buildError(msg.requestId, 'relay', {
        category: 'validation',
        code: 'missing_target_request',
        message: 'targetRequestId is required',
      }));
      return true;
    }

    const pending = pendingCommands.get(payload.targetRequestId);
    if (!pending) {
      let removedFromQueue = false;
      let queuedControllerId: string | undefined;
      let queuedAction: string | undefined;
      let queuedNodeId: string | undefined;
      let queuedTabSessionId: string | undefined;
      for (const [tabKey, queue] of queuedByTab.entries()) {
        const index = queue.findIndex((item: any) => item.message.requestId === payload.targetRequestId);
        if (index !== -1) {
          const queued = queue[index];
          const queuedPayload = queued?.message.payload as { action?: string; targetNodeId?: string; tabSessionId?: string } | undefined;
          queuedControllerId = queued?.controllerId;
          queuedAction = queuedPayload?.action;
          queuedNodeId = queuedPayload?.targetNodeId;
          queuedTabSessionId = queuedPayload?.tabSessionId;
          clearTimeout(queued?.timeoutHandle);
          queue.splice(index, 1);
          if (queue.length === 0) queuedByTab.delete(tabKey);
          removedFromQueue = true;
          break;
        }
      }

      if (removedFromQueue) {
        const queuedOwner = queuedControllerId ? clients.get(queuedControllerId) : undefined;
        if (queuedOwner) {
          send(queuedOwner.ws, buildError(payload.targetRequestId, 'relay', {
            category: 'execution',
            code: 'command_cancelled',
            message: 'Command was cancelled before execution',
            retryable: true,
            action: queuedAction,
            nodeId: queuedNodeId,
            tabSessionId: queuedTabSessionId,
          }));
        }

        send(ws, buildEnvelope('event', 'relay', msg.requestId, {
          type: 'cancel_ack',
          targetRequestId: payload.targetRequestId,
          status: 'cancelled',
        }));
        return true;
      }

      const streamSession = commandTestStreamSessions.get(payload.targetRequestId);
      if (streamSession) {
        if (streamSession.controllerId !== client.id) {
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'auth',
            code: 'command_owner_mismatch',
            message: 'Cannot cancel a command test stream owned by another controller',
            nodeId: streamSession.nodeId,
            action: streamSession.action,
          }));
          return true;
        }

        const nodeClient = nodeClients.get(streamSession.nodeId);
        if (nodeClient) {
          for (const listener of streamSession.listeners) {
            if (!listener.subscribeRequestId) {
              continue;
            }

            send(nodeClient.ws, buildEnvelope('command', 'relay', nanoid(), {
              targetNodeId: streamSession.nodeId,
              action: 'listener.unsubscribe',
              payload: {
                targetRequestId: listener.subscribeRequestId,
              },
              timeoutMs: 5000,
              waitPolicy: 'fail_fast',
            }));
          }
        }

        send(ws, buildEnvelope('result', 'relay', payload.targetRequestId, {
          ok: true,
          durationMs: Date.now() - streamSession.createdAt,
          action: streamSession.action,
          commandOutcome: 'cancelled',
          data: {
            streamCancelled: true,
          },
        }));
        clearCommandTestStreamSession(streamSession.requestId);
        send(ws, buildEnvelope('event', 'relay', msg.requestId, {
          type: 'cancel_ack',
          targetRequestId: payload.targetRequestId,
          status: 'cancelled',
        }));
        return true;
      }

      send(ws, buildError(msg.requestId, 'relay', {
        category: 'routing',
        code: 'command_not_found',
        message: 'No pending command with targetRequestId',
      }));
      return true;
    }

    const nodeClient = nodeClients.get(pending.nodeId);
    if (nodeClient) {
      send(nodeClient.ws, buildEnvelope('command_cancel', 'relay', msg.requestId, {
        targetRequestId: payload.targetRequestId,
        nodeId: pending.nodeId,
        action: pending.action,
      }));
    }

    send(ws, buildEnvelope('event', 'relay', msg.requestId, {
      type: 'cancel_ack',
      targetRequestId: payload.targetRequestId,
      status: 'forwarded',
    }));
    return true;
  }

  if (msg.messageType === 'result' || msg.messageType === 'error') {
    const pending = pendingCommands.get(msg.requestId);
    if (pending) {
      const owner = clients.get(pending.controllerId);
      if (owner) send(owner.ws, msg);

      if (msg.messageType === 'result') {
        const resultPayload = msg.payload as { ok?: boolean };
        if (resultPayload.ok === true && pending.action === 'listener.subscribe') {
          listenerSubscriptions.set(msg.requestId, {
            requestId: msg.requestId,
            controllerId: pending.controllerId,
            nodeId: pending.nodeId,
            createdAt: Date.now(),
          });
        }
        if (resultPayload.ok === true && pending.action === 'listener.unsubscribe' && pending.unsubscribeTargetRequestId) {
          removeListenerSubscription(pending.unsubscribeTargetRequestId);
        }

        if (resultPayload.ok === true && pending.action === 'command.test') {
          const listeners = extractCommandStreamListeners(msg.payload);
          if (listeners.length > 0) {
            commandTestStreamSessions.set(msg.requestId, {
              requestId: msg.requestId,
              controllerId: pending.controllerId,
              nodeId: pending.nodeId,
              action: pending.action,
              createdAt: pending.createdAt,
              tabKey: pending.tabKey,
              listeners,
            });
          }
        }
      }

      if (pending.action === 'listener.subscribe') {
        const sessionRequestId = listenerToCommandStreamSession.get(msg.requestId);
        const listenerSubscribeFailed = msg.messageType === 'error'
          || (msg.messageType === 'result' && (msg.payload as { ok?: boolean }).ok !== true);
        if (sessionRequestId && listenerSubscribeFailed) {
          const streamSession = commandTestStreamSessions.get(sessionRequestId);
          const streamOwner = streamSession ? clients.get(streamSession.controllerId) : undefined;
          if (streamSession && streamOwner) {
            send(streamOwner.ws, buildEnvelope('result', 'relay', streamSession.requestId, {
              ok: true,
              durationMs: Date.now() - streamSession.createdAt,
              action: streamSession.action,
              commandOutcome: 'failed',
              data: {
                streamFailed: true,
                reason: 'listener_subscribe_failed',
              },
            }));
          }
          clearCommandTestStreamSession(sessionRequestId);
        }
      }

      clearTimeout(pending.timeoutHandle);
      pendingCommands.delete(msg.requestId);
      clearInflightAndRunNext(pending.tabKey);
    }

    emitLog({
      level: msg.messageType === 'error' ? 'error' : 'info',
      source: client.role,
      type: msg.messageType,
      requestId: msg.requestId,
      nodeId: client.nodeId,
      status: msg.messageType,
      data: msg.payload,
    });
    return true;
  }

  if (msg.messageType === 'refresh') {
    const payload = msg.payload as { refreshToken?: string };
    if (!payload.refreshToken) {
      send(ws, buildError(msg.requestId, 'relay', {
        category: 'auth',
        code: 'missing_refresh_token',
        message: 'refreshToken is required',
      }));
      return true;
    }
    const session = resolveRefreshSession(refreshTokens, persistRefreshSessions, payload.refreshToken);
    if (!session) {
      send(ws, buildError(msg.requestId, 'relay', {
        category: 'auth',
        code: 'invalid_refresh_token',
        message: 'Refresh token invalid',
      }));
      return true;
    }
    issueAccessToken(session.role, session.nodeId, session.controllerId, session.scopes, session.clientId)
      .then((accessToken: string) => {
        send(ws, buildEnvelope('refresh_ack', 'relay', msg.requestId, { accessToken }));
      })
      .catch(() => {
        send(ws, buildError(msg.requestId, 'relay', {
          category: 'internal',
          code: 'refresh_failed',
          message: 'Failed to refresh access token',
        }));
      });
    return true;
  }

  return false;
}
