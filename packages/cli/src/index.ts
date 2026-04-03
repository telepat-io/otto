#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { Command } from 'commander';
import { nanoid } from 'nanoid';
import WebSocket from 'ws';
import { createEnvelope, type CommandPayload, type Envelope } from '@telepat/otto-protocol';
import {
  DEFAULT_CONTROLLER_RELAY_URL,
  deriveHttpUrl,
  loadConfig,
  saveConfig,
  type OttoConfig,
} from './config.js';
import { refreshControllerAccessToken } from './auth-refresh.js';
import { buildRelayStatusReport, renderRelayStatusPretty } from './daemon-status.js';
import { installExtensionArtifact } from './extension-manager.js';
import { resolveTargetNodeId } from './node-resolution.js';
import { readRelayDaemonState, startRelayAttached, startRelayDaemon, stopRelayDaemon } from './relay-daemon.js';
import { ensureRelayDaemonReadyForSetup, shouldReuseCachedInstall, shouldRunSetupNonInteractive } from './setup-logic.js';
import { runCommandTui, runLogsFollowTui, runSettingsTui, runSetupPromptTui } from './tui.js';
import {
  formatLogEntryHuman,
  formatLogEntryJson,
  parseLatestOption,
  parseLogLevelOption,
  parseLogSourceOption,
  type LogEntry,
  type LogSource,
} from './logs-options.js';

type RelayAuthErrorPayload = {
  category?: string;
  code?: string;
  message?: string;
};

class RelayAuthError extends Error {
  payload?: RelayAuthErrorPayload;

  constructor(message: string, payload?: RelayAuthErrorPayload) {
    super(message);
    this.name = 'RelayAuthError';
    this.payload = payload;
  }
}

async function requestJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

export async function openControllerSocket(config: OttoConfig): Promise<WebSocket> {
  let resolvedConfig = config;
  let accessToken = resolvedConfig.controllerAccessToken;

  if (!accessToken) {
    const refreshed = await refreshControllerAccessToken(resolvedConfig);
    if (refreshed) {
      accessToken = refreshed;
      resolvedConfig = {
        ...resolvedConfig,
        relayHttpUrl: resolvedConfig.relayHttpUrl ?? deriveHttpUrl(resolvedConfig.relayUrl),
        controllerAccessToken: refreshed,
      };
      saveConfig(resolvedConfig);
    }
  }

  if (!accessToken) {
    throw new Error('Missing controllerAccessToken. Run `otto pair <code>` first.');
  }

  const authWithToken = async (token: string): Promise<WebSocket> => {
    console.error('[otto:cli][debug] opening controller websocket connection');
    const ws = new WebSocket(resolvedConfig.relayUrl);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });

    ws.send(
      JSON.stringify(
        createEnvelope('hello', 'controller', nanoid(), {
          role: 'controller',
          capabilities: ['commands', 'logs'],
        }),
      ),
    );

    ws.send(
      JSON.stringify(
        createEnvelope('auth', 'controller', nanoid(), {
          accessToken: token,
        }),
      ),
    );

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Timed out waiting for auth_ack'));
      }, 5000);
      ws.on('message', (data) => {
        const msg = JSON.parse(String(data)) as Envelope;
        if (msg.messageType === 'auth_ack') {
          console.error('[otto:cli][debug] relay auth acknowledged for controller session');
          clearTimeout(timeout);
          resolve();
        }
        if (msg.messageType === 'error') {
          clearTimeout(timeout);
          ws.close();
          const payload = (msg.payload && typeof msg.payload === 'object')
            ? msg.payload as RelayAuthErrorPayload
            : undefined;
          reject(new RelayAuthError(`Auth failed: ${JSON.stringify(msg.payload)}`, payload));
        }
      });
    });

    return ws;
  };

  try {
    return await authWithToken(accessToken);
  } catch (error) {
    const authError = error instanceof RelayAuthError ? error : null;
    const isInvalidAccess = authError?.payload?.code === 'invalid_access_token';
    if (!isInvalidAccess) {
      throw error;
    }

    const refreshed = await refreshControllerAccessToken(resolvedConfig);
    if (!refreshed) {
      throw error;
    }

    console.error('[otto:cli][debug] access token refreshed after invalid_access_token; retrying websocket auth');

    const updatedConfig: OttoConfig = {
      ...resolvedConfig,
      relayHttpUrl: resolvedConfig.relayHttpUrl ?? deriveHttpUrl(resolvedConfig.relayUrl),
      controllerAccessToken: refreshed,
    };
    saveConfig(updatedConfig);
    return authWithToken(refreshed);
  }
}

