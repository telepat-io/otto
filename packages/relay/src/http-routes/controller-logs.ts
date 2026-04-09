/* eslint-disable @typescript-eslint/no-explicit-any */

import type { IncomingMessage, ServerResponse } from 'node:http';

export function handleRelayHttpControllerAndLogRoutes(params: {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  ctx: Record<string, unknown>;
}): boolean {
  const { req, res, url, ctx } = params;
  const {
    jsonResponse,
    canRegisterControllerClient,
    ALLOW_REMOTE_CONTROLLER_REGISTRATION,
    CONTROLLER_REGISTRATION_SECRET,
    normalizeControllerNameInput,
    normalizedControllerNameKey,
    findControllerByNormalizedName,
    controllerClients,
    deriveAvatarSeed,
    randomBytes,
    hashClientSecret,
    persistControllerClients,
    verifyClientSecret,
    removeControllerClientByIdWithSideEffects,
    purgeControllerClientById,
    parseBearerToken,
    verifyAccessToken,
    listAclForNode,
    controllerAcl,
    aclKey,
    persistControllerAcl,
    emitLog,
    nanoid,
    issueAccessToken,
    issueRefreshToken,
    refreshTokens,
    persistRefreshSessions,
    REFRESH_TTL_SECONDS,
    DEFAULT_CONTROLLER_SCOPES,
    parseSinceMs,
    parseLogLevel,
    parseLogSource,
    parseLatest,
    filterLogs,
    logEvents,
    logStorage,
    LOG_WINDOW_MAX_FILE_BYTES,
    nodeClients,
  } = ctx as any;

  if (req.method === 'POST' && url.pathname === '/api/controller/register') {
    if (!canRegisterControllerClient(req, {
      allowRemoteControllerRegistration: ALLOW_REMOTE_CONTROLLER_REGISTRATION,
      controllerRegistrationSecret: CONTROLLER_REGISTRATION_SECRET,
    })) {
      jsonResponse(res, 403, { error: 'registration_forbidden' });
      return true;
    }

    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          name?: string;
          description?: string;
          avatarSeed?: string;
        };
        const name = typeof body.name === 'string' ? normalizeControllerNameInput(body.name).slice(0, 120) : '';
        const description = typeof body.description === 'string'
          ? body.description.trim().slice(0, 500)
          : '';
        if (!name || !description) {
          jsonResponse(res, 400, { error: 'controller_metadata_required' });
          return;
        }

        const normalizedName = normalizedControllerNameKey(name);
        const existing = findControllerByNormalizedName(controllerClients, normalizedName);
        if (existing) {
          jsonResponse(res, 409, {
            error: 'controller_name_conflict',
            code: 'controller_name_conflict',
            message: 'Controller name is already registered',
            clientId: existing.clientId,
          });
          return;
        }

        const clientId = `clt_${nanoid(10)}`;
        const clientSecret = `cs_${randomBytes(24).toString('base64url')}`;
        const secretSalt = randomBytes(16).toString('hex');
        const record = {
          clientId,
          name,
          description,
          normalizedName,
          avatarSeed: typeof body.avatarSeed === 'string' && body.avatarSeed.trim().length > 0
            ? body.avatarSeed.trim().slice(0, 64)
            : deriveAvatarSeed(name),
          secretSalt,
          secretHash: hashClientSecret(clientSecret, secretSalt),
          createdAt: Date.now(),
        };

        controllerClients.set(clientId, record);
        persistControllerClients();

        emitLog({
          level: 'info',
          source: 'relay',
          type: 'controller_client_registered',
          status: 'created',
          data: { clientId, name },
        });

        jsonResponse(res, 200, {
          clientId,
          name,
          description,
          avatarSeed: record.avatarSeed,
          clientSecret,
          createdAt: record.createdAt,
        });
      } catch {
        jsonResponse(res, 400, { error: 'invalid_json' });
      }
    });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/controller/token') {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          clientId?: string;
          clientSecret?: string;
        };

        if (!body.clientId || !body.clientSecret) {
          jsonResponse(res, 400, { error: 'client_credentials_required' });
          return;
        }

        const record = controllerClients.get(body.clientId);
        if (!record || record.revokedAt) {
          jsonResponse(res, 401, { error: 'invalid_client_credentials' });
          return;
        }

        if (!verifyClientSecret(body.clientSecret, record)) {
          emitLog({
            level: 'warn',
            source: 'relay',
            type: 'controller_client_auth_failed',
            status: 'denied',
            data: { clientId: body.clientId },
          });
          jsonResponse(res, 401, { error: 'invalid_client_credentials' });
          return;
        }

        const controllerId = `ctl_${nanoid(10)}`;
        const accessToken = await issueAccessToken(
          'controller',
          undefined,
          controllerId,
          DEFAULT_CONTROLLER_SCOPES,
          record.clientId,
        );
        const refreshToken = issueRefreshToken(
          refreshTokens,
          persistRefreshSessions,
          REFRESH_TTL_SECONDS,
          'controller',
          undefined,
          controllerId,
          DEFAULT_CONTROLLER_SCOPES,
          record.clientId,
        );

        record.lastUsedAt = Date.now();
        controllerClients.set(record.clientId, record);
        persistControllerClients();

        emitLog({
          level: 'info',
          source: 'relay',
          type: 'controller_client_token_issued',
          status: 'issued',
          data: { clientId: record.clientId, controllerId },
        });

        jsonResponse(res, 200, {
          clientId: record.clientId,
          controllerId,
          scopes: DEFAULT_CONTROLLER_SCOPES,
          accessToken,
          refreshToken,
        });
      } catch {
        jsonResponse(res, 400, { error: 'invalid_json' });
      }
    });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/controller/remove') {
    if (!canRegisterControllerClient(req, {
      allowRemoteControllerRegistration: ALLOW_REMOTE_CONTROLLER_REGISTRATION,
      controllerRegistrationSecret: CONTROLLER_REGISTRATION_SECRET,
    })) {
      jsonResponse(res, 403, { error: 'registration_forbidden' });
      return true;
    }

    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { clientId?: string };
        const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
        if (!clientId) {
          jsonResponse(res, 400, { error: 'clientId_required' });
          return;
        }

        if (!controllerClients.has(clientId)) {
          jsonResponse(res, 404, { error: 'client_not_found' });
          return;
        }

        jsonResponse(res, 200, removeControllerClientByIdWithSideEffects(clientId));
      } catch {
        jsonResponse(res, 400, { error: 'invalid_json' });
      }
    });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/controller/remove-all') {
    if (!canRegisterControllerClient(req, {
      allowRemoteControllerRegistration: ALLOW_REMOTE_CONTROLLER_REGISTRATION,
      controllerRegistrationSecret: CONTROLLER_REGISTRATION_SECRET,
    })) {
      jsonResponse(res, 403, { error: 'registration_forbidden' });
      return true;
    }

    const removedClientIds: string[] = [];
    let aclRevokedCount = 0;
    let refreshRevokedCount = 0;
    let disconnectedSessions = 0;
    const clientIds = Array.from(controllerClients.keys() as Iterable<string>);

    for (const clientId of clientIds) {
      const removal = removeControllerClientByIdWithSideEffects(clientId);
      removedClientIds.push(clientId);
      aclRevokedCount += removal.aclRevokedCount;
      refreshRevokedCount += removal.refreshRevokedCount;
      disconnectedSessions += removal.disconnectedSessions;
      purgeControllerClientById(controllerClients, persistControllerClients, clientId);
    }

    jsonResponse(res, 200, {
      ok: true,
      removedClientIds,
      removedCount: removedClientIds.length,
      aclRevokedCount,
      refreshRevokedCount,
      disconnectedSessions,
    });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/controller/access') {
    const token = parseBearerToken(req);
    if (!token) {
      jsonResponse(res, 401, { error: 'missing_access_token' });
      return true;
    }

    void (async () => {
      try {
        const claims = await verifyAccessToken(token);
        if (claims.role !== 'node' || !claims.nodeId) {
          jsonResponse(res, 403, { error: 'forbidden_role' });
          return;
        }

        jsonResponse(res, 200, {
          nodeId: claims.nodeId,
          clients: listAclForNode(controllerClients, controllerAcl, claims.nodeId),
        });
      } catch {
        jsonResponse(res, 401, { error: 'invalid_access_token' });
      }
    })();
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/controller/access') {
    const token = parseBearerToken(req);
    if (!token) {
      jsonResponse(res, 401, { error: 'missing_access_token' });
      return true;
    }

    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      void (async () => {
        try {
          const claims = await verifyAccessToken(token);
          if (claims.role !== 'node' || !claims.nodeId) {
            jsonResponse(res, 403, { error: 'forbidden_role' });
            return;
          }

          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
            clientId?: string;
            grant?: boolean;
            expiresAt?: number;
          };

          if (!body.clientId || typeof body.grant !== 'boolean') {
            jsonResponse(res, 400, { error: 'clientId_and_grant_required' });
            return;
          }

          const record = controllerClients.get(body.clientId);
          if (!record || record.revokedAt) {
            jsonResponse(res, 404, { error: 'client_not_found' });
            return;
          }

          const key = aclKey(body.clientId, claims.nodeId);
          if (body.grant) {
            if (typeof body.expiresAt === 'number' && body.expiresAt <= Date.now()) {
              jsonResponse(res, 400, { error: 'invalid_expiresAt' });
              return;
            }

            const nextGrant = {
              clientId: body.clientId,
              nodeId: claims.nodeId,
              grantedByNodeId: claims.nodeId,
              grantedAt: Date.now(),
              expiresAt: typeof body.expiresAt === 'number' ? body.expiresAt : undefined,
            };

            controllerAcl.set(key, nextGrant);
            persistControllerAcl();

            emitLog({
              level: 'info',
              source: 'node',
              type: 'controller_acl_granted',
              nodeId: claims.nodeId,
              status: 'granted',
              data: { clientId: body.clientId, expiresAt: nextGrant.expiresAt },
            });

            jsonResponse(res, 200, { ok: true, clientId: body.clientId, nodeId: claims.nodeId, granted: true });
            return;
          }

          const removed = controllerAcl.delete(key);
          if (removed) {
            persistControllerAcl();
          }

          emitLog({
            level: 'info',
            source: 'node',
            type: 'controller_acl_revoked',
            nodeId: claims.nodeId,
            status: 'revoked',
            data: { clientId: body.clientId, existed: removed },
          });

          jsonResponse(res, 200, { ok: true, clientId: body.clientId, nodeId: claims.nodeId, granted: false });
        } catch {
          jsonResponse(res, 400, { error: 'invalid_json' });
        }
      })();
    });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/logs') {
    const since = url.searchParams.get('since');
    const level = url.searchParams.get('level');
    const nodeId = url.searchParams.get('nodeId');
    const requestId = url.searchParams.get('requestId');
    const source = url.searchParams.get('source');
    const latest = url.searchParams.get('latest');
    const sinceMs = parseSinceMs(since, Date.now() - 60 * 60 * 1000);
    if (since && sinceMs === null) {
      jsonResponse(res, 400, { error: 'invalid_since' });
      return true;
    }
    const parsedLevel = parseLogLevel(level);
    if (level && parsedLevel === null) {
      jsonResponse(res, 400, { error: 'invalid_level' });
      return true;
    }
    const parsedSource = parseLogSource(source);
    if (source && parsedSource === null) {
      jsonResponse(res, 400, { error: 'invalid_source' });
      return true;
    }
    const parsedLatest = parseLatest(latest);
    if (latest && parsedLatest === null) {
      jsonResponse(res, 400, { error: 'invalid_latest' });
      return true;
    }

    const logs = filterLogs(logEvents, {
      sinceMs: sinceMs ?? Date.now() - 60 * 60 * 1000,
      level: parsedLevel ?? undefined,
      nodeId: nodeId ?? undefined,
      requestId: requestId ?? undefined,
      source: parsedSource ?? undefined,
      latest: parsedLatest ?? undefined,
    });
    jsonResponse(res, 200, { logs });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/logs/status') {
    const sizeBytes = logStorage.totalLogBytes();
    const oldest = logEvents.length > 0 ? logEvents[0]?.timestamp : null;
    const newest = logEvents.length > 0 ? logEvents[logEvents.length - 1]?.timestamp : null;
    jsonResponse(res, 200, {
      retentionDays: 14,
      totalEvents: logEvents.length,
      sizeBytes,
      windowing: {
        mode: 'daily',
        maxFileBytes: LOG_WINDOW_MAX_FILE_BYTES,
      },
      oldest,
      newest,
    });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/logs/export') {
    const since = url.searchParams.get('since');
    const level = url.searchParams.get('level');
    const nodeId = url.searchParams.get('nodeId');
    const requestId = url.searchParams.get('requestId');
    const source = url.searchParams.get('source');
    const latest = url.searchParams.get('latest');
    const sinceMs = parseSinceMs(since, Date.now() - 24 * 60 * 60 * 1000);
    if (since && sinceMs === null) {
      jsonResponse(res, 400, { error: 'invalid_since' });
      return true;
    }
    const parsedLevel = parseLogLevel(level);
    if (level && parsedLevel === null) {
      jsonResponse(res, 400, { error: 'invalid_level' });
      return true;
    }
    const parsedSource = parseLogSource(source);
    if (source && parsedSource === null) {
      jsonResponse(res, 400, { error: 'invalid_source' });
      return true;
    }
    const parsedLatest = parseLatest(latest);
    if (latest && parsedLatest === null) {
      jsonResponse(res, 400, { error: 'invalid_latest' });
      return true;
    }

    const filtered = filterLogs(logEvents, {
      sinceMs: sinceMs ?? Date.now() - 24 * 60 * 60 * 1000,
      level: parsedLevel ?? undefined,
      nodeId: nodeId ?? undefined,
      requestId: requestId ?? undefined,
      source: parsedSource ?? undefined,
      latest: parsedLatest ?? undefined,
    });

    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    res.end(filtered.map((evt: unknown) => JSON.stringify(evt)).join('\n'));
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/nodes/connected') {
    const token = parseBearerToken(req);
    if (!token) {
      jsonResponse(res, 401, { error: 'missing_access_token' });
      return true;
    }

    void (async () => {
      try {
        const claims = await verifyAccessToken(token);
        if (claims.role !== 'controller') {
          jsonResponse(res, 403, { error: 'forbidden_role' });
          return;
        }

        const nodes = Array.from(nodeClients.entries() as Iterable<[string, { authenticated?: boolean }]> )
          .filter(([, client]) => client.authenticated)
          .map(([nodeId]) => ({ nodeId }));

        jsonResponse(res, 200, { nodes });
      } catch {
        jsonResponse(res, 401, { error: 'invalid_access_token' });
      }
    })();
    return true;
  }

  return false;
}
