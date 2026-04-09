import type {
  ChatMessage,
  ChatMessageDeletedEvent,
  ChatParticipantEvent,
  ChatTypingEvent,
  ConversationRef,
  DomainMeta,
  StreamDomainObject,
  UserRef,
} from '@telepat/otto-protocol';

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
  originalEntity?: unknown;
};

export type RedditPollingFallbackPlan = {
  enabled: true;
  mode: 'poll';
  strategy: 'command_poll';
  intervalMs: number;
  maxPolls: number;
  roomId?: string;
};

const DEFAULT_FALLBACK_INTERVAL_MS = 7_000;
const DEFAULT_FALLBACK_MAX_POLLS = 4;
const MAX_DEDUPE_KEYS = 2_000;

type ParticipantDirectory = Map<string, Map<string, UserRef>>;

export type StreamDomainUpdate = {
  updateType: string;
  data: StreamDomainObject;
};

export type RedditStreamDomainMapper = {
  mapNetworkUpdate: (updateType: string, data: unknown) => StreamDomainUpdate[];
};

function dedupeKey(event: RedditListenerEvent): string {
  if (event.eventId && event.eventId.length > 0) {
    return `${event.kind}:${event.eventId}`;
  }

  if (event.kind === 'typing') {
    return `typing:${event.roomId ?? 'unknown'}:${(event.userIds ?? []).join(',')}`;
  }

  if (event.kind === 'message_deleted') {
    return `message_deleted:${event.roomId ?? 'unknown'}:${event.redacts ?? 'unknown'}`;
  }

  if (event.kind === 'room_member') {
    return `room_member:${event.roomId ?? 'unknown'}:${event.stateKey ?? 'unknown'}`;
  }

  return `new_message:${event.roomId ?? 'unknown'}:${event.sender ?? 'unknown'}:${event.originServerTs ?? 0}:${event.text ?? ''}`;
}

function compactDeduper(seenKeys: Set<string>): void {
  if (seenKeys.size <= MAX_DEDUPE_KEYS) {
    return;
  }

  const keep = Array.from(seenKeys).slice(Math.floor(MAX_DEDUPE_KEYS / 2));
  seenKeys.clear();
  for (const key of keep) {
    seenKeys.add(key);
  }
}

function domainDedupeKey(value: StreamDomainObject): string {
  if (value.kind === 'chat.message') {
    return [
      value.kind,
      value.conversation?.id ?? '',
      value.from?.id ?? '',
      value.to?.id ?? '',
      value.datetime ?? '',
      value.message ?? '',
    ].join('|');
  }

  if (value.kind === 'chat.typing') {
    return [
      value.kind,
      value.conversation?.id ?? '',
      value.from?.id ?? '',
      value.to?.id ?? '',
      value.datetime ?? '',
      value.isTyping === true ? '1' : '0',
    ].join('|');
  }

  if (value.kind === 'chat.participant') {
    return [
      value.kind,
      value.conversation?.id ?? '',
      value.participant?.id ?? '',
      value.event ?? '',
      value.datetime ?? '',
    ].join('|');
  }

  if (value.kind === 'chat.message_deleted') {
    return [
      value.kind,
      value.conversation?.id ?? '',
      value.messageId ?? '',
      value.deletedBy?.id ?? '',
      value.datetime ?? '',
    ].join('|');
  }

  return JSON.stringify(value);
}

