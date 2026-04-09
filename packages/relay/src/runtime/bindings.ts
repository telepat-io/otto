import type { WebSocket } from 'ws';
import type { Envelope, ErrorPayload, MessageType, OttoRole } from '@telepat/otto-protocol';
import { disconnectControllerSessionsByClientId, removeControllerClientById } from '../controller-client-removal-utils.js';
import { revokeControllerAclByClientId, type ControllerAclGrant } from '../controller-acl-utils.js';
import { revokeRefreshSessionsByClientId, type RefreshSession } from '../refresh-session-utils.js';
import {
  clearCommandTestStreamSession as clearCommandTestStreamSessionUtil,
  clearCommandTestStreamSessionsForController as clearCommandTestStreamSessionsForControllerUtil,
  clearCommandTestStreamSessionsForNode as clearCommandTestStreamSessionsForNodeUtil,
  markControllerHeartbeat as markControllerHeartbeatUtil,
  queuedDepthForController as queuedDepthForControllerUtil,
  removeListenerSubscription as removeListenerSubscriptionUtil,
  removeListenerSubscriptionsForController as removeListenerSubscriptionsForControllerUtil,
  removeListenerSubscriptionsForNode as removeListenerSubscriptionsForNodeUtil,
  removeQueuedCommandsForController as removeQueuedCommandsForControllerUtil,
  requestOwnedTabCleanupForController as requestOwnedTabCleanupForControllerUtil,
  withControllerOwnershipMetadata as withControllerOwnershipMetadataUtil,
} from './helpers.js';
import type { ControllerClientRecord, LogEvent } from '../relay-models-schemas.js';
import type {
  Client,
  CommandTestStreamSession,
  ListenerSubscription,
  QueuedCommand,
} from './types.js';

export function createRelayRuntimeBindings(params: {
  clients: Map<string, Client>;
  nodeClients: Map<string, Client>;
  controllerClients: Map<string, ControllerClientRecord>;
  controllerAcl: Map<string, ControllerAclGrant>;
  refreshTokens: Map<string, RefreshSession>;
  queuedByTab: Map<string, QueuedCommand[]>;
  listenerSubscriptions: Map<string, ListenerSubscription>;
  listenerToCommandStreamSession: Map<string, string>;
  commandTestStreamSessions: Map<string, CommandTestStreamSession>;
  persistControllerClients: () => void;
  persistControllerAcl: () => void;
  persistRefreshSessions: () => void;
  send: (ws: WebSocket, msg: Envelope) => void;
  buildError: (requestId: string, role: OttoRole | 'relay', payload: ErrorPayload) => Envelope<ErrorPayload>;
  buildEnvelope: (messageType: MessageType, senderRole: OttoRole | 'relay', requestId: string, payload: unknown) => Envelope;
  emitLog: (event: Omit<LogEvent, 'id' | 'timestamp'>) => void;
  nextRequestId: () => string;
  asRecord: (value: unknown) => Record<string, unknown> | null;
}) {
  const disconnectControllerSessionsByClientIdWithSignal = (clientId: string): number => {
    return disconnectControllerSessionsByClientId(params.clients.values(), clientId, (client) => {
      params.send(client.ws, params.buildError(params.nextRequestId(), 'relay', {
        category: 'auth',
        code: 'controller_revoked',
        message: 'Controller client has been removed and access has been revoked',
        clientId,
      }));
      client.ws.close();
    });
  };

  const removeControllerClientByIdWithSideEffects = (clientId: string) => {
    return removeControllerClientById(
      params.controllerClients,
      params.persistControllerClients,
      (targetClientId) => revokeControllerAclByClientId(params.controllerAcl, params.persistControllerAcl, targetClientId),
      (targetClientId) => revokeRefreshSessionsByClientId(params.refreshTokens, params.persistRefreshSessions, targetClientId),
      disconnectControllerSessionsByClientIdWithSignal,
      ({ clientId: removedClientId, aclRevokedCount, refreshRevokedCount, disconnectedSessions }) => {
        params.emitLog({
          level: 'warn',
          source: 'relay',
          type: 'controller_client_removed',
          status: 'revoked',
          data: {
            clientId: removedClientId,
            aclRevokedCount,
            refreshRevokedCount,
            disconnectedSessions,
          },
        });
      },
      clientId,
    );
  };

  function queuedDepthForController(controllerId: string): number {
    return queuedDepthForControllerUtil(params.queuedByTab, controllerId);
  }

  function removeQueuedCommandsForController(controllerId: string): void {
    removeQueuedCommandsForControllerUtil(params.queuedByTab, controllerId, ({ requestId, tabKey }) => {
      params.emitLog({
        level: 'info',
        source: 'relay',
        type: 'queued_command_dropped',
        requestId,
        status: 'controller_disconnected',
        data: {
          controllerId,
          tabKey,
        },
      });
    });
  }

  function withControllerOwnershipMetadata(msg: Envelope, controllerClientId?: string): Envelope {
    return withControllerOwnershipMetadataUtil(msg, controllerClientId, params.asRecord);
  }

  function requestOwnedTabCleanupForController(client: Client): void {
    requestOwnedTabCleanupForControllerUtil({
      client,
      nodeClients: params.nodeClients,
      send: (ws, msg) => params.send(ws as WebSocket, msg),
      buildEnvelope: params.buildEnvelope,
      emitLog: params.emitLog,
      nextRequestId: params.nextRequestId,
    });
  }

  function removeListenerSubscription(requestId: string): void {
    removeListenerSubscriptionUtil(
      params.listenerSubscriptions,
      params.listenerToCommandStreamSession,
      params.commandTestStreamSessions,
      requestId,
    );
  }

  function removeListenerSubscriptionsForController(controllerId: string): void {
    removeListenerSubscriptionsForControllerUtil(params.listenerSubscriptions, params.listenerToCommandStreamSession, controllerId);
  }

  function removeListenerSubscriptionsForNode(nodeId: string): void {
    removeListenerSubscriptionsForNodeUtil(params.listenerSubscriptions, params.listenerToCommandStreamSession, nodeId);
  }

  function clearCommandTestStreamSession(sessionRequestId: string): void {
    clearCommandTestStreamSessionUtil(params.commandTestStreamSessions, params.listenerToCommandStreamSession, sessionRequestId);
  }

  function clearCommandTestStreamSessionsForController(controllerId: string): void {
    clearCommandTestStreamSessionsForControllerUtil(
      params.commandTestStreamSessions,
      params.listenerToCommandStreamSession,
      controllerId,
    );
  }

  function clearCommandTestStreamSessionsForNode(nodeId: string): void {
    clearCommandTestStreamSessionsForNodeUtil(params.commandTestStreamSessions, params.listenerToCommandStreamSession, nodeId);
  }

  function markControllerHeartbeat(client: Client): void {
    markControllerHeartbeatUtil(client);
  }

  return {
    removeControllerClientByIdWithSideEffects,
    queuedDepthForController,
    removeQueuedCommandsForController,
    withControllerOwnershipMetadata,
    requestOwnedTabCleanupForController,
    removeListenerSubscription,
    removeListenerSubscriptionsForController,
    removeListenerSubscriptionsForNode,
    clearCommandTestStreamSession,
    clearCommandTestStreamSessionsForController,
    clearCommandTestStreamSessionsForNode,
    markControllerHeartbeat,
  };
}
