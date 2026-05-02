/**
 * SDK-specific type definitions and re-exports from protocol.
 */

export interface Node {
  /** Unique identifier for the node */
  nodeId: string;
}

export interface CommandDescriptor {
  /** Site (e.g., 'reddit', 'twitter') */
  site: string;
  /** Command identifier */
  id: string;
  /** Human-readable command name */
  displayName: string;
  /** Command description */
  description: string;
  /** Command tags/categories */
  tags: string[];
  /** Whether command requires authentication */
  requiresAuth: boolean;
  /** Optional input field definitions */
  inputFields?: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    description: string;
    optional?: boolean;
  }>;
}

export interface CommandResult {
  /** Whether command succeeded */
  ok: boolean;
  /** Command result data */
  data?: unknown;
  /** Command execution outcome */
  commandOutcome: 'completed' | 'failed' | 'timed_out' | 'cancelled';
  /** Duration in milliseconds */
  durationMs: number;
  /** Error message if applicable */
  error?: string;
}

export interface PairingChallenge {
  /** Challenge identifier */
  challengeId: string;
  /** 6-digit approval code */
  code: string;
  /** Node ID being paired */
  nodeId: string;
  /** Pairing status */
  status: 'pending' | 'approved' | 'expired';
  /** Expiration timestamp (milliseconds) */
  expiresAt: number;
}

export interface ListenerUpdateEvent {
  /** Event type */
  type: 'listener_update';
  /** Event data (varies by listener type) */
  data: unknown;
  /** Listener-specific update type */
  updateType?: string;
  /** ISO timestamp when event was emitted */
  emittedAt?: string;
}