function parseJsonObject(value: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function isJsonOutput(config: OttoConfig): boolean {
  return config.outputFormat === 'json';
}

function logJsonAware(config: OttoConfig, value: unknown): void {
  if (isJsonOutput(config)) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (typeof value === 'string') {
    console.log(value);
    return;
  }
  console.log(JSON.stringify(value, null, 2));
}

function parseMaybeNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Value must be a positive number');
  }
  return parsed;
}

function parseSetupStrategy(value: unknown): 'auto' | 'download' | 'build' {
  const strategy = String(value ?? 'auto') as 'auto' | 'download' | 'build';
  if (!['auto', 'download', 'build'].includes(strategy)) {
    throw new Error('--strategy must be one of auto|download|build');
  }
  return strategy;
}

function normalizeControllerRelayUrl(urlValue: string): string {
  const parsed = new URL(urlValue.trim());
  if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
    throw new Error('relayUrl must use ws:// or wss://');
  }
  if (parsed.searchParams.get('role') !== 'controller') {
    parsed.searchParams.set('role', 'controller');
  }
  return parsed.toString();
}

async function runCommandOnce(
  config: OttoConfig,
  targetNodeId: string,
  opts: { action: string; tabSession?: string; payload: Record<string, unknown>; timeoutMs?: number },
): Promise<Envelope> {
  const ws = await openControllerSocket(config);
  const requestId = nanoid();
  const timeoutMs = Math.max(1000, Number(opts.timeoutMs ?? 30_000));

  const commandPayload: CommandPayload = {
    targetNodeId,
    tabSessionId: opts.tabSession,
    action: opts.action,
    payload: opts.payload,
    idempotencyKey: nanoid(),
    replayNonce: nanoid(),
    timeoutMs,
    waitPolicy: 'fail_fast',
  };

  return new Promise<Envelope>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`Timed out waiting for terminal response (${timeoutMs + 5000}ms)`));
    }, timeoutMs + 5000);

    const onMessage = (data: WebSocket.RawData) => {
      const msg = JSON.parse(String(data)) as Envelope;
      if (msg.requestId !== requestId) {
        return;
      }

      if (msg.messageType !== 'result' && msg.messageType !== 'error') {
        return;
      }

      clearTimeout(timeout);
      ws.off('message', onMessage);
      ws.close();
      resolve(msg);
    };

    ws.on('message', onMessage);
    ws.send(JSON.stringify(createEnvelope('command', 'controller', requestId, commandPayload)));
  });
}

async function followLogsOnce(config: OttoConfig, source: LogSource | undefined, jsonOutput: boolean): Promise<void> {
  const ws = await openControllerSocket(config);
  const requestId = nanoid();
  console.error(`[otto:cli][debug] subscribing to logs stream source=${source ?? 'all'}`);
  ws.send(
    JSON.stringify(
      createEnvelope('event', 'controller', requestId, {
        type: 'logs_subscribe',
        source,
      }),
    ),
  );

  ws.on('message', (data) => {
    const msg = JSON.parse(String(data)) as Envelope;
    if (msg.messageType === 'event') {
      const payload = msg.payload as { type?: string; entry?: unknown };
      if (payload.type === 'log') {
        const entry = (payload.entry ?? {}) as LogEntry;
        const line = jsonOutput ? formatLogEntryJson(entry) : formatLogEntryHuman(entry);
        console.log(line);
      }
    }
  });

  console.log('[otto] following logs, press Ctrl+C to stop');
}

