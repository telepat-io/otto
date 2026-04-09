import type { Envelope, OttoRole } from '@telepat/otto-protocol';

type ClientLike = {
  id: string;
  role: OttoRole;
  ws: unknown;
  nodeId?: string;
  controllerId?: string;
  clientId?: string;
  authenticated: boolean;
  lastHeartbeatAtMs?: number;
};

type ListenerSubscription = {
  requestId: string;
  controllerId: string;
  nodeId: string;
  createdAt: number;
};

type CommandStreamListenerBinding = {
  listener: string;
  options: Record<string, unknown>;
  subscribeRequestId?: string;
};

type CommandTestStreamSession = {
  requestId: string;
  controllerId: string;
  nodeId: string;
  action: string;
  createdAt: number;
  tabKey?: string;
  timeoutHandle?: ReturnType<typeof setTimeout>;
  listeners: CommandStreamListenerBinding[];
};

type QueuedCommand = {
  message: Envelope;
  controllerId: string;
  timeoutHandle: ReturnType<typeof setTimeout>;
};

export function lockKey(nodeId: string, tabSessionId: string): string {
  return `${nodeId}:${tabSessionId}`;
}

export function tabQueueKey(nodeId: string, tabSessionId: string): string {
  return `${nodeId}:${tabSessionId}`;
}

export function queuedDepthForController(
  queuedByTab: Map<string, QueuedCommand[]>,
  controllerId: string,
): number {
  let total = 0;
  for (const queue of queuedByTab.values()) {
    for (const item of queue) {
      if (item.controllerId === controllerId) total += 1;
    }
  }
  return total;
}

export function removeQueuedCommandsForController(
  queuedByTab: Map<string, QueuedCommand[]>,
  controllerId: string,
  onDrop: (params: { requestId: string; controllerId: string; tabKey: string }) => void,
): void {
  for (const [tabKey, queue] of queuedByTab.entries()) {
    const kept: QueuedCommand[] = [];
    for (const queued of queue) {
      if (queued.controllerId !== controllerId) {
        kept.push(queued);
        continue;
      }

      clearTimeout(queued.timeoutHandle);
      onDrop({
        requestId: queued.message.requestId,
        controllerId,
        tabKey,
      });
    }

    if (kept.length === 0) {
      queuedByTab.delete(tabKey);
      continue;
    }

    queuedByTab.set(tabKey, kept);
  }
}

export function withControllerOwnershipMetadata(
  msg: Envelope,
  controllerClientId: string | undefined,
  asRecord: (value: unknown) => Record<string, unknown> | null,
): Envelope {
  const payload = asRecord(msg.payload);
  const action = typeof payload?.action === 'string' ? payload.action : undefined;
  if (action !== 'primitive.tab.open' || !controllerClientId) {
    return msg;
  }

  const nested = asRecord(payload?.payload) ?? {};
  const mergedPayload = {
    ...nested,
    __controllerClientId: controllerClientId,
  };

  return {
    ...msg,
    payload: {
      ...payload,
      payload: mergedPayload,
    },
  };
}

export function requestOwnedTabCleanupForController(params: {
  client: ClientLike;
  nodeClients: Map<string, ClientLike>;
  send: (ws: unknown, msg: Envelope) => void;
  buildEnvelope: (messageType: 'command', senderRole: OttoRole | 'relay', requestId: string, payload: unknown) => Envelope;
  emitLog: (event: {
    level: 'debug' | 'info' | 'warn' | 'error';
    source: 'relay' | 'controller' | 'node';
    type: string;
    requestId?: string;
    nodeId?: string;
    action?: string;
    status?: string;
    data?: unknown;
  }) => void;
  nextRequestId: () => string;
}): void {
  if (params.client.role !== 'controller' || !params.client.clientId) {
    return;
  }

  for (const nodeClient of params.nodeClients.values()) {
    if (!nodeClient.authenticated || !nodeClient.nodeId) {
      continue;
    }

    const cleanupRequestId = params.nextRequestId();
    params.send(nodeClient.ws, params.buildEnvelope('command', 'relay', cleanupRequestId, {
      targetNodeId: nodeClient.nodeId,
      action: 'primitive.tab.close_owned',
      payload: {
        controllerClientId: params.client.clientId,
      },
      timeoutMs: 10_000,
      waitPolicy: 'fail_fast',
    }));

    params.emitLog({
      level: 'info',
      source: 'relay',
      type: 'orphan_tab_cleanup_dispatched',
      requestId: cleanupRequestId,
      nodeId: nodeClient.nodeId,
      action: 'primitive.tab.close_owned',
      status: 'dispatched',
      data: {
        controllerId: params.client.controllerId,
        clientId: params.client.clientId,
      },
    });
  }
}

