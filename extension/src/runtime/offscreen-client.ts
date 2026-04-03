import { nanoid } from 'nanoid';
import { createEnvelope, type Envelope } from '@telepat/otto-protocol';
import type { ExtensionLogEntry, ExtensionLogEventPayload } from '@telepat/otto-protocol';
import { computeReconnectDelayMs, enqueueOutbound } from './offscreen-transport.js';
import { createExtensionLogQueue } from './extension-log-queue.js';
import type { RelayConnectionStatus } from './onboarding-state.js';

let ws: WebSocket | null = null;
let heartbeatTimer: number | undefined;
let reconnectTimer: number | undefined;
let reconnectAttempt = 0;
let authenticated = false;
let localDevLogStreamingEnabled = false;
const outboundQueue: Envelope[] = [];
const extensionLogQueue = createExtensionLogQueue(300);

function sendOrQueueExtensionLog(entry: ExtensionLogEntry): void {
  if (!localDevLogStreamingEnabled) {
    return;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN || !authenticated) {
    extensionLogQueue.enqueue(entry);
    return;
  }

  const payload: ExtensionLogEventPayload = {
    type: 'extension_log',
    entry: {
      ...entry,
      timestamp: entry.timestamp ?? new Date().toISOString(),
    },
  };
  ws.send(JSON.stringify(createEnvelope('event', 'node', nanoid(), payload)));
}

function flushExtensionLogQueue(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN || !authenticated || !localDevLogStreamingEnabled) {
    return;
  }
  const buffered = extensionLogQueue.drain();
  for (const next of buffered) {
    const payload: ExtensionLogEventPayload = {
      type: 'extension_log',
      entry: {
        ...next,
        timestamp: next.timestamp ?? new Date().toISOString(),
      },
    };
    ws.send(JSON.stringify(createEnvelope('event', 'node', nanoid(), payload)));
  }
}

function flushOutboundQueue(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  while (outboundQueue.length > 0) {
    const next = outboundQueue.shift();
    if (!next) return;
    ws.send(JSON.stringify(next));
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  const delay = computeReconnectDelayMs(reconnectAttempt, Math.random());
  const attempt = reconnectAttempt + 1;
  reconnectAttempt += 1;
  console.log(`[otto:offscreen] scheduling reconnect attempt ${attempt} in ${delay}ms`);
  sendOrQueueExtensionLog({
    level: 'debug',
    type: 'offscreen.reconnect_scheduled',
    data: { attempt, delayMs: delay },
  });
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    void connect();
  }, delay) as unknown as number;
}

function startHeartbeat(): void {
  stopHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(createEnvelope('ping', 'node', nanoid(), { ts: Date.now() })));
  }, 15000) as unknown as number;
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = undefined;
  }
}

async function loadConfig(): Promise<{
  relayUrl: string;
  nodeId: string;
  accessToken?: string;
  refreshToken?: string;
  pairingCode?: string;
  relayConnectionStatus?: RelayConnectionStatus;
  relayConnectionError?: string;
  localDevLogStreamingEnabled?: boolean;
}> {
  const response = await chrome.runtime.sendMessage({ type: 'otto.getConfig' });
  return response as {
    relayUrl: string;
    nodeId: string;
    accessToken?: string;
    refreshToken?: string;
    pairingCode?: string;
    relayConnectionStatus?: RelayConnectionStatus;
    relayConnectionError?: string;
    localDevLogStreamingEnabled?: boolean;
  };
}

async function publishConnectionStatus(status: RelayConnectionStatus, error?: string): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: 'otto.connectionStatus',
      payload: {
        status,
        error,
      },
    });
  } catch {
    // Ignore telemetry write failures to avoid reconnect loops.
  }
}

async function forwardToBackground(message: Envelope): Promise<void> {
  try {
    const response = (await chrome.runtime.sendMessage(message)) as Envelope;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(response));
    } else {
      enqueueOutbound(outboundQueue, response);
    }
  } catch (err) {
    console.error('[otto:offscreen] failed to forward command', err);
    const payload = message.payload as { action?: string; targetNodeId?: string; tabSessionId?: string };
    const errorEnvelope = createEnvelope('error', 'node', message.requestId, {
      category: 'execution',
      code: 'bridge_failure',
      message: 'Failed to relay command to background runtime',
      action: payload.action,
      nodeId: payload.targetNodeId,
      tabSessionId: payload.tabSessionId,
    });
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(errorEnvelope));
    } else {
      enqueueOutbound(outboundQueue, errorEnvelope);
    }
  }
}