const program = new Command();
program.name('otto').description('Otto CLI').version('0.1.0');

program
  .command('start')
  .description('Start relay (daemon by default, or attached for development)')
  .option('-a, --attached', 'Run attached in foreground and stream logs to current terminal', false)
  .option('--port <port>', 'Relay port', '8787')
  .action(async (opts) => {
    const port = Number(opts.port);
    if (!Number.isFinite(port) || port <= 0) {
      throw new Error('--port must be a positive number');
    }

    if (opts.attached) {
      const existing = readRelayDaemonState();
      if (existing) {
        console.error(`[otto] relay daemon already running (pid ${existing.pid}). Stop it first with \`otto stop\`.`);
        process.exit(1);
      }

      const proc = startRelayAttached(port);
      proc.on('exit', (code) => process.exit(code ?? 0));
      return;
    }

    const existing = readRelayDaemonState();
    if (existing) {
      console.log(`[otto] relay already running (pid ${existing.pid})`);
      console.log(`[otto] logs: ${existing.logPath}`);
      return;
    }

    const state = startRelayDaemon(port);
    console.log(`[otto] relay started in daemon mode (pid ${state.pid})`);
    console.log(`[otto] logs: ${state.logPath}`);
    console.log('[otto] stop with: otto stop');
  });

program
  .command('stop')
  .description('Stop relay daemon if it is running')
  .action(async () => {
    const result = await stopRelayDaemon();
    if (!result.stopped || !result.state) {
      console.log('[otto] relay already stopped');
      return;
    }

    console.log(`[otto] relay stopped (pid ${result.state.pid})`);
  });

program
  .command('status')
  .description('Show relay daemon status')
  .action(async () => {
    const config = loadConfig();
    const report = buildRelayStatusReport(readRelayDaemonState());

    if (isJsonOutput(config)) {
      logJsonAware(config, report);
    } else {
      console.log(renderRelayStatusPretty(report));
    }
  });

program
  .command('relay:start')
  .description('Start relay in attached foreground mode (legacy alias)')
  .option('--port <port>', 'Relay port', '8787')
  .action((opts) => {
    const port = Number(opts.port);
    if (!Number.isFinite(port) || port <= 0) {
      throw new Error('--port must be a positive number');
    }

    const proc = startRelayAttached(port);
    proc.on('exit', (code) => process.exit(code ?? 0));
  });

program
  .command('config')
  .description('Configure relay and defaults')
  .requiredOption('--relay-url <url>', 'Relay websocket URL')
  .option('--relay-http-url <url>', 'Relay HTTP base URL')
  .option('--node-id <id>', 'Default target node ID')
  .action((opts) => {
    const previous = loadConfig();
    const relayUrl = normalizeControllerRelayUrl(String(opts.relayUrl));
    const relayHttpUrl = opts.relayHttpUrl ?? deriveHttpUrl(relayUrl);
    saveConfig({
      ...previous,
      relayUrl,
      relayHttpUrl,
      targetNodeId: opts.nodeId,
    });
    console.log('[otto] config saved');
  });

