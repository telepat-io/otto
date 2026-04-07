import type { SiteRecipe } from '../types.js';

type GetChatMessagesInput = {
  roomId?: string;
  limit?: number;
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;
const REDDIT_MATRIX_V3_PATTERN = 'https://matrix.redditspace.com/_matrix/client/v3/*';

function clampLimit(input: number | undefined): number {
  if (!input || Number.isNaN(input)) {
    return DEFAULT_LIMIT;
  }
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(input)));
}

function extractMessageText(event: Record<string, unknown>): string | undefined {
  const content = event.content;
  if (!content || typeof content !== 'object') {
    return undefined;
  }

  const body = (content as { body?: unknown }).body;
  if (typeof body === 'string' && body.trim().length > 0) {
    return body;
  }

  const formattedBody = (content as { formatted_body?: unknown }).formatted_body;
  if (typeof formattedBody === 'string' && formattedBody.trim().length > 0) {
    return formattedBody;
  }

  return undefined;
}

export const getChatMessagesRecipe: SiteRecipe = {
  metadata: {
    site: 'reddit.com',
    id: 'getChatMessages',
    displayName: 'Get Reddit Chat Messages',
    description: 'Loads recent Reddit chat messages from Matrix room history.',
    tags: ['chat', 'reddit', 'history'],
    requiresAuth: true,
    preloadHost: 'chat.reddit.com',
    inputFields: [
      {
        name: 'roomId',
        type: 'string',
        description: 'Reddit Matrix room id to fetch. When omitted, fetches recent messages across joined rooms.',
        optional: true,
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum number of historical events to request from Matrix.',
        optional: true,
      },
    ],
  },
  async execute(ctx, input) {
    const parsed = (input ?? {}) as Partial<GetChatMessagesInput>;
    const roomId = typeof parsed.roomId === 'string' ? parsed.roomId.trim() : '';
    const limit = clampLimit(typeof parsed.limit === 'number' ? parsed.limit : undefined);

    const payload = await ctx.executeScript(
      async (targetRoomId: string, targetLimit: number) => {
        const tokenCandidates = ['chat:matrix-access-token', 'chat:access-token'];

        const readToken = (): string => {
          for (const key of tokenCandidates) {
            try {
              const raw = localStorage.getItem(key);
              if (!raw) {
                continue;
              }

              if (key === 'chat:matrix-access-token') {
                const direct = JSON.parse(raw) as unknown;
                if (typeof direct === 'string' && direct.length > 0) {
                  return direct;
                }
                if (direct && typeof direct === 'object') {
                  const maybeToken = (direct as { token?: unknown }).token;
                  if (typeof maybeToken === 'string' && maybeToken.length > 0) {
                    return maybeToken;
                  }
                }
              }

              const tokenData = JSON.parse(raw) as { token?: unknown };
              if (typeof tokenData.token === 'string' && tokenData.token.length > 0) {
                return tokenData.token;
              }
            } catch {
              continue;
            }
          }
          return '';
        };

        const matrixRequest = async (token: string, endpoint: string) => {
          const response = await fetch(
            `https://matrix.redditspace.com/_matrix/client/v3${endpoint}`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          );

          return response;
        };

        let token = readToken();
        if (!token) {
          throw new Error('reddit_matrix_token_missing');
        }

        const endpoint = targetRoomId
          ? `/rooms/${encodeURIComponent(targetRoomId)}/messages?dir=b&limit=${targetLimit}`
          : '/sync?timeout=0';

        let response = await matrixRequest(token, endpoint);
        if (response.status === 401) {
          token = readToken();
          if (!token) {
            throw new Error('reddit_matrix_token_missing');
          }
          response = await matrixRequest(token, endpoint);
        }

        if (!response.ok) {
          throw new Error(`reddit_matrix_history_failed:${response.status}`);
        }

        const body = await response.json() as Record<string, unknown>;
        if (!targetRoomId) {
          const rooms = body.rooms && typeof body.rooms === 'object'
            ? body.rooms as Record<string, unknown>
            : {};
          const join = rooms.join && typeof rooms.join === 'object'
            ? rooms.join as Record<string, unknown>
            : {};

          const chunk: Array<Record<string, unknown>> = [];
          for (const [joinedRoomId, roomValue] of Object.entries(join)) {
            if (chunk.length >= targetLimit) {
              break;
            }

            const room = roomValue && typeof roomValue === 'object'
              ? roomValue as Record<string, unknown>
              : {};
            const timeline = room.timeline && typeof room.timeline === 'object'
              ? room.timeline as Record<string, unknown>
              : {};
            const timelineEvents = Array.isArray(timeline.events)
              ? timeline.events as Array<Record<string, unknown>>
              : [];

            for (const event of timelineEvents) {
              if (chunk.length >= targetLimit) {
                break;
              }

              if (event.type !== 'm.room.message') {
                continue;
              }

              chunk.push({
                ...event,
                roomId: joinedRoomId,
              });
            }
          }

          return {
            scope: 'all_rooms',
            chunk,
          };
        }

        const roomChunk = Array.isArray(body.chunk) ? body.chunk : [];
        return {
          scope: 'room',
          chunk: roomChunk,
        };
      },
      [roomId, limit],
    );

    const chunk = payload && typeof payload === 'object' && Array.isArray((payload as { chunk?: unknown }).chunk)
      ? (payload as { chunk: Array<Record<string, unknown>> }).chunk
      : [];

    const scope = payload && typeof payload === 'object' && (payload as { scope?: unknown }).scope === 'all_rooms'
      ? 'all_rooms'
      : 'room';

    const messages = chunk
      .filter((event) => event.type === 'm.room.message')
      .map((event) => ({
        eventId: typeof event.event_id === 'string' ? event.event_id : undefined,
        roomId: typeof event.roomId === 'string' ? event.roomId : roomId,
        text: extractMessageText(event),
        sender: typeof event.sender === 'string' ? event.sender : undefined,
        createdAt: typeof event.origin_server_ts === 'number'
          ? new Date(event.origin_server_ts).toISOString()
          : undefined,
      }))
      .filter((message) => Boolean(message.text));

    const roomsMap = new Map<string, Array<{
      eventId?: string;
      roomId: string;
      text?: string;
      sender?: string;
      createdAt?: string;
    }>>();

    for (const message of messages) {
      const key = message.roomId || 'unknown';
      const existing = roomsMap.get(key) ?? [];
      existing.push(message);
      roomsMap.set(key, existing);
    }

    const rooms = Array.from(roomsMap.entries()).map(([groupRoomId, roomMessages]) => ({
      roomId: groupRoomId,
      count: roomMessages.length,
      messages: roomMessages,
    }));

    return {
      scope,
      roomId: roomId || undefined,
      totalCount: messages.length,
      roomCount: rooms.length,
      rooms,
    };
  },
  async test(ctx, input) {
    const parsed = (input ?? {}) as Partial<GetChatMessagesInput>;
    const roomId = typeof parsed.roomId === 'string' ? parsed.roomId.trim() : '';

    await ctx.navigateTab('https://chat.reddit.com/threads');

    const readiness = await ctx.executeScript(async () => {
      const tokenCandidates = ['chat:matrix-access-token', 'chat:access-token'];

      const hasToken = (): boolean => {
        for (const key of tokenCandidates) {
          try {
            const raw = localStorage.getItem(key);
            if (!raw) {
              continue;
            }

            const parsedToken = JSON.parse(raw) as unknown;
            if (typeof parsedToken === 'string' && parsedToken.length > 0) {
              return true;
            }

            if (parsedToken && typeof parsedToken === 'object') {
              const maybeToken = (parsedToken as { token?: unknown }).token;
              if (typeof maybeToken === 'string' && maybeToken.length > 0) {
                return true;
              }
            }
          } catch {
            continue;
          }
        }

        return false;
      };

      return {
        ready: hasToken(),
      };
    }, []);

    return {
      ready: Boolean(readiness && typeof readiness === 'object' && (readiness as { ready?: unknown }).ready),
      roomId: roomId || undefined,
      stream: {
        listeners: [
          {
            listener: 'network.http_intercept',
            options: {
              tabSessionId: ctx.tabSessionId,
              site: 'reddit.com',
              mode: 'hybrid',
              includeBody: true,
              includeHeaders: false,
              urlPatterns: [REDDIT_MATRIX_V3_PATTERN],
              requestHostAllowlist: ['matrix.redditspace.com'],
              mimeTypes: ['application/json', 'text/plain'],
              maxBodyBytes: 1_000_000,
            },
          },
        ],
      },
    };
  },
};
