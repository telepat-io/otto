import { nanoid } from 'nanoid';
import type { NetworkInterceptListenerOptions, NetworkInterceptListenerUpdate } from '@telepat/otto-protocol';
import { createNetworkInterceptListenerManager } from './network-intercept-listener.js';

type ChromeLike = typeof chrome;

type RedditListenerEvent = {
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

type RedditSyncPayload = {
  ok: boolean;
  error?: string;
  statusCode?: number;
  nextBatch?: string;
  selfUserId?: string;
  events: RedditListenerEvent[];
};

type RedditListenerTransportMode = 'intercept' | 'poll';

type RedditListenerState = {
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

type SubscribeOptions = {
  pollIntervalMs?: unknown;
  tabId?: unknown;
  tabSessionId?: unknown;
  mode?: unknown;
};

type ResolvedTabSession = {
  tabId: number;
  tabSessionId?: string;
  ownedTab: boolean;
  createdTabSessionId?: string;
};

const DEFAULT_POLL_INTERVAL_MS = 7000;
const MIN_POLL_INTERVAL_MS = 3000;
const MAX_POLL_INTERVAL_MS = 60000;
const MAX_DEDUPE_KEYS = 2000;
const MAX_INTERCEPT_ERRORS_BEFORE_FALLBACK = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getUserId(matrixUserId: string | undefined): string | undefined {
  if (!matrixUserId) {
    return undefined;
  }
  return matrixUserId.replace('@t2_', '').replace(':reddit.com', '');
}

function dedupeKey(event: RedditListenerEvent): string {
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

function compactDeduper(set: Set<string>): void {
  if (set.size <= MAX_DEDUPE_KEYS) {
    return;
  }

  const keep = Array.from(set).slice(Math.floor(MAX_DEDUPE_KEYS / 2));
  set.clear();
  for (const value of keep) {
    set.add(value);
  }
}

function clampPollInterval(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_POLL_INTERVAL_MS;
  }
  return Math.max(MIN_POLL_INTERVAL_MS, Math.min(MAX_POLL_INTERVAL_MS, Math.floor(value)));
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function parseSyncPayloadsFromBody(body: string): Array<Record<string, unknown>> {
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

function extractEventsFromSync(sync: Record<string, unknown>): { nextBatch?: string; events: RedditListenerEvent[] } {
  type EventLike = Record<string, unknown>;

  const events: RedditListenerEvent[] = [];
  const nextBatch = typeof sync.next_batch === 'string' ? sync.next_batch : undefined;
  const rooms = (sync.rooms ?? {}) as Record<string, unknown>;
  const join = (rooms.join ?? {}) as Record<string, unknown>;

  for (const [roomId, roomValue] of Object.entries(join)) {
    const room = roomValue as {
      state?: { events?: EventLike[] };
      timeline?: { events?: EventLike[] };
      ephemeral?: { events?: EventLike[] };
    };

    const stateEvents = Array.isArray(room.state?.events) ? room.state.events : [];
    const timelineEvents = Array.isArray(room.timeline?.events) ? room.timeline.events : [];
    const ephemeralEvents = Array.isArray(room.ephemeral?.events) ? room.ephemeral.events : [];

    for (const event of [...stateEvents, ...timelineEvents, ...ephemeralEvents]) {
      const type = typeof event.type === 'string' ? event.type : '';
      if (type === 'm.room.member') {
        const content = event.content && typeof event.content === 'object'
          ? event.content as Record<string, unknown>
          : {};
        events.push({
          kind: 'room_member',
          eventId: typeof event.event_id === 'string' ? event.event_id : undefined,
          roomId,
          stateKey: typeof event.state_key === 'string' ? event.state_key : undefined,
          displayName: typeof content.displayname === 'string' ? content.displayname : undefined,
        });
        continue;
      }

      if (type === 'm.room.message') {
        const content = event.content && typeof event.content === 'object'
          ? event.content as Record<string, unknown>
          : {};
        const body = typeof content.body === 'string' ? content.body : undefined;
        if (!body) {
          continue;
        }
        events.push({
          kind: 'new_message',
          eventId: typeof event.event_id === 'string' ? event.event_id : undefined,
          roomId,
          sender: typeof event.sender === 'string' ? event.sender : undefined,
          text: body,
          originServerTs: typeof event.origin_server_ts === 'number' ? event.origin_server_ts : undefined,
        });
        continue;
      }

      if (type === 'm.room.redaction') {
        events.push({
          kind: 'message_deleted',
          eventId: typeof event.event_id === 'string' ? event.event_id : undefined,
          roomId,
          redacts: typeof event.redacts === 'string' ? event.redacts : undefined,
        });
        continue;
      }

      if (type === 'm.typing') {
        const content = event.content && typeof event.content === 'object'
          ? event.content as Record<string, unknown>
          : {};
        const userIds = Array.isArray(content.user_ids)
          ? content.user_ids.filter((value): value is string => typeof value === 'string')
          : [];
        if (userIds.length > 0) {
          events.push({
            kind: 'typing',
            eventId: typeof event.event_id === 'string' ? event.event_id : undefined,
            roomId,
            userIds,
          });
        }
      }
    }
  }

  return {
    nextBatch,
    events,
  };
}

async function readTabSessions(chromeApi: ChromeLike): Promise<Record<string, number>> {
  const snapshot = await chromeApi.storage.session.get(['tabSessions']);
  return (snapshot.tabSessions as Record<string, number> | undefined) ?? {};
}

async function saveTabSessions(chromeApi: ChromeLike, tabSessions: Record<string, number>): Promise<void> {
  await chromeApi.storage.session.set({ tabSessions });
}

async function resolveTabSession(chromeApi: ChromeLike, options: SubscribeOptions): Promise<ResolvedTabSession> {
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

async function pollMatrix(chromeApi: ChromeLike, tabId: number): Promise<RedditSyncPayload> {
  const scriptResult = await chromeApi.scripting.executeScript({
    target: { tabId },
    func: async () => {
      const tokenCandidates = ['chat:matrix-access-token', 'chat:access-token'];
      const readToken = (): string => {
        for (const key of tokenCandidates) {
          try {
            const raw = localStorage.getItem(key);
            if (!raw) {
              continue;
            }

            const parsed = JSON.parse(raw) as unknown;
            if (typeof parsed === 'string' && parsed.length > 0) {
              return parsed;
            }

            if (parsed && typeof parsed === 'object') {
              const token = (parsed as { token?: unknown }).token;
              if (typeof token === 'string' && token.length > 0) {
                return token;
              }
            }
          } catch {
            continue;
          }
        }

        return '';
      };

      const createSyncUrl = (cursor: string | undefined): string => {
        const url = new URL('https://matrix.redditspace.com/_matrix/client/v3/sync');
        url.searchParams.set('timeout', '0');
        if (cursor) {
          url.searchParams.set('since', cursor);
        }
        return url.toString();
      };

      const doSync = async (token: string, cursor: string | undefined) => {
        return fetch(createSyncUrl(cursor), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      };

      let token = readToken();
      if (!token) {
        return {
          ok: false,
          error: 'reddit_matrix_token_missing',
          events: [],
        } as RedditSyncPayload;
      }

      let response = await doSync(token, undefined);
      if (response.status === 401) {
        token = readToken();
        if (!token) {
          return {
            ok: false,
            error: 'reddit_matrix_token_missing',
            statusCode: 401,
            events: [],
          } as RedditSyncPayload;
        }
        response = await doSync(token, undefined);
      }

      if (!response.ok) {
        return {
          ok: false,
          error: `reddit_matrix_sync_failed:${response.status}`,
          statusCode: response.status,
          events: [],
        } as RedditSyncPayload;
      }

      const sync = await response.json() as Record<string, unknown>;
      const extracted = extractEventsFromSync(sync);

      let selfUserId: string | undefined;
      try {
        const meResponse = await fetch('https://www.reddit.com/api/me.json', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (meResponse.ok) {
          const mePayload = await meResponse.json() as { data?: Record<string, unknown> };
          const meId = typeof mePayload.data?.id === 'string' ? mePayload.data.id : undefined;
          if (meId) {
            selfUserId = meId;
          }
        }
      } catch {
        selfUserId = undefined;
      }

      return {
        ok: true,
        nextBatch: extracted.nextBatch,
        selfUserId,
        events: extracted.events,
      } as RedditSyncPayload;
    },
  });

  return (scriptResult[0]?.result ?? { ok: false, error: 'reddit_matrix_script_failed', events: [] }) as RedditSyncPayload;
}

export function createRedditChatListenerManager(
  chromeApi: ChromeLike,
  networkInterceptListenerManager = createNetworkInterceptListenerManager(chromeApi),
) {
  const listeners = new Map<string, RedditListenerState>();

  const emitUpdate = async (requestId: string, updateType: string, data: unknown): Promise<void> => {
    try {
      await chromeApi.runtime.sendMessage({
        type: 'otto.listenerUpdate',
        payload: {
          requestId,
          updateType,
          emittedAt: new Date().toISOString(),
          data,
        },
      });
    } catch {
      // Avoid listener crash on transient runtime bridge failures.
    }
  };

  const emitMatrixEvents = async (state: RedditListenerState, events: RedditListenerEvent[]): Promise<void> => {
    for (const event of events) {
      const key = dedupeKey(event);
      if (state.seenEventIds.has(key)) {
        continue;
      }
      state.seenEventIds.add(key);
      compactDeduper(state.seenEventIds);

      if (event.kind === 'new_message') {
        const senderId = getUserId(event.sender);
        await emitUpdate(state.requestId, 'new_message', {
          roomId: event.roomId,
          eventId: event.eventId,
          text: event.text,
          sender: event.sender,
          senderId,
          from: senderId && state.selfUserId && senderId === state.selfUserId ? 'creator' : 'peer',
          createdAt: typeof event.originServerTs === 'number'
            ? new Date(event.originServerTs).toISOString()
            : undefined,
        });
        continue;
      }

      if (event.kind === 'typing') {
        const peerIds = (event.userIds ?? []).map((userId) => getUserId(userId)).filter((value): value is string => Boolean(value));
        await emitUpdate(state.requestId, 'typing', {
          roomId: event.roomId,
          userIds: event.userIds,
          peerIds,
        });
        continue;
      }

      if (event.kind === 'message_deleted') {
        await emitUpdate(state.requestId, 'message_deleted', {
          roomId: event.roomId,
          eventId: event.eventId,
          redacts: event.redacts,
        });
        continue;
      }

      if (event.kind === 'room_member') {
        const peerId = getUserId(event.stateKey);
        if (peerId && state.selfUserId && peerId === state.selfUserId) {
          continue;
        }
        await emitUpdate(state.requestId, 'room_member', {
          roomId: event.roomId,
          eventId: event.eventId,
          peerId,
          peerUsername: event.displayName,
          stateKey: event.stateKey,
        });
      }
    }
  };

  const poll = async (state: RedditListenerState): Promise<void> => {
    if (state.stopped || state.pollInFlight) {
      return;
    }

    state.pollInFlight = true;
    const payload = await pollMatrix(chromeApi, state.tabId);
    try {
      if (!payload.ok) {
        await emitUpdate(state.requestId, 'error', {
          code: payload.error ?? 'reddit_matrix_poll_failed',
          statusCode: payload.statusCode,
        });
        return;
      }

      if (payload.nextBatch) {
        state.sinceToken = payload.nextBatch;
      }

      if (payload.selfUserId) {
        state.selfUserId = payload.selfUserId;
      }

      await emitMatrixEvents(state, payload.events ?? []);
    } finally {
      state.pollInFlight = false;
    }
  };

  const scheduleNextPoll = (state: RedditListenerState): void => {
    if (state.stopped) {
      return;
    }

    if (state.pollTimer !== undefined) {
      clearTimeout(state.pollTimer);
    }

    state.pollTimer = setTimeout(() => {
      void (async () => {
        if (state.stopped) {
          return;
        }
        await poll(state);
        scheduleNextPoll(state);
      })();
    }, state.pollIntervalMs) as unknown as number;
  };

  const startPolling = async (state: RedditListenerState): Promise<void> => {
    if (state.pollTimer !== undefined) {
      clearTimeout(state.pollTimer);
      state.pollTimer = undefined;
    }

    state.mode = 'poll';
    await poll(state);
    scheduleNextPoll(state);
  };

  const stopInterception = async (state: RedditListenerState): Promise<void> => {
    if (!state.networkRequestId) {
      return;
    }

    await networkInterceptListenerManager.unsubscribe(state.networkRequestId);
    state.networkRequestId = undefined;
  };

  const fallbackToPolling = async (state: RedditListenerState, reason: string): Promise<void> => {
    if (state.mode === 'poll') {
      return;
    }

    await stopInterception(state);
    if (!state.fallbackEmitted) {
      state.fallbackEmitted = true;
      await emitUpdate(state.requestId, 'mode_fallback', {
        mode: 'poll',
        reason,
      });
    }
    await startPolling(state);
  };

  const handleInterceptResponse = async (state: RedditListenerState, data: NetworkInterceptListenerUpdate): Promise<void> => {
    if (!data.body) {
      state.interceptErrors += 1;
      if (state.interceptErrors >= MAX_INTERCEPT_ERRORS_BEFORE_FALLBACK) {
        await fallbackToPolling(state, 'intercept_body_unavailable');
      }
      return;
    }

    let payloadBody = data.body;
    if (data.base64Encoded) {
      try {
        payloadBody = decodeBase64Utf8(data.body);
      } catch {
        state.interceptErrors += 1;
        if (state.interceptErrors >= MAX_INTERCEPT_ERRORS_BEFORE_FALLBACK) {
          await fallbackToPolling(state, 'intercept_base64_decode_failed');
        }
        return;
      }
    }

    const syncPayloads = parseSyncPayloadsFromBody(payloadBody);
    if (syncPayloads.length === 0) {
      state.interceptErrors += 1;
      if (state.interceptErrors >= MAX_INTERCEPT_ERRORS_BEFORE_FALLBACK) {
        await fallbackToPolling(state, 'intercept_parse_failed');
      }
      return;
    }

    state.interceptErrors = 0;
    for (const syncPayload of syncPayloads) {
      const extracted = extractEventsFromSync(syncPayload);
      if (extracted.nextBatch) {
        state.sinceToken = extracted.nextBatch;
      }
      await emitMatrixEvents(state, extracted.events);
    }
  };

  const startInterception = async (state: RedditListenerState): Promise<void> => {
    if (!state.tabSessionId) {
      await fallbackToPolling(state, 'intercept_missing_tab_session');
      return;
    }

    const networkRequestId = `reddit_network_${state.requestId}`;
    const options: NetworkInterceptListenerOptions = {
      tabSessionId: state.tabSessionId,
      site: 'reddit.com',
      mode: 'fetch',
      includeBody: true,
      includeHeaders: false,
      urlPatterns: ['https://matrix.redditspace.com/_matrix/client/v3/sync*'],
      requestHostAllowlist: ['matrix.redditspace.com'],
      mimeTypes: ['application/json', 'text/plain'],
      maxBodyBytes: 1_000_000,
    };

    await networkInterceptListenerManager.subscribe(networkRequestId, options, {
      emitToRelay: false,
      onUpdate: async (updateType, rawData) => {
        const current = listeners.get(state.requestId);
        if (!current || current.mode !== 'intercept') {
          return;
        }

        if (updateType === 'network.response') {
          await handleInterceptResponse(current, rawData as NetworkInterceptListenerUpdate);
          return;
        }

        if (updateType === 'network.detached') {
          await fallbackToPolling(current, 'intercept_detached');
          return;
        }

        if (updateType === 'network.error') {
          current.interceptErrors += 1;
          if (current.interceptErrors >= MAX_INTERCEPT_ERRORS_BEFORE_FALLBACK) {
            await fallbackToPolling(current, 'intercept_network_error');
          }
        }
      },
    });

    state.mode = 'intercept';
    state.networkRequestId = networkRequestId;
  };

  const subscribe = async (requestId: string, options: SubscribeOptions): Promise<{ tabId: number; pollIntervalMs: number; source: string }> => {
    if (listeners.has(requestId)) {
      throw new Error('reddit_listener_already_subscribed');
    }

    const pollIntervalMs = clampPollInterval(options.pollIntervalMs);
    const preferredMode = options.mode === 'poll' ? 'poll' : 'intercept';
    const resolvedTab = await resolveTabSession(chromeApi, options);

    if (resolvedTab.ownedTab) {
      await sleep(1500);
    }

    const state: RedditListenerState = {
      requestId,
      tabId: resolvedTab.tabId,
      tabSessionId: resolvedTab.tabSessionId,
      ownedTab: resolvedTab.ownedTab,
      createdTabSessionId: resolvedTab.createdTabSessionId,
      pollIntervalMs,
      pollInFlight: false,
      stopped: false,
      seenEventIds: new Set<string>(),
      mode: preferredMode,
      interceptErrors: 0,
      fallbackEmitted: false,
    };

    listeners.set(requestId, state);

    if (preferredMode === 'intercept') {
      try {
        await startInterception(state);
      } catch {
        await fallbackToPolling(state, 'intercept_unavailable');
      }
    } else {
      await startPolling(state);
    }

    return {
      tabId: state.tabId,
      pollIntervalMs,
      source: 'reddit.new_chat_messages',
    };
  };

  const unsubscribe = async (requestId: string): Promise<boolean> => {
    const state = listeners.get(requestId);
    if (!state) {
      return false;
    }

    state.stopped = true;
    if (state.pollTimer !== undefined) {
      clearTimeout(state.pollTimer);
      state.pollTimer = undefined;
    }

    await stopInterception(state);

    if (state.ownedTab) {
      try {
        await chromeApi.tabs.remove(state.tabId);
      } catch {
        // Tab might already be closed.
      }
    }

    if (state.createdTabSessionId) {
      const sessions = await readTabSessions(chromeApi);
      delete sessions[state.createdTabSessionId];
      await saveTabSessions(chromeApi, sessions);
    }

    listeners.delete(requestId);
    return true;
  };

  const unsubscribeAll = async (): Promise<void> => {
    const ids = Array.from(listeners.keys());
    for (const requestId of ids) {
      await unsubscribe(requestId);
    }
  };

  return {
    subscribe,
    unsubscribe,
    unsubscribeAll,
  };
}
