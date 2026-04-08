/* eslint-disable @typescript-eslint/no-explicit-any */

import type { WebSocketServer } from 'ws';
import { handleRelayWsClose, handleRelayWsPreCommandMessage } from './relay-ws-routes-lifecycle.js';
import { handleRelayWsNonCommandFrames } from './relay-ws-routes-non-command.js';

type RelayWsHandlersContext = Record<string, unknown>;

export function registerRelayWsHandlers(wss: WebSocketServer, ctx: RelayWsHandlersContext): void {
  const {
    nanoid,
    releaseExpiredLocks,
    send,
    buildError,
    clients,
    nodeClients,
    buildEnvelope,
    emitLog,
    isRevokedControllerClient,
    controllerClients,
    listenerSubscriptions,
    isActionAllowed,
    validateReplayWindow,
    isControllerAllowedNode,
    controllerAcl,
    persistControllerAcl,
    withControllerOwnershipMetadata,
    tabQueueKey,
    inflightByTab,
    queuedByTab,
    TAB_QUEUE_LIMIT,
    queuedDepthForController,
    CONTROLLER_QUEUE_LIMIT,
    asRecord,
    findCandidateCommandStreamSession,
    listenerToCommandStreamSession,
    commandTestStreamSessions,
    clearCommandTestStreamSession,
    pendingCommands,
    clearInflightAndRunNext,
  } = ctx as any;

  wss.on('connection', (ws) => {
    const clientId = nanoid();
    let client: any = null;

    ws.on('message', (raw) => {
      releaseExpiredLocks();

      let msg: any;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        send(ws, buildError('unknown', 'relay', {
          category: 'validation',
          code: 'invalid_json',
          message: 'Unable to parse JSON frame',
        }));
        return;
      }

      const preCommandResult = handleRelayWsPreCommandMessage({ msg, ws, client, clientId, ctx });
      client = preCommandResult.client;
      if (preCommandResult.handled) {
        return;
      }

      if (msg.messageType === 'command') {
        if (client.role !== 'controller') {
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'auth',
            code: 'forbidden_role',
            message: 'Only controller can send command frames',
          }));
          return;
        }

        if (isRevokedControllerClient(controllerClients, client.clientId)) {
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'auth',
            code: 'controller_revoked',
            message: 'Controller client has been removed and cannot execute commands',
            clientId: client.clientId,
          }));
          ws.close();
          return;
        }

        const payload = msg.payload as {
          targetNodeId?: string;
          action?: string;
          replayNonce?: string;
          payload?: { targetRequestId?: string };
        };
        if (!isActionAllowed(client.scopes, String(payload.action ?? ''))) {
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'auth',
            code: 'forbidden_action',
            message: 'Controller token does not allow this action',
            action: String(payload.action ?? ''),
            nodeId: payload.targetNodeId,
          }));
          return;
        }

        const replay = validateReplayWindow(client.id, msg.timestamp, payload.replayNonce);
        if (!replay.ok) {
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'validation',
            code: replay.code,
            message: replay.message,
          }));
          return;
        }

        if (!payload.targetNodeId) {
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'validation',
            code: 'missing_target_node',
            message: 'targetNodeId is required',
          }));
          return;
        }

        if (!isControllerAllowedNode(controllerAcl, persistControllerAcl, client.clientId, payload.targetNodeId)) {
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'auth',
            code: 'acl_missing_node_grant',
            message: 'Controller is not granted access to targetNodeId. Approve this controller in extension Controller Access UI.',
            actionableHint: 'Approve this controller from extension popup/options Controller Access section.',
            action: String(payload.action ?? ''),
            nodeId: payload.targetNodeId,
            clientId: client.clientId,
          }));
          emitLog({
            level: 'warn',
            source: 'relay',
            type: 'controller_acl_denied',
            requestId: msg.requestId,
            nodeId: payload.targetNodeId,
            action: String(payload.action ?? ''),
            status: 'denied',
            data: {
              controllerId: client.controllerId,
              clientId: client.clientId,
            },
          });
          return;
        }

        if (payload.action === 'listener.unsubscribe') {
          const targetRequestId = payload.payload?.targetRequestId;
          if (!targetRequestId || typeof targetRequestId !== 'string') {
            send(ws, buildError(msg.requestId, 'relay', {
              category: 'validation',
              code: 'missing_listener_target',
              message: 'listener.unsubscribe requires payload.targetRequestId',
              action: String(payload.action ?? ''),
            }));
            return;
          }

          const existing = listenerSubscriptions.get(targetRequestId);
          if (!existing) {
            send(ws, buildError(msg.requestId, 'relay', {
              category: 'routing',
              code: 'listener_not_found',
              message: 'No active listener subscription for payload.targetRequestId',
              action: String(payload.action ?? ''),
              nodeId: payload.targetNodeId,
            }));
            return;
          }

          if (existing.controllerId !== client.id) {
            send(ws, buildError(msg.requestId, 'relay', {
              category: 'auth',
              code: 'listener_owner_mismatch',
              message: 'Cannot unsubscribe a listener owned by another controller',
              action: String(payload.action ?? ''),
              nodeId: payload.targetNodeId,
            }));
            return;
          }

          if (existing.nodeId !== payload.targetNodeId) {
            send(ws, buildError(msg.requestId, 'relay', {
              category: 'validation',
              code: 'listener_node_mismatch',
              message: 'listener target node must match subscribed listener node',
              action: String(payload.action ?? ''),
              nodeId: payload.targetNodeId,
            }));
            return;
          }
        }

        const targetNode = nodeClients.get(payload.targetNodeId);
        if (!targetNode || !targetNode.authenticated) {
          send(ws, buildError(msg.requestId, 'relay', {
            category: 'routing',
            code: 'node_offline',
            message: `Node ${payload.targetNodeId} is not connected`,
            retryable: true,
            nodeId: payload.targetNodeId,
          }));
          return;
        }

        const messageForNode = withControllerOwnershipMetadata(msg, client.clientId);

        const tabSessionId = (msg.payload as { tabSessionId?: string }).tabSessionId;
        const queueKey = tabSessionId ? tabQueueKey(payload.targetNodeId, tabSessionId) : undefined;
        if (queueKey && inflightByTab.has(queueKey)) {
          const waitPolicy = (msg.payload as { waitPolicy?: string }).waitPolicy ?? 'fail_fast';
          if (waitPolicy === 'fail_fast') {
            send(ws, buildError(msg.requestId, 'relay', {
              category: 'lock_conflict',
              code: 'tab_busy',
              message: 'tabSessionId is busy and waitPolicy is fail_fast',
              retryable: true,
              nodeId: payload.targetNodeId,
              tabSessionId,
              action: String(payload.action ?? 'unknown'),
            }));
            return;
          }

          const queue = queuedByTab.get(queueKey) ?? [];
          if (queue.length >= TAB_QUEUE_LIMIT) {
            send(ws, buildError(msg.requestId, 'relay', {
              category: 'lock_conflict',
              code: 'tab_queue_limit_exceeded',
              message: `tabSessionId queue limit exceeded (${TAB_QUEUE_LIMIT})`,
              retryable: true,
              nodeId: payload.targetNodeId,
              tabSessionId,
              action: String(payload.action ?? 'unknown'),
            }));
            return;
          }

          const controllerQueuedDepth = queuedDepthForController(client.id);
          if (controllerQueuedDepth >= CONTROLLER_QUEUE_LIMIT) {
            send(ws, buildError(msg.requestId, 'relay', {
              category: 'lock_conflict',
              code: 'controller_queue_limit_exceeded',
              message: `controller queued command limit exceeded (${CONTROLLER_QUEUE_LIMIT})`,
              retryable: true,
              nodeId: payload.targetNodeId,
              tabSessionId,
              action: String(payload.action ?? 'unknown'),
            }));
            return;
          }

          const waitTimeoutMs = Math.max(1000, Number((msg.payload as { timeoutMs?: number }).timeoutMs ?? 30_000));
          const timeoutHandle = setTimeout(() => {
            const currentQueue = queuedByTab.get(queueKey);
            if (!currentQueue) return;
            const index = currentQueue.findIndex((item: any) => item.message.requestId === msg.requestId);
            if (index === -1) return;
            const [removed] = currentQueue.splice(index, 1);
            if (currentQueue.length === 0) queuedByTab.delete(queueKey);

            if (removed) {
              const owner = clients.get(removed.controllerId);
              if (owner) {
                send(owner.ws, buildError(msg.requestId, 'relay', {
                  category: 'timeout',
                  code: 'queue_wait_timed_out',
                  message: 'Command timed out while waiting in queue',
                  retryable: true,
                  nodeId: payload.targetNodeId,
                  action: String(payload.action ?? 'unknown'),
                  tabSessionId,
                }));
              }
            }
          }, waitTimeoutMs);

          queue.push({ message: messageForNode, controllerId: client.id, timeoutHandle });
          queuedByTab.set(queueKey, queue);
          send(ws, buildEnvelope('event', 'relay', msg.requestId, {
            type: 'queued',
            targetNodeId: payload.targetNodeId,
            tabSessionId,
            queueDepth: queue.length,
          }));
          return;
        }

        if (payload.action === 'listener.subscribe') {
          const subscribePayload = asRecord(payload.payload);
          const listener = subscribePayload?.listener;
          if (typeof listener === 'string' && listener.length > 0) {
            const streamSession = findCandidateCommandStreamSession(
              client.id,
              payload.targetNodeId,
              queueKey,
              listener,
            );
            if (streamSession) {
              const declaredListener = streamSession.listeners.find((item: any) => {
                if (item.subscribeRequestId) {
                  return false;
                }
                return item.listener === listener;
              });
              if (declaredListener) {
                declaredListener.subscribeRequestId = msg.requestId;
                listenerToCommandStreamSession.set(msg.requestId, streamSession.requestId);
              }
            }
          }
        }

        const timeoutMs = Number((msg.payload as { timeoutMs?: number }).timeoutMs ?? 30_000);
        if (queueKey) inflightByTab.add(queueKey);
        const timeoutHandle = setTimeout(() => {
          const stillPending = pendingCommands.get(msg.requestId);
          if (!stillPending) return;
          if (stillPending.action === 'listener.subscribe') {
            const sessionRequestId = listenerToCommandStreamSession.get(stillPending.requestId);
            if (sessionRequestId) {
              const streamSession = commandTestStreamSessions.get(sessionRequestId);
              const streamOwner = streamSession ? clients.get(streamSession.controllerId) : undefined;
              if (streamSession && streamOwner) {
                send(streamOwner.ws, buildEnvelope('result', 'relay', streamSession.requestId, {
                  ok: true,
                  durationMs: Date.now() - streamSession.createdAt,
                  action: streamSession.action,
                  commandOutcome: 'timed_out',
                  data: {
                    streamTimedOut: true,
                    reason: 'listener_subscribe_timeout',
                  },
                }));
              }
              clearCommandTestStreamSession(sessionRequestId);
            }
          }
          const owner = clients.get(stillPending.controllerId);
          if (owner) {
            send(owner.ws, buildError(msg.requestId, 'relay', {
              category: 'timeout',
              code: 'command_timed_out',
              message: 'Command exceeded timeout before terminal response',
              retryable: true,
              nodeId: stillPending.nodeId,
              action: stillPending.action,
            }));
          }
          pendingCommands.delete(msg.requestId);
          clearInflightAndRunNext(stillPending.tabKey);
        }, Math.max(1000, timeoutMs));

        pendingCommands.set(msg.requestId, {
          requestId: msg.requestId,
          controllerId: client.id,
          nodeId: payload.targetNodeId,
          action: String(payload.action ?? 'unknown'),
          timeoutMs,
          unsubscribeTargetRequestId: payload.action === 'listener.unsubscribe' ? payload.payload?.targetRequestId : undefined,
          createdAt: Date.now(),
          tabKey: queueKey,
          timeoutHandle,
        });

        send(targetNode.ws, messageForNode);
        send(ws, buildEnvelope('event', 'relay', msg.requestId, {
          type: 'routed',
          targetNodeId: payload.targetNodeId,
          tabSessionId,
        }));
        emitLog({
          level: 'info',
          source: 'controller',
          type: 'command_routed',
          requestId: msg.requestId,
          nodeId: payload.targetNodeId,
          action: String(payload.action ?? ''),
          status: 'routed',
        });
        return;
      }

      if (handleRelayWsNonCommandFrames({ msg, ws, client, ctx })) {
        return;
      }
    });

    ws.on('close', () => {
      handleRelayWsClose({ client, ctx });
    });
  });
}
