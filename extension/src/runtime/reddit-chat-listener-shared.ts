import { nanoid } from 'nanoid';

export type ChromeLike = typeof chrome;

export type RedditListenerEvent = {
  kind: 'new_message' | 'typing' | 'message_deleted' | 'room_member';
  eventId?: string;
  roomId?: string;
  sender?: string;
  text?: string;
  originServerTs?: number;
  stateKey?: string;
  displayName?: string;
  redacts?: string;
  userIds?: string[];
};

export type RedditSyncPayload = {
  ok: boolean;
  error?: string;
  statusCode?: number;
  nextBatch?: string;
  selfUserId?: string;
  events: RedditListenerEvent[];
};

export type RedditListenerTransportMode = 'intercept' | 'poll';

export type RedditListenerState = {
  requestId: string;
  tabId: number;
  tabSessionId?: string;
  ownedTab: boolean;
  createdTabSessionId?: string;
  pollIntervalMs: number;
  pollTimer?: number;
  pollInFlight: boolean;
  stopped: boolean;
  sinceToken?: string;
  selfUserId?: string;
  seenEventIds: Set<string>;
  mode: RedditListenerTransportMode;
  networkRequestId?: string;
  interceptErrors: number;
  fallbackEmitted: boolean;
};

export type SubscribeOptions = {
  pollIntervalMs?: unknown;
  tabId?: unknown;
  tabSessionId?: unknown;
  mode?: unknown;
};

export type ResolvedTabSession = {
  tabId: number;
  tabSessionId?: string;
  ownedTab: boolean;
  createdTabSessionId?: string;
};

export const DEFAULT_POLL_INTERVAL_MS = 7000;
const MIN_POLL_INTERVAL_MS = 3000;
const MAX_POLL_INTERVAL_MS = 60000;
export const MAX_DEDUPE_KEYS = 2000;
export const MAX_INTERCEPT_ERRORS_BEFORE_FALLBACK = 3;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function getUserId(matrixUserId: string | undefined): string | undefined {
  if (!matrixUserId) {
    return undefined;
  }
  return matrixUserId.replace('@t2_', '').replace(':reddit.com', '');
}

export function dedupeKey(event: RedditListenerEvent): string {
  if (event.eventId) {
    return event.eventId;
  }

  if (event.kind === 'typing') {
    return `typing:${event.roomId ?? 'unknown'}:${(event.userIds ?? []).join(',')}`;
  }

  if (event.kind === 'message_deleted') {
    return `deleted:${event.redacts ?? 'unknown'}`;
  }

  if (event.kind === 'room_member') {
    return `room_member:${event.roomId ?? 'unknown'}:${event.stateKey ?? 'unknown'}`;
  }

  return `${event.kind}:${event.roomId ?? 'unknown'}:${event.sender ?? 'unknown'}:${event.originServerTs ?? 0}`;
}

export function compactDeduper(set: Set<string>): void {
  if (set.size <= MAX_DEDUPE_KEYS) {
    return;
  }

  const keep = Array.from(set).slice(Math.floor(MAX_DEDUPE_KEYS / 2));
  set.clear();
  for (const value of keep) {
    set.add(value);
  }
}

export function clampPollInterval(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_POLL_INTERVAL_MS;
  }
  return Math.max(MIN_POLL_INTERVAL_MS, Math.min(MAX_POLL_INTERVAL_MS, Math.floor(value)));
}

export function decodeBase64Utf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function parseSyncPayloadsFromBody(body: string): Array<Record<string, unknown>> {
  const trimmed = body.trim();
  if (!trimmed) {
    return [];
  }

  const parsed: Array<Record<string, unknown>> = [];
  const lines = trimmed.split('\n');
  for (const line of lines) {
    const lineValue = line.trim();
    const candidate = lineValue.startsWith('data:')
      ? lineValue.slice('data:'.length).trim()
      : lineValue;
    if (!candidate.startsWith('{')) {
      continue;
    }

    try {
      const value = JSON.parse(candidate) as unknown;
      if (value && typeof value === 'object') {
        parsed.push(value as Record<string, unknown>);
      }
    } catch {
      // Keep parsing subsequent lines.
    }
  }

  if (parsed.length > 0) {
    return parsed;
  }

  try {
    const value = JSON.parse(trimmed) as unknown;
    if (value && typeof value === 'object') {
      return [value as Record<string, unknown>];
    }
  } catch {
    return [];
  }

  return [];
}

export async function readTabSessions(chromeApi: ChromeLike): Promise<Record<string, number>> {
  const snapshot = await chromeApi.storage.session.get(['tabSessions']);
  return (snapshot.tabSessions as Record<string, number> | undefined) ?? {};
}

export async function saveTabSessions(chromeApi: ChromeLike, tabSessions: Record<string, number>): Promise<void> {
  await chromeApi.storage.session.set({ tabSessions });
}

export async function resolveTabSession(chromeApi: ChromeLike, options: SubscribeOptions): Promise<ResolvedTabSession> {
  if (typeof options.tabSessionId === 'string' && options.tabSessionId.trim().length > 0) {
    const tabSessionId = options.tabSessionId.trim();
    const sessions = await readTabSessions(chromeApi);
    const tabIdValue = sessions[tabSessionId];
    if (typeof tabIdValue !== 'number') {
      throw new Error('reddit_listener_unknown_tab_session');
    }

    const tab = await chromeApi.tabs.get(tabIdValue);
    if (!tab.id) {
      throw new Error('reddit_listener_invalid_tab_session_tab');
    }

    return {
      tabId: tab.id,
      tabSessionId,
      ownedTab: false,
    };
  }

  if (typeof options.tabId === 'number' && Number.isFinite(options.tabId)) {
    const tab = await chromeApi.tabs.get(options.tabId);
    if (!tab.id) {
      throw new Error('reddit_listener_invalid_tab_id');
    }

    const sessions = await readTabSessions(chromeApi);
    const matched = Object.entries(sessions).find(([, tabIdValue]) => tabIdValue === tab.id)?.[0];

    return {
      tabId: tab.id,
      tabSessionId: matched,
      ownedTab: false,
    };
  }

  const tab = await chromeApi.tabs.create({ url: 'https://chat.reddit.com/threads', active: false });
  if (!tab.id) {
    throw new Error('reddit_listener_tab_create_failed');
  }

  const sessions = await readTabSessions(chromeApi);
  const createdTabSessionId = `tab_listener_${nanoid(10)}`;
  sessions[createdTabSessionId] = tab.id;
  await saveTabSessions(chromeApi, sessions);

  return {
    tabId: tab.id,
    tabSessionId: createdTabSessionId,
    ownedTab: true,
    createdTabSessionId,
  };
}