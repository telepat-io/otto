import type { ExtensionLogEntry } from '@telepat/otto-protocol';

export type ExtensionLogQueue = {
  enqueue: (entry: ExtensionLogEntry) => void;
  drain: () => ExtensionLogEntry[];
  size: () => number;
};

export function createExtensionLogQueue(maxSize: number): ExtensionLogQueue {
  const queue: ExtensionLogEntry[] = [];

  return {
    enqueue(entry: ExtensionLogEntry) {
      queue.push({
        ...entry,
        timestamp: entry.timestamp ?? new Date().toISOString(),
      });
      if (queue.length > maxSize) {
        queue.shift();
      }
    },
    drain() {
      if (queue.length === 0) {
        return [];
      }
      return queue.splice(0, queue.length);
    },
    size() {
      return queue.length;
    },
  };
}