program
  .command('setup')
  .description('Guided controller setup including relay daemon readiness, extension acquisition, and Chrome handoff instructions')
  .option('--relay-url <url>', 'Controller relay websocket URL')
  .option('--strategy <strategy>', 'auto|download|build')
  .option('--yes', 'Accept defaults without interactive confirmation', false)
  .option('--force', 'Reinstall extension artifact even if local cached version is present', false)
  .option('--output-dir <path>', 'Directory for downloaded extension artifacts')
  .option('--release-base-url <url>', 'Release base URL for extension downloads')
  .option('--repo-path <path>', 'Local repo path used for --strategy build')
  .option('--download-timeout-ms <ms>', 'Download timeout in milliseconds')
  .option('--non-interactive', 'Skip interactive prompts and emit deterministic output', false)
  .action(async (opts) => {
    const config = loadConfig();
    const cliVersion = program.version() ?? '0.1.0';
    const interactiveAllowed = process.stdout.isTTY && process.stdin.isTTY;
    const explicitNonInteractive = Boolean(opts.nonInteractive);
    const nonInteractive = shouldRunSetupNonInteractive(interactiveAllowed, explicitNonInteractive);

    const defaults = {
      relayUrl: normalizeControllerRelayUrl(opts.relayUrl ?? config.relayUrl ?? DEFAULT_CONTROLLER_RELAY_URL),
      strategy: parseSetupStrategy(opts.strategy ?? config.setupStrategyDefault ?? 'auto'),
      repoPath: opts.repoPath as string | undefined,
    };

    const resolved = (!nonInteractive && !opts.yes)
      ? await runSetupPromptTui(defaults)
      : defaults;

    if (!resolved) {
      console.log('[otto] setup cancelled');
      return;
    }

    const relayUrl = normalizeControllerRelayUrl(resolved.relayUrl);
    const relayHttpUrl = deriveHttpUrl(relayUrl);
    const timeoutMs = parseMaybeNumber(opts.downloadTimeoutMs, config.downloadTimeoutMs ?? 25_000);
    const strategy = resolved.strategy;
    const relayDaemon = ensureRelayDaemonReadyForSetup(relayUrl, readRelayDaemonState, startRelayDaemon);

    const cachedUnpackedPath = config.extension?.unpackedPath;
    const canReuseCachedInstall = shouldReuseCachedInstall(config, cliVersion, Boolean(opts.force), existsSync);

    const install = canReuseCachedInstall
      ? {
          source: config.extension?.source ?? 'download',
          version: cliVersion,
          zipPath: config.extension?.zipPath,
          unpackedPath: cachedUnpackedPath as string,
          checksumSha256: config.extension?.checksumSha256,
          releaseBaseUrl: config.extension?.releaseBaseUrl,
        }
      : await installExtensionArtifact({
          strategy,
          version: cliVersion,
          outputDir: opts.outputDir,
          releaseBaseUrl: opts.releaseBaseUrl,
          timeoutMs,
          repoPath: resolved.repoPath,
        });

    const nextConfig: OttoConfig = {
      ...config,
      relayUrl,
      relayHttpUrl,
      downloadTimeoutMs: timeoutMs,
      extension: {
        version: install.version,
        source: install.source,
        zipPath: install.zipPath,
        unpackedPath: install.unpackedPath,
        checksumSha256: install.checksumSha256,
        installedAt: new Date().toISOString(),
        releaseBaseUrl: install.releaseBaseUrl,
      },
    };
    saveConfig(nextConfig);

    const summary = {
      relayUrl,
      relayHttpUrl,
      relayDaemon: {
        status: relayDaemon.status,
        ...relayDaemon.state,
      },
      extension: nextConfig.extension,
      pairingReady: Boolean(nextConfig.controllerAccessToken),
      nextSteps: nextConfig.controllerAccessToken
        ? ['Open extension popup to confirm node status', 'otto recipes list', 'otto test reddit.com getFeed']
        : [
            'Open extension popup and confirm pairing code is visible',
            'otto authcode',
            'otto pair <code>',
            'Re-open extension popup and confirm status = Connected',
            'otto recipes list',
          ],
    };

    if (nonInteractive) {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    console.log('[otto] setup complete');
    if (relayDaemon.status === 'started') {
      console.log(`[otto] relay daemon started (pid ${relayDaemon.state.pid})`);
    } else {
      console.log(`[otto] relay daemon already running (pid ${relayDaemon.state.pid})`);
    }
    console.log(`[otto] relay daemon logs: ${relayDaemon.state.logPath}`);
    if (canReuseCachedInstall) {
      console.log('[otto] reused existing local extension artifact cache');
    }
    console.log(`[otto] relay URL: ${relayUrl}`);
    console.log(`[otto] extension source: ${install.source}`);
    if (install.zipPath) {
      console.log(`[otto] extension zip: ${install.zipPath}`);
    }
    console.log(`[otto] extension folder (load unpacked): ${install.unpackedPath}`);
    console.log('[otto] Chrome install steps:');
    console.log('  1) Open chrome://extensions');
    console.log('  2) Enable Developer mode');
    console.log(`  3) Click Load unpacked and select: ${install.unpackedPath}`);
    console.log('  4) Click the Otto toolbar icon to open node setup popup');
    console.log('  5) Verify relay URL and wait for pairing code in popup status');
    if (!nextConfig.controllerAccessToken) {
      console.log('[otto] pairing required next: otto authcode && otto pair <code>');
      console.log('[otto] after pairing: open popup again and confirm status shows Connected');
    }
  });

const extension = program.command('extension').description('Manage extension artifact installation for setup');

extension
  .command('get')
  .description('Download or build an extension artifact and cache it locally')
  .option('--strategy <strategy>', 'auto|download|build', 'auto')
  .option('--output-dir <path>', 'Directory for downloaded extension artifacts')
  .option('--release-base-url <url>', 'Release base URL for extension downloads')
  .option('--repo-path <path>', 'Local repo path used for --strategy build')
  .option('--download-timeout-ms <ms>', 'Download timeout in milliseconds')
  .action(async (opts) => {
    const config = loadConfig();
    const cliVersion = program.version() ?? '0.1.0';
    const strategy = parseSetupStrategy(opts.strategy);

    const install = await installExtensionArtifact({
      strategy,
      version: cliVersion,
      outputDir: opts.outputDir,
      releaseBaseUrl: opts.releaseBaseUrl,
      timeoutMs: parseMaybeNumber(opts.downloadTimeoutMs, config.downloadTimeoutMs ?? 25_000),
      repoPath: opts.repoPath,
    });

    const nextConfig: OttoConfig = {
      ...config,
      extension: {
        version: install.version,
        source: install.source,
        zipPath: install.zipPath,
        unpackedPath: install.unpackedPath,
        checksumSha256: install.checksumSha256,
        installedAt: new Date().toISOString(),
        releaseBaseUrl: install.releaseBaseUrl,
      },
    };
    saveConfig(nextConfig);

    logJsonAware(nextConfig, {
      ok: true,
      extension: nextConfig.extension,
    });
  });

extension
  .command('info')
  .description('Show installed extension artifact metadata from local config')
  .action(() => {
    const config = loadConfig();
    logJsonAware(config, {
      extension: config.extension ?? null,
      relayUrl: config.relayUrl,
      relayHttpUrl: config.relayHttpUrl ?? deriveHttpUrl(config.relayUrl),
    });
  });

program
  .command('settings')
  .description('Edit controller-global settings stored in ~/.otto/config.json')
  .action(async () => {
    const config = loadConfig();
    if (!process.stdout.isTTY || !process.stdin.isTTY) {
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    const updated = await runSettingsTui(config);
    saveConfig(updated);
    console.log('[otto] settings saved');
  });

program
  .command('authcode')
  .description('List pending auth codes')
  .action(async () => {
    const config = loadConfig();
    const base = config.relayHttpUrl ?? deriveHttpUrl(config.relayUrl);
    const result = (await requestJson(`${base}/api/pairing/pending`)) as { pending: unknown[] };
    console.log(JSON.stringify(result, null, 2));
  });

program
  .command('pair')
  .description('Approve pairing code and store controller tokens')
  .argument('<code>', 'Pairing code like 123-456')
  .action(async (code: string) => {
    const config = loadConfig();
    const base = config.relayHttpUrl ?? deriveHttpUrl(config.relayUrl);
    const result = (await requestJson(`${base}/api/pairing/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    })) as {
      nodeId: string;
      scopes: string[];
      controllerAccessToken: string;
      controllerRefreshToken: string;
    };

    saveConfig({
      ...config,
      targetNodeId: config.targetNodeId ?? result.nodeId,
      relayHttpUrl: base,
      controllerAccessToken: result.controllerAccessToken,
      controllerRefreshToken: result.controllerRefreshToken,
    });

    console.log('[otto] pairing approved and controller tokens saved');
    console.log(`[otto] target node default: ${config.targetNodeId ?? result.nodeId}`);
    console.log(`[otto] controller scopes: ${result.scopes.join(', ')}`);
  });

program
  .command('revoke')
  .description('Revoke stored refresh token from relay and clear local controller auth')
  .action(async () => {
    const config = loadConfig();
    const base = config.relayHttpUrl ?? deriveHttpUrl(config.relayUrl);

    if (config.controllerRefreshToken) {
      await requestJson(`${base}/api/auth/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: config.controllerRefreshToken }),
      });
    }

    saveConfig({
      ...config,
      controllerAccessToken: undefined,
      controllerRefreshToken: undefined,
    });
    console.log('[otto] controller tokens cleared and refresh token revoked');
  });

