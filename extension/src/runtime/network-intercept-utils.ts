import type { NetworkInterceptMode } from '@telepat/otto-protocol';

const DEFAULT_MAX_BODY_BYTES = 256_000;
const MAX_MAX_BODY_BYTES = 2_000_000;
const DEFAULT_MIME_TYPES = [
  'application/json',
  'text/plain',
  'text/html',
  'text/css',
  'application/javascript',
  'text/javascript',
  'application/xml',
  'text/xml',
] as const;

export function normalizeSite(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizePatterns(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);

  return Array.from(new Set(normalized));
}

export function normalizeHostAllowlist(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
    .filter((entry) => entry.length > 0);

  return Array.from(new Set(normalized));
}

export function normalizeMimeTypes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_MIME_TYPES];
  }

  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
    .filter((entry) => entry.length > 0);

  return normalized.length > 0 ? Array.from(new Set(normalized)) : [...DEFAULT_MIME_TYPES];
}

export function normalizeBodyLimit(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_MAX_BODY_BYTES;
  }
  return Math.max(1_024, Math.min(MAX_MAX_BODY_BYTES, Math.floor(value)));
}

export function headerArrayToRecord(headers: Array<{ name?: string; value?: string }> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) {
    return out;
  }

  for (const header of headers) {
    const key = typeof header.name === 'string' ? header.name : '';
    if (!key) {
      continue;
    }
    out[key] = typeof header.value === 'string' ? header.value : '';
  }

  return out;
}

export function getHeaderValue(headers: Record<string, string>, key: string): string | undefined {
  const lowered = key.toLowerCase();
  for (const [headerName, value] of Object.entries(headers)) {
    if (headerName.toLowerCase() === lowered) {
      return value;
    }
  }
  return undefined;
}

export function redactHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (/^(authorization|cookie|set-cookie|proxy-authorization)$/i.test(key)) {
      out[key] = '<redacted>';
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function matchesAnyPattern(url: string, patterns: string[]): boolean {
  if (patterns.length === 0) {
    return true;
  }

  for (const pattern of patterns) {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    const regex = new RegExp(`^${escaped}$`, 'i');
    if (regex.test(url)) {
      return true;
    }
  }

  return false;
}

function approximateBodyBytes(body: string, base64Encoded: boolean): number {
  if (base64Encoded) {
    return Math.floor((body.length * 3) / 4);
  }
  return new TextEncoder().encode(body).byteLength;
}

export function clampBody(body: string, base64Encoded: boolean, maxBodyBytes: number): { body: string; truncated: boolean; bodyBytes: number } {
  const bodyBytes = approximateBodyBytes(body, base64Encoded);
  if (bodyBytes <= maxBodyBytes) {
    return { body, truncated: false, bodyBytes };
  }

  if (base64Encoded) {
    const charsLimit = Math.max(8, Math.floor((maxBodyBytes / 3) * 4));
    return {
      body: body.slice(0, charsLimit),
      truncated: true,
      bodyBytes,
    };
  }

  const bytes = new TextEncoder().encode(body);
  const limited = bytes.slice(0, maxBodyBytes);
  return {
    body: new TextDecoder().decode(limited),
    truncated: true,
    bodyBytes,
  };
}

export function shouldCaptureMimeType(mimeType: string | undefined, allowed: string[]): boolean {
  if (!mimeType) {
    return false;
  }

  const normalized = mimeType.toLowerCase();
  return allowed.some((value) => normalized.startsWith(value));
}

export function matchesRequestHostAllowlist(url: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) {
    return false;
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }

  return allowlist.some((allowedHost) => {
    return hostname === allowedHost || hostname.endsWith(`.${allowedHost}`);
  });
}

export function normalizeMode(value: unknown): NetworkInterceptMode {
  if (value === 'fetch' || value === 'hybrid' || value === 'network') {
    return value;
  }
  return 'network';
}