async function connect(): Promise<void> {
  const { relayUrl, nodeId, accessToken, pairingCode, localDevLogStreamingEnabled: localLogFlag } = await loadConfig();
  localDevLogStreamingEnabled = localLogFlag === true;

  if (!accessToken) {
    await publishConnectionStatus('waiting_for_pairing');
    if (pairingCode) {
      console.log(`[otto:offscreen] waiting for pairing approval, code: ${pairingCode}`);
    } else {
      console.log('[otto:offscreen] waiting for pairing approval but no pairing code is available');
    }
    sendOrQueueExtensionLog({
      level: 'debug',
      type: 'offscreen.waiting_for_pairing',
      status: 'waiting_for_pairing',
      data: { hasPairingCode: Boolean(pairingCode) },
    });
    scheduleReconnect();
    return;
  }

  console.log('[otto:offscreen] attempting relay connection with stored node access token');
  sendOrQueueExtensionLog({
    level: 'debug',
    type: 'offscreen.connect_attempt',
    status: 'connecting',
    data: {
      relayUrl,
      hasAccessToken: true,
    },
  });

  await publishConnectionStatus('connecting');
  ws = new WebSocket(relayUrl);

  ws.addEventListener('open', () => {
    authenticated = false;
    reconnectAttempt = 0;
    console.log('[otto:offscreen] websocket opened; sending hello/auth');
    sendOrQueueExtensionLog({
      level: 'debug',
      type: 'offscreen.websocket_opened',
      status: 'connecting',
      data: {
        relayUrl,
      },
    });
    startHeartbeat();

    ws?.send(
      JSON.stringify(
        createEnvelope('hello', 'node', nanoid(), {
          role: 'node',
          nodeId,
          capabilities: [
            'primitive.tab.open',
            'primitive.tab.close',
            'primitive.tab.navigate',
            'primitive.tab.query',
            'primitive.dom.extract_text',
            'recipe.list',
            'recipe.run',
            'recipe.reddit_feed',
          ],
        }),
      ),
    );

    ws?.send(
      JSON.stringify(
        createEnvelope('auth', 'node', nanoid(), {
          accessToken,
        }),
      ),
    );
  });

  ws.addEventListener('message', (event) => {
    const envelope = JSON.parse(String(event.data)) as Envelope;
    if (envelope.messageType === 'command' || envelope.messageType === 'command_cancel') {
      void forwardToBackground(envelope);
      return;
    }

    if (envelope.messageType === 'auth_ack') {
      authenticated = true;
      console.log('[otto:offscreen] relay authentication acknowledged');
      void publishConnectionStatus('authenticated_connected');
      sendOrQueueExtensionLog({
        level: 'info',
        type: 'offscreen.authenticated_connected',
        status: 'authenticated_connected',
      });
      flushOutboundQueue();
      flushExtensionLogQueue();
      return;
    }

    if (envelope.messageType === 'error') {
      const maybePayload = envelope.payload as { category?: string; message?: string };
      if (maybePayload.category === 'auth') {
        console.warn(`[otto:offscreen] relay auth error: ${maybePayload.message ?? 'unknown auth failure'}`);
        sendOrQueueExtensionLog({
          level: 'warn',
          type: 'offscreen.auth_error',
          status: 'error',
          data: {
            message: maybePayload.message,
          },
        });
        void publishConnectionStatus('error', maybePayload.message || 'Relay rejected node authentication.');
      }
      return;
    }

    if (envelope.messageType === 'ping') {
      ws?.send(JSON.stringify(createEnvelope('pong', 'node', envelope.requestId, { ok: true })));
    }
  });

  ws.addEventListener('close', () => {
    authenticated = false;
    stopHeartbeat();
    console.warn('[otto:offscreen] websocket closed; reconnecting');
    sendOrQueueExtensionLog({
      level: 'warn',
      type: 'offscreen.websocket_closed',
      status: 'disconnected',
    });
    void publishConnectionStatus('disconnected');
    scheduleReconnect();
  });

  ws.addEventListener('error', () => {
    authenticated = false;
    console.warn('[otto:offscreen] websocket transport error; reconnecting');
    sendOrQueueExtensionLog({
      level: 'warn',
      type: 'offscreen.websocket_error',
      status: 'error',
    });
    void publishConnectionStatus('error', 'Socket error while connecting to relay.');
    scheduleReconnect();
  });
}

chrome.runtime.onMessage.addListener((message: { type?: string; payload?: unknown }, _sender, sendResponse) => {
  if (message.type === 'otto.offscreen.enqueueLog') {
    const payload = (message.payload ?? {}) as Partial<ExtensionLogEntry>;
    if (!payload.type || typeof payload.type !== 'string') {
      sendResponse({ ok: false, error: 'invalid_extension_log_type' });
      return true;
    }

    sendOrQueueExtensionLog({
      level: payload.level ?? 'debug',
      type: payload.type,
      timestamp: payload.timestamp,
      requestId: payload.requestId,
      traceId: payload.traceId,
      action: payload.action,
      status: payload.status,
      data: payload.data,
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'otto.offscreen.reconnect') {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    void connect();
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

void connect();
