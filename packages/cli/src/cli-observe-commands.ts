import { type Command } from 'commander';
import type { Envelope, NetworkInterceptListenerOptions } from '@telepat/otto-protocol';
import type WebSocket from 'ws';
import type { OttoConfig } from './config.js';
import type { LogSource } from './logs-options.js';

export function registerObserveCommands(params: {
  program: Command;
  loadConfig: () => OttoConfig;
  deriveHttpUrl: (relayUrl: string) => string;
  resolveTargetNodeId: (config: OttoConfig, nodeId?: string) => Promise<string>;
  runCommandOnce: (
    config: OttoConfig,
    targetNodeId: string,
    opts: { action: string; tabSession?: string; payload: Record<string, unknown>; timeoutMs?: number },
  ) => Promise<Envelope>;
  parseMaybeNumber: (value: unknown, fallback: number) => number;
  parsePositiveNumberOption: (value: unknown, label: string) => number;
  parseNetworkMode: (value: unknown) => 'network' | 'fetch' | 'hybrid';
  collectString: (value: string, previous: string[]) => string[];
  parseLogLevelOption: (value?: string) => 'debug' | 'info' | 'warn' | 'error' | undefined;
  parseLogSourceOption: (value?: string) => LogSource | undefined;
  parseLatestOption: (value?: string) => number | undefined;
  requestJson: (url: string, init?: RequestInit) => Promise<unknown>;
  subscribeNetworkListenerAndFollow: (
    config: OttoConfig,
    targetNodeId: string,
    options: NetworkInterceptListenerOptions,
    timeoutMs: number,
    openControllerSocket: (config: OttoConfig) => Promise<WebSocket>,
    startControllerHeartbeat: (ws: WebSocket) => () => void,
  ) => Promise<void>;
  openControllerSocket: (config: OttoConfig) => Promise<WebSocket>;
  startControllerHeartbeat: (ws: WebSocket) => () => void;
  runLogsFollowTui: (config: OttoConfig, source: LogSource | undefined, jsonOutput: boolean) => Promise<void>;
  followLogsOnce: (config: OttoConfig, source: LogSource | undefined, jsonOutput: boolean) => Promise<void>;
}): void {
  const commands = params.program.command('commands').description('Discover available commands from target node');

  commands
    .command('list')
    .description('List available commands')
    .option('--node-id <id>', 'Override target node id')
    .option('--site <site>', 'Filter by site, for example reddit.com')
    .option('--timeout <ms>', 'Command timeout in milliseconds', '30000')
    .action(async (opts) => {
      const config = params.loadConfig();
      const targetNodeId = await params.resolveTargetNodeId(config, opts.nodeId);

      const response = await params.runCommandOnce(config, targetNodeId, {
        action: 'command.list',
        payload: {},
        timeoutMs: Number(opts.timeout),
      });

      if (response.messageType === 'error') {
        console.log(JSON.stringify(response, null, 2));
        process.exitCode = 1;
        return;
      }

      const payload = response.payload as {
        data?: {
          commands?: Array<{ site?: string }>;
        };
      };

      const commandsList = payload.data?.commands ?? [];
      const filtered = opts.site
        ? commandsList.filter((commandEntry) => String(commandEntry.site ?? '').toLowerCase() === String(opts.site).toLowerCase())
        : commandsList;

      const output = {
        ...response,
        payload: {
          ...(response.payload as Record<string, unknown>),
          data: {
            ...(payload.data ?? {}),
            commands: filtered,
          },
        },
      };

      console.log(JSON.stringify(output, null, 2));
    });

  const logs = params.program.command('logs').description('Read relay logs');
  const listener = params.program.command('listener').description('Manage long-lived node listeners');

  listener
    .command('subscribe-network')
    .description('Subscribe to network response interception updates and stream them')
    .requiredOption('--tab-session <id>', 'Target managed tab session id')
    .requiredOption('--site <site>', 'Site scope (for example reddit.com)')
    .option('--pattern <glob>', 'URL pattern to capture (repeat for multiple)', params.collectString, [])
    .option('--request-host <host>', 'Allow capture for request host (repeat for multiple)', params.collectString, [])
    .option('--mode <mode>', 'network|fetch|hybrid', 'network')
    .option('--include-headers', 'Include redacted request/response headers in updates', false)
    .option('--no-include-body', 'Do not include response body in updates')
    .option('--max-body-bytes <n>', 'Max response body bytes per update', '256000')
    .option('--mime <mime>', 'Allowed MIME prefix (repeat for multiple)', params.collectString, [])
    .option('--node-id <id>', 'Override target node id')
    .option('--timeout <ms>', 'Command timeout in milliseconds', '30000')
    .action(async (opts) => {
      const config = params.loadConfig();
      const targetNodeId = await params.resolveTargetNodeId(config, opts.nodeId);
      const mode = params.parseNetworkMode(opts.mode);
      const maxBodyBytes = params.parsePositiveNumberOption(opts.maxBodyBytes, '--max-body-bytes');
      const timeoutMs = params.parseMaybeNumber(opts.timeout, 30_000);

      const options: NetworkInterceptListenerOptions = {
        tabSessionId: String(opts.tabSession),
        site: String(opts.site),
        mode,
        includeBody: Boolean(opts.includeBody),
        includeHeaders: Boolean(opts.includeHeaders),
        maxBodyBytes,
      };

      if (Array.isArray(opts.pattern) && opts.pattern.length > 0) {
        options.urlPatterns = opts.pattern;
      }

      if (Array.isArray(opts.requestHost) && opts.requestHost.length > 0) {
        options.requestHostAllowlist = opts.requestHost;
      }

      if (Array.isArray(opts.mime) && opts.mime.length > 0) {
        options.mimeTypes = opts.mime;
      }

      await params.subscribeNetworkListenerAndFollow(
        config,
        targetNodeId,
        options,
        timeoutMs,
        params.openControllerSocket,
        params.startControllerHeartbeat,
      );
    });

  listener
    .command('unsubscribe')
    .description('Unsubscribe an active listener by its subscribe request id')
    .requiredOption('--target-request-id <id>', 'Original subscribe request id')
    .option('--node-id <id>', 'Override target node id')
    .option('--timeout <ms>', 'Command timeout in milliseconds', '30000')
    .action(async (opts) => {
      const config = params.loadConfig();
      const targetNodeId = await params.resolveTargetNodeId(config, opts.nodeId);

      const response = await params.runCommandOnce(config, targetNodeId, {
        action: 'listener.unsubscribe',
        payload: {
          targetRequestId: String(opts.targetRequestId),
        },
        timeoutMs: params.parseMaybeNumber(opts.timeout, 30_000),
      });

      console.log(JSON.stringify(response, null, 2));
      if (response.messageType === 'error') {
        process.exitCode = 1;
      }
    });

  logs
    .command('list')
    .description('List historical relay logs')
    .option('--since <iso>', 'ISO timestamp filter')
    .option('--level <level>', 'debug|info|warn|error')
    .option('--source <source>', 'relay|controller|node|all')
    .option('--latest <n>', 'Return only the latest N logs')
    .option('--node-id <id>', 'Filter by nodeId')
    .option('--request-id <id>', 'Filter by requestId')
    .action(async (opts) => {
      const config = params.loadConfig();
      const base = config.relayHttpUrl ?? params.deriveHttpUrl(config.relayUrl);
      const level = params.parseLogLevelOption(opts.level);
      const source = params.parseLogSourceOption(opts.source);
      const latest = params.parseLatestOption(opts.latest);
      const search = new URLSearchParams();
      if (opts.since) search.set('since', opts.since);
      if (level) search.set('level', level);
      if (source) search.set('source', source);
      if (latest) search.set('latest', String(latest));
      if (opts.nodeId) search.set('nodeId', opts.nodeId);
      if (opts.requestId) search.set('requestId', opts.requestId);
      const result = await params.requestJson(`${base}/api/logs?${search.toString()}`);
      console.log(JSON.stringify(result, null, 2));
    });

  logs
    .command('follow')
    .description('Follow live relay logs')
    .option('--source <source>', 'relay|controller|node|all')
    .option('--json', 'Output full JSON log entries', false)
    .action(async (opts) => {
      const config = params.loadConfig();
      const source = params.parseLogSourceOption(opts.source);
      const jsonOutput = Boolean(opts.json);
      if (process.stdout.isTTY && process.stdin.isTTY) {
        await params.runLogsFollowTui(config, source, jsonOutput);
        return;
      }
      await params.followLogsOnce(config, source, jsonOutput);
    });

  logs
    .command('status')
    .description('Show relay log storage status')
    .action(async () => {
      const config = params.loadConfig();
      const base = config.relayHttpUrl ?? params.deriveHttpUrl(config.relayUrl);
      const result = await params.requestJson(`${base}/api/logs/status`);
      console.log(JSON.stringify(result, null, 2));
    });

  logs
    .command('export')
    .description('Export logs as newline-delimited JSON')
    .option('--since <iso>', 'ISO timestamp filter')
    .option('--level <level>', 'debug|info|warn|error')
    .option('--source <source>', 'relay|controller|node|all')
    .option('--latest <n>', 'Return only the latest N logs')
    .option('--node-id <id>', 'Filter by nodeId')
    .option('--request-id <id>', 'Filter by requestId')
    .action(async (opts) => {
      const config = params.loadConfig();
      const base = config.relayHttpUrl ?? params.deriveHttpUrl(config.relayUrl);
      const level = params.parseLogLevelOption(opts.level);
      const source = params.parseLogSourceOption(opts.source);
      const latest = params.parseLatestOption(opts.latest);
      const search = new URLSearchParams();
      if (opts.since) search.set('since', opts.since);
      if (level) search.set('level', level);
      if (source) search.set('source', source);
      if (latest) search.set('latest', String(latest));
      if (opts.nodeId) search.set('nodeId', opts.nodeId);
      if (opts.requestId) search.set('requestId', opts.requestId);

      const response = await fetch(`${base}/api/logs/export?${search.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to export logs: ${response.status}`);
      }
      const data = await response.text();
      console.log(data);
    });
}
