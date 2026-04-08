import type { Envelope } from '@telepat/otto-protocol';

type ListenerUpdatePayload = {
  type?: string;
};

export function isListenerUpdateForSubscription(msg: Envelope, subscribeRequestId: string): boolean {
  if (msg.messageType !== 'event') {
    return false;
  }

  if (msg.requestId !== subscribeRequestId) {
    return false;
  }

  const payload = (msg.payload ?? {}) as ListenerUpdatePayload;
  return payload.type === 'listener_update';
}
