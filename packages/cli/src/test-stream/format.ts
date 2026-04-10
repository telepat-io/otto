import type {
  ChatMessage,
  ChatMessageDeletedEvent,
  ChatParticipantEvent,
  ChatTypingEvent,
  Envelope,
  ErrorPayload,
  ResultPayload,
  StreamDomainObject,
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

type DomainObjectWithKind = StreamDomainObject & { kind: string };

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

function isStreamDomainObject(data: unknown): data is DomainObjectWithKind {
  return Boolean(data && typeof data === 'object' && typeof (data as { kind?: unknown }).kind === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function resolveAuthorLabel(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return getString(value);
  }

  if (!isRecord(value)) {
    return undefined;
  }

  return getString(value.displayName)
    || getString(value.username)
    || getString(value.id);
}

function renderPostCollection(
  value: unknown,
  style: {
    dim: (text: string) => string;
    title: (text: string) => string;
    author: (text: string) => string;
    community: (text: string) => string;
    stat: (text: string) => string;
    preview: (text: string) => string;
  },
): string[] {
  if (!isRecord(value) || !Array.isArray(value.posts)) {
    return [];
  }

  const truncate = (input: string, max: number): string => {
    if (input.length <= max) {
      return input;
    }
    if (max <= 3) {
      return input.slice(0, max);
    }
    return `${input.slice(0, max - 3)}...`;
  };

  const pad = (input: string, width: number): string => {
    if (input.length >= width) {
      return input;
    }
    return `${input}${' '.repeat(width - input.length)}`;
  };

  const widths = {
    score: 6,
    comments: 6,
    community: 18,
    author: 16,
    title: 72,
  };

  const desiredTitleWidth = 72;
  const minTitleWidth = 18;
  const tableOverheadWithoutTitle = 16 + widths.score + widths.comments + widths.community + widths.author;
  const terminalColumns = typeof process.stdout.columns === 'number'
    ? process.stdout.columns
    : undefined;
  const responsiveTitleWidth = terminalColumns === undefined
    ? desiredTitleWidth
    : Math.max(minTitleWidth, Math.min(desiredTitleWidth, terminalColumns - tableOverheadWithoutTitle));
  widths.title = responsiveTitleWidth;

  const separator = [
    '+',
    '-'.repeat(widths.score + 2),
    '+',
    '-'.repeat(widths.comments + 2),
    '+',
    '-'.repeat(widths.community + 2),
    '+',
    '-'.repeat(widths.author + 2),
    '+',
    '-'.repeat(widths.title + 2),
    '+',
  ].join('');

  const posts = value.posts;
  const lines: string[] = [`[otto:test:data] ${style.stat(`posts=${posts.length}`)}`];
  if (posts.length === 0) {
    return lines;
  }

  lines.push(style.dim(separator));
  lines.push(style.dim(
    `| ${pad('score', widths.score)} | ${pad('cmnts', widths.comments)} | ${pad('community', widths.community)} | ${pad('author', widths.author)} | ${pad('title / preview', widths.title)} |`,
  ));
  lines.push(style.dim(separator));

  const maxLines = Math.min(posts.length, 20);

  for (let index = 0; index < maxLines; index += 1) {
    const post = posts[index];
    if (!isRecord(post)) {
      lines.push(`[post ${index + 1}] ${summarizeUnknownData(post)}`);
      continue;
    }

    const title = getString(post.title) ?? '(untitled)';
    const author = resolveAuthorLabel(post.author) ?? 'unknown';
    const community = getString(post.community);
    const score = getNumber(post.score);
    const commentCount = getNumber(post.commentCount);
    const preview = getString(post.content) || getString(post.summary) || getString(post.message);
    const titleWithPreview = preview
      ? `${title} | ${preview}`
      : title;

    const scoreCell = style.stat(pad(score === undefined ? '-' : String(score), widths.score));
    const commentsCell = style.stat(pad(commentCount === undefined ? '-' : String(commentCount), widths.comments));
    const communityCell = style.community(pad(truncate(community ?? '-', widths.community), widths.community));
    const authorCell = style.author(pad(truncate(author, widths.author), widths.author));
    const titleCell = style.title(pad(truncate(oneLine(titleWithPreview), widths.title), widths.title));

    lines.push(`| ${scoreCell} | ${commentsCell} | ${communityCell} | ${authorCell} | ${titleCell} |`);
  }

  lines.push(style.dim(separator));

  if (posts.length > maxLines) {
    lines.push(`[otto:test:data] ${style.dim(`truncated=${posts.length - maxLines}`)}`);
  }

  return lines;
}

function renderResultData(
  value: unknown,
  style: {
    dim: (text: string) => string;
    title: (text: string) => string;
    author: (text: string) => string;
    community: (text: string) => string;
    stat: (text: string) => string;
    preview: (text: string) => string;
  },
): string[] {
  if (value === undefined) {
    return [];
  }

  const postLines = renderPostCollection(value, style);
  if (postLines.length > 0) {
    return postLines;
  }

  if (Array.isArray(value)) {
    return [`[otto:test:data] array(${value.length})`];
  }

  if (isRecord(value)) {
    return [`[otto:test:data] ${summarizeUnknownData(value)}`];
  }

  return [`[otto:test:data] ${summarizeUnknownData(value)}`];
}

export function createCommandTestStreamRenderer(context: RendererContext): {
  renderCommandResponse: (msg: Envelope, action: string) => string[];
  renderSubscribeResponse: (msg: Envelope, listener: string) => string[];
  renderListenerUpdate: (msg: Envelope) => string[];
  renderTerminalResponse: (msg: Envelope) => string[];
} {
  void context.site;
  void context.command;
  const colorEnabled = supportsColor(context.useColor);

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

  const style = {
    dim: (text: string) => colorize(colorEnabled, 'dim', text),
    title: (text: string) => colorize(colorEnabled, 'green', text),
    author: (text: string) => colorize(colorEnabled, 'cyan', text),
    community: (text: string) => colorize(colorEnabled, 'yellow', text),
    stat: (text: string) => colorize(colorEnabled, 'blue', text),
    preview: (text: string) => colorize(colorEnabled, 'dim', text),
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
        const dataLines = renderResultData(payload.data, style);
        const warningLines = Array.isArray(payload.warnings)
          ? payload.warnings
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            .map((warning) => `[otto:test:warning] ${shorten(oneLine(warning), 220)}`)
          : [];
        return [`[otto:test] ${action} ${statusPart}${durationPart}`, ...dataLines, ...warningLines];
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
      const baseEmittedAt = typeof extracted.payload.emittedAt === 'string' ? extracted.payload.emittedAt : msg.timestamp;

      if (isStreamDomainObject(data)) {
        const time = colorize(colorEnabled, 'dim', `[${shortTimestamp(baseEmittedAt)}]`);

        if (data.kind === 'chat.message') {
          const message = data as ChatMessage;
          const fromLabel = message.from.displayName || message.from.username || message.from.id;
          const toLabel = message.to.displayName || message.to.username || message.to.id;
          const when = message.datetime || baseEmittedAt;
          const messageTime = colorize(colorEnabled, 'dim', `[${shortTimestamp(when)}]`);
          const roomPart = message.conversation?.id
            ? ` ${colorize(colorEnabled, 'dim', `(${message.conversation.id})`)}`
            : '';
          return [
            `${messageTime} ${colorize(colorEnabled, 'blue', '[chat.message]')} ${colorize(colorEnabled, 'cyan', fromLabel)} -> ${colorize(colorEnabled, 'yellow', toLabel)}: ${shorten(oneLine(message.message), 240)}${roomPart}`,
          ];
        }

        if (data.kind === 'chat.typing') {
          const typing = data as ChatTypingEvent;
          const fromLabel = typing.from.displayName || typing.from.username || typing.from.id;
          const toLabel = typing.to.displayName || typing.to.username || typing.to.id;
          const when = typing.datetime || baseEmittedAt;
          const typingTime = colorize(colorEnabled, 'dim', `[${shortTimestamp(when)}]`);
          const roomPart = typing.conversation?.id
            ? ` ${colorize(colorEnabled, 'dim', `(${typing.conversation.id})`)}`
            : '';
          return [
            `${typingTime} ${colorize(colorEnabled, 'blue', '[chat.typing]')} ${fromLabel} -> ${toLabel}${roomPart}`,
          ];
        }

        if (data.kind === 'chat.participant') {
          const participant = data as ChatParticipantEvent;
          const when = participant.datetime || baseEmittedAt;
          const participantTime = colorize(colorEnabled, 'dim', `[${shortTimestamp(when)}]`);
          const participantLabel = participant.participant.displayName
            || participant.participant.username
            || participant.participant.id;
          const roomPart = participant.conversation?.id
            ? ` ${colorize(colorEnabled, 'dim', `(${participant.conversation.id})`)}`
            : '';
          return [
            `${participantTime} ${colorize(colorEnabled, 'blue', '[chat.participant]')} ${participantLabel} ${participant.event}${roomPart}`,
          ];
        }

        if (data.kind === 'chat.message_deleted') {
          const deleted = data as ChatMessageDeletedEvent;
          const when = deleted.datetime || baseEmittedAt;
          const deletedTime = colorize(colorEnabled, 'dim', `[${shortTimestamp(when)}]`);
          const actor = deleted.deletedBy?.displayName || deleted.deletedBy?.username || deleted.deletedBy?.id || 'unknown';
          const roomPart = deleted.conversation?.id
            ? ` ${colorize(colorEnabled, 'dim', `(${deleted.conversation.id})`)}`
            : '';
          return [
            `${deletedTime} ${colorize(colorEnabled, 'blue', '[chat.message_deleted]')} ${actor} deleted ${deleted.messageId}${roomPart}`,
          ];
        }

        return [
          `${time} [update:${data.kind}] ${summarizeUnknownData(data)}`,
        ];
      }

      const time = colorize(colorEnabled, 'dim', `[${shortTimestamp(baseEmittedAt)}]`);
      const summary = summarizeUnknownData(data);
      return [`${time} [update:${updateType}] ${summary}`];
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
