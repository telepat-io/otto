import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';

import {
  PORT,
  TOKEN_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
  REFRESH_SESSIONS_FILE,
  CONTROLLER_CLIENTS_FILE,
  CONTROLLER_ACL_FILE,
  CONTROLLER_HEARTBEAT_INTERVAL_MS,
  CONTROLLER_HEARTBEAT_MISS_LIMIT,
} from './relay-config.js';
import { createRelayState, createRelayContext } from './relay-context.js';
import { registerRelayHttpRoutes } from './http-routes/index.js';
import { registerRelayWsHandlers } from './ws-routes/index.js';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

const state = createRelayState();
const { ctx, hydrateStats } = createRelayContext(state);

/* eslint-disable @typescript-eslint/no-explicit-any */
const {
  emitLog,
  cleanupLogs,
  cleanupRefreshSessions,
  cleanupControllerAcl,
} = ctx as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

const server = createServer();
const wss = new WebSocketServer({ noServer: true });

registerRelayHttpRoutes(server, ctx);
registerRelayWsHandlers(wss, ctx);

// WS upgrade: origin validation for node connections
server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin;
  const role = req.url?.includes('role=node') ? 'node' : 'controller';

  emitLog({
    level: 'info',
    source: 'relay',
    type: 'ws_upgrade_attempt',
    data: { role, url: req.url, origin },
  });

  if (role === 'node') {
    const allowedOrigin = process.env.OTTO_EXTENSION_ORIGIN;
    if (allowedOrigin && origin !== allowedOrigin) {
      emitLog({
        level: 'warn',
        source: 'relay',
        type: 'ws_upgrade_rejected',
        data: { role, url: req.url, origin, reason: 'origin_not_allowed', allowedOrigin },
      });
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws);
  });
});

// Maintenance: log rotation, session expiry, ACL expiry (hourly)
setInterval(() => {
  cleanupLogs();
  cleanupRefreshSessions();
  cleanupControllerAcl();
}, 60 * 60 * 1000);

// Maintenance: controller heartbeat enforcement
setInterval(() => {
  const { clients } = state;
  const nowMs = Date.now();
  const staleThresholdMs = CONTROLLER_HEARTBEAT_INTERVAL_MS * CONTROLLER_HEARTBEAT_MISS_LIMIT;

  for (const client of clients.values()) {
    if (client.role !== 'controller' || !client.authenticated) {
      continue;
    }

    const lastSeenMs = client.lastHeartbeatAtMs ?? nowMs;
    if (nowMs - lastSeenMs <= staleThresholdMs) {
      continue;
    }

    emitLog({
      level: 'warn',
      source: 'relay',
      type: 'controller_heartbeat_timeout',
      nodeId: client.nodeId,
      status: 'disconnecting',
      data: {
        controllerId: client.controllerId,
        clientId: client.clientId,
        staleForMs: nowMs - lastSeenMs,
        heartbeatIntervalMs: CONTROLLER_HEARTBEAT_INTERVAL_MS,
        heartbeatMissLimit: CONTROLLER_HEARTBEAT_MISS_LIMIT,
      },
    });
    client.ws.close();
  }
}, Math.max(1_000, Math.floor(CONTROLLER_HEARTBEAT_INTERVAL_MS / 2)));

server.listen(PORT, () => {
  console.log(`[relay] listening on :${PORT}`);
  console.log(
    `[relay] auth config accessTtl=${TOKEN_TTL_SECONDS}s refreshTtl=${REFRESH_TTL_SECONDS}s refreshStore=${REFRESH_SESSIONS_FILE}`,
  );
  emitLog({
    level: 'info',
    source: 'relay',
    type: 'relay_started',
    status: 'listening',
    data: {
      port: PORT,
      accessTokenTtlSeconds: TOKEN_TTL_SECONDS,
      refreshTokenTtlSeconds: REFRESH_TTL_SECONDS,
      refreshSessionStore: {
        file: REFRESH_SESSIONS_FILE,
        ...hydrateStats.refreshStoreStats,
      },
      controllerClientStore: {
        file: CONTROLLER_CLIENTS_FILE,
        ...hydrateStats.controllerClientStoreStats,
      },
      controllerAclStore: {
        file: CONTROLLER_ACL_FILE,
        ...hydrateStats.controllerAclStoreStats,
      },
    },
  });
});
