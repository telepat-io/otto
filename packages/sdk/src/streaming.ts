import type { Envelope } from '@telepat/otto-protocol';
import { nanoid } from 'nanoid';
import type { OttoWsSession } from './ws.js';
import type { ListenerUpdateEvent } from './types.js';
import { OttoError } from './errors.js';
import { EventEmitter } from 'node:events';

/**
 * A stream session that can be used as both an AsyncIterable and EventEmitter.
 *
 * @example
 * ```ts
 * // As async iterable
 * for await (const event of stream) {
 *   console.log(event);
 * }
 *
 * // As EventEmitter
 * stream.on('data', (event) => console.log(event));
 * stream.on('error', (err) => console.error(err));
 * stream.on('end', () => console.log('Stream ended'));
 * ```
 */
export class StreamSession extends EventEmitter implements AsyncIterable<ListenerUpdateEvent> {
  private subscribeRequestId: string | null = null;
  private queue: ListenerUpdateEvent[] = [];
  private ended = false;
  private unsubscribePromise: Promise<void> | null = null;

  constructor(
    private wsSession: OttoWsSession,
    private nodeId: string,
    private listener: string,
    private options: Record<string, unknown> | undefined,
  ) {
    super();
  }

  /**
   * Start listening to events. Called automatically by iterate() or first on() call.
   * @internal
   */
  async start(): Promise<void> {
    if (this.subscribeRequestId) {
      return;
    }

    const envelope: Envelope = {
      protocolVersion: '1.0',
      messageType: 'command',
      requestId: nanoid(),
      timestamp: new Date().toISOString(),
      senderRole: 'controller',
      payload: {
        targetNodeId: this.nodeId,
        action: 'listener.subscribe',
        payload: {
          listener: this.listener,
          options: this.options ?? {},
        },
      },
    };

    this.subscribeRequestId = envelope.requestId;

    const response = await this.wsSession.sendAndWaitForResponse(envelope);
    const result = response.payload as { ok?: boolean; error?: string };

    if (!result.ok) {
      throw new OttoError(result.error ?? 'Failed to subscribe to listener');
    }

    // Register handler for listener_update events
    const unsubscribeHandler = this.wsSession.onMessage((msg) => {
      if (msg.requestId === this.subscribeRequestId && msg.messageType === 'event') {
        const payload = msg.payload as ListenerUpdateEvent | undefined;
        if (payload?.type === 'listener_update') {
          this.queue.push(payload);
          this.emit('data', payload);
        }
      }
    });

    this.unsubscribePromise = (async () => {
      unsubscribeHandler();
    })();
  }

  /**
   * Unsubscribe from the listener stream.
   *
   * @example
   * ```ts
   * const stream = client.listeners.subscribe({ ... });
   * // ... use stream ...
   * await stream.unsubscribe();
   * ```
   */
  async unsubscribe(): Promise<void> {
    if (!this.subscribeRequestId) {
      return;
    }

    const envelope: Envelope = {
      protocolVersion: '1.0',
      messageType: 'command',
      requestId: nanoid(),
      timestamp: new Date().toISOString(),
      senderRole: 'controller',
      payload: {
        targetNodeId: this.nodeId,
        action: 'listener.unsubscribe',
        payload: {
          targetRequestId: this.subscribeRequestId,
        },
      },
    };

    try {
      await this.wsSession.sendAndWaitForResponse(envelope);
    } catch (err) {
      console.error('Error unsubscribing from listener:', err);
    }

    this.ended = true;
    this.emit('end');

    if (this.unsubscribePromise) {
      await this.unsubscribePromise;
    }
  }

  /**
   * Make the stream async iterable.
   *
   * @example
   * ```ts
   * for await (const event of stream) {
   *   console.log(event);
   * }
   * ```
   */
  async *[Symbol.asyncIterator](): AsyncIterator<ListenerUpdateEvent> {
    await this.start();

    while (!this.ended || this.queue.length > 0) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!;
      } else if (!this.ended) {
        // Wait for next event or end
        await new Promise((resolve) => {
          const onData = () => resolve(undefined);
          const onEnd = () => resolve(undefined);
          this.once('data', onData);
          this.once('end', onEnd);
        });
      }
    }
  }

  /**
   * Override EventEmitter's on to ensure stream is started.
   */
  override on(
    eventName: string | symbol,
    listener: (...args: unknown[]) => void,
  ): this {
    if (eventName === 'data' || eventName === 'error' || eventName === 'end') {
      void this.start().catch((err) => this.emit('error', err));
    }
    return super.on(eventName, listener);
  }
}

/**
 * Manages listener subscriptions and streaming.
 *
 * @example
 * ```ts
 * const stream = client.listeners.subscribe({
 *   nodeId: 'node_xyz',
 *   listener: 'network.http_intercept',
 *   options: { site: 'example.com' },
 * });
 *
 * for await (const event of stream) {
 *   console.log(event);
 * }
 * ```
 *
 * @internal
 */
export class ListenersClient {
  constructor(private wsSession: OttoWsSession) {}

  /**
   * Subscribe to a listener stream on a node.
   *
   * @param options - Subscription options
   * @param options.nodeId - Target node ID
   * @param options.listener - Listener name (e.g., 'network.http_intercept')
   * @param options.options - Listener-specific options
   * @returns StreamSession that supports both AsyncIterable and EventEmitter patterns
   *
   * @example
   * ```ts
   * // As async iterable
   * const stream = client.listeners.subscribe({
   *   nodeId: 'node_xyz',
   *   listener: 'network.http_intercept',
   * });
   * for await (const event of stream) {
   *   console.log(event);
   * }
   *
   * // As EventEmitter
   * stream.on('data', (event) => console.log(event));
   * stream.on('error', (err) => console.error(err));
   * stream.on('end', () => console.log('done'));
   * ```
   */
  subscribe(options: {
    nodeId: string;
    listener: string;
    options?: Record<string, unknown>;
  }): StreamSession {
    return new StreamSession(
      this.wsSession,
      options.nodeId,
      options.listener,
      options.options,
    );
  }
}
