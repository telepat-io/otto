import type { OttoConfig } from '../config.js';

export type ControllerRegistrationMetadata = {
  name: string;
  description: string;
  avatarSeed?: string;
};

export function parseJsonObject(value: string, label: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

export function isJsonOutput(config: OttoConfig): boolean {
  return config.outputFormat === 'json';
}

export function logJsonAware(config: OttoConfig, value: unknown): void {
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

export function parseMaybeNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Value must be a positive number');
  }
  return parsed;
}

export function parsePositiveNumberOption(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
  return parsed;
}

export function parseNetworkMode(value: unknown): 'network' | 'fetch' | 'hybrid' {
  const mode = String(value ?? 'network').trim() as 'network' | 'fetch' | 'hybrid';
  if (!['network', 'fetch', 'hybrid'].includes(mode)) {
    throw new Error('--mode must be one of network|fetch|hybrid');
  }
  return mode;
}

export function collectString(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export function normalizeControllerName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 120);
}

export function normalizeControllerDescription(value: string): string {
  return value.trim().slice(0, 500);
}

export async function promptControllerMetadata(
  defaults: { name?: string; description?: string } = {},
): Promise<ControllerRegistrationMetadata> {
  const { createInterface } = await import('node:readline/promises');
  const { stdin: input, stdout: output } = await import('node:process');
  const rl = createInterface({ input, output });
  try {
    const nameAnswer = await rl.question(`Controller name${defaults.name ? ` [${defaults.name}]` : ''}: `);
    const descriptionAnswer = await rl.question(
      `Controller description${defaults.description ? ` [${defaults.description}]` : ''}: `,
    );

    const name = normalizeControllerName(nameAnswer || defaults.name || '');
    const description = normalizeControllerDescription(descriptionAnswer || defaults.description || '');
    if (!name || !description) {
      throw new Error('Controller registration requires both name and description.');
    }

    return { name, description };
  } finally {
    rl.close();
  }
}

export async function resolveControllerRegistrationMetadata(
  opts: {
    name?: string;
    description?: string;
    avatarSeed?: string;
  },
  defaults: { name?: string; description?: string } = {},
  options: { promptIfMissing?: boolean } = {},
): Promise<ControllerRegistrationMetadata> {
  const flagName = typeof opts.name === 'string' ? normalizeControllerName(opts.name) : '';
  const flagDescription = typeof opts.description === 'string' ? normalizeControllerDescription(opts.description) : '';
  const defaultName = normalizeControllerName(defaults.name ?? '');
  const defaultDescription = normalizeControllerDescription(defaults.description ?? '');
  const avatarSeed = typeof opts.avatarSeed === 'string' && opts.avatarSeed.trim().length > 0
    ? opts.avatarSeed.trim().slice(0, 64)
    : undefined;
  const promptIfMissing = options.promptIfMissing !== false;

  const resolvedName = flagName || defaultName;
  const resolvedDescription = flagDescription || defaultDescription;

  if (resolvedName && resolvedDescription && !promptIfMissing) {
    return {
      name: resolvedName,
      description: resolvedDescription,
      avatarSeed,
    };
  }

  if (flagName && flagDescription) {
    return { name: flagName, description: flagDescription, avatarSeed };
  }

  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    throw new Error('Non-interactive registration requires --name and --description.');
  }

  const prompted = await promptControllerMetadata({
    name: flagName || defaults.name,
    description: flagDescription || defaults.description,
  });
  return {
    ...prompted,
    avatarSeed,
  };
}

export function showAclMissingGrantHint(errorPayload: {
  code?: string;
  nodeId?: string;
  clientId?: string;
  actionableHint?: string;
}): void {
  if (errorPayload.code !== 'acl_missing_node_grant' && errorPayload.code !== 'forbidden_node_access') {
    return;
  }

  const nodeSuffix = errorPayload.nodeId ? ` for node ${errorPayload.nodeId}` : '';
  const clientSuffix = errorPayload.clientId ? ` (client ${errorPayload.clientId})` : '';
  console.error(`[otto] controller access is not granted${nodeSuffix}${clientSuffix}.`);
  console.error(
    `[otto] ${errorPayload.actionableHint ?? 'Approve this controller in extension popup/options -> Controller Access.'}`,
  );
}
