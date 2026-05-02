import { OttoHttpClient } from './http.js';
import { OttoWsSession } from './ws.js';
import { CommandsClient } from './commands.js';
import { ListenersClient } from './streaming.js';
import { PairingClient, NodesClient } from './pairing.js';
import { OttoError, OttoAuthError } from './errors.js';

/**
 * Main SDK client for interacting with Otto relay.
 *
 * @example
 * ```ts
 * import { OttoClient } from '@telepat/otto-sdk';
 *
 * const client = new OttoClient({
 *   relayUrl: 'wss://relay.example.com',
 *   clientId: 'clt_xxx',
 *   clientSecret: 'cs_yyy',
 * });
 *
 * await client.connect();
 * const nodes = await client.nodes.list();
 * const result = await client.commands.run({
 *   nodeId: nodes[0].nodeId,
 *   site: 'reddit',
 *   command: 'search_posts',
 *   input: { query: 'typescript' },
 * });
 * console.log(result);
 * await client.disconnect();
 * ```
 */
export class OttoClient {
  private httpClient: OttoHttpClient;
  private wsSession: OttoWsSession | null = null;
  private accessToken: string | null = null;
  private nodesClient: NodesClient | null = null;
  private commandsClient: CommandsClient | null = null;
  private listenersClient: ListenersClient | null = null;
  private pairingClient: PairingClient | null = null;

  /**
   * Create a new Otto client.
   *
   * @param options - Client initialization options
   * @param options.relayUrl - Relay WebSocket URL (e.g., 'wss://relay.example.com' or 'ws://localhost:8787')
   * @param options.clientId - Controller client ID from relay registration
   * @param options.clientSecret - Controller client secret from relay registration
   *
   * @example
   * ```ts
   * const client = new OttoClient({
   *   relayUrl: 'wss://relay.example.com',
   *   clientId: 'clt_xxxxxxxxxx',
   *   clientSecret: 'cs_yyyyyyyyyyyyyyyyyy',
   * });
   * ```
   */
  constructor(
    private options: {
      relayUrl: string;
      clientId: string;
      clientSecret: string;
    },
  ) {
    this.httpClient = new OttoHttpClient(options.relayUrl);
  }

  /**
   * Sub-client for node operations (list connected nodes).
   */
  get nodes(): NodesClient {
    if (!this.nodesClient) {
      this.nodesClient = new NodesClient(this.httpClient);
    }
    return this.nodesClient;
  }

  /**
   * Sub-client for command operations (list/run commands on nodes).
   */
  get commands(): CommandsClient {
    return new CommandsClient(this.getWsSession());
  }

  /**
   * Sub-client for listener operations (subscribe to streaming updates).
   */
  get listeners(): ListenersClient {
    return new ListenersClient(this.getWsSession());
  }

  /**
   * Sub-client for pairing operations (approve pending pair requests).
   */
  get pairing(): PairingClient {
    if (!this.pairingClient) {
      this.pairingClient = new PairingClient(this.httpClient);
    }
    return this.pairingClient;
  }

  private getWsSession(): OttoWsSession {
    if (!this.wsSession) {
      throw new OttoError('Not connected. Call connect() first.');
    }
    return this.wsSession;
  }

  /**
   * Establish connection to relay and authenticate.
   * Safe to call multiple times; subsequent calls are no-ops if already connected.
   *
   * @throws OttoAuthError if credentials are invalid
   * @throws OttoError if connection fails
   *
   * @example
   * ```ts
   * await client.connect();
   * ```
   */
  async connect(): Promise<void> {
    if (this.wsSession?.isAuthenticated()) {
      return;
    }

    // Exchange credentials for access token
    try {
      const tokens = await this.httpClient.exchangeCredentials(
        this.options.clientId,
        this.options.clientSecret,
      );
      this.accessToken = tokens.accessToken;
      this.httpClient.setAccessToken(this.accessToken);
    } catch (err) {
      throw new OttoAuthError(
        `Authentication failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Establish WebSocket connection
    this.wsSession = new OttoWsSession(
      this.options.relayUrl,
      this.options.clientId,
      this.accessToken,
    );

    try {
      await this.wsSession.connect();
    } catch (err) {
      this.wsSession = null;
      throw err;
    }
  }

  /**
   * Close connection to relay.
   * Safe to call multiple times.
   *
   * @example
   * ```ts
   * await client.disconnect();
   * ```
   */
  async disconnect(): Promise<void> {
    if (this.wsSession) {
      await this.wsSession.disconnect();
      this.wsSession = null;
    }
    this.accessToken = null;
  }

  /**
   * Returns true if client is connected and authenticated.
   * @internal
   */
  isConnected(): boolean {
    return this.wsSession?.isAuthenticated() ?? false;
  }

  /**
   * Ensure connection before executing API call.
   * @internal
   */
  private async ensureConnected(): Promise<void> {
    if (!this.isConnected()) {
      await this.connect();
    }
  }
}

export { OttoError, OttoAuthError, OttoTimeoutError, OttoCommandError } from './errors.js';
export type {
  Node,
  CommandDescriptor,
  CommandResult,
  PairingChallenge,
  ListenerUpdateEvent,
} from './types.js';
export { StreamSession } from './streaming.js';