program
  .command('cmd')
  .description('Send a command to a target node')
  .requiredOption('--action <action>', 'Action name')
  .option('--tab-session <id>', 'tabSessionId')
  .option('--node-id <id>', 'Override target node id')
  .option('--payload <json>', 'JSON payload', '{}')
  .option('--timeout <ms>', 'Command timeout in milliseconds', '30000')
  .action(async (opts) => {
    const config = loadConfig();
    const targetNodeId = await resolveTargetNodeId(config, opts.nodeId);

    if (process.stdout.isTTY && process.stdin.isTTY) {
      await runCommandTui(config, {
        targetNodeId,
        tabSessionId: opts.tabSession,
        action: opts.action,
        payload: opts.payload,
      });
      return;
    }

    const response = await runCommandOnce(config, targetNodeId, {
      action: opts.action,
      tabSession: opts.tabSession,
      payload: parseJsonObject(opts.payload, '--payload'),
      timeoutMs: Number(opts.timeout),
    });

    console.log(JSON.stringify(response, null, 2));
    if (response.messageType === 'error') {
      process.exitCode = 1;
    }
  });

program
  .command('test')
  .description('Run a website recipe for local developer testing')
  .argument('<site>', 'Website domain, for example reddit.com')
  .argument('<recipe>', 'Recipe id, for example getFeed')
  .option('--node-id <id>', 'Override target node id')
  .option('--tab-session <id>', 'Use an existing tabSessionId instead of auto-opening a tab')
  .option('--payload <json>', 'Recipe input JSON object', '{}')
  .option('--timeout <ms>', 'Command timeout in milliseconds', '30000')
  .option('--auth-mode <mode>', 'auto|strict_fail|skip', 'auto')
  .option('--close-tab-on-exit', 'Close auto-opened tab when test finishes', false)
  .action(async (site: string, recipe: string, opts) => {
    const config = loadConfig();
    const targetNodeId = await resolveTargetNodeId(config, opts.nodeId);

    if (!['auto', 'strict_fail', 'skip'].includes(String(opts.authMode))) {
      throw new Error('--auth-mode must be one of auto|strict_fail|skip');
    }

    const timeoutMs = Number(opts.timeout);
    const recipeInput = parseJsonObject(opts.payload, '--payload');

    let tabSessionId = opts.tabSession as string | undefined;
    let openedTabSessionId: string | undefined;

    if (!tabSessionId) {
      const openUrl = site.startsWith('http://') || site.startsWith('https://') ? site : `https://${site}`;
      const openResponse = await runCommandOnce(config, targetNodeId, {
        action: 'primitive.tab.open',
        payload: { url: openUrl },
        timeoutMs,
      });

      console.log(JSON.stringify(openResponse, null, 2));
      if (openResponse.messageType === 'error') {
        process.exitCode = 1;
        return;
      }

      const openPayload = openResponse.payload as { data?: { tabSessionId?: string } };
      tabSessionId = openPayload.data?.tabSessionId;
      openedTabSessionId = tabSessionId;
      if (!tabSessionId) {
        throw new Error('primitive.tab.open succeeded but did not return tabSessionId');
      }
    }

    try {
      const testResponse = await runCommandOnce(config, targetNodeId, {
        action: 'recipe.run',
        tabSession: tabSessionId,
        payload: {
          tabSessionId,
          site,
          recipe,
          input: recipeInput,
          authMode: opts.authMode,
        },
        timeoutMs,
      });

      console.log(JSON.stringify(testResponse, null, 2));
      if (testResponse.messageType === 'error') {
        process.exitCode = 1;
      }
    } finally {
      if (opts.closeTabOnExit && openedTabSessionId) {
        const closeResponse = await runCommandOnce(config, targetNodeId, {
          action: 'primitive.tab.close',
          tabSession: openedTabSessionId,
          payload: { tabSessionId: openedTabSessionId },
          timeoutMs,
        });
        console.log(JSON.stringify(closeResponse, null, 2));
      }
    }
  });

