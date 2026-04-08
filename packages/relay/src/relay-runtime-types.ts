import type { WebSocket } from 'ws';
import type { Envelope, OttoRole } from '@telepat/otto-protocol';
import type { CommandStreamListenerBinding } from './command-stream-utils.js';

export type Client = {
  id: string;
  ws: WebSocket;
  role: OttoRole;
  nodeId?: string;
  controllerId?: string;
  clientId?: string;
  scopes: string[];
  authenticated: boolean;
  subscriptions: Set<string>;
  logSourceFilter?: 'relay' | 'controller' | 'node' | 'all';
  lastHeartbeatAtMs?: number;
};

export type LockState = {
  controllerId: string;
  expiresAt: number;
};

export type PendingCommand = {
  requestId: string;
  controllerId: string;
  nodeId: string;
  action: string;
  timeoutMs: number;
  unsubscribeTargetRequestId?: string;
  createdAt: number;
  tabKey?: string;
  timeoutHandle: ReturnType<typeof setTimeout>;
};

export type CommandTestStreamSession = {
  requestId: string;
  controllerId: string;
  nodeId: string;
  action: string;
  createdAt: number;
  tabKey?: string;
  timeoutHandle?: ReturnType<typeof setTimeout>;
  listeners: CommandStreamListenerBinding[];
};

export type ListenerSubscription = {
  requestId: string;
  controllerId: string;
  nodeId: string;
  createdAt: number;
};

export type QueuedCommand = {
  message: Envelope;
  controllerId: string;
  timeoutHandle: ReturnType<typeof setTimeout>;
};
