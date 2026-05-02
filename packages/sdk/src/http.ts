import { OttoError } from './errors.js';

/**
 * Derives HTTP URL from WebSocket URL.
 * Converts wss:// → https:// and ws:// → http://
 *
 * @param wsUrl - WebSocket URL with optional query params
 * @returns HTTP URL
 */
export function deriveHttpUrl(wsUrl: string): string {
  const parsed = new URL(wsUrl);
  parsed.search = '';
  parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
  return parsed.toString().replace(/\/$/, '');
}

/**
 * HTTP client wrapper using native fetch.
 * Handles token-based authentication and error responses.
 */
export class OttoHttpClient {
  private httpUrl: string;
  private accessToken: string | null = null;

  /**
   * @param wsUrl - Relay WebSocket URL
   */
  constructor(wsUrl: string) {
    this.httpUrl = deriveHttpUrl(wsUrl);
  }

  /**
   * Sets the access token for subsequent requests.
   * @param token - Bearer token
   */
  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  /**
   * Exchange clientId + clientSecret for access/refresh tokens.
   *
   * @param clientId - Controller client ID
   * @param clientSecret - Controller client secret
   * @returns Token response with accessToken and refreshToken
   * @throws OttoError on failure
   *
   * @example
   * ```ts
   * const response = await httpClient.exchangeCredentials(clientId, clientSecret);
   * console.log(response.accessToken);
   * ```
   */
  async exchangeCredentials(
    clientId: string,
    clientSecret: string,
  ): Promise<{ accessToken: string; refreshToken?: string }> {
    const response = await fetch(`${this.httpUrl}/api/controller/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new OttoError(`Token exchange failed: ${response.status} ${body}`);
    }

    const data = await response.json() as {
      accessToken?: string;
      refreshToken?: string;
    };
    if (typeof data.accessToken !== 'string') {
      throw new OttoError('Invalid token response: missing accessToken');
    }

    return { accessToken: data.accessToken, refreshToken: data.refreshToken };
  }

  /**
   * List connected nodes accessible by this controller.
   *
   * @returns Array of connected nodes
   * @throws OttoError on failure
   */
  async listConnectedNodes(): Promise<Array<{ nodeId: string }>> {
    const response = await fetch(`${this.httpUrl}/api/nodes/connected`, {
      method: 'GET',
      headers: this.buildAuthHeaders(),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new OttoError(`Failed to list nodes: ${response.status} ${body}`);
    }

    const data = await response.json() as { nodes?: Array<{ nodeId: string }> };
    return data.nodes ?? [];
  }

  /**
   * List pending pairing challenges.
   *
   * @returns Array of pending pairing challenges
   * @throws OttoError on failure
   */
  async listPendingPairings(): Promise<Array<{
    challengeId: string;
    code: string;
    nodeId: string;
    status: string;
    expiresAt: number;
  }>> {
    const response = await fetch(`${this.httpUrl}/api/pairing/pending`, {
      method: 'GET',
    });

    if (!response.ok) {
      const body = await response.text();
      throw new OttoError(`Failed to list pairings: ${response.status} ${body}`);
    }

    const data = await response.json() as {
      pending?: Array<{
        challengeId: string;
        code: string;
        nodeId: string;
        status: string;
        expiresAt: number;
      }>;
    };
    return data.pending ?? [];
  }

  /**
   * Approve a pairing challenge by code.
   *
   * @param code - 6-digit pairing code
   * @throws OttoError on failure
   */
  async approvePairing(code: string): Promise<void> {
    const response = await fetch(`${this.httpUrl}/api/pairing/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new OttoError(`Pairing approval failed: ${response.status} ${body}`);
    }
  }

  /**
   * Send an authenticated HTTP POST request.
   *
   * @param endpoint - Endpoint path (e.g., '/api/something')
   * @param body - Request body
   * @returns Response body as JSON
   * @throws OttoError on failure
   * @internal
   */
  async post(
    endpoint: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.httpUrl}${endpoint}`, {
      method: 'POST',
      headers: { ...this.buildAuthHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new OttoError(`HTTP ${response.status}: ${text}`);
    }

    return (await response.json()) as Record<string, unknown>;
  }

  private buildAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.accessToken) {
      headers.authorization = `Bearer ${this.accessToken}`;
    }
    return headers;
  }
}
