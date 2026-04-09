import type { OttoRole } from '@telepat/otto-protocol';
import type { PairingChallenge, RateLimitState, ReplayState } from '../relay-models-schemas.js';
import {
  checkRateLimit as checkRateLimitUtil,
  deriveStatus as deriveStatusUtil,
  isActionAllowed as isActionAllowedUtil,
  issueAccessToken as issueAccessTokenUtil,
  randomCode as randomCodeUtil,
  validateReplayWindow as validateReplayWindowUtil,
  verifyAccessToken as verifyAccessTokenUtil,
} from './helpers.js';

export function createRelayAuthBindings(params: {
  tokenSecret: string;
  tokenPreviousSecret?: string;
  tokenIssuer: string;
  tokenAudience: string;
  tokenTtlSeconds: number;
  rateLimitPerMin: number;
  replayWindowMs: number;
  rateLimit: Map<string, RateLimitState>;
  replayState: Map<string, ReplayState>;
}) {
  function randomCode(): string {
    return randomCodeUtil();
  }

  async function issueAccessToken(
    role: OttoRole,
    nodeId?: string,
    controllerId?: string,
    scopes: string[] = [],
    clientId?: string,
  ): Promise<string> {
    return issueAccessTokenUtil({
      role,
      nodeId,
      controllerId,
      scopes,
      clientId,
      tokenSecret: params.tokenSecret,
      tokenIssuer: params.tokenIssuer,
      tokenAudience: params.tokenAudience,
      tokenTtlSeconds: params.tokenTtlSeconds,
    });
  }

  async function verifyAccessToken(token: string): Promise<{
    role: OttoRole;
    nodeId?: string;
    controllerId?: string;
    clientId?: string;
    scopes: string[];
  }> {
    return verifyAccessTokenUtil({
      token,
      tokenSecret: params.tokenSecret,
      tokenPreviousSecret: params.tokenPreviousSecret,
      tokenIssuer: params.tokenIssuer,
      tokenAudience: params.tokenAudience,
    });
  }

  function checkRateLimit(clientId: string): boolean {
    return checkRateLimitUtil(params.rateLimit, clientId, params.rateLimitPerMin);
  }

  function isActionAllowed(scopes: string[], action: string): boolean {
    return isActionAllowedUtil(scopes, action);
  }

  function validateReplayWindow(clientId: string, timestampIso: string, replayNonce?: string): { ok: true } | { ok: false; code: string; message: string } {
    return validateReplayWindowUtil({
      replayState: params.replayState,
      replayWindowMs: params.replayWindowMs,
      clientId,
      timestampIso,
      replayNonce,
    });
  }

  function deriveStatus(challenge: PairingChallenge): PairingChallenge {
    return deriveStatusUtil(challenge);
  }

  return {
    randomCode,
    issueAccessToken,
    verifyAccessToken,
    checkRateLimit,
    isActionAllowed,
    validateReplayWindow,
    deriveStatus,
  };
}
