export type ControllerClientRecord = {
  clientId: string;
  name: string;
  description: string;
  avatarSeed: string;
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

export function aclKey(clientId: string, nodeId: string): string {
  return `${clientId}:${nodeId}`;
}

export function cleanupControllerAcl(
  grants: Map<string, ControllerAclGrant>,
  persistControllerAcl: () => void,
): { removed: number } {
  let removed = 0;
  const now = Date.now();
  for (const [key, grant] of grants.entries()) {
    if (grant.expiresAt && grant.expiresAt <= now) {
      grants.delete(key);
      removed += 1;
    }
  }

  if (removed > 0) {
    persistControllerAcl();
  }

  return { removed };
}

export function listAclForNode(
  clients: Map<string, ControllerClientRecord>,
  grants: Map<string, ControllerAclGrant>,
  nodeId: string,
): Array<{
  clientId: string;
  name: string;
  description: string;
  avatarSeed: string;
  createdAt: number;
  lastUsedAt?: number;
  revoked: boolean;
  granted: boolean;
  grantExpiresAt?: number;
}> {
  return Array.from(clients.values())
    .map((client) => {
      const grant = grants.get(aclKey(client.clientId, nodeId));
      return {
        clientId: client.clientId,
        name: client.name,
        description: client.description,
        avatarSeed: client.avatarSeed,
        createdAt: client.createdAt,
        lastUsedAt: client.lastUsedAt,
        revoked: typeof client.revokedAt === 'number',
        granted: Boolean(grant),
        grantExpiresAt: grant?.expiresAt,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function revokeControllerAclByClientId(
  grants: Map<string, ControllerAclGrant>,
  persistControllerAcl: () => void,
  clientId: string,
): number {
  let removed = 0;
  for (const [key, grant] of grants.entries()) {
    if (grant.clientId !== clientId) {
      continue;
    }
    grants.delete(key);
    removed += 1;
  }

  if (removed > 0) {
    persistControllerAcl();
  }

  return removed;
}

export function isControllerAllowedNode(
  grants: Map<string, ControllerAclGrant>,
  persistControllerAcl: () => void,
  clientId: string | undefined,
  targetNodeId: string,
): boolean {
  if (!clientId) {
    return true;
  }

  const key = aclKey(clientId, targetNodeId);
  const grant = grants.get(key);
  if (!grant) {
    return false;
  }

  if (grant.expiresAt && grant.expiresAt <= Date.now()) {
    grants.delete(key);
    persistControllerAcl();
    return false;
  }

  return true;
}