const recipes = program.command('recipes').description('Discover available recipes from target node');

recipes
  .command('list')
  .description('List available recipes')
  .option('--node-id <id>', 'Override target node id')
  .option('--site <site>', 'Filter by site, for example reddit.com')
  .option('--timeout <ms>', 'Command timeout in milliseconds', '30000')
  .action(async (opts) => {
    const config = loadConfig();
    const targetNodeId = await resolveTargetNodeId(config, opts.nodeId);

    const response = await runCommandOnce(config, targetNodeId, {
      action: 'recipe.list',
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
        recipes?: Array<{ site?: string }>;
      };
    };

    const recipes = payload.data?.recipes ?? [];
    const filtered = opts.site
      ? recipes.filter((recipe) => String(recipe.site ?? '').toLowerCase() === String(opts.site).toLowerCase())
      : recipes;

    const output = {
      ...response,
      payload: {
        ...(response.payload as Record<string, unknown>),
        data: {
          ...(payload.data ?? {}),
          recipes: filtered,
        },
      },
    };

    console.log(JSON.stringify(output, null, 2));
  });

const logs = program.command('logs').description('Read relay logs');

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
    const config = loadConfig();
    const base = config.relayHttpUrl ?? deriveHttpUrl(config.relayUrl);
    const level = parseLogLevelOption(opts.level);
    const source = parseLogSourceOption(opts.source);
    const latest = parseLatestOption(opts.latest);
    const params = new URLSearchParams();
    if (opts.since) params.set('since', opts.since);
    if (level) params.set('level', level);
    if (source) params.set('source', source);
    if (latest) params.set('latest', String(latest));
    if (opts.nodeId) params.set('nodeId', opts.nodeId);
    if (opts.requestId) params.set('requestId', opts.requestId);
    const result = await requestJson(`${base}/api/logs?${params.toString()}`);
    console.log(JSON.stringify(result, null, 2));
  });

