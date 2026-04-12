export type OttoRole = 'controller' | 'node' | 'relay';

export type MessageType =
  | 'hello'
  | 'hello_ack'
  | 'auth'
  | 'auth_ack'
  | 'command'
  | 'result'
  | 'error'
  | 'event'
  | 'ping'
  | 'pong'
  | 'refresh'
  | 'refresh_ack'
  | 'tab_lock'
  | 'tab_unlock'
  | 'command_cancel';

export type WaitPolicy = 'fail_fast' | 'wait_with_timeout';

export interface Envelope<TPayload = unknown> {
  protocolVersion: '1.0';
  messageType: MessageType;
  requestId: string;
  traceId?: string;
  timestamp: string;
  senderRole: OttoRole;
  payload: TPayload;
}

export interface HelloPayload {
  role: OttoRole;
  capabilities: string[];
  nodeId?: string;
}

export interface AuthPayload {
  accessToken: string;
}

export interface CommandPayload {
  targetNodeId: string;
  // Canonical reference for tab-scoped execution. Runtime also accepts payload.tabSessionId for compatibility.
  tabSessionId?: string;
  action: string;
  timeoutMs?: number;
  idempotencyKey?: string;
  replayNonce?: string;
  waitPolicy?: WaitPolicy;
  payload: Record<string, unknown>;
}

export type CommandAuthMode = 'auto' | 'strict_fail' | 'skip';

export type CommandInputFieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface CommandInputFieldDescriptor {
  name: string;
  type: CommandInputFieldType;
  description: string;
  optional?: boolean;
}

export interface CommandDescriptor {
  site: string;
  id: string;
  displayName: string;
  description: string;
  tags: string[];
  requiresAuth: boolean;
  requiresDebuggerFocus?: boolean;
  preloadHost?: string;
  inputFields?: CommandInputFieldDescriptor[];
  inputAtLeastOneOf?: string[];
}

export type CommandAction = 'command.list' | 'command.run' | 'command.test' | 'command.reddit_feed';

export interface CommandRunPayload {
  site: string;
  command: string;
  input?: Record<string, unknown>;
  authMode?: CommandAuthMode;
}

export interface CommandTestStreamListener {
  listener: ListenerName | string;
  options?: Record<string, unknown>;
}

export interface CommandTestStream {
  listeners: CommandTestStreamListener[];
}

export interface UserRef {
  id: string;
  username?: string;
  displayName?: string;
  platform?: string;
  originalEntity?: unknown;
}

export interface UserProfileStats {
  followers?: number;
  following?: number;
  posts?: number;
  comments?: number;
  reputation?: number;
}

export interface UserProfile {
  kind: 'entity.user';
  id: string;
  platform: string;
  username?: string;
  displayName?: string;
  profileUrl?: string;
  avatarUrl?: string;
  bio?: string;
  isVerified?: boolean;
  createdAt?: string;
  flags?: string[];
  stats?: UserProfileStats;
  originalEntity?: unknown;
}

export interface ConversationRef {
  id: string;
  platform?: string;
  title?: string;
  originalEntity?: unknown;
}

export interface DomainMeta {
  site: string;
  source?: string;
  rawEventType?: string;
  trace?: Record<string, unknown>;
}

export interface ChatMessage {
  kind: 'chat.message';
  conversation: ConversationRef;
  from: UserRef;
  to: UserRef;
  message: string;
  datetime: string;
  eventId?: string;
  meta?: DomainMeta;
  originalEntity?: unknown;
}

export interface ChatTypingEvent {
  kind: 'chat.typing';
  conversation: ConversationRef;
  from: UserRef;
  to: UserRef;
  datetime: string;
  isTyping?: boolean;
  eventId?: string;
  meta?: DomainMeta;
  originalEntity?: unknown;
}

export interface ChatParticipantEvent {
  kind: 'chat.participant';
  conversation: ConversationRef;
  participant: UserRef;
  event: 'joined' | 'left' | 'updated';
  datetime: string;
  eventId?: string;
  meta?: DomainMeta;
  originalEntity?: unknown;
}

export interface ChatMessageDeletedEvent {
  kind: 'chat.message_deleted';
  conversation: ConversationRef;
  messageId: string;
  datetime: string;
  deletedBy?: UserRef;
  eventId?: string;
  meta?: DomainMeta;
  originalEntity?: unknown;
}

