import type { OttoConfig } from './config.js';

export const CLIENT_SECRET_ENV_VAR = 'OTTO_CONTROLLER_CLIENT_SECRET';
const CLIENT_SECRET_SERVICE_NAME = 'otto.controller.client';

type KeytarApi = {
  getPassword: (service: string, account: string) => Promise<string | null>;
  setPassword: (service: string, account: string, password: string) => Promise<void>;
  deletePassword: (service: string, account: string) => Promise<boolean>;
};

export type SecretSource = 'env' | 'keychain';

export type ResolvedClientSecret = {
  secret: string;
  source: SecretSource;
};

function resolveRelayAccountNamespace(config: OttoConfig): string {
  const relayUrl = config.relayHttpUrl ?? config.relayUrl;
  try {
    const parsed = new URL(relayUrl);
    return parsed.host.toLowerCase();
  } catch {
    return relayUrl.toLowerCase();
  }
}

export function getClientSecretAccount(config: OttoConfig, clientId: string): string {
  return `${resolveRelayAccountNamespace(config)}:${clientId}`;
}

async function loadKeytar(): Promise<KeytarApi | null> {
  try {
    const mod = await import('keytar');
    return (mod.default ?? mod) as KeytarApi;
  } catch {
    return null;
  }
}

export async function resolveClientSecret(
  config: OttoConfig,
  clientId: string,
): Promise<ResolvedClientSecret> {
  const envSecret = process.env[CLIENT_SECRET_ENV_VAR];
  if (typeof envSecret === 'string' && envSecret.trim().length > 0) {
    return {
      secret: envSecret.trim(),
      source: 'env',
    };
  }

  const keytar = await loadKeytar();
  if (!keytar) {
    throw new Error(
      `Client secret not found in environment and keychain is unavailable. Set ${CLIENT_SECRET_ENV_VAR} or pass --client-secret to otto client login.`,
    );
  }

  const account = getClientSecretAccount(config, clientId);
  const secret = await keytar.getPassword(CLIENT_SECRET_SERVICE_NAME, account);
  if (!secret) {
    throw new Error(
      `No stored secret found for client ${clientId}. Set ${CLIENT_SECRET_ENV_VAR} or run otto client login --client-secret <secret>.`,
    );
  }

  return {
    secret,
    source: 'keychain',
  };
}

export async function storeClientSecret(config: OttoConfig, clientId: string, clientSecret: string): Promise<boolean> {
  const keytar = await loadKeytar();
  if (!keytar) {
    return false;
  }

  const account = getClientSecretAccount(config, clientId);
  await keytar.setPassword(CLIENT_SECRET_SERVICE_NAME, account, clientSecret);
  return true;
}

export async function deleteClientSecret(config: OttoConfig, clientId: string): Promise<boolean> {
  const keytar = await loadKeytar();
  if (!keytar) {
    return false;
  }

  const account = getClientSecretAccount(config, clientId);
  return keytar.deletePassword(CLIENT_SECRET_SERVICE_NAME, account);
}
