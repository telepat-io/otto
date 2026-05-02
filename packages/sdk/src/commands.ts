import type { Envelope } from '@telepat/otto-protocol';
import { nanoid } from 'nanoid';
import type { OttoWsSession } from './ws.js';
import type { CommandDescriptor, CommandResult } from './types.js';
import { OttoCommandError } from './errors.js';

/**
 * Manages command execution on nodes.
 *
 * @example
 * ```ts
 * const result = await client.commands.run({
 *   nodeId: 'node_xyz',
 *   site: 'reddit.com',
 *   command: 'search_posts',
 *   input: { query: 'typescript' },
 * });
 * ```
 *
 * @internal
 */
export class CommandsClient {
  constructor(private wsSession: OttoWsSession) {}

  /**
   * List all available commands on a node.
   *
   * @param options - Command list options
   * @param options.nodeId - Target node ID
   * @returns Array of command descriptors
   * @throws OttoError on failure
   *
   * @example
   * ```ts
   * const commands = await client.commands.list({ nodeId: 'node_xyz' });
   * ```
   */
  async list(options: { nodeId: string }): Promise<CommandDescriptor[]> {
    const envelope: Envelope = {
      protocolVersion: '1.0',
      messageType: 'command',
      requestId: nanoid(),
      timestamp: new Date().toISOString(),
      senderRole: 'controller',
      payload: {
        targetNodeId: options.nodeId,
        action: 'command.list',
        payload: {},
      },
    };

    const response = await this.wsSession.sendAndWaitForResponse(envelope);
    const result = response.payload as { ok?: boolean; data?: unknown; error?: string };

    if (!result.ok) {
      throw new OttoCommandError(
        result.error ?? 'Command list failed',
        'failed',
      );
    }

    return (Array.isArray(result.data) ? result.data : []) as CommandDescriptor[];
  }

  /**
   * Execute a command on a node and wait for result.
   *
   * @param options - Command execution options
   * @param options.nodeId - Target node ID
   * @param options.site - Command site domain (e.g., 'reddit.com', 'twitter.com')
   * @param options.command - Command identifier
   * @param options.input - Command input payload
   * @param options.timeoutMs - Command timeout in milliseconds (default 30000)
   * @returns Command result
   * @throws OttoCommandError if command fails
   * @throws OttoTimeoutError if command times out
   *
   * @example
   * ```ts
   * const result = await client.commands.run({
   *   nodeId: 'node_xyz',
   *   site: 'reddit.com',
   *   command: 'search_posts',
   *   input: { query: 'typescript' },
   *   timeoutMs: 60000,
   * });
   * ```
   */
  async run(options: {
    nodeId: string;
    site: string;
    command: string;
    input?: Record<string, unknown>;
    timeoutMs?: number;
  }): Promise<CommandResult> {
    const envelope: Envelope = {
      protocolVersion: '1.0',
      messageType: 'command',
      requestId: nanoid(),
      timestamp: new Date().toISOString(),
      senderRole: 'controller',
      payload: {
        targetNodeId: options.nodeId,
        action: 'command.run',
        timeoutMs: options.timeoutMs ?? 30000,
        payload: {
          site: options.site,
          command: options.command,
          input: options.input ?? {},
        },
      },
    };

    const response = await this.wsSession.sendAndWaitForResponse(
      envelope,
      (options.timeoutMs ?? 30000) + 5000, // Add buffer for network latency
    );

    const result = response.payload as {
      ok?: boolean;
      data?: unknown;
      commandOutcome?: string;
      durationMs?: number;
      error?: string;
    };

    if (!result.ok || !result.commandOutcome) {
      throw new OttoCommandError(
        result.error ?? 'Command execution failed',
        result.commandOutcome ?? 'failed',
      );
    }

    if (result.commandOutcome !== 'completed') {
      throw new OttoCommandError(
        result.error ?? `Command ${result.commandOutcome}`,
        result.commandOutcome,
      );
    }

    return {
      ok: true,
      data: result.data,
      commandOutcome: result.commandOutcome,
      durationMs: result.durationMs ?? 0,
    };
  }
}