export interface Article {
  kind: 'content.article';
  id: string;
  title: string;
  url?: string;
  author?: UserRef;
  publishedAt?: string;
  summary?: string;
  meta?: DomainMeta;
  originalEntity?: unknown;
}

export interface PostComment {
  kind: 'content.post_comment';
  id: string;
  parentPostId?: string;
  parentCommentId?: string;
  author?: UserRef;
  content?: string;
  publishedAt?: string;
  editedAt?: string;
  score?: number;
  depth?: number;
  comments?: PostComment[];
  meta?: DomainMeta;
  originalEntity?: unknown;
}

export interface Post {
  kind: 'content.post';
  id: string;
  title: string;
  url?: string;
  author?: UserRef;
  publishedAt?: string;
  editedAt?: string;
  content?: string;
  community?: string;
  score?: number;
  commentCount?: number;
  comments?: PostComment[];
  meta?: DomainMeta;
  originalEntity?: unknown;
}

export type StreamDomainObject =
  | ChatMessage
  | ChatTypingEvent
  | ChatParticipantEvent
  | ChatMessageDeletedEvent
  | Article
  | Post
  | PostComment;

export type CommandOutcome = 'completed' | 'failed' | 'timed_out' | 'cancelled';

export interface ResultPayload {
  ok: boolean;
  durationMs: number;
  action: string;
  data?: unknown;
  warnings?: string[];
  commandOutcome?: CommandOutcome;
}

export interface ErrorPayload {
  category:
    | 'auth'
    | 'validation'
    | 'routing'
    | 'execution'
    | 'timeout'
    | 'lock_conflict'
    | 'internal';
  code: string;
  message: string;
  retryable?: boolean;
  action?: string;
  stage?: string;
  nodeId?: string;
  clientId?: string;
  tabSessionId?: string;
  actionableHint?: string;
}

export interface LockPayload {
  targetNodeId: string;
  tabSessionId: string;
  lockLeaseMs?: number;
  waitPolicy?: WaitPolicy;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogSource = 'relay' | 'controller' | 'node' | 'all';

export interface LogsSubscribePayload {
  type: 'logs_subscribe';
  source?: LogSource;
}

export type ListenerCommandAction = 'listener.subscribe' | 'listener.unsubscribe';

export type ListenerName = 'network.http_intercept';

export type NetworkInterceptMode = 'network' | 'fetch' | 'hybrid';

export interface NetworkInterceptListenerOptions {
  tabSessionId: string;
  site: string;
  urlPatterns?: string[];
  requestHostAllowlist?: string[];
  mode?: NetworkInterceptMode;
  includeBody?: boolean;
  includeHeaders?: boolean;
  maxBodyBytes?: number;
  mimeTypes?: string[];
}

export interface NetworkInterceptListenerUpdate {
  eventId: string;
  tabSessionId: string;
  tabId: number;
  site: string;
  url: string;
  method?: string;
  status?: number;
  mimeType?: string;
  requestId: string;
  captureSource: 'network' | 'fetch';
  emittedAt: string;
  body?: string;
  base64Encoded?: boolean;
  truncated?: boolean;
  bodyBytes?: number;
  error?: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
}

export interface ListenerSubscribeCommandPayload {
  listener: ListenerName | string;
  options?: Record<string, unknown>;
}

export interface ListenerUnsubscribeCommandPayload {
  targetRequestId: string;
}

export interface ListenerUpdateEventPayload {
  type: 'listener_update';
  data: unknown;
  updateType?: string;
  emittedAt?: string;
}

export interface ExtensionLogEntry {
  level: LogLevel;
  type: string;
  timestamp?: string;
  requestId?: string;
  traceId?: string;
  action?: string;
  status?: string;
  data?: unknown;
}

export interface ExtensionLogEventPayload {
  type: 'extension_log';
  entry: ExtensionLogEntry;
}

export const PROTOCOL_VERSION = '1.0' as const;

export function createEnvelope<TPayload>(
  messageType: MessageType,
  senderRole: OttoRole,
  requestId: string,
  payload: TPayload,
  traceId?: string,
): Envelope<TPayload> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    messageType,
    requestId,
    traceId,
    timestamp: new Date().toISOString(),
    senderRole,
    payload,
  };
}
