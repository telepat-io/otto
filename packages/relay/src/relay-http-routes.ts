/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Server } from 'node:http';
import { handleRelayHttpControllerAndLogRoutes } from './relay-http-routes-controller-logs.js';

type RelayHttpRoutesContext = Record<string, unknown>;

export function registerRelayHttpRoutes(server: Server, ctx: RelayHttpRoutesContext): void {
  const {
    PORT,
    pairingByCode,
    pairingByChallenge,
    jsonResponse,
    deriveStatus,
    nanoid,
    randomCode,
    emitLog,
    issueAccessToken,
    issueRefreshToken,
    refreshTokens,
    persistRefreshSessions,
    REFRESH_TTL_SECONDS,
    DEFAULT_CONTROLLER_SCOPES,
    resolveRefreshSession,
    revokeRefreshToken,
  } = ctx as any;

  server.on('request', (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

    if (req.method === 'POST' && url.pathname === '/api/pairing/request') {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { nodeId?: string };
          if (!body.nodeId) {
            jsonResponse(res, 400, { error: 'nodeId_required' });
            return;
          }

          for (const existing of pairingByCode.values()) {
            const fresh = deriveStatus(existing);
            if (fresh.nodeId === body.nodeId && fresh.status === 'pending') {
              jsonResponse(res, 200, fresh);
              return;
            }
          }

          const challenge = {
            challengeId: `ch_${nanoid(12)}`,
            code: randomCode(),
            nodeId: body.nodeId,
            status: 'pending',
            expiresAt: Date.now() + 5 * 60 * 1000,
          };

          pairingByCode.set(challenge.code, challenge);
          pairingByChallenge.set(challenge.challengeId, challenge);
          emitLog({
            level: 'info',
            source: 'relay',
            type: 'pairing_requested',
            nodeId: challenge.nodeId,
            status: 'pending',
            data: { challengeId: challenge.challengeId, code: challenge.code },
          });

          jsonResponse(res, 200, challenge);
        } catch {
          jsonResponse(res, 400, { error: 'invalid_json' });
        }
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/pairing/pending') {
      const pending: unknown[] = [];
      for (const existing of pairingByCode.values() as Iterable<unknown>) {
        const fresh = deriveStatus(existing);
        if ((fresh as { status?: string }).status === 'pending') {
          pending.push(fresh);
        }
      }
      jsonResponse(res, 200, { pending });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/pairing/approve') {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', async () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { code?: string };
          if (!body.code) {
            jsonResponse(res, 400, { error: 'code_required' });
            return;
          }

          const challenge = pairingByCode.get(body.code);
          if (!challenge) {
            jsonResponse(res, 404, { error: 'pairing_not_found' });
            return;
          }
          deriveStatus(challenge);
          if (challenge.status !== 'pending') {
            jsonResponse(res, 409, { error: 'pairing_not_pending' });
            return;
          }

          const controllerId = `ctl_${nanoid(10)}`;
          challenge.status = 'approved';
          challenge.approvedAt = Date.now();
          challenge.nodeAccessToken = await issueAccessToken('node', challenge.nodeId, undefined, ['*']);
          challenge.nodeRefreshToken = issueRefreshToken(
            refreshTokens,
            persistRefreshSessions,
            REFRESH_TTL_SECONDS,
            'node',
            challenge.nodeId,
            undefined,
            ['*'],
          );

          const controllerAccessToken = await issueAccessToken(
            'controller',
            challenge.nodeId,
            controllerId,
            DEFAULT_CONTROLLER_SCOPES,
          );
          const controllerRefreshToken = issueRefreshToken(
            refreshTokens,
            persistRefreshSessions,
            REFRESH_TTL_SECONDS,
            'controller',
            challenge.nodeId,
            controllerId,
            DEFAULT_CONTROLLER_SCOPES,
          );

          emitLog({
            level: 'info',
            source: 'relay',
            type: 'pairing_approved',
            nodeId: challenge.nodeId,
            status: 'approved',
            data: { challengeId: challenge.challengeId, controllerId },
          });

          jsonResponse(res, 200, {
            challengeId: challenge.challengeId,
            nodeId: challenge.nodeId,
            controllerId,
            scopes: DEFAULT_CONTROLLER_SCOPES,
            controllerAccessToken,
            controllerRefreshToken,
          });
        } catch {
          jsonResponse(res, 400, { error: 'invalid_json' });
        }
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/pairing/status') {
      const challengeId = url.searchParams.get('challengeId');
      if (!challengeId) {
        jsonResponse(res, 400, { error: 'challengeId_required' });
        return;
      }
      const challenge = pairingByChallenge.get(challengeId);
      if (!challenge) {
        jsonResponse(res, 404, { error: 'challenge_not_found' });
        return;
      }
      jsonResponse(res, 200, deriveStatus(challenge));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/refresh') {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', async () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { refreshToken?: string };
          if (!body.refreshToken) {
            jsonResponse(res, 400, { error: 'refreshToken_required' });
            return;
          }
          const session = resolveRefreshSession(refreshTokens, persistRefreshSessions, body.refreshToken);
          if (!session) {
            jsonResponse(res, 401, { error: 'invalid_refresh_token' });
            return;
          }
          const accessToken = await issueAccessToken(
            session.role,
            session.nodeId,
            session.controllerId,
            session.scopes,
            session.clientId,
          );
          const refreshToken = issueRefreshToken(
            refreshTokens,
            persistRefreshSessions,
            REFRESH_TTL_SECONDS,
            session.role,
            session.nodeId,
            session.controllerId,
            session.scopes,
            session.clientId,
          );
          revokeRefreshToken(refreshTokens, persistRefreshSessions, body.refreshToken);
          jsonResponse(res, 200, { accessToken, refreshToken });
        } catch {
          jsonResponse(res, 400, { error: 'invalid_json' });
        }
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/revoke') {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { refreshToken?: string };
          if (!body.refreshToken) {
            jsonResponse(res, 400, { error: 'refreshToken_required' });
            return;
          }
          const existed = revokeRefreshToken(refreshTokens, persistRefreshSessions, body.refreshToken);
          jsonResponse(res, 200, { revoked: existed });
        } catch {
          jsonResponse(res, 400, { error: 'invalid_json' });
        }
      });
      return;
    }

    if (handleRelayHttpControllerAndLogRoutes({ req, res, url, ctx })) {
      return;
    }

    jsonResponse(res, 404, { error: 'not_found' });
  });
}
