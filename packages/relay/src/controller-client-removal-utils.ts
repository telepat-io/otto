import type { ControllerClientRecord } from './controller-client-utils.js';

export type RelayControllerClientConnection = {
  role: string;
  clientId?: string;
  authenticated: boolean;
};

export function disconnectControllerSessionsByClientId<T extends RelayControllerClientConnection>(
  connections: Iterable<T>,
  clientId: string,
  onDisconnect: (connection: T) => void,
): number {
  let disconnected = 0;
  for (const connection of connections) {
    if (connection.role !== 'controller' || connection.clientId !== clientId || !connection.authenticated) {
      continue;
    }

    onDisconnect(connection);
    disconnected += 1;
  }

  return disconnected;
}

export function removeControllerClientById(
  controllerClients: Map<string, ControllerClientRecord>,
  persistControllerClients: () => void,
  revokeControllerAclByClientId: (clientId: string) => number,
  revokeRefreshSessionsByClientId: (clientId: string) => number,
  disconnectControllerSessionsByClientId: (clientId: string) => number,
  emitRemovalLog: (data: {
    clientId: string;
    aclRevokedCount: number;
    refreshRevokedCount: number;
    disconnectedSessions: number;
  }) => void,
  clientId: string,
): {
  ok: boolean;
  clientId: string;
  revokedAt: number;
  aclRevokedCount: number;
  refreshRevokedCount: number;
  disconnectedSessions: number;
  alreadyRevoked: boolean;
} {
  const record = controllerClients.get(clientId);
  if (!record) {
    throw new Error('client_not_found');
  }

  if (typeof record.revokedAt === 'number') {
    return {
      ok: true,
      clientId,
      revokedAt: record.revokedAt,
      aclRevokedCount: 0,
      refreshRevokedCount: 0,
      disconnectedSessions: 0,
      alreadyRevoked: true,
    };
  }

  record.revokedAt = Date.now();
  controllerClients.set(clientId, record);
  persistControllerClients();

  const aclRevokedCount = revokeControllerAclByClientId(clientId);
  const refreshRevokedCount = revokeRefreshSessionsByClientId(clientId);
  const disconnectedSessions = disconnectControllerSessionsByClientId(clientId);

  emitRemovalLog({
    clientId,
    aclRevokedCount,
    refreshRevokedCount,
    disconnectedSessions,
  });

  return {
    ok: true,
    clientId,
    revokedAt: record.revokedAt,
    aclRevokedCount,
    refreshRevokedCount,
    disconnectedSessions,
    alreadyRevoked: false,
  };
}

export function purgeControllerClientById(
  controllerClients: Map<string, ControllerClientRecord>,
  persistControllerClients: () => void,
  clientId: string,
): boolean {
  if (!controllerClients.has(clientId)) {
    return false;
  }

  controllerClients.delete(clientId);
  persistControllerClients();
  return true;
}

export function isRevokedControllerClient(
  controllerClients: Map<string, ControllerClientRecord>,
  clientId: string | undefined,
): boolean {
  if (!clientId) {
    return false;
  }

  const record = controllerClients.get(clientId);
  return !record || typeof record.revokedAt === 'number';
}