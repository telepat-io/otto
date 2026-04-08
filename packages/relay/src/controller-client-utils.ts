import { createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export type ControllerClientRecord = {
  clientId: string;
  name: string;
  description: string;
  normalizedName: string;
  avatarSeed: string;
  secretSalt: string;
  secretHash: string;
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
};

export type RawControllerClientRecord = {
  clientId: string;
  name?: string;
  description?: string;
  normalizedName?: string;
  avatarSeed?: string;
  label?: string;
  secretSalt: string;
  secretHash: string;
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
};

export function normalizeControllerNameInput(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizedControllerNameKey(value: string): string {
  return normalizeControllerNameInput(value).normalize('NFKC').toLowerCase();
}

export function deriveAvatarSeed(name: string): string {
  return createHash('sha256').update(normalizedControllerNameKey(name)).digest('hex').slice(0, 16);
}

export function findControllerByNormalizedName(
  clients: Map<string, ControllerClientRecord>,
  normalizedName: string,
): ControllerClientRecord | undefined {
  for (const record of clients.values()) {
    if (record.normalizedName !== normalizedName) {
      continue;
    }

    if (typeof record.revokedAt === 'number') {
      continue;
    }

    return record;
  }

  return undefined;
}

export function materializeControllerRecord(raw: RawControllerClientRecord): ControllerClientRecord | null {
  const fallbackName = typeof raw.label === 'string' && raw.label.trim().length > 0
    ? raw.label
    : undefined;
  const resolvedName = normalizeControllerNameInput(String(raw.name ?? fallbackName ?? ''));
  if (!resolvedName) {
    return null;
  }

  const normalizedName = raw.normalizedName && raw.normalizedName.trim().length > 0
    ? raw.normalizedName.trim()
    : normalizedControllerNameKey(resolvedName);
  const description = typeof raw.description === 'string' && raw.description.trim().length > 0
    ? raw.description.trim()
    : 'No description provided.';
  const avatarSeed = typeof raw.avatarSeed === 'string' && raw.avatarSeed.trim().length > 0
    ? raw.avatarSeed.trim().slice(0, 64)
    : deriveAvatarSeed(resolvedName);

  return {
    clientId: raw.clientId,
    name: resolvedName,
    description,
    normalizedName,
    avatarSeed,
    secretSalt: raw.secretSalt,
    secretHash: raw.secretHash,
    createdAt: raw.createdAt,
    lastUsedAt: raw.lastUsedAt,
    revokedAt: raw.revokedAt,
  };
}

export function hashClientSecret(secret: string, salt: string): string {
  return scryptSync(secret, salt, 32).toString('base64');
}

export function verifyClientSecret(secret: string, record: ControllerClientRecord): boolean {
  const expected = Buffer.from(record.secretHash, 'base64');
  const actual = Buffer.from(hashClientSecret(secret, record.secretSalt), 'base64');
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) {
    return false;
  }
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

export function canRegisterControllerClient(
  req: IncomingMessage,
  options: {
    allowRemoteControllerRegistration: boolean;
    controllerRegistrationSecret?: string;
  },
): boolean {
  if (!options.allowRemoteControllerRegistration && !isLoopbackAddress(req.socket.remoteAddress)) {
    return false;
  }

  if (!options.controllerRegistrationSecret) {
    return true;
  }

  return req.headers['x-otto-registration-secret'] === options.controllerRegistrationSecret;
}