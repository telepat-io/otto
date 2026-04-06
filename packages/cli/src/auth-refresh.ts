import { deriveHttpUrl, type OttoConfig } from './config.js';

type RefreshResponse = {
  accessToken?: unknown;
  refreshToken?: unknown;
};

export type RefreshedControllerTokens = {
  accessToken: string;
  refreshToken?: string;
};

export async function refreshControllerAccessToken(config: OttoConfig): Promise<RefreshedControllerTokens | null> {
  if (!config.controllerRefreshToken) {
    return null;
  }

  const base = config.relayHttpUrl ?? deriveHttpUrl(config.relayUrl);
  const response = await fetch(`${base}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: config.controllerRefreshToken }),
  });

  if (!response.ok) {
    return null;
  }

  const body = await response.json() as RefreshResponse;
  if (typeof body.accessToken !== 'string' || body.accessToken.length === 0) {
    throw new Error('Refresh endpoint returned invalid accessToken');
  }

  return {
    accessToken: body.accessToken,
    refreshToken: typeof body.refreshToken === 'string' && body.refreshToken.length > 0
      ? body.refreshToken
      : undefined,
  };
}
