import { existsSync, readFileSync } from 'node:fs';
import type { ControllerAclGrant } from './controller-acl-utils.js';
import type {
  ControllerClientRecord,
  RawControllerClientRecord,
} from './controller-client-utils.js';
import type { RefreshSession } from './refresh-session-utils.js';

export function loadRefreshSessionsFromFile(params: {
  filePath: string;
  refreshTokens: Map<string, RefreshSession>;
  parseEntry: (raw: unknown) => { token: string; session: RefreshSession } | null;
  persistRefreshSessions: () => void;
}): { loaded: number; invalid: number; expired: number } {
  if (!existsSync(params.filePath)) {
    return { loaded: 0, invalid: 0, expired: 0 };
  }

  const lines = readFileSync(params.filePath, 'utf8').split('\n').filter(Boolean);
  let loaded = 0;
  let invalid = 0;
  let expired = 0;
  const now = Date.now();

  for (const line of lines) {
    try {
      const parsed = params.parseEntry(JSON.parse(line));
      if (!parsed) {
        invalid += 1;
        continue;
      }

      if (parsed.session.expiresAt <= now) {
        expired += 1;
        continue;
      }

      params.refreshTokens.set(parsed.token, parsed.session);
      loaded += 1;
    } catch {
      invalid += 1;
    }
  }

  // Rewrite to drop malformed and expired entries, and to dedupe by map key.
  params.persistRefreshSessions();
  return { loaded, invalid, expired };
}

export function loadControllerClientsFromFile(params: {
  filePath: string;
  controllerClients: Map<string, ControllerClientRecord>;
  parseClient: (raw: unknown) => RawControllerClientRecord | null;
  materializeControllerRecord: (raw: RawControllerClientRecord) => ControllerClientRecord | null;
  persistControllerClients: () => void;
}): { loaded: number; invalid: number } {
  if (!existsSync(params.filePath)) {
    return { loaded: 0, invalid: 0 };
  }

  const lines = readFileSync(params.filePath, 'utf8').split('\n').filter(Boolean);
  let loaded = 0;
  let invalid = 0;

  for (const line of lines) {
    try {
      const rawClient = params.parseClient(JSON.parse(line));
      if (!rawClient) {
        invalid += 1;
        continue;
      }

      const materialized = params.materializeControllerRecord(rawClient);
      if (!materialized) {
        invalid += 1;
        continue;
      }

      params.controllerClients.set(materialized.clientId, materialized);
      loaded += 1;
    } catch {
      invalid += 1;
    }
  }

  params.persistControllerClients();
  return { loaded, invalid };
}

export function loadControllerAclFromFile(params: {
  filePath: string;
  controllerAcl: Map<string, ControllerAclGrant>;
  parseGrant: (raw: unknown) => ControllerAclGrant | null;
  aclKey: (clientId: string, nodeId: string) => string;
  persistControllerAcl: () => void;
}): { loaded: number; invalid: number; expired: number } {
  if (!existsSync(params.filePath)) {
    return { loaded: 0, invalid: 0, expired: 0 };
  }

  const now = Date.now();
  const lines = readFileSync(params.filePath, 'utf8').split('\n').filter(Boolean);
  let loaded = 0;
  let invalid = 0;
  let expired = 0;

  for (const line of lines) {
    try {
      const grant = params.parseGrant(JSON.parse(line));
      if (!grant) {
        invalid += 1;
        continue;
      }

      if (grant.expiresAt && grant.expiresAt <= now) {
        expired += 1;
        continue;
      }

      params.controllerAcl.set(params.aclKey(grant.clientId, grant.nodeId), grant);
      loaded += 1;
    } catch {
      invalid += 1;
    }
  }

  params.persistControllerAcl();
  return { loaded, invalid, expired };
}