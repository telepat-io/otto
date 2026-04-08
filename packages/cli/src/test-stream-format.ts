import type {
  Envelope,
  ErrorPayload,
  NetworkInterceptListenerUpdate,
  ResultPayload,
} from '@telepat/otto-protocol';

type ListenerUpdateEnvelopePayload = {
  type?: string;
  data?: unknown;
  updateType?: string;
  emittedAt?: string;
};

type RendererContext = {
  site: string;
  command: string;
  jsonOutput: boolean;
  useColor?: boolean;
};

type MatrixMessage = {
  eventId?: string;
  roomId?: string;
  sender?: string;
  text: string;
  createdAt?: string;
};

type RedditCommandListenerData = {
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

type ColorToken = 'dim' | 'cyan' | 'green' | 'yellow' | 'red' | 'blue';

const ANSI_BY_TOKEN: Record<ColorToken, string> = {
  dim: '\u001b[2m',
  cyan: '\u001b[36m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  red: '\u001b[31m',
  blue: '\u001b[34m',
};

const ANSI_RESET = '\u001b[0m';

function supportsColor(useColor?: boolean): boolean {
  if (process.env.NO_COLOR) {
    return false;
  }

  if (typeof useColor === 'boolean') {
    return useColor;
  }

  return Boolean(process.stdout.isTTY);
}

function colorize(enabled: boolean, token: ColorToken, text: string): string {
  if (!enabled) {
    return text;
  }
  return `${ANSI_BY_TOKEN[token]}${text}${ANSI_RESET}`;
}

function jsonLine(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function shortTimestamp(iso?: string): string {
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

function shorten(value: string, max = 140): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}...`;
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function extractListenerUpdate(msg: Envelope): {
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

function decodeBody(body: string, base64Encoded?: boolean): string {
  if (!base64Encoded) {
    return body;
  }

  try {
    return Buffer.from(body, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function parseMatrixMessagesFromBody(bodyText: string): MatrixMessage[] {
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

function normalizeSender(sender?: string): string {
  if (!sender) {
    return 'unknown-sender';
  }

  const trimmed = sender.startsWith('@') ? sender.slice(1) : sender;
  const [name] = trimmed.split(':');
  return name || 'unknown-sender';
}

function inferRecipient(data: RedditCommandListenerData): string {
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

function normalizeUserId(userId: string): string {
  if (!userId) {
    return 'unknown-sender';
  }

  const trimmed = userId.startsWith('@') ? userId.slice(1) : userId;
  const [name] = trimmed.split(':');
  return name || 'unknown-sender';
}

function inferActor(data: RedditCommandListenerData): string {
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

function summarizeUnknownData(data: unknown): string {
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

export function createCommandTestStreamRenderer(context: RendererContext): {
  renderCommandResponse: (msg: Envelope, action: string) => string[];
  renderSubscribeResponse: (msg: Envelope, listener: string) => string[];
  renderListenerUpdate: (msg: Envelope) => string[];
  renderTerminalResponse: (msg: Envelope) => string[];
} {
  const colorEnabled = supportsColor(context.useColor);
  const seenMessageIds = new Set<string>();
  const roomPeerLabels = new Map<string, Map<string, string>>();
  const roomUserIds = new Map<string, Set<string>>();

  const renderResultStatus = (status: string): string => {
    if (status === 'completed') {
      return colorize(colorEnabled, 'green', status);
    }
    if (status === 'failed') {
      return colorize(colorEnabled, 'red', status);
    }
    return colorize(colorEnabled, 'yellow', status);
  };

  const maybeJson = (msg: Envelope): string[] => {
    if (!context.jsonOutput) {
      return [];
    }
    return [jsonLine(msg)];
  };

  const rememberRoomPeer = (roomId: string | undefined, peerId: string | undefined, peerUsername: string | undefined): void => {
    if (!roomId || !peerId || !peerUsername) {
      return;
    }

    const byPeerId = roomPeerLabels.get(roomId) ?? new Map<string, string>();
    byPeerId.set(peerId, peerUsername);
    roomPeerLabels.set(roomId, byPeerId);
  };

  const resolveRoomPeerLabel = (roomId: string | undefined, senderId: string | undefined): string | undefined => {
    if (!roomId || !senderId) {
      return undefined;
    }

    const byPeerId = roomPeerLabels.get(roomId);
    if (!byPeerId) {
      return undefined;
    }

    return byPeerId.get(senderId);
  };

  const rememberRoomUserId = (roomId: string | undefined, userId: string | undefined): void => {
    if (!roomId || !userId) {
      return;
    }

    const ids = roomUserIds.get(roomId) ?? new Set<string>();
    ids.add(userId);
    roomUserIds.set(roomId, ids);
  };

  const resolveRoomPrimaryPeerLabel = (roomId: string | undefined): string | undefined => {
    if (!roomId) {
      return undefined;
    }

    const byPeerId = roomPeerLabels.get(roomId);
    if (!byPeerId || byPeerId.size === 0) {
      return undefined;
    }

    const userIds = roomUserIds.get(roomId) ?? new Set<string>();
    for (const [peerId, peerName] of byPeerId.entries()) {
      if (!userIds.has(peerId)) {
        return peerName;
      }
    }

    return byPeerId.values().next().value as string | undefined;
  };

  return {
    renderCommandResponse: (msg: Envelope, action: string): string[] => {
      const raw = maybeJson(msg);
      if (raw.length > 0) {
        return raw;
      }

      if (msg.messageType === 'result') {
        const payload = (msg.payload ?? {}) as Partial<ResultPayload>;
        const outcome = typeof payload.commandOutcome === 'string' ? payload.commandOutcome : 'completed';
        const durationMs = typeof payload.durationMs === 'number' ? payload.durationMs : undefined;
        const statusPart = renderResultStatus(outcome);
        const durationPart = durationMs === undefined ? '' : ` (${durationMs}ms)`;
        return [`[otto:test] ${action} ${statusPart}${durationPart}`];
      }

      if (msg.messageType === 'error') {
        const payload = (msg.payload ?? {}) as Partial<ErrorPayload>;
        const code = typeof payload.code === 'string' ? payload.code : 'unknown_error';
        const detail = typeof payload.message === 'string' ? payload.message : jsonLine(msg.payload);
        return [
          `[otto:test] ${action} ${colorize(colorEnabled, 'red', 'failed')} code=${code} ${shorten(oneLine(detail), 220)}`,
        ];
      }

      return [`[otto:test] ${action} ${msg.messageType}`];
    },

    renderSubscribeResponse: (msg: Envelope, listener: string): string[] => {
      const raw = maybeJson(msg);
      if (raw.length > 0) {
        return raw;
      }

      if (msg.messageType === 'result') {
        return [
          `[stream] ${colorize(colorEnabled, 'green', 'subscribed')} listener=${listener}`,
        ];
      }

      if (msg.messageType === 'error') {
        const payload = (msg.payload ?? {}) as Partial<ErrorPayload>;
        const code = typeof payload.code === 'string' ? payload.code : 'listener_subscribe_error';
        const detail = typeof payload.message === 'string' ? payload.message : 'unknown error';
        return [
          `[stream] ${colorize(colorEnabled, 'red', 'subscribe_failed')} listener=${listener} code=${code} ${shorten(oneLine(detail), 180)}`,
        ];
      }

      return [`[stream] listener=${listener} response=${msg.messageType}`];
    },

    renderListenerUpdate: (msg: Envelope): string[] => {
      const raw = maybeJson(msg);
      if (raw.length > 0) {
        return raw;
      }

      const extracted = extractListenerUpdate(msg);
      if (!extracted) {
        return [];
      }

      const updateType = typeof extracted.payload.updateType === 'string'
        ? extracted.payload.updateType
        : 'listener_update';

      const data = extracted.payload.data;
      const isRedditChatMessages = context.site === 'reddit.com' && context.command === 'getChatMessages';

      if (!isRedditChatMessages || !data || typeof data !== 'object') {
        const emittedAt = typeof extracted.payload.emittedAt === 'string' ? extracted.payload.emittedAt : msg.timestamp;
        const time = colorize(colorEnabled, 'dim', `[${shortTimestamp(emittedAt)}]`);
        const summary = summarizeUnknownData(data);
        return [`${time} [update:${updateType}] ${summary}`];
      }

      const commandData = data as RedditCommandListenerData;
      const hasCommandNativeShape = [
        'new_message',
        'typing',
        'room_member',
        'message_deleted',
      ].includes(updateType);
      if (hasCommandNativeShape) {
        const emittedAt = typeof extracted.payload.emittedAt === 'string' ? extracted.payload.emittedAt : msg.timestamp;
        const time = colorize(colorEnabled, 'dim', `[${shortTimestamp(emittedAt)}]`);
        const roomId = typeof commandData.roomId === 'string' ? commandData.roomId : undefined;
        const roomPart = roomId ? ` ${colorize(colorEnabled, 'dim', `(${roomId})`)}` : '';

        if (updateType === 'new_message') {
          const senderId = typeof commandData.senderId === 'string' ? commandData.senderId : undefined;
          const fromRole = typeof commandData.from === 'string' ? commandData.from : undefined;
          const eventTime = typeof commandData.createdAt === 'string' && commandData.createdAt.length > 0
            ? commandData.createdAt
            : emittedAt;
          const messageTime = colorize(colorEnabled, 'dim', `[${shortTimestamp(eventTime)}]`);
          const senderRaw = typeof commandData.sender === 'string'
            ? commandData.sender
            : (senderId ? `@${senderId}:reddit.com` : undefined);
          const roomPeerLabel = resolveRoomPeerLabel(roomId, senderId);
          if (fromRole === 'creator') {
            rememberRoomUserId(roomId, senderId);
          }

          const senderLabel = fromRole === 'creator'
            ? 'user'
            : (roomPeerLabel ?? normalizeSender(senderRaw));
          const sender = colorize(colorEnabled, 'cyan', senderLabel);

          const inferredRecipient = inferRecipient(commandData);
          const primaryPeerLabel = resolveRoomPrimaryPeerLabel(roomId);
          let recipientLabel = inferredRecipient === 'creator' ? 'user' : inferredRecipient;
          if (fromRole === 'creator') {
            recipientLabel = primaryPeerLabel ?? (recipientLabel === 'peer' ? 'peer' : recipientLabel);
          } else if (fromRole === 'peer') {
            recipientLabel = 'user';
          }
          const recipient = colorize(colorEnabled, 'yellow', recipientLabel);
          const text = typeof commandData.text === 'string' ? oneLine(commandData.text) : '';
          const message = text || '(empty message)';
          return [
            `${messageTime} ${colorize(colorEnabled, 'blue', '[chat:new_message]')} ${sender} -> ${recipient}: ${shorten(message, 240)}${roomPart}`,
          ];
        }

        if (updateType === 'typing') {
          const peerIds = Array.isArray(commandData.peerIds)
            ? commandData.peerIds.filter((value): value is string => typeof value === 'string')
            : (Array.isArray(commandData.userIds)
              ? commandData.userIds.filter((value): value is string => typeof value === 'string')
              : []);
          const actorList = peerIds.map((userId) => normalizeUserId(userId));
          const who = actorList.length > 0 ? actorList.join(', ') : inferActor(commandData);
          const inferredRecipient = inferRecipient(commandData);
          const recipient = inferredRecipient === 'unknown-recipient' && actorList.length > 0
            ? 'user'
            : (inferredRecipient === 'creator' ? 'user' : inferredRecipient);
          return [
            `${time} ${colorize(colorEnabled, 'blue', '[chat:typing]')} ${who} -> ${recipient}${roomPart}`,
          ];
        }

        if (updateType === 'room_member') {
          const peerId = typeof commandData.peerId === 'string' && commandData.peerId.length > 0
            ? commandData.peerId
            : undefined;
          const peerName = typeof commandData.peerUsername === 'string' && commandData.peerUsername.length > 0
            ? commandData.peerUsername
            : inferActor(commandData);
          rememberRoomPeer(roomId, peerId, typeof commandData.peerUsername === 'string' ? commandData.peerUsername : undefined);
          const recipient = inferRecipient(commandData);
          return [
            `${time} ${colorize(colorEnabled, 'blue', '[chat:room_member]')} ${peerName} -> ${recipient === 'creator' || recipient === 'unknown-recipient' ? 'user' : recipient} joined${roomPart}`,
          ];
        }

        if (updateType === 'message_deleted') {
          const actor = inferActor(commandData);
          const recipient = inferRecipient(commandData);
          const redacts = typeof commandData.redacts === 'string' ? commandData.redacts : 'unknown-event';
          return [
            `${time} ${colorize(colorEnabled, 'blue', '[chat:message_deleted]')} ${actor} -> ${recipient === 'creator' ? 'user' : recipient} deleted ${redacts}${roomPart}`,
          ];
        }
      }

      const net = data as Partial<NetworkInterceptListenerUpdate>;
      const emittedAt = typeof net.emittedAt === 'string'
        ? net.emittedAt
        : (typeof extracted.payload.emittedAt === 'string' ? extracted.payload.emittedAt : msg.timestamp);
      const method = typeof net.method === 'string' ? net.method : '?';
      const status = typeof net.status === 'number' ? String(net.status) : '?';
      const shortUrl = typeof net.url === 'string' ? shorten(net.url, 90) : 'unknown-url';
      const networkMetaPieces = [`${method}`, status, shortUrl];
      if (net.truncated) {
        networkMetaPieces.push('truncated');
      }
      if (typeof net.error === 'string' && net.error.length > 0) {
        networkMetaPieces.push(`error=${net.error}`);
      }

      const time = colorize(colorEnabled, 'dim', `[${shortTimestamp(emittedAt)}]`);
      const lines: string[] = [
        `${time} ${colorize(colorEnabled, 'blue', `[net:${updateType}]`)} ${networkMetaPieces.join(' | ')}`,
      ];

      if (typeof net.body !== 'string' || net.body.length === 0) {
        return lines;
      }

      const decoded = decodeBody(net.body, net.base64Encoded);
      if (!decoded) {
        return lines;
      }

      const messages = parseMatrixMessagesFromBody(decoded);
      for (const message of messages) {
        const dedupeId = message.eventId ?? `${message.roomId ?? 'unknown'}|${message.sender ?? 'unknown'}|${message.createdAt ?? ''}|${message.text}`;
        if (seenMessageIds.has(dedupeId)) {
          continue;
        }
        seenMessageIds.add(dedupeId);

        const sender = colorize(colorEnabled, 'cyan', normalizeSender(message.sender));
        const messageTime = colorize(colorEnabled, 'dim', `[${shortTimestamp(message.createdAt ?? emittedAt)}]`);
        const roomPart = message.roomId ? ` ${colorize(colorEnabled, 'dim', `(${message.roomId})`)}` : '';
        lines.push(`${messageTime} ${sender}: ${shorten(message.text, 240)}${roomPart}`);
      }

      return lines;
    },

    renderTerminalResponse: (msg: Envelope): string[] => {
      const raw = maybeJson(msg);
      if (raw.length > 0) {
        return raw;
      }

      if (msg.messageType === 'result') {
        const payload = (msg.payload ?? {}) as Partial<ResultPayload>;
        const outcome = typeof payload.commandOutcome === 'string' ? payload.commandOutcome : 'completed';
        const durationMs = typeof payload.durationMs === 'number' ? payload.durationMs : undefined;
        const durationPart = durationMs === undefined ? '' : ` (${durationMs}ms)`;
        return [
          `[stream] terminal ${renderResultStatus(outcome)}${durationPart}`,
        ];
      }

      if (msg.messageType === 'error') {
        const payload = (msg.payload ?? {}) as Partial<ErrorPayload>;
        const code = typeof payload.code === 'string' ? payload.code : 'unknown_error';
        const detail = typeof payload.message === 'string' ? payload.message : jsonLine(msg.payload);
        return [
          `[stream] terminal ${colorize(colorEnabled, 'red', 'error')} code=${code} ${shorten(oneLine(detail), 220)}`,
        ];
      }

      return [`[stream] terminal ${msg.messageType}`];
    },
  };
}
