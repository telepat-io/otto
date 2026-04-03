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
  tabSessionId?: string;
  action: string;
  timeoutMs?: number;
  idempotencyKey?: string;
  replayNonce?: string;
  waitPolicy?: WaitPolicy;
  payload: Record<string, unknown>;
}

export type RecipeAuthMode = 'auto' | 'strict_fail' | 'skip';

export interface RecipeDescriptor {
  site: string;
  id: string;
  displayName: string;
  description: string;
  tags: string[];
  requiresAuth: boolean;
}

export interface RecipeRunPayload {
  site: string;
  recipe: string;
  input?: Record<string, unknown>;
  authMode?: RecipeAuthMode;
}

export interface ResultPayload {
  ok: boolean;
  durationMs: number;
  action: string;
  data?: unknown;
  warnings?: string[];
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
  tabSessionId?: string;
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