function getUserId(matrixUserId: string | undefined): string | undefined {
  if (!matrixUserId) {
    return undefined;
  }
  return matrixUserId.replace('@t2_', '').replace(':reddit.com', '');
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function toIsoDate(originServerTs: number | undefined, fallback: string): string {
  if (typeof originServerTs === 'number' && Number.isFinite(originServerTs)) {
    return new Date(originServerTs).toISOString();
  }
  return fallback;
}

function toConversation(roomId: string | undefined, originalEntity?: unknown): ConversationRef {
  return {
    id: roomId && roomId.length > 0 ? roomId : 'unknown_room',
    platform: 'reddit',
    originalEntity,
  };
}

function createMeta(rawEventType: string): DomainMeta {
  return {
    site: 'reddit.com',
    source: 'matrix.sync',
    rawEventType,
  };
}

function toUserRef(matrixUserId: string | undefined, displayName?: string, originalEntity?: unknown): UserRef | undefined {
  const id = getUserId(matrixUserId);
  if (!id) {
    return undefined;
  }

  return {
    id,
    username: id,
    displayName,
    platform: 'reddit',
    originalEntity,
  };
}

function upsertRoomParticipant(directory: ParticipantDirectory, roomId: string | undefined, participant: UserRef): void {
  if (!roomId || roomId.length === 0) {
    return;
  }

  const roomParticipants = directory.get(roomId) ?? new Map<string, UserRef>();
  const existing = roomParticipants.get(participant.id);
  roomParticipants.set(participant.id, {
    ...existing,
    ...participant,
  });
  directory.set(roomId, roomParticipants);
}

function getRoomParticipant(directory: ParticipantDirectory, roomId: string | undefined, userId: string | undefined): UserRef | undefined {
  if (!roomId || !userId) {
    return undefined;
  }
  return directory.get(roomId)?.get(userId);
}

function createFallbackUser(userId: string | undefined): UserRef {
  if (userId && userId.length > 0) {
    return {
      id: userId,
      username: userId,
      platform: 'reddit',
      originalEntity: {
        userId,
      },
    };
  }

  return {
    id: 'unknown',
    username: 'unknown',
    platform: 'reddit',
    originalEntity: null,
  };
}

function resolveRecipient(
  directory: ParticipantDirectory,
  roomId: string | undefined,
  senderId: string | undefined,
  selfUserId?: string,
): UserRef {
  if (selfUserId && senderId && senderId !== selfUserId) {
    return getRoomParticipant(directory, roomId, selfUserId) ?? createFallbackUser(selfUserId);
  }

  const roomParticipants = roomId ? directory.get(roomId) : undefined;
  if (roomParticipants) {
    for (const [participantId, participant] of roomParticipants.entries()) {
      if (participantId !== senderId) {
        return participant;
      }
    }
  }

  return createFallbackUser(selfUserId);
}

function parseChunkedJson(body: string): Array<Record<string, unknown>> {
  const parsed: Array<Record<string, unknown>> = [];
  let cursor = 0;

  while (cursor < body.length) {
    while (cursor < body.length && /\s/.test(body[cursor] ?? '')) {
      cursor += 1;
    }

    if (cursor >= body.length) {
      break;
    }

    const sizeStart = cursor;
    while (cursor < body.length && /[0-9a-fA-F]/.test(body[cursor] ?? '')) {
      cursor += 1;
    }

    if (cursor === sizeStart) {
      break;
    }

    const sizeHex = body.slice(sizeStart, cursor);
    const size = Number.parseInt(sizeHex, 16);
    if (!Number.isFinite(size) || size < 0) {
      break;
    }

    if (body.slice(cursor, cursor + 2) === '\r\n') {
      cursor += 2;
    }

    if (size === 0) {
      break;
    }

    if (cursor + size > body.length) {
      break;
    }

    const raw = body.slice(cursor, cursor + size);
    cursor += size;

    if (body.slice(cursor, cursor + 2) === '\r\n') {
      cursor += 2;
    }

    try {
      const value = JSON.parse(raw) as unknown;
      if (value && typeof value === 'object') {
        parsed.push(value as Record<string, unknown>);
      }
    } catch {
      break;
    }
  }

  return parsed;
}

export function parseSyncPayloadsFromBody(body: string): Array<Record<string, unknown>> {
  const trimmed = body.trim();
  if (!trimmed) {
    return [];
  }

  const chunked = parseChunkedJson(trimmed);
  if (chunked.length > 0) {
    return chunked;
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
      continue;
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

export function extractEventsFromSync(sync: Record<string, unknown>): { nextBatch?: string; events: RedditListenerEvent[] } {
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
          originServerTs: typeof event.origin_server_ts === 'number' ? event.origin_server_ts : undefined,
          originalEntity: event,
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
          originalEntity: event,
        });
        continue;
      }

      if (type === 'm.room.redaction') {
        events.push({
          kind: 'message_deleted',
          eventId: typeof event.event_id === 'string' ? event.event_id : undefined,
          roomId,
          sender: typeof event.sender === 'string' ? event.sender : undefined,
          redacts: typeof event.redacts === 'string' ? event.redacts : undefined,
          originServerTs: typeof event.origin_server_ts === 'number' ? event.origin_server_ts : undefined,
          originalEntity: event,
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
            originServerTs: typeof event.origin_server_ts === 'number' ? event.origin_server_ts : undefined,
            originalEntity: event,
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

export function toStreamDomainObjects(events: RedditListenerEvent[], selfUserId?: string): StreamDomainObject[] {
  const updates: StreamDomainObject[] = [];
  const participantDirectory: ParticipantDirectory = new Map();
  const fallbackIso = new Date().toISOString();

  for (const event of events) {
    if (event.kind === 'room_member') {
      const participant = toUserRef(event.stateKey, event.displayName, event.originalEntity);
      if (!participant) {
        continue;
      }

      upsertRoomParticipant(participantDirectory, event.roomId, participant);

      if (selfUserId && participant.id === selfUserId) {
        continue;
      }

      const memberEvent: ChatParticipantEvent = {
        kind: 'chat.participant',
        conversation: toConversation(event.roomId, {
          roomId: event.roomId,
        }),
        participant,
        event: 'joined',
        datetime: toIsoDate(event.originServerTs, fallbackIso),
        eventId: event.eventId,
        meta: createMeta('m.room.member'),
        originalEntity: event.originalEntity ?? event,
      };
      updates.push(memberEvent);
      continue;
    }

    if (event.kind === 'new_message') {
      const senderId = getUserId(event.sender);
      const from = getRoomParticipant(participantDirectory, event.roomId, senderId)
        ?? toUserRef(event.sender, undefined, event.originalEntity)
        ?? createFallbackUser(senderId);
      const to = resolveRecipient(participantDirectory, event.roomId, senderId, selfUserId);

      const messageEvent: ChatMessage = {
        kind: 'chat.message',
        conversation: toConversation(event.roomId, {
          roomId: event.roomId,
        }),
        from,
        to,
        message: event.text ?? '',
        datetime: toIsoDate(event.originServerTs, fallbackIso),
        eventId: event.eventId,
        meta: createMeta('m.room.message'),
        originalEntity: event.originalEntity ?? event,
      };
      updates.push(messageEvent);
      continue;
    }

    if (event.kind === 'typing') {
      const userIds = event.userIds ?? [];
      for (const matrixUserId of userIds) {
        const senderId = getUserId(matrixUserId);
        const from = getRoomParticipant(participantDirectory, event.roomId, senderId)
          ?? toUserRef(matrixUserId, undefined, event.originalEntity)
          ?? createFallbackUser(senderId);
        const to = resolveRecipient(participantDirectory, event.roomId, senderId, selfUserId);

        const typingEvent: ChatTypingEvent = {
          kind: 'chat.typing',
          conversation: toConversation(event.roomId, {
            roomId: event.roomId,
          }),
          from,
          to,
          datetime: toIsoDate(event.originServerTs, fallbackIso),
          isTyping: true,
          eventId: event.eventId,
          meta: createMeta('m.typing'),
          originalEntity: event.originalEntity ?? event,
        };
        updates.push(typingEvent);
      }
      continue;
    }

    if (event.kind === 'message_deleted') {
      if (!event.redacts) {
        continue;
      }

      const deletedBy = toUserRef(event.sender, undefined, event.originalEntity);
      const deletedEvent: ChatMessageDeletedEvent = {
        kind: 'chat.message_deleted',
        conversation: toConversation(event.roomId, {
          roomId: event.roomId,
        }),
        messageId: event.redacts,
        datetime: toIsoDate(event.originServerTs, fallbackIso),
        deletedBy,
        eventId: event.eventId,
        meta: createMeta('m.room.redaction'),
        originalEntity: event.originalEntity ?? event,
      };
      updates.push(deletedEvent);
    }
  }

  return updates;
}

export function createRedditStreamDomainMapper(selfUserId?: string): RedditStreamDomainMapper {
  const participantDirectory: ParticipantDirectory = new Map();
  const seenEventKeys = new Set<string>();
  const seenDomainObjectKeys = new Set<string>();

  const mapEvents = (events: RedditListenerEvent[]): StreamDomainObject[] => {
    const output: StreamDomainObject[] = [];
    const fallbackIso = new Date().toISOString();

    for (const event of events) {
      const key = dedupeKey(event);
      if (seenEventKeys.has(key)) {
        continue;
      }
      seenEventKeys.add(key);
      compactDeduper(seenEventKeys);

      if (event.kind === 'room_member') {
        const participant = toUserRef(event.stateKey, event.displayName, event.originalEntity);
        if (!participant) {
          continue;
        }

        upsertRoomParticipant(participantDirectory, event.roomId, participant);

        if (selfUserId && participant.id === selfUserId) {
          continue;
        }

        const participantEvent: ChatParticipantEvent = {
          kind: 'chat.participant',
          conversation: toConversation(event.roomId, {
            roomId: event.roomId,
          }),
          participant,
          event: 'joined',
          datetime: toIsoDate(event.originServerTs, fallbackIso),
          eventId: event.eventId,
          meta: createMeta('m.room.member'),
          originalEntity: event.originalEntity ?? event,
        };

        const participantKey = domainDedupeKey(participantEvent);
        if (seenDomainObjectKeys.has(participantKey)) {
          continue;
        }
        seenDomainObjectKeys.add(participantKey);
        compactDeduper(seenDomainObjectKeys);
        output.push(participantEvent);
        continue;
      }

      if (event.kind === 'new_message') {
        const senderId = getUserId(event.sender);
        const from = getRoomParticipant(participantDirectory, event.roomId, senderId)
          ?? toUserRef(event.sender, undefined, event.originalEntity)
          ?? createFallbackUser(senderId);
        const to = resolveRecipient(participantDirectory, event.roomId, senderId, selfUserId);

        const messageEvent: ChatMessage = {
          kind: 'chat.message',
          conversation: toConversation(event.roomId, {
            roomId: event.roomId,
          }),
          from,
          to,
          message: event.text ?? '',
          datetime: toIsoDate(event.originServerTs, fallbackIso),
          eventId: event.eventId,
          meta: createMeta('m.room.message'),
          originalEntity: event.originalEntity ?? event,
        };

        const messageKey = domainDedupeKey(messageEvent);
        if (seenDomainObjectKeys.has(messageKey)) {
          continue;
        }
        seenDomainObjectKeys.add(messageKey);
        compactDeduper(seenDomainObjectKeys);
        output.push(messageEvent);
        continue;
      }

      if (event.kind === 'typing') {
        const userIds = event.userIds ?? [];
        for (const matrixUserId of userIds) {
          const senderId = getUserId(matrixUserId);
          const from = getRoomParticipant(participantDirectory, event.roomId, senderId)
            ?? toUserRef(matrixUserId, undefined, event.originalEntity)
            ?? createFallbackUser(senderId);
          const to = resolveRecipient(participantDirectory, event.roomId, senderId, selfUserId);

          const typingEvent: ChatTypingEvent = {
            kind: 'chat.typing',
            conversation: toConversation(event.roomId, {
              roomId: event.roomId,
            }),
            from,
            to,
            datetime: toIsoDate(event.originServerTs, fallbackIso),
            isTyping: true,
            eventId: event.eventId,
            meta: createMeta('m.typing'),
            originalEntity: event.originalEntity ?? event,
          };

          const typingKey = domainDedupeKey(typingEvent);
          if (seenDomainObjectKeys.has(typingKey)) {
            continue;
          }
          seenDomainObjectKeys.add(typingKey);
          compactDeduper(seenDomainObjectKeys);
          output.push(typingEvent);
        }
        continue;
      }

      if (event.kind === 'message_deleted' && event.redacts) {
        const deletedEvent: ChatMessageDeletedEvent = {
          kind: 'chat.message_deleted',
          conversation: toConversation(event.roomId, {
            roomId: event.roomId,
          }),
          messageId: event.redacts,
          datetime: toIsoDate(event.originServerTs, fallbackIso),
          deletedBy: toUserRef(event.sender, undefined, event.originalEntity),
          eventId: event.eventId,
          meta: createMeta('m.room.redaction'),
          originalEntity: event.originalEntity ?? event,
        };

        const deletedKey = domainDedupeKey(deletedEvent);
        if (seenDomainObjectKeys.has(deletedKey)) {
          continue;
        }
        seenDomainObjectKeys.add(deletedKey);
        compactDeduper(seenDomainObjectKeys);
        output.push(deletedEvent);
      }
    }

    return output;
  };

  return {
    mapNetworkUpdate(updateType, data) {
      if (updateType !== 'network.response' || !data || typeof data !== 'object') {
        return [];
      }

      const response = data as { body?: unknown; base64Encoded?: unknown };
      if (typeof response.body !== 'string' || response.body.length === 0) {
        return [];
      }

      let body = response.body;
      if (response.base64Encoded === true) {
        try {
          body = decodeBase64Utf8(body);
        } catch {
          return [];
        }
      }

      const payloads = parseSyncPayloadsFromBody(body);
      if (payloads.length === 0) {
        return [];
      }

      const mapped: StreamDomainUpdate[] = [];
      for (const payload of payloads) {
        const extracted = extractEventsFromSync(payload);
        const domainObjects = mapEvents(extracted.events);
        for (const domainObject of domainObjects) {
          mapped.push({
            updateType: domainObject.kind,
            data: domainObject,
          });
        }
      }

      return mapped;
    },
  };
}

export function createRedditNetworkListenerOptions(tabSessionId: string): Record<string, unknown> {
  return {
    tabSessionId,
    site: 'reddit.com',
    streamAdapter: 'reddit.chat.v1',
    mode: 'fetch',
    includeBody: true,
    includeHeaders: false,
    urlPatterns: ['https://matrix.redditspace.com/_matrix/client/v3/sync*'],
    requestHostAllowlist: ['matrix.redditspace.com'],
    mimeTypes: ['application/json', 'text/plain'],
    maxBodyBytes: 1_000_000,
  };
}

export function createPollingFallbackPlan(roomId?: string): RedditPollingFallbackPlan {
  return {
    enabled: true,
    mode: 'poll',
    strategy: 'command_poll',
    intervalMs: DEFAULT_FALLBACK_INTERVAL_MS,
    maxPolls: DEFAULT_FALLBACK_MAX_POLLS,
    roomId: roomId && roomId.length > 0 ? roomId : undefined,
  };
}
