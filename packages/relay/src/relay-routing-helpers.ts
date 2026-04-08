import type { Envelope, ErrorPayload } from '@telepat/otto-protocol';

type CommandStreamListenerBindingLike = {
  listener: string;
  options: Record<string, unknown>;
  subscribeRequestId?: string;
};

type CommandTestStreamSessionLike = {
  requestId: string;
  controllerId: string;
  nodeId: string;
  action: string;
  createdAt: number;
  tabKey?: string;
  listeners: CommandStreamListenerBindingLike[];
};

type PendingCommandLike = {
  requestId: string;
  controllerId: string;
  nodeId: string;
  action: string;
  tabKey?: string;
  timeoutHandle: ReturnType<typeof setTimeout>;
};

type QueuedCommandLike = {
  message: Envelope;
  controllerId: string;
  timeoutHandle: ReturnType<typeof setTimeout>;
};

type ClientLike = {
  ws: unknown;
  authenticated?: boolean;
};

export function findCandidateCommandStreamSession(
  sessions: Map<string, CommandTestStreamSessionLike>,
  controllerId: string,
  nodeId: string,
  tabKey: string | undefined,
  listener: string,
): CommandTestStreamSessionLike | undefined {
  for (const session of sessions.values()) {
    if (session.controllerId !== controllerId || session.nodeId !== nodeId) {
      continue;
    }
    if (session.tabKey !== tabKey) {
      continue;
    }

    const candidate = session.listeners.find((declared) => {
      if (declared.subscribeRequestId) {
        return false;
      }
      return declared.listener === listener;
    });
    if (candidate) {
      return session;
    }
  }

  return undefined;
}

export function clearInflightAndRunNext(params: {
  tabKey?: string;
  inflightByTab: Set<string>;
  queuedByTab: Map<string, QueuedCommandLike[]>;
  pendingCommands: Map<string, PendingCommandLike>;
  listenerToCommandStreamSession: Map<string, string>;
  commandTestStreamSessions: Map<string, CommandTestStreamSessionLike>;
  clients: Map<string, ClientLike>;
  nodeClients: Map<string, ClientLike>;
  send: (ws: unknown, msg: Envelope) => void;
  buildEnvelope: (messageType: 'result' | 'event', senderRole: 'relay', requestId: string, payload: unknown) => Envelope;
  buildError: (requestId: string, senderRole: 'relay', payload: ErrorPayload) => Envelope;
  clearCommandTestStreamSession: (sessionRequestId: string) => void;
}): void {
  const runNext = (nextTabKey?: string): void => {
    if (!nextTabKey) return;
    params.inflightByTab.delete(nextTabKey);
    const queue = params.queuedByTab.get(nextTabKey);
    if (!queue || queue.length === 0) {
      params.queuedByTab.delete(nextTabKey);
      return;
    }

    const next = queue.shift();
    if (!next) return;
    clearTimeout(next.timeoutHandle);
    if (queue.length === 0) {
      params.queuedByTab.delete(nextTabKey);
    }

    const payload = next.message.payload as {
      targetNodeId?: string;
      action?: string;
      timeoutMs?: number;
    };
    const nodeId = payload.targetNodeId;
    if (!nodeId) return;

    const owner = params.clients.get(next.controllerId);
    const targetNode = params.nodeClients.get(nodeId);
    if (!owner || !targetNode || !targetNode.authenticated) {
      if (owner) {
        params.send(owner.ws, params.buildError(next.message.requestId, 'relay', {
          category: 'routing',
          code: 'node_offline',
          message: `Node ${nodeId} is not connected`,
          retryable: true,
          nodeId,
        }));
      }
      return;
    }

    const timeoutMs = Number(payload.timeoutMs ?? 30_000);
    params.inflightByTab.add(nextTabKey);
    const timeoutHandle = setTimeout(() => {
      const stillPending = params.pendingCommands.get(next.message.requestId);
      if (!stillPending) return;
      if (stillPending.action === 'listener.subscribe') {
        const sessionRequestId = params.listenerToCommandStreamSession.get(stillPending.requestId);
        if (sessionRequestId) {
          const streamSession = params.commandTestStreamSessions.get(sessionRequestId);
          const streamOwner = streamSession ? params.clients.get(streamSession.controllerId) : undefined;
          if (streamSession && streamOwner) {
            params.send(streamOwner.ws, params.buildEnvelope('result', 'relay', streamSession.requestId, {
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
          params.clearCommandTestStreamSession(sessionRequestId);
        }
      }
      const controller = params.clients.get(stillPending.controllerId);
      if (controller) {
        params.send(controller.ws, params.buildError(next.message.requestId, 'relay', {
          category: 'timeout',
          code: 'command_timed_out',
          message: 'Command exceeded timeout before terminal response',
          retryable: true,
          nodeId: stillPending.nodeId,
          action: stillPending.action,
        }));
      }
      params.pendingCommands.delete(next.message.requestId);
      runNext(stillPending.tabKey);
    }, Math.max(1000, timeoutMs));

    params.pendingCommands.set(next.message.requestId, {
      requestId: next.message.requestId,
      controllerId: next.controllerId,
      nodeId,
      action: String(payload.action ?? 'unknown'),
      timeoutHandle,
      tabKey: nextTabKey,
    });

    params.send(targetNode.ws, next.message);
    params.send(owner.ws, params.buildEnvelope('event', 'relay', next.message.requestId, {
      type: 'routed',
      targetNodeId: nodeId,
    }));
  };

  runNext(params.tabKey);
}
