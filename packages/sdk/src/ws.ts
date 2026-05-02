import type { Envelope, AuthAckPayload } from '@telepat/otto-protocol';
import { nanoid } from 'nanoid';
import { OttoError, OttoAuthError, OttoTimeoutError } from './errors.js';

/**
 * Manages WebSocket connection lifecycle, authentication, and heartbeat.
 * Handles automatic reconnection and token refresh.
 *
 * @internal
 */
export class OttoWsSession {
  private ws: WebSocket | null = null;
  private connected = false;
  private authenticated = false;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private pendingRequests = new Map<
    string,
    { resolve: (msg: Envelope) => void; reject: (err: Error) => void; timeout: ReturnType<typeof setTimeout> }
  >();

  private messageHandlers = new Set<(msg: Envelope) => void>();

  constructor(
    private wsUrl: string,
    private clientId: string,
    private accessToken: string,
  ) {}

  /**
   * Establish WebSocket connection and authenticate.
   *
   * @throws OttoAuthError if authentication fails
   * @throws OttoError if connection fails
   */
  async connect(): Promise<void> {
    if (this.connected && this.authenticated) {
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);
      } catch (err) {
        reject(new OttoError(`Failed to create WebSocket: ${err instanceof Error ? err.message : String(err)}`));
        return;
      }

      const onOpen = (): void => {
        this.connected = true;
        this.sendHello();
        this.sendAuth()
          .then(() => {
            this.setupHeartbeat();
            resolve();
          })
          .catch(reject);
      };

      const onClose = (): void => {
        this.connected = false;
        this.authenticated = false;
        this.cleanupHeartbeat();
      };

      const onError = (event: Event): void => {
        const errorMsg = event instanceof ErrorEvent ? event.message : 'WebSocket error';
        reject(new OttoError(`WebSocket error: ${errorMsg}`));
      };

      this.ws.addEventListener('open', onOpen, { once: true });
      this.ws.addEventListener('close', onClose);
      this.ws.addEventListener('error', onError, { once: true });
      this.ws.addEventListener('message', (event) => this.handleMessage(event));
    });
  }

  /**
   * Close WebSocket connection.
   */
  async disconnect(): Promise<void> {
    this.cleanupHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.authenticated = false;
  }

  /**
   * Send a message and wait for a response with matching requestId.
   *
   * @param envelope - Message envelope
   * @param timeoutMs - Response timeout in milliseconds (default 30000)
   * @returns Response envelope
   * @throws OttoTimeoutError on timeout
   * @throws OttoError on failure
   *
   * @internal
   */
  async sendAndWaitForResponse(
    envelope: Envelope,
    timeoutMs = 30000,
  ): Promise<Envelope> {
    if (!this.ws || !this.authenticated) {
      throw new OttoError('Not connected or not authenticated');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(envelope.requestId);
        reject(new OttoTimeoutError(`Request ${envelope.requestId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(envelope.requestId, { resolve, reject, timeout });

      try {
        this.ws!.send(JSON.stringify(envelope));
      } catch (err) {
        this.pendingRequests.delete(envelope.requestId);
        clearTimeout(timeout);
        reject(new OttoError(`Failed to send message: ${err instanceof Error ? err.message : String(err)}`));
      }
    });
  }

  /**
   * Register a handler to receive all incoming messages.
   *
   * @param handler - Function to call on each message
   * @internal
   */
  onMessage(handler: (msg: Envelope) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Returns true if WebSocket is connected and authenticated.
   * @internal
   */
  isAuthenticated(): boolean {
    return this.authenticated;
  }

  private sendHello(): void {
    const hello: Envelope = {
      protocolVersion: '1.0',
      messageType: 'hello',
      requestId: nanoid(),
      timestamp: new Date().toISOString(),
      senderRole: 'controller',
      payload: {
        role: 'controller',
        capabilities: [],
      },
    };
    this.ws!.send(JSON.stringify(hello));
  }

  private async sendAuth(): Promise<void> {
    const auth: Envelope = {
      protocolVersion: '1.0',
      messageType: 'auth',
      requestId: nanoid(),
      timestamp: new Date().toISOString(),
      senderRole: 'controller',
      payload: { accessToken: this.accessToken },
    };

    const response = await this.sendAndWaitForResponse(auth, 10000);
    const ack = response.payload as AuthAckPayload;

    if (!ack.accepted) {
      throw new OttoAuthError('Authentication rejected by relay');
    }

    this.authenticated = true;
  }

  private setupHeartbeat(): void {
    const heartbeatIntervalMs = 8000;

    const sendPing = (): void => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }

      const ping: Envelope = {
        protocolVersion: '1.0',
        messageType: 'ping',
        requestId: nanoid(),
        timestamp: new Date().toISOString(),
        senderRole: 'controller',
        payload: {},
      };

      this.ws.send(JSON.stringify(ping));

      this.heartbeatTimeoutId = setTimeout(() => {
        console.warn('Heartbeat timeout, closing WebSocket');
        this.ws?.close();
      }, 5000);
    };

    this.heartbeatInterval = setInterval(sendPing, heartbeatIntervalMs);
  }

  private cleanupHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.heartbeatTimeoutId) {
      clearTimeout(this.heartbeatTimeoutId);
      this.heartbeatTimeoutId = null;
    }
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const msg = JSON.parse(event.data) as Envelope;

      if (msg.messageType === 'pong') {
        if (this.heartbeatTimeoutId) {
          clearTimeout(this.heartbeatTimeoutId);
          this.heartbeatTimeoutId = null;
        }
      }

      // Resolve pending requests
      const pending = this.pendingRequests.get(msg.requestId);
      if (pending) {
        this.pendingRequests.delete(msg.requestId);
        clearTimeout(pending.timeout);
        pending.resolve(msg);
      }

      // Broadcast to other listeners
      for (const handler of this.messageHandlers) {
        handler(msg);
      }
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err);
    }
  }
}
