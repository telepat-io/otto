import { nanoid } from 'nanoid';
import WebSocket from 'ws';
import { createEnvelope, type CommandPayload, type Envelope } from '@telepat/otto-protocol';
import { createSocketClosedWhileWaitingError } from './cli/socket-errors.js';

export type SentCommand = {
  requestId: string;
  response: Promise<Envelope>;
};

export function sendCommandWithSocket(
  ws: WebSocket,
  targetNodeId: string,
  opts: { action: string; tabSession?: string; payload: Record<string, unknown>; timeoutMs?: number; signal?: AbortSignal },
): SentCommand {
  const requestId = nanoid();
  const timeoutMs = Math.max(1000, Number(opts.timeoutMs ?? 30_000));

  const commandPayload: CommandPayload = {
    targetNodeId,
    tabSessionId: opts.tabSession,
    action: opts.action,
    payload: opts.payload,
    idempotencyKey: nanoid(),
    replayNonce: nanoid(),
    timeoutMs,
    waitPolicy: 'fail_fast',
  };

  const response = new Promise<Envelope>((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new Error(`Aborted waiting for ${opts.action} response`));
      return;
    }

    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      ws.off('message', onMessage);
      ws.off('close', onClose);
      if (opts.signal) {
        opts.signal.removeEventListener('abort', onAbort);
      }
      fn();
    };

    const timeout = setTimeout(() => {
      settle(() => reject(new Error(`Timed out waiting for terminal response (${timeoutMs + 5000}ms)`)));
    }, timeoutMs + 5000);

    const onMessage = (data: WebSocket.RawData) => {
      const msg = JSON.parse(String(data)) as Envelope;
      if (msg.requestId !== requestId) {
        return;
      }

      if (msg.messageType !== 'result' && msg.messageType !== 'error') {
        return;
      }

      settle(() => resolve(msg));
    };

    const onClose = () => {
      settle(() => reject(createSocketClosedWhileWaitingError(opts.action)));
    };

    const onAbort = () => {
      settle(() => reject(new Error(`Aborted waiting for ${opts.action} response`)));
    };

    ws.on('message', onMessage);
    ws.once('close', onClose);
    if (opts.signal) {
      opts.signal.addEventListener('abort', onAbort, { once: true });
    }
    ws.send(JSON.stringify(createEnvelope('command', 'controller', requestId, commandPayload)));
  });

  return {
    requestId,
    response,
  };
}

export async function runCommandWithSocket(
  ws: WebSocket,
  targetNodeId: string,
  opts: { action: string; tabSession?: string; payload: Record<string, unknown>; timeoutMs?: number; signal?: AbortSignal },
): Promise<Envelope> {
  return sendCommandWithSocket(ws, targetNodeId, opts).response;
}

export async function sendCommandCancelWithSocket(ws: WebSocket, targetRequestId: string, timeoutMs = 1500): Promise<void> {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }

  const cancelRequestId = nanoid();
  ws.send(
    JSON.stringify(
      createEnvelope('command_cancel', 'controller', cancelRequestId, {
        targetRequestId,
      }),
    ),
  );

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      resolve();
    }, timeoutMs);

    const onMessage = (data: WebSocket.RawData) => {
      const msg = JSON.parse(String(data)) as Envelope;
      if (msg.requestId !== cancelRequestId) {
        return;
      }

      if (msg.messageType !== 'event' && msg.messageType !== 'result' && msg.messageType !== 'error') {
        return;
      }

      clearTimeout(timer);
      ws.off('message', onMessage);
      resolve();
    };

    ws.on('message', onMessage);
  });
}
