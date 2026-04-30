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
  controllerClientId?: string;
  controllerName?: string;
  controllerDescription?: string;
  controllerAccessToken?: string;
  controllerRefreshToken?: string;
  outputFormat?: 'pretty' | 'json';
  setupNonInteractiveDefault?: boolean;
  downloadTimeoutMs?: number;
  extension?: OttoExtensionInstall;
};

export const DEFAULT_CONTROLLER_RELAY_URL = 'ws://127.0.0.1:8787?role=controller';

export function loadConfig(configPath = CONFIG_PATH): OttoConfig {
  if (!existsSync(configPath)) {
    return { relayUrl: DEFAULT_CONTROLLER_RELAY_URL };
  }

  const raw = JSON.parse(readFileSync(configPath, 'utf8')) as unknown;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { relayUrl: DEFAULT_CONTROLLER_RELAY_URL };
  }

  return {
    ...(raw as OttoConfig),
    relayUrl: (raw as OttoConfig).relayUrl || DEFAULT_CONTROLLER_RELAY_URL,
  };
}

export function saveConfig(config: OttoConfig, configPath = CONFIG_PATH, configDir = CONFIG_DIR): void {
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function deriveHttpUrl(relayUrl: string): string {
  const parsed = new URL(relayUrl);
  parsed.search = '';
  parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
  return parsed.toString().replace(/\/$/, '');
}
