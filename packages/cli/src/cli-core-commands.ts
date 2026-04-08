import { existsSync } from 'node:fs';
import type { Command } from 'commander';
import type { OttoConfig } from './config.js';
import type { RelayDaemonState } from './relay-daemon.js';
import type { RelayStatusReport } from './daemon-status.js';

export type RegisterCoreCommandsDeps = {
  loadConfig: () => OttoConfig;
  saveConfig: (config: OttoConfig) => void;
  normalizeControllerRelayUrl: (urlValue: string) => string;
  deriveHttpUrl: (relayUrl: string) => string;
  parseSetupStrategy: (value: unknown) => 'auto' | 'download' | 'build';
  parseMaybeNumber: (value: unknown, defaultValue: number) => number;
  shouldRunSetupNonInteractive: (interactiveAllowed: boolean, explicitNonInteractive: boolean) => boolean;
  runSetupPromptTui: (defaults: {
    relayUrl: string;
    strategy: 'auto' | 'download' | 'build';
    repoPath?: string;
  }) => Promise<{ relayUrl: string; strategy: 'auto' | 'download' | 'build'; repoPath?: string } | null>;
  ensureRelayDaemonReadyForSetup: (
    relayUrl: string,
    readRelayDaemonState: () => RelayDaemonState | null,
    startRelayDaemon: (port: number) => RelayDaemonState,
  ) => { status: 'started' | 'already_running'; state: RelayDaemonState };
  readRelayDaemonState: () => RelayDaemonState | null;
  startRelayDaemon: (port: number) => RelayDaemonState;
  startRelayAttached: (port: number) => { on: (event: 'exit', listener: (code: number | null) => void) => void };
  stopRelayDaemon: () => Promise<{ stopped: boolean; state: RelayDaemonState | null }>;
  buildRelayStatusReport: (state: RelayDaemonState | null) => RelayStatusReport;
  renderRelayStatusPretty: (report: RelayStatusReport) => string;
  isJsonOutput: (config: OttoConfig) => boolean;
  logJsonAware: (config: OttoConfig, value: unknown) => void;
  installExtensionArtifact: (opts: {
    strategy: 'auto' | 'download' | 'build';
    version: string;
    outputDir?: string;
    releaseBaseUrl?: string;
    timeoutMs: number;
    repoPath?: string;
  }) => Promise<{
    source: 'download' | 'build';
    version: string;
    zipPath?: string;
    unpackedPath: string;
    checksumSha256?: string;
    releaseBaseUrl?: string;
  }>;
  shouldReuseCachedInstall: (
    config: OttoConfig,
    cliVersion: string,
    force: boolean,
    existsFn: typeof existsSync,
  ) => boolean;
  DEFAULT_CONTROLLER_RELAY_URL: string;
  runSettingsTui: (config: OttoConfig) => Promise<OttoConfig>;
};

