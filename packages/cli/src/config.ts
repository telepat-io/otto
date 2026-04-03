import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const CONFIG_DIR = join(homedir(), '.otto');
export const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

export type OttoExtensionInstall = {
  version: string;
  source: 'download' | 'build';
  zipPath?: string;
  unpackedPath: string;
  checksumSha256?: string;
  installedAt: string;
  releaseBaseUrl?: string;
};

export type OttoConfig = {
  relayUrl: string;
  relayHttpUrl?: string;
  targetNodeId?: string;
  controllerAccessToken?: string;
  controllerRefreshToken?: string;
  outputFormat?: 'pretty' | 'json';
  setupStrategyDefault?: 'auto' | 'download' | 'build';
  setupNonInteractiveDefault?: boolean;
  strictVersionCheck?: boolean;
  downloadTimeoutMs?: number;
  extension?: OttoExtensionInstall;
};

export const DEFAULT_CONTROLLER_RELAY_URL = 'ws://127.0.0.1:8787?role=controller';

export function loadConfig(): OttoConfig {
  if (!existsSync(CONFIG_PATH)) {
    return { relayUrl: DEFAULT_CONTROLLER_RELAY_URL };
  }

  const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as unknown;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { relayUrl: DEFAULT_CONTROLLER_RELAY_URL };
  }

  return {
    ...(raw as OttoConfig),
    relayUrl: (raw as OttoConfig).relayUrl || DEFAULT_CONTROLLER_RELAY_URL,
  };
}

export function saveConfig(config: OttoConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function deriveHttpUrl(relayUrl: string): string {
  const parsed = new URL(relayUrl);
  parsed.search = '';
  parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
  return parsed.toString().replace(/\/$/, '');
}
