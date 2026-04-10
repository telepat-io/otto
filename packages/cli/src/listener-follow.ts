import { nanoid } from 'nanoid';
import WebSocket from 'ws';
import { createEnvelope, type CommandPayload, type Envelope } from '@telepat/otto-protocol';
import type { NetworkInterceptListenerOptions } from '@telepat/otto-protocol';
import type { OttoConfig } from './config.js';
import { createCommandTestStreamRenderer } from './test-stream/format.js';
import { isListenerUpdateForSubscription } from './stream-correlation.js';

export async function subscribeListenerAndFollow(
  ws: WebSocket,
  targetNodeId: string,
  site: string,
  command: string,
  listener: string,
  options: Record<string, unknown>,
  timeoutMs: number,
  jsonOutput: boolean,
  followDurationMs?: number,
  onSubscribed?: () => Promise<void>,
  onInterrupt?: () => Promise<void>,
  handleSignals = true,
): Promise<void> {
  const renderer = createCommandTestStreamRenderer({
    site,
    command,
    jsonOutput,
    useColor: process.stdout.isTTY,
  });

  const subscribeRequestId = nanoid();
  let cleanedUp = false;

  const unsubscribeFallback = async (): Promise<void> => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    const unsubscribeRequestId = nanoid();
    const unsubscribePayload: CommandPayload = {
      targetNodeId,
      action: 'listener.unsubscribe',
      payload: {
        targetRequestId: subscribeRequestId,
      },
      idempotencyKey: nanoid(),
      replayNonce: nanoid(),
      timeoutMs,
      waitPolicy: 'fail_fast',
    };

    ws.send(JSON.stringify(createEnvelope('command', 'controller', unsubscribeRequestId, unsubscribePayload)));
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1000);
      const handler = (data: WebSocket.RawData) => {
        const msg = JSON.parse(String(data)) as Envelope;
        if (msg.requestId !== unsubscribeRequestId) {
          return;
        }
        if (msg.messageType !== 'result' && msg.messageType !== 'error') {
          return;
        }
        clearTimeout(timer);
        ws.off('message', handler);
        resolve();
      };
      ws.on('message', handler);
    });
  };

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for subscribe response (${timeoutMs + 2000}ms)`));
    }, timeoutMs + 2000);

    const handler = (data: WebSocket.RawData) => {
      const msg = JSON.parse(String(data)) as Envelope;
      if (msg.requestId !== subscribeRequestId) {
        return;
      }

      if (msg.messageType === 'error') {
        clearTimeout(timer);
        ws.off('message', handler);
        const errorPayload = (msg.payload ?? {}) as {
          code?: string;
          action?: string;
          message?: string;
        };
        if (errorPayload.code === 'forbidden_action' && errorPayload.action === 'listener.subscribe') {
          reject(
            new Error(
              `${errorPayload.message ?? 'listener.subscribe forbidden'}; controller token likely lacks listener.subscribe scope. Re-auth with \`otto client login\` (or re-pair if you use pairing auth) to mint a token with listener scopes.`,
            ),
          );
          return;
        }

        reject(new Error(`listener.subscribe failed: ${JSON.stringify(msg.payload)}`));
        return;
      }

      if (msg.messageType === 'result') {
        clearTimeout(timer);
        ws.off('message', handler);
        for (const line of renderer.renderSubscribeResponse(msg, listener)) {
          console.log(line);
        }
        resolve();
      }
    };

    const commandPayload: CommandPayload = {
      targetNodeId,
      tabSessionId: typeof options.tabSessionId === 'string' ? options.tabSessionId : undefined,
      action: 'listener.subscribe',
      payload: {
        listener,
        options,
      },
      idempotencyKey: nanoid(),
      replayNonce: nanoid(),
      timeoutMs,
      waitPolicy: 'fail_fast',
    };

    ws.on('message', handler);
    ws.send(JSON.stringify(createEnvelope('command', 'controller', subscribeRequestId, commandPayload)));
  });

  console.error(`[otto] following ${listener} updates, press Ctrl+C to stop`);
  if (typeof followDurationMs === 'number' && followDurationMs > 0) {
    console.error(`[otto] auto-stopping listener follow after ${followDurationMs}ms`);
  }

  if (onSubscribed) {
    try {
      await onSubscribed();
    } catch (error) {
      console.error(`[otto] stream probe failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await new Promise<void>((resolve) => {
    let done = false;
    let autoStopTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      if (done) {
        return;
      }
      done = true;
      if (autoStopTimer) {
        clearTimeout(autoStopTimer);
      }
      if (handleSignals) {
        process.removeListener('SIGINT', handleSigint);
      }
      ws.off('close', handleClose);
      ws.off('message', handleMessage);
      resolve();
    };

    const handleSigint = () => {
      void (async () => {
        if (onInterrupt) {
          await onInterrupt();
        }
        await unsubscribeFallback();
      })().finally(() => {
        finish();
      });
    };

    const handleClose = () => {
      console.error('[otto] stream connection closed; ending listener follow');
      finish();
    };

    const handleMessage = (data: WebSocket.RawData) => {
      const msg = JSON.parse(String(data)) as Envelope;

      if (isListenerUpdateForSubscription(msg, subscribeRequestId)) {
        for (const line of renderer.renderListenerUpdate(msg)) {
          console.log(line);
        }
      }
    };

    if (typeof followDurationMs === 'number' && followDurationMs > 0) {
      autoStopTimer = setTimeout(() => {
        console.error(`[otto] listener follow window elapsed (${followDurationMs}ms)`);
        finish();
      }, followDurationMs);
    }

    if (handleSignals) {
      process.once('SIGINT', handleSigint);
    }
    ws.on('close', handleClose);
    ws.on('message', handleMessage);
  });

  await unsubscribeFallback();
}

export async function subscribeNetworkListenerAndFollow(
  config: OttoConfig,
  targetNodeId: string,
  options: NetworkInterceptListenerOptions,
  timeoutMs: number,
  openControllerSocket: (config: OttoConfig) => Promise<WebSocket>,
  startControllerHeartbeat: (ws: WebSocket) => () => void,
): Promise<void> {
  const ws = await openControllerSocket(config);
  const stopHeartbeat = startControllerHeartbeat(ws);
  const subscribeRequestId = nanoid();
  let unsubscribed = false;
  const handleSigint = () => {
    void cleanup().then(() => process.exit(0));
  };

  const commandPayload: CommandPayload = {
    targetNodeId,
    tabSessionId: options.tabSessionId,
    action: 'listener.subscribe',
    payload: {
      listener: 'network.http_intercept',
      options,
    },
    idempotencyKey: nanoid(),
    replayNonce: nanoid(),
    timeoutMs,
    waitPolicy: 'fail_fast',
  };

  const cleanup = async (): Promise<void> => {
    if (unsubscribed) {
      return;
    }

    unsubscribed = true;
    const unsubscribeRequestId = nanoid();
    const unsubscribePayload: CommandPayload = {
      targetNodeId,
      action: 'listener.unsubscribe',
      payload: {
        targetRequestId: subscribeRequestId,
      },
      idempotencyKey: nanoid(),
      replayNonce: nanoid(),
      timeoutMs,
      waitPolicy: 'fail_fast',
    };

    ws.send(JSON.stringify(createEnvelope('command', 'controller', unsubscribeRequestId, unsubscribePayload)));
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1000);
      const handler = (data: WebSocket.RawData) => {
        const msg = JSON.parse(String(data)) as Envelope;
        if (msg.requestId !== unsubscribeRequestId) {
          return;
        }
        if (msg.messageType !== 'result' && msg.messageType !== 'error') {
          return;
        }
        clearTimeout(timer);
        ws.off('message', handler);
        resolve();
      };
      ws.on('message', handler);
    });
    ws.close();
    stopHeartbeat();
  };

  process.once('SIGINT', handleSigint);

  try {
    await new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for subscribe response (${timeoutMs + 2000}ms)`));
      }, timeoutMs + 2000);

      const handler = (data: WebSocket.RawData) => {
        const msg = JSON.parse(String(data)) as Envelope;
        if (msg.requestId !== subscribeRequestId) {
          return;
        }

        if (msg.messageType === 'error') {
          clearTimeout(timer);
          ws.off('message', handler);
          reject(new Error(`listener.subscribe failed: ${JSON.stringify(msg.payload)}`));
          return;
        }

        if (msg.messageType === 'result') {
          clearTimeout(timer);
          ws.off('message', handler);
          console.log(JSON.stringify(msg, null, 2));
          resolve(true);
        }
      };

      ws.on('message', handler);
      ws.send(JSON.stringify(createEnvelope('command', 'controller', subscribeRequestId, commandPayload)));
    });
  } catch (error) {
    process.removeListener('SIGINT', handleSigint);
    ws.close();
    stopHeartbeat();
    throw error;
  }

  console.error('[otto] following network listener updates, press Ctrl+C to stop');
  ws.on('message', (data) => {
    const msg = JSON.parse(String(data)) as Envelope;
    if (msg.messageType !== 'event') {
      return;
    }
    if (msg.requestId !== subscribeRequestId) {
      return;
    }
    const payload = (msg.payload ?? {}) as { type?: string; data?: unknown };
    if (payload.type !== 'listener_update') {
      return;
    }
    console.log(JSON.stringify(msg, null, 2));
  });
}