export function removeListenerSubscription(
  listenerSubscriptions: Map<string, ListenerSubscription>,
  listenerToCommandStreamSession: Map<string, string>,
  commandTestStreamSessions: Map<string, CommandTestStreamSession>,
  requestId: string,
): void {
  const sessionRequestId = listenerToCommandStreamSession.get(requestId);
  if (sessionRequestId) {
    const session = commandTestStreamSessions.get(sessionRequestId);
    if (session) {
      for (const listener of session.listeners) {
        if (listener.subscribeRequestId === requestId) {
          listener.subscribeRequestId = undefined;
        }
      }
    }
    listenerToCommandStreamSession.delete(requestId);
  }
  listenerSubscriptions.delete(requestId);
}

export function removeListenerSubscriptionsForController(
  listenerSubscriptions: Map<string, ListenerSubscription>,
  listenerToCommandStreamSession: Map<string, string>,
  controllerId: string,
): void {
  for (const [requestId, subscription] of listenerSubscriptions.entries()) {
    if (subscription.controllerId === controllerId) {
      listenerSubscriptions.delete(requestId);
      listenerToCommandStreamSession.delete(requestId);
    }
  }
}

export function removeListenerSubscriptionsForNode(
  listenerSubscriptions: Map<string, ListenerSubscription>,
  listenerToCommandStreamSession: Map<string, string>,
  nodeId: string,
): void {
  for (const [requestId, subscription] of listenerSubscriptions.entries()) {
    if (subscription.nodeId === nodeId) {
      listenerSubscriptions.delete(requestId);
      listenerToCommandStreamSession.delete(requestId);
    }
  }
}

export function clearCommandTestStreamSession(
  commandTestStreamSessions: Map<string, CommandTestStreamSession>,
  listenerToCommandStreamSession: Map<string, string>,
  sessionRequestId: string,
): void {
  const session = commandTestStreamSessions.get(sessionRequestId);
  if (!session) {
    return;
  }

  if (session.timeoutHandle) {
    clearTimeout(session.timeoutHandle);
  }

  for (const listener of session.listeners) {
    if (listener.subscribeRequestId) {
      listenerToCommandStreamSession.delete(listener.subscribeRequestId);
    }
  }

  commandTestStreamSessions.delete(sessionRequestId);
}

export function clearCommandTestStreamSessionsForController(
  commandTestStreamSessions: Map<string, CommandTestStreamSession>,
  listenerToCommandStreamSession: Map<string, string>,
  controllerId: string,
): void {
  for (const [requestId, session] of commandTestStreamSessions.entries()) {
    if (session.controllerId === controllerId) {
      clearCommandTestStreamSession(commandTestStreamSessions, listenerToCommandStreamSession, requestId);
    }
  }
}

export function clearCommandTestStreamSessionsForNode(
  commandTestStreamSessions: Map<string, CommandTestStreamSession>,
  listenerToCommandStreamSession: Map<string, string>,
  nodeId: string,
): void {
  for (const [requestId, session] of commandTestStreamSessions.entries()) {
    if (session.nodeId === nodeId) {
      clearCommandTestStreamSession(commandTestStreamSessions, listenerToCommandStreamSession, requestId);
    }
  }
}

export function markControllerHeartbeat(client: ClientLike): void {
  if (client.role !== 'controller') {
    return;
  }
  client.lastHeartbeatAtMs = Date.now();
}