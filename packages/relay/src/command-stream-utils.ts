export type CommandStreamListenerBinding = {
  listener: string;
  options: Record<string, unknown>;
  subscribeRequestId?: string;
};

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function extractCommandStreamListeners(payload: unknown): CommandStreamListenerBinding[] {
  const resultPayload = asRecord(payload);
  const data = asRecord(resultPayload?.data);
  const stream = asRecord(data?.stream);
  const listenersRaw = stream?.listeners;
  if (!Array.isArray(listenersRaw)) {
    return [];
  }

  const listeners: CommandStreamListenerBinding[] = [];
  for (const entry of listenersRaw) {
    const listenerRecord = asRecord(entry);
    const listener = listenerRecord?.listener;
    if (typeof listener !== 'string' || listener.length === 0) {
      continue;
    }
    const optionsRecord = asRecord(listenerRecord?.options) ?? {};
    listeners.push({
      listener,
      options: optionsRecord,
    });
  }

  return listeners;
}