logs
  .command('follow')
  .description('Follow live relay logs')
  .option('--source <source>', 'relay|controller|node|all')
  .option('--json', 'Output full JSON log entries', false)
  .action(async (opts) => {
    const config = loadConfig();
    const source = parseLogSourceOption(opts.source);
    const jsonOutput = Boolean(opts.json);
    if (process.stdout.isTTY && process.stdin.isTTY) {
      await runLogsFollowTui(config, source, jsonOutput);
      return;
    }
    await followLogsOnce(config, source, jsonOutput);
  });

logs
  .command('status')
  .description('Show relay log storage status')
  .action(async () => {
    const config = loadConfig();
    const base = config.relayHttpUrl ?? deriveHttpUrl(config.relayUrl);
    const result = await requestJson(`${base}/api/logs/status`);
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
    const config = loadConfig();
    const base = config.relayHttpUrl ?? deriveHttpUrl(config.relayUrl);
    const level = parseLogLevelOption(opts.level);
    const source = parseLogSourceOption(opts.source);
    const latest = parseLatestOption(opts.latest);
    const params = new URLSearchParams();
    if (opts.since) params.set('since', opts.since);
    if (level) params.set('level', level);
    if (source) params.set('source', source);
    if (latest) params.set('latest', String(latest));
    if (opts.nodeId) params.set('nodeId', opts.nodeId);
    if (opts.requestId) params.set('requestId', opts.requestId);

    const response = await fetch(`${base}/api/logs/export?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`Failed to export logs: ${response.status}`);
    }
    const data = await response.text();
    console.log(data);
  });

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
