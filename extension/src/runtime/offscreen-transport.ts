import type { Envelope } from '@telepat/otto-protocol';

export const MAX_OUTBOUND_QUEUE = 200;

export function computeReconnectDelayMs(attempt: number, randomJitter: number): number {
  return Math.min(1000 * 2 ** attempt + Math.floor(randomJitter * 300), 30_000);
}

export function enqueueOutbound(queue: Envelope[], message: Envelope, maxSize = MAX_OUTBOUND_QUEUE): void {
  queue.push(message);
  while (queue.length > maxSize) {
    queue.shift();
  }
}
