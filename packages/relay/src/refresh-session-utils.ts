import { nanoid } from 'nanoid';
import type { OttoRole } from '@telepat/otto-protocol';

export type RefreshSession = {
  role: OttoRole;
  nodeId?: string;
  controllerId?: string;
  clientId?: string;
  scopes: string[];
  expiresAt: number;
};

export function cleanupRefreshSessions(
  refreshTokens: Map<string, RefreshSession>,
  persistRefreshSessions: () => void,
): { removed: number } {
  let removed = 0;
  const now = Date.now();
  for (const [token, session] of refreshTokens.entries()) {
    if (session.expiresAt <= now) {
      refreshTokens.delete(token);
      removed += 1;
    }
  }

  if (removed > 0) {
    persistRefreshSessions();
  }

  return { removed };
}

export function revokeRefreshSessionsByClientId(
  refreshTokens: Map<string, RefreshSession>,
  persistRefreshSessions: () => void,
  clientId: string,
): number {
  let removed = 0;
  for (const [token, session] of refreshTokens.entries()) {
    if (session.clientId !== clientId) {
      continue;
    }
    refreshTokens.delete(token);
    removed += 1;
  }

  if (removed > 0) {
    persistRefreshSessions();
  }

  return removed;
}

export function issueRefreshToken(
  refreshTokens: Map<string, RefreshSession>,
  persistRefreshSessions: () => void,
  refreshTtlSeconds: number,
  role: OttoRole,
  nodeId?: string,
  controllerId?: string,
  scopes: string[] = [],
  clientId?: string,
): string {
  const token = `rt_${nanoid(36)}`;
  refreshTokens.set(token, {
    role,
    nodeId,
    controllerId,
    clientId,
    scopes,
    expiresAt: Date.now() + refreshTtlSeconds * 1000,
  });
  persistRefreshSessions();
  return token;
}

export function resolveRefreshSession(
  refreshTokens: Map<string, RefreshSession>,
  persistRefreshSessions: () => void,
  refreshToken: string,
): RefreshSession | undefined {
  const session = refreshTokens.get(refreshToken);
  if (!session) {
    return undefined;
  }

  if (session.expiresAt <= Date.now()) {
    refreshTokens.delete(refreshToken);
    persistRefreshSessions();
    return undefined;
  }

  return session;
}

export function revokeRefreshToken(
  refreshTokens: Map<string, RefreshSession>,
  persistRefreshSessions: () => void,
  refreshToken: string,
): boolean {
  const existed = refreshTokens.delete(refreshToken);
  if (existed) {
    persistRefreshSessions();
  }
  return existed;
}