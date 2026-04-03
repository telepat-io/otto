import { type OttoConfig } from './config.js';
import { type RelayDaemonState } from './relay-daemon.js';

export type SetupRelayDaemonResult = {
  status: 'started' | 'already_running';
  state: RelayDaemonState;
};

export function shouldRunSetupNonInteractive(interactiveAllowed: boolean, explicitNonInteractive: boolean): boolean {
  return explicitNonInteractive || !interactiveAllowed;
}

export function deriveRelayPortFromUrl(relayUrl: string): number {
  const parsed = new URL(relayUrl);
  if (parsed.port) {
    return Number(parsed.port);
  }
  return parsed.protocol === 'wss:' ? 443 : 80;
}

export function ensureRelayDaemonReadyForSetup(
  relayUrl: string,
  readState: () => RelayDaemonState | null,
  startDaemon: (port: number) => RelayDaemonState,
): SetupRelayDaemonResult {
  const desiredPort = deriveRelayPortFromUrl(relayUrl);
  const existing = readState();

  if (existing) {
    if (existing.port !== desiredPort) {
      throw new Error(
        `[otto] relay daemon already running on port ${existing.port}, but setup relay URL uses port ${desiredPort}. Stop it with \`otto stop\` and rerun setup.`,
      );
    }
    return {
      status: 'already_running',
      state: existing,
    };
  }

  return {
    status: 'started',
    state: startDaemon(desiredPort),
  };
}

export function shouldReuseCachedInstall(
  config: OttoConfig,
  cliVersion: string,
  force: boolean,
  existsFn: (path: string) => boolean,
): boolean {
  if (force) {
    return false;
  }

  const unpackedPath = config.extension?.unpackedPath;
  if (config.extension?.version !== cliVersion) {
    return false;
  }

  if (typeof unpackedPath !== 'string' || unpackedPath.length === 0) {
    return false;
  }

  // Force one-time migration away from legacy hidden local build artifacts.
  if (config.extension?.source === 'build' && /[\\/]extension[\\/]\.output[\\/]chrome-mv3$/.test(unpackedPath)) {
    return false;
  }

  return existsFn(unpackedPath);
}
