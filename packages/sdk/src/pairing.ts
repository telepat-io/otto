import type { OttoHttpClient } from './http.js';
import type { Node, PairingChallenge } from './types.js';
import { OttoError } from './errors.js';

/**
 * Manages node pairing workflows.
 *
 * @internal
 */
export class PairingClient {
  constructor(private httpClient: OttoHttpClient) {}

  /**
   * List pending pairing challenges awaiting approval.
   *
   * @returns Array of pending pairing challenges
   * @throws OttoError on failure
   *
   * @example
   * ```ts
   * const pending = await client.pairing.listPending();
   * for (const challenge of pending) {
   *   console.log(`Approve with code: ${challenge.code}`);
   * }
   * ```
   */
  async listPending(): Promise<PairingChallenge[]> {
    const pairings = await this.httpClient.listPendingPairings();
    return pairings.map((p) => ({
      challengeId: p.challengeId,
      code: p.code,
      nodeId: p.nodeId,
      status: p.status as 'pending' | 'approved' | 'expired',
      expiresAt: p.expiresAt,
    }));
  }

  /**
   * Approve a pairing challenge by its 6-digit code.
   *
   * @param options - Approval options
   * @param options.code - 6-digit pairing code
   * @throws OttoError if code is invalid or pairing fails
   *
   * @example
   * ```ts
   * await client.pairing.approve({ code: '123456' });
   * ```
   */
  async approve(options: { code: string }): Promise<void> {
    if (!options.code || options.code.length !== 6) {
      throw new OttoError('Pairing code must be 6 digits');
    }
    await this.httpClient.approvePairing(options.code);
  }
}

/**
 * Manages node listing and discovery.
 *
 * @internal
 */
export class NodesClient {
  constructor(private httpClient: OttoHttpClient) {}

  /**
   * List all connected nodes you have ACL-granted access to.
   *
   * @returns Array of accessible nodes
   * @throws OttoError on failure
   *
   * @example
   * ```ts
   * const nodes = await client.nodes.list();
   * for (const node of nodes) {
   *   console.log(`Node: ${node.nodeId}`);
   * }
   * ```
   */
  async list(): Promise<Node[]> {
    return this.httpClient.listConnectedNodes();
  }
}