export function registerCoreCommands(program: Command, deps: RegisterCoreCommandsDeps): void {
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
        const existing = deps.readRelayDaemonState();
        if (existing) {
          console.error(`[otto] relay daemon already running (pid ${existing.pid}). Stop it first with \`otto stop\`.`);
          process.exit(1);
        }

        const proc = deps.startRelayAttached(port);
        proc.on('exit', (code) => process.exit(code ?? 0));
        return;
      }

      const existing = deps.readRelayDaemonState();
      if (existing) {
        console.log(`[otto] relay already running (pid ${existing.pid})`);
        console.log(`[otto] logs: ${existing.logPath}`);
        return;
      }

      const state = deps.startRelayDaemon(port);
      console.log(`[otto] relay started in daemon mode (pid ${state.pid})`);
      console.log(`[otto] logs: ${state.logPath}`);
      console.log('[otto] stop with: otto stop');
    });

  program
    .command('stop')
    .description('Stop relay daemon if it is running')
    .action(async () => {
      const result = await deps.stopRelayDaemon();
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
      const config = deps.loadConfig();
      const report = deps.buildRelayStatusReport(deps.readRelayDaemonState());

      if (deps.isJsonOutput(config)) {
        deps.logJsonAware(config, report);
      } else {
        console.log(deps.renderRelayStatusPretty(report));
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

      const proc = deps.startRelayAttached(port);
      proc.on('exit', (code) => process.exit(code ?? 0));
    });

  program
    .command('config')
    .description('Configure relay and defaults')
    .requiredOption('--relay-url <url>', 'Relay websocket URL')
    .option('--relay-http-url <url>', 'Relay HTTP base URL')
    .option('--node-id <id>', 'Default target node ID')
    .action((opts) => {
      const previous = deps.loadConfig();
      const relayUrl = deps.normalizeControllerRelayUrl(String(opts.relayUrl));
      const relayHttpUrl = opts.relayHttpUrl ?? deps.deriveHttpUrl(relayUrl);
      deps.saveConfig({
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
      const config = deps.loadConfig();
      const cliVersion = program.version() ?? '0.1.0';
      const interactiveAllowed = process.stdout.isTTY && process.stdin.isTTY;
      const explicitNonInteractive = Boolean(opts.nonInteractive);
      const nonInteractive = deps.shouldRunSetupNonInteractive(interactiveAllowed, explicitNonInteractive);

      const defaults = {
        relayUrl: deps.normalizeControllerRelayUrl(opts.relayUrl ?? config.relayUrl ?? deps.DEFAULT_CONTROLLER_RELAY_URL),
        strategy: deps.parseSetupStrategy(opts.strategy ?? config.setupStrategyDefault ?? 'auto'),
        repoPath: opts.repoPath as string | undefined,
      };

      const resolved = (!nonInteractive && !opts.yes)
        ? await deps.runSetupPromptTui(defaults)
        : defaults;

      if (!resolved) {
        console.log('[otto] setup cancelled');
        return;
      }

      const relayUrl = deps.normalizeControllerRelayUrl(resolved.relayUrl);
      const relayHttpUrl = deps.deriveHttpUrl(relayUrl);
      const timeoutMs = deps.parseMaybeNumber(opts.downloadTimeoutMs, config.downloadTimeoutMs ?? 25_000);
      const strategy = resolved.strategy;
      const relayDaemon = deps.ensureRelayDaemonReadyForSetup(relayUrl, deps.readRelayDaemonState, deps.startRelayDaemon);

      const cachedUnpackedPath = config.extension?.unpackedPath;
      const canReuseCachedInstall = deps.shouldReuseCachedInstall(config, cliVersion, Boolean(opts.force), existsSync);

      const install = canReuseCachedInstall
        ? {
            source: config.extension?.source ?? 'download',
            version: cliVersion,
            zipPath: config.extension?.zipPath,
            unpackedPath: cachedUnpackedPath as string,
            checksumSha256: config.extension?.checksumSha256,
            releaseBaseUrl: config.extension?.releaseBaseUrl,
          }
        : await deps.installExtensionArtifact({
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
      deps.saveConfig(nextConfig);

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
          ? ['Open extension popup to confirm node status', 'otto commands list', 'otto test reddit.com getFeed']
          : [
              'Open extension popup and confirm pairing code is visible',
              'otto authcode',
              'otto pair <code>',
              'Re-open extension popup and confirm status = Connected',
              'otto commands list',
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
      const config = deps.loadConfig();
      const cliVersion = program.version() ?? '0.1.0';
      const strategy = deps.parseSetupStrategy(opts.strategy);

      const install = await deps.installExtensionArtifact({
        strategy,
        version: cliVersion,
        outputDir: opts.outputDir,
        releaseBaseUrl: opts.releaseBaseUrl,
        timeoutMs: deps.parseMaybeNumber(opts.downloadTimeoutMs, config.downloadTimeoutMs ?? 25_000),
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
      deps.saveConfig(nextConfig);

      deps.logJsonAware(nextConfig, {
        ok: true,
        extension: nextConfig.extension,
      });
    });

  extension
    .command('info')
    .description('Show installed extension artifact metadata from local config')
    .action(() => {
      const config = deps.loadConfig();
      deps.logJsonAware(config, {
        extension: config.extension ?? null,
        relayUrl: config.relayUrl,
        relayHttpUrl: config.relayHttpUrl ?? deps.deriveHttpUrl(config.relayUrl),
      });
    });

  program
    .command('settings')
    .description('Edit controller-global settings stored in ~/.otto/config.json')
    .action(async () => {
      const config = deps.loadConfig();
      if (!process.stdout.isTTY || !process.stdin.isTTY) {
        console.log(JSON.stringify(config, null, 2));
        return;
      }

      const updated = await deps.runSettingsTui(config);
      deps.saveConfig(updated);
      console.log('[otto] settings saved');
    });
}
