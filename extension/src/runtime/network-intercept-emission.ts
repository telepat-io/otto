import { nanoid } from 'nanoid';
import type { NetworkInterceptListenerUpdate } from '@telepat/otto-protocol';
import type {
  ChromeLike,
  ResponseMetadata,
  SubscriptionState,
} from './network-intercept-types.js';
import {
  clampBody,
  redactHeaders,
} from './network-intercept-utils.js';

export function createEmitUpdate(chromeApi: ChromeLike) {
  return async (requestId: string, updateType: string, data: unknown): Promise<void> => {
    const emittedAt = new Date().toISOString();

    try {
      await chromeApi.runtime.sendMessage({
        type: 'otto.offscreen.emitListenerUpdate',
        payload: {
          requestId,
          updateType,
          emittedAt,
          data,
        },
      });
    } catch {
      // Ignore transient offscreen routing failures.
    }

    try {
      await chromeApi.runtime.sendMessage({
        type: 'otto.listenerUpdate',
        payload: {
          requestId,
          updateType,
          emittedAt,
          data,
        },
      });
    } catch {
      // Ignore transient bridge failures.
    }
  };
}

export function createEmitSubscriptionUpdate(
  emitUpdate: (requestId: string, updateType: string, data: unknown) => Promise<void>,
) {
  return async (sub: SubscriptionState, updateType: string, data: unknown): Promise<void> => {
    if (sub.emitToRelay) {
      await emitUpdate(sub.requestId, updateType, data);
    }

    if (!sub.onUpdate) {
      return;
    }

    try {
      await sub.onUpdate(updateType, data);
    } catch {
      // Listener callbacks are best-effort and should not fail interception flow.
    }
  };
}

export async function emitNetworkUpdate(
  emitSubscriptionUpdate: (sub: SubscriptionState, updateType: string, data: unknown) => Promise<void>,
  sub: SubscriptionState,
  metadata: ResponseMetadata,
  requestId: string,
  source: 'network' | 'fetch',
  bodyData?: { body: string; base64Encoded: boolean },
  error?: string,
): Promise<void> {
  const emittedAt = new Date().toISOString();
  const update: NetworkInterceptListenerUpdate = {
    eventId: `net_${nanoid(10)}`,
    tabSessionId: sub.tabSessionId,
    tabId: sub.tabId,
    site: sub.site,
    url: metadata.url,
    method: metadata.method,
    status: metadata.status,
    mimeType: metadata.mimeType,
    requestId,
    captureSource: source,
    emittedAt,
  };

  if (sub.includeHeaders) {
    update.requestHeaders = redactHeaders(metadata.requestHeaders);
    update.responseHeaders = redactHeaders(metadata.responseHeaders);
  }

  if (error) {
    update.error = error;
    await emitSubscriptionUpdate(sub, 'network.error', update);
    return;
  }

  if (!sub.includeBody || !bodyData) {
    await emitSubscriptionUpdate(sub, 'network.response', update);
    return;
  }

  const clamped = clampBody(bodyData.body, bodyData.base64Encoded, sub.maxBodyBytes);
  update.body = clamped.body;
  update.base64Encoded = bodyData.base64Encoded;
  update.truncated = clamped.truncated;
  update.bodyBytes = clamped.bodyBytes;

  await emitSubscriptionUpdate(sub, 'network.response', update);
}