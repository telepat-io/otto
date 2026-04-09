import { jwtVerify, SignJWT } from 'jose';
import type { OttoRole } from '@telepat/otto-protocol';
import type { PairingChallenge, ReplayState } from '../relay-models-schemas.js';

export function randomCode(): string {
  const a = Math.floor(100 + Math.random() * 900);
  const b = Math.floor(100 + Math.random() * 900);
  return `${a}-${b}`;
}

export async function issueAccessToken(params: {
  role: OttoRole;
  nodeId?: string;
  controllerId?: string;
  scopes?: string[];
  clientId?: string;
  tokenSecret: string;
  tokenIssuer: string;
  tokenAudience: string;
  tokenTtlSeconds: number;
}): Promise<string> {
  const secret = new TextEncoder().encode(params.tokenSecret);
  return new SignJWT({
    role: params.role,
    nodeId: params.nodeId,
    controllerId: params.controllerId,
    clientId: params.clientId,
    scopes: params.scopes ?? [],
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(params.tokenIssuer)
    .setAudience(params.tokenAudience)
    .setIssuedAt()
    .setExpirationTime(`${params.tokenTtlSeconds}s`)
    .sign(secret);
}

export async function verifyAccessToken(params: {
  token: string;
  tokenSecret: string;
  tokenPreviousSecret?: string;
  tokenIssuer: string;
  tokenAudience: string;
}): Promise<{
  role: OttoRole;
  nodeId?: string;
  controllerId?: string;
  clientId?: string;
  scopes: string[];
}> {
  const secrets = [params.tokenSecret, params.tokenPreviousSecret].filter((x): x is string => Boolean(x));
  let payload: Awaited<ReturnType<typeof jwtVerify>>['payload'] | undefined;
  for (const candidate of secrets) {
    try {
      const secret = new TextEncoder().encode(candidate);
      const verified = await jwtVerify(params.token, secret, {
        issuer: params.tokenIssuer,
        audience: params.tokenAudience,
      });
      payload = verified.payload;
      break;
    } catch {
      // Try next secret.
    }
  }

  if (!payload) {
    throw new Error('token_verification_failed');
  }

  const role = payload.role as OttoRole | undefined;
  if (!role) throw new Error('missing_role');
  const scopes = Array.isArray(payload.scopes) ? payload.scopes.map((x) => String(x)) : [];
  return {
    role,
    nodeId: payload.nodeId as string | undefined,
    controllerId: payload.controllerId as string | undefined,
    clientId: payload.clientId as string | undefined,
    scopes,
  };
}

export function checkRateLimit(rateLimit: Map<string, { windowStartMs: number; count: number }>, clientId: string, perMinute: number): boolean {
  const now = Date.now();
  const current = rateLimit.get(clientId);
  if (!current || now - current.windowStartMs >= 60_000) {
    rateLimit.set(clientId, { windowStartMs: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= perMinute;
}

export function isActionAllowed(scopes: string[], action: string): boolean {
  if (scopes.includes('*')) return true;
  return scopes.includes(action);
}

export function validateReplayWindow(params: {
  replayState: Map<string, ReplayState>;
  replayWindowMs: number;
  clientId: string;
  timestampIso: string;
  replayNonce?: string;
}): { ok: true } | { ok: false; code: string; message: string } {
  if (!params.replayNonce) {
    return { ok: false, code: 'missing_replay_nonce', message: 'command payload must include replayNonce' };
  }

  const ts = Date.parse(params.timestampIso);
  if (Number.isNaN(ts)) {
    return { ok: false, code: 'invalid_timestamp', message: 'command envelope timestamp must be valid ISO-8601' };
  }

  const now = Date.now();
  if (Math.abs(now - ts) > params.replayWindowMs) {
    return {
      ok: false,
      code: 'timestamp_out_of_window',
      message: `command timestamp outside replay window (${params.replayWindowMs}ms)`,
    };
  }

  const state = params.replayState.get(params.clientId) ?? { nonceSeenAtMs: new Map<string, number>() };
  const cutoff = now - params.replayWindowMs;
  for (const [nonce, seenAt] of state.nonceSeenAtMs.entries()) {
    if (seenAt < cutoff) state.nonceSeenAtMs.delete(nonce);
  }

  if (state.nonceSeenAtMs.has(params.replayNonce)) {
    return { ok: false, code: 'replay_rejected', message: 'replayNonce has already been used in this session window' };
  }

  state.nonceSeenAtMs.set(params.replayNonce, now);
  params.replayState.set(params.clientId, state);
  return { ok: true };
}

export function deriveStatus(challenge: PairingChallenge): PairingChallenge {
  if (challenge.status === 'pending' && challenge.expiresAt <= Date.now()) {
    challenge.status = 'expired';
  }
  return challenge;
}
