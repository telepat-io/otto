export function normalizeRelayInputUrl(rawRelayUrl: string): string {
  const trimmed = rawRelayUrl.trim();
  if (!trimmed) {
    throw new Error('Relay URL is required.');
  }

  const parsed = new URL(trimmed);
  if (parsed.protocol === 'http:') {
    parsed.protocol = 'ws:';
  } else if (parsed.protocol === 'https:') {
    parsed.protocol = 'wss:';
  }

  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error('Relay URL must use ws:// or wss:// protocol.');
  }

  return parsed.toString();
}

export function normalizeRelaySocketUrl(rawRelayUrl: string): string {
  const normalized = new URL(normalizeRelayInputUrl(rawRelayUrl));
  if (!normalized.searchParams.has('role')) {
    normalized.searchParams.set('role', 'node');
  }
  return normalized.toString();
}
