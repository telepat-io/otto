import type { Envelope } from '@telepat/otto-protocol';

export type ListenerUpdateEnvelopePayload = {
  type?: string;
  data?: unknown;
  updateType?: string;
  emittedAt?: string;
};

export type MatrixMessage = {
  eventId?: string;
  roomId?: string;
  sender?: string;
  text: string;
  createdAt?: string;
};

export type RedditCommandListenerData = {
  roomId?: unknown;
  eventId?: unknown;
  text?: unknown;
  createdAt?: unknown;
  sender?: unknown;
  senderId?: unknown;
  from?: unknown;
  peerId?: unknown;
  peerUsername?: unknown;
  userIds?: unknown;
  peerIds?: unknown;
  stateKey?: unknown;
  redacts?: unknown;
};

export function shortTimestamp(iso?: string): string {
  if (!iso) {
    return 'unknown-time';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  const normalized = date.toISOString();
  return `${normalized.slice(11, 19)}Z`;
}

export function shorten(value: string, max = 140): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}...`;
}

export function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function extractListenerUpdate(msg: Envelope): {
  payload: ListenerUpdateEnvelopePayload;
} | null {
  if (msg.messageType !== 'event') {
    return null;
  }

  const payload = (msg.payload ?? {}) as ListenerUpdateEnvelopePayload;
  if (payload.type !== 'listener_update') {
    return null;
  }

  return {
    payload,
  };
}

export function decodeBody(body: string, base64Encoded?: boolean): string {
  if (!base64Encoded) {
    return body;
  }

  try {
    return Buffer.from(body, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

export function parseMatrixMessagesFromBody(bodyText: string): MatrixMessage[] {
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(bodyText) as unknown;
  } catch {
    return [];
  }

  if (!parsedBody || typeof parsedBody !== 'object') {
    return [];
  }

  const messages: MatrixMessage[] = [];
  const bodyRecord = parsedBody as Record<string, unknown>;

  const tryPushFromEvent = (event: Record<string, unknown>, fallbackRoomId?: string): void => {
    if (event.type !== 'm.room.message') {
      return;
    }

    const content = event.content && typeof event.content === 'object'
      ? event.content as Record<string, unknown>
      : undefined;
    const rawText = typeof content?.body === 'string' ? content.body : '';
    const text = oneLine(rawText);
    if (!text) {
      return;
    }

    const originServerTs = typeof event.origin_server_ts === 'number' ? event.origin_server_ts : undefined;
    const createdAt = originServerTs ? new Date(originServerTs).toISOString() : undefined;

    messages.push({
      eventId: typeof event.event_id === 'string' ? event.event_id : undefined,
      roomId: typeof event.room_id === 'string' ? event.room_id : fallbackRoomId,
      sender: typeof event.sender === 'string' ? event.sender : undefined,
      text,
      createdAt,
    });
  };

  const rooms = bodyRecord.rooms && typeof bodyRecord.rooms === 'object'
    ? bodyRecord.rooms as Record<string, unknown>
    : undefined;
  const join = rooms?.join && typeof rooms.join === 'object'
    ? rooms.join as Record<string, unknown>
    : undefined;

  if (join) {
    for (const [joinedRoomId, roomValue] of Object.entries(join)) {
      const room = roomValue && typeof roomValue === 'object'
        ? roomValue as Record<string, unknown>
        : {};
      const timeline = room.timeline && typeof room.timeline === 'object'
        ? room.timeline as Record<string, unknown>
        : {};
      const timelineEvents = Array.isArray(timeline.events) ? timeline.events : [];
      for (const candidate of timelineEvents) {
        if (!candidate || typeof candidate !== 'object') {
          continue;
        }
        tryPushFromEvent(candidate as Record<string, unknown>, joinedRoomId);
      }
    }
  }

  if (Array.isArray(bodyRecord.chunk)) {
    for (const candidate of bodyRecord.chunk) {
      if (!candidate || typeof candidate !== 'object') {
        continue;
      }
      tryPushFromEvent(candidate as Record<string, unknown>);
    }
  }

  return messages;
}

export function normalizeSender(sender?: string): string {
  if (!sender) {
    return 'unknown-sender';
  }

  const trimmed = sender.startsWith('@') ? sender.slice(1) : sender;
  const [name] = trimmed.split(':');
  return name || 'unknown-sender';
}

export function inferRecipient(data: RedditCommandListenerData): string {
  if (data.from === 'peer') {
    return 'creator';
  }
  if (data.from === 'creator') {
    return 'peer';
  }
  if (typeof data.peerId === 'string' && data.peerId.length > 0) {
    return data.peerId;
  }
  return 'unknown-recipient';
}

export function normalizeUserId(userId: string): string {
  if (!userId) {
    return 'unknown-sender';
  }

  const trimmed = userId.startsWith('@') ? userId.slice(1) : userId;
  const [name] = trimmed.split(':');
  return name || 'unknown-sender';
}

export function inferActor(data: RedditCommandListenerData): string {
  if (typeof data.sender === 'string' && data.sender.length > 0) {
    return normalizeUserId(data.sender);
  }

  if (typeof data.senderId === 'string' && data.senderId.length > 0) {
    return data.senderId;
  }

  if (typeof data.peerId === 'string' && data.peerId.length > 0) {
    return data.peerId;
  }

  if (typeof data.stateKey === 'string' && data.stateKey.length > 0) {
    return normalizeUserId(data.stateKey);
  }

  return 'unknown-sender';
}

export function summarizeUnknownData(data: unknown): string {
  if (data === undefined) {
    return 'no-data';
  }

  if (data === null) {
    return 'null';
  }

  if (typeof data === 'string') {
    return shorten(oneLine(data));
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return String(data);
  }

  if (Array.isArray(data)) {
    return `array(${data.length})`;
  }

  if (typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const keys = Object.keys(record).slice(0, 4);
    const parts = keys.map((key) => {
      const value = record[key];
      if (typeof value === 'string') {
        return `${key}=${shorten(oneLine(value), 60)}`;
      }
      if (typeof value === 'number' || typeof value === 'boolean') {
        return `${key}=${value}`;
      }
      if (Array.isArray(value)) {
        return `${key}=array(${value.length})`;
      }
      if (value && typeof value === 'object') {
        return `${key}=object`;
      }
      return `${key}=null`;
    });
    return parts.join(' ');
  }

  return String(data);
}
