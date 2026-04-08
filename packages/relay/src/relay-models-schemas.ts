import { z } from 'zod';
import type { OttoRole } from '@telepat/otto-protocol';

export type PairingChallenge = {
  challengeId: string;
  code: string;
  nodeId: string;
  status: 'pending' | 'approved' | 'expired';
  expiresAt: number;
  approvedAt?: number;
  nodeAccessToken?: string;
  nodeRefreshToken?: string;
};

export type RefreshSession = {
  role: OttoRole;
  nodeId?: string;
  controllerId?: string;
  clientId?: string;
  scopes: string[];
  expiresAt: number;
};

export type ControllerClientRecord = {
  clientId: string;
  name: string;
  description: string;
  normalizedName: string;
  avatarSeed: string;
  secretSalt: string;
  secretHash: string;
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
};

export type ControllerAclGrant = {
  clientId: string;
  nodeId: string;
  grantedByNodeId: string;
  grantedAt: number;
  expiresAt?: number;
};

export type RateLimitState = {
  windowStartMs: number;
  count: number;
};

export type ReplayState = {
  nonceSeenAtMs: Map<string, number>;
};

export type LogEvent = {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: 'relay' | 'controller' | 'node';
  type: string;
  requestId?: string;
  traceId?: string;
  nodeId?: string;
  action?: string;
  status?: string;
  data?: unknown;
};

export type RefreshStoreEntry = {
  token: string;
  session: RefreshSession;
};

export const helloSchema = z.object({
  role: z.enum(['controller', 'node']),
  capabilities: z.array(z.string()).default([]),
  nodeId: z.string().optional(),
});

export const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
export const logSourceSchema = z.enum(['relay', 'controller', 'node', 'all']);
export const logsSubscribeSchema = z.object({
  type: z.literal('logs_subscribe'),
  source: logSourceSchema.optional(),
});

export const extensionLogEventSchema = z.object({
  type: z.literal('extension_log'),
  entry: z.object({
    level: logLevelSchema.default('debug'),
    type: z.string().min(1).max(120),
    timestamp: z.string().datetime().optional(),
    requestId: z.string().optional(),
    traceId: z.string().optional(),
    action: z.string().optional(),
    status: z.string().optional(),
    data: z.unknown().optional(),
  }),
});

export const listenerUpdateEventSchema = z.object({
  type: z.literal('listener_update'),
  data: z.unknown(),
  updateType: z.string().min(1).max(120).optional(),
  emittedAt: z.string().datetime().optional(),
});

export const refreshSessionSchema = z.object({
  role: z.enum(['controller', 'node']),
  nodeId: z.string().optional(),
  controllerId: z.string().optional(),
  clientId: z.string().optional(),
  scopes: z.array(z.string()),
  expiresAt: z.number().int(),
});

export const controllerClientSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  description: z.string().min(1).max(500).optional(),
  normalizedName: z.string().min(1).max(120).optional(),
  avatarSeed: z.string().min(1).max(64).optional(),
  // Legacy field kept optional for migration from older controller records.
  label: z.string().min(1).max(120).optional(),
  secretSalt: z.string().min(1),
  secretHash: z.string().min(1),
  createdAt: z.number().int(),
  lastUsedAt: z.number().int().optional(),
  revokedAt: z.number().int().optional(),
});

export const controllerAclGrantSchema = z.object({
  clientId: z.string().min(1),
  nodeId: z.string().min(1),
  grantedByNodeId: z.string().min(1),
  grantedAt: z.number().int(),
  expiresAt: z.number().int().optional(),
});

export const refreshStoreEntrySchema = z.object({
  token: z.string().min(1),
  session: refreshSessionSchema,
});

export const controllerClientStoreEntrySchema = z.object({
  client: controllerClientSchema,
});

export const controllerAclStoreEntrySchema = z.object({
  grant: controllerAclGrantSchema,
});
