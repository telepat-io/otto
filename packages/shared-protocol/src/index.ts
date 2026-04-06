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

export type RecipeAuthMode = 'auto' | 'strict_fail' | 'skip';

export type RecipeInputFieldType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface RecipeInputFieldDescriptor {
  name: string;
  type: RecipeInputFieldType;
  description: string;
  optional?: boolean;
}

export interface RecipeDescriptor {
  site: string;
  id: string;
  displayName: string;
  description: string;
  tags: string[];
  requiresAuth: boolean;
  preloadHost?: string;
  inputFields?: RecipeInputFieldDescriptor[];
  inputAtLeastOneOf?: string[];
}

export type RecipeCommandAction = 'recipe.list' | 'recipe.run' | 'recipe.test' | 'recipe.reddit_feed';

export interface RecipeRunPayload {
  site: string;
  recipe: string;
  input?: Record<string, unknown>;
  authMode?: RecipeAuthMode;
}

export interface RecipeTestStreamListener {
  listener: ListenerName | string;
  options?: Record<string, unknown>;
}

export interface RecipeTestStream {
  listeners: RecipeTestStreamListener[];
}

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
