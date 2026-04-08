import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  loadControllerAclFromFile,
  loadControllerClientsFromFile,
  loadRefreshSessionsFromFile,
} from './store-load-utils.js';
import type { LogEvent } from './relay-models-schemas.js';
import type { ControllerAclGrant } from './controller-acl-utils.js';
import type { ControllerClientRecord, RawControllerClientRecord } from './controller-client-utils.js';
import type { RefreshSession } from './refresh-session-utils.js';
import type { RefreshStoreEntry } from './relay-models-schemas.js';

type LogStorageLike = {
  listOperationLogFiles: () => string[];
  parseTimestampMs: (timestamp: string) => number | null;
};

export function persistRefreshSessionsToFile(filePath: string, refreshTokens: Map<string, RefreshSession>): void {
  const serialized = Array.from(refreshTokens.entries())
    .map(([token, session]) => JSON.stringify({ token, session } satisfies RefreshStoreEntry))
    .join('\n');
  writeFileSync(filePath, serialized ? `${serialized}\n` : '');
}

export function persistControllerClientsToFile(filePath: string, controllerClients: Map<string, ControllerClientRecord>): void {
  const serialized = Array.from(controllerClients.values())
    .map((client) => JSON.stringify({ client }))
    .join('\n');
  writeFileSync(filePath, serialized ? `${serialized}\n` : '');
}

export function persistControllerAclToFile(filePath: string, controllerAcl: Map<string, ControllerAclGrant>): void {
  const serialized = Array.from(controllerAcl.values())
    .map((grant) => JSON.stringify({ grant }))
    .join('\n');
  writeFileSync(filePath, serialized ? `${serialized}\n` : '');
}

export function hydrateRelayStateFromDisk(params: {
  logDir: string;
  refreshSessionsFile: string;
  controllerClientsFile: string;
  controllerAclFile: string;
  refreshTokens: Map<string, RefreshSession>;
  controllerClients: Map<string, ControllerClientRecord>;
  controllerAcl: Map<string, ControllerAclGrant>;
  parseRefreshEntry: (raw: unknown) => { token: string; session: RefreshSession } | null;
  parseClient: (raw: unknown) => RawControllerClientRecord | null;
  parseGrant: (raw: unknown) => ControllerAclGrant | null;
  materializeControllerRecord: (raw: RawControllerClientRecord) => ControllerClientRecord | null;
  aclKey: (clientId: string, nodeId: string) => string;
  persistRefreshSessions: () => void;
  persistControllerClients: () => void;
  persistControllerAcl: () => void;
  logStorage: LogStorageLike;
  logEvents: LogEvent[];
  logRetentionMs: number;
}): {
  refreshStoreStats: ReturnType<typeof loadRefreshSessionsFromFile>;
  controllerClientStoreStats: ReturnType<typeof loadControllerClientsFromFile>;
  controllerAclStoreStats: ReturnType<typeof loadControllerAclFromFile>;
} {
  if (!existsSync(params.logDir)) {
    mkdirSync(params.logDir, { recursive: true });
  }

  const refreshStoreStats = loadRefreshSessionsFromFile({
    filePath: params.refreshSessionsFile,
    refreshTokens: params.refreshTokens,
    parseEntry: params.parseRefreshEntry,
    persistRefreshSessions: params.persistRefreshSessions,
  });

  const controllerClientStoreStats = loadControllerClientsFromFile({
    filePath: params.controllerClientsFile,
    controllerClients: params.controllerClients,
    parseClient: params.parseClient,
    materializeControllerRecord: params.materializeControllerRecord,
    persistControllerClients: params.persistControllerClients,
  });

  const controllerAclStoreStats = loadControllerAclFromFile({
    filePath: params.controllerAclFile,
    controllerAcl: params.controllerAcl,
    parseGrant: params.parseGrant,
    aclKey: params.aclKey,
    persistControllerAcl: params.persistControllerAcl,
  });

  for (const filePath of params.logStorage.listOperationLogFiles()) {
    const lines = readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const evt = JSON.parse(line) as LogEvent;
        const ts = params.logStorage.parseTimestampMs(evt.timestamp);
        if (ts !== null && Date.now() - ts <= params.logRetentionMs) {
          params.logEvents.push(evt);
        }
      } catch {
        // ignore malformed legacy entries
      }
    }
  }

  return {
    refreshStoreStats,
    controllerClientStoreStats,
    controllerAclStoreStats,
  };
}
