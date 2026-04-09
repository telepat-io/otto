import type { Command } from 'commander';
import type { OttoConfig } from '../config.js';

type ControllerRegisterResponse = {
  clientId: string;
  name: string;
  description: string;
  avatarSeed?: string;
  clientSecret: string;
  createdAt: number;
};

type ControllerTokenResponse = {
  clientId: string;
  controllerId: string;
  scopes: string[];
  accessToken: string;
  refreshToken: string;
};

type ControllerRemoveResponse = {
  ok: boolean;
  clientId: string;
  revokedAt: number;
  aclRevokedCount: number;
  refreshRevokedCount: number;
  disconnectedSessions: number;
  alreadyRevoked?: boolean;
};

type ControllerRemoveAllResponse = {
  ok: boolean;
  removedClientIds: string[];
  removedCount: number;
  alreadyRevokedCount: number;
  aclRevokedCount: number;
  refreshRevokedCount: number;
  disconnectedSessions: number;
};

export type RegisterIdentityCommandsDeps = {
  loadConfig: () => OttoConfig;
  saveConfig: (config: OttoConfig) => void;
  deriveHttpUrl: (relayUrl: string) => string;
  getRelayHttpBase: (config: OttoConfig) => string;
  isJsonOutput: (config: OttoConfig) => boolean;
  logJsonAware: (config: OttoConfig, value: unknown) => void;
  requestJson: (url: string, init?: RequestInit) => Promise<unknown>;
  resolveControllerRegistrationMetadata: (
    opts: { name?: string; description?: string; avatarSeed?: string },
    defaults: { name?: string; description?: string },
    promptOptions?: { promptIfMissing?: boolean },
  ) => Promise<{ name: string; description: string; avatarSeed?: string }>;
  storeClientSecret: (config: OttoConfig, clientId: string, clientSecret: string) => Promise<boolean>;
  resolveClientSecret: (
    config: OttoConfig,
    clientId: string,
  ) => Promise<{ secret: string; source: 'env' | 'keychain' }>;
  deleteClientSecret: (config: OttoConfig, clientId: string) => Promise<boolean>;
  CLIENT_SECRET_ENV_VAR: string;
};

export function registerIdentityCommands(program: Command, deps: RegisterIdentityCommandsDeps): void {
  const client = program.command('client').description('Manage independently registered controller clients');

  client
    .command('register')
    .description('Register a new controller client and store secret securely when keychain is available')
    .option('--name <name>', 'Human-readable controller name (required in non-interactive mode)')
    .option('--description <description>', 'Controller description (required in non-interactive mode)')
    .option('--avatar-seed <seed>', 'Optional deterministic avatar seed value')
    .action(async (opts) => {
      const config = deps.loadConfig();
      const base = deps.getRelayHttpBase(config);
      const payload = await deps.resolveControllerRegistrationMetadata(opts, {
        name: config.controllerName,
        description: config.controllerDescription,
      });

      const result = (await deps.requestJson(`${base}/api/controller/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })) as ControllerRegisterResponse;

      const storedInKeychain = await deps.storeClientSecret(config, result.clientId, result.clientSecret);

      deps.saveConfig({
        ...config,
        relayHttpUrl: base,
        controllerClientId: result.clientId,
        controllerName: result.name,
        controllerDescription: result.description,
      });

      if (deps.isJsonOutput(config)) {
        deps.logJsonAware(config, {
          clientId: result.clientId,
          name: result.name,
          description: result.description,
          createdAt: result.createdAt,
          secretStoredIn: storedInKeychain ? 'keychain' : 'env',
          clientSecret: storedInKeychain ? undefined : result.clientSecret,
        });
        return;
      }

      console.log(`[otto] registered client ${result.clientId} (${result.name})`);
      if (storedInKeychain) {
        console.log('[otto] client secret stored in OS keychain');
        return;
      }

      console.log('[otto] keychain unavailable, secret was not stored automatically');
      console.log(`[otto] export ${deps.CLIENT_SECRET_ENV_VAR}='${result.clientSecret}'`);
    });

  client
    .command('login')
    .description('Exchange controller client credentials for access/refresh tokens and save local auth')
    .option('--client-id <id>', 'Controller client id (defaults to configured client id)')
    .option('--client-secret <secret>', `Client secret (if omitted, resolve from ${deps.CLIENT_SECRET_ENV_VAR} or keychain)`)
    .option('--remember-secret', 'Store --client-secret in keychain when available', false)
    .action(async (opts) => {
      const config = deps.loadConfig();
      const base = deps.getRelayHttpBase(config);
      const clientId = String(opts.clientId ?? config.controllerClientId ?? '').trim();
      if (!clientId) {
        throw new Error('Missing client id. Pass --client-id or run otto client register first.');
      }

      let clientSecret: string;
      let secretSource: 'flag' | 'env' | 'keychain';
      if (typeof opts.clientSecret === 'string' && opts.clientSecret.trim().length > 0) {
        clientSecret = opts.clientSecret.trim();
        secretSource = 'flag';
      } else {
        const resolved = await deps.resolveClientSecret(config, clientId);
        clientSecret = resolved.secret;
        secretSource = resolved.source;
      }

      const result = (await deps.requestJson(`${base}/api/controller/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret }),
      })) as ControllerTokenResponse;

      if (opts.rememberSecret && secretSource === 'flag') {
        await deps.storeClientSecret(config, clientId, clientSecret);
      }

      deps.saveConfig({
        ...config,
        relayHttpUrl: base,
        controllerClientId: result.clientId,
        controllerAccessToken: result.accessToken,
        controllerRefreshToken: result.refreshToken,
        controllerName: config.controllerName,
        controllerDescription: config.controllerDescription,
      });

      deps.logJsonAware(config, {
        ok: true,
        clientId: result.clientId,
        controllerId: result.controllerId,
        scopes: result.scopes,
        secretSource,
      });
    });

  client
    .command('status')
    .description('Show local controller client state and secret resolution source')
    .option('--client-id <id>', 'Override client id to inspect')
    .action(async (opts) => {
      const config = deps.loadConfig();
      const clientId = String(opts.clientId ?? config.controllerClientId ?? '').trim();

      let secretSource: 'missing' | 'env' | 'keychain' = 'missing';
      if (clientId) {
        try {
          const resolved = await deps.resolveClientSecret(config, clientId);
          secretSource = resolved.source;
        } catch {
          secretSource = 'missing';
        }
      }

      deps.logJsonAware(config, {
        relayUrl: config.relayUrl,
        relayHttpUrl: deps.getRelayHttpBase(config),
        controllerClientId: clientId || null,
        controllerName: config.controllerName ?? null,
        controllerDescription: config.controllerDescription ?? null,
        hasAccessToken: Boolean(config.controllerAccessToken),
        hasRefreshToken: Boolean(config.controllerRefreshToken),
        secretSource,
      });
    });

  client
    .command('forget')
    .description('Delete stored client secret and clear local controller client auth state')
    .option('--client-id <id>', 'Override client id to forget')
    .action(async (opts) => {
      const config = deps.loadConfig();
      const clientId = String(opts.clientId ?? config.controllerClientId ?? '').trim();
      const keychainRemoved = clientId
        ? await deps.deleteClientSecret(config, clientId)
        : false;

      deps.saveConfig({
        ...config,
        controllerClientId: undefined,
        controllerName: undefined,
        controllerDescription: undefined,
        controllerAccessToken: undefined,
        controllerRefreshToken: undefined,
      });

      deps.logJsonAware(config, {
        ok: true,
        clientId: clientId || null,
        keychainRemoved,
        envVar: deps.CLIENT_SECRET_ENV_VAR,
      });
    });

  client
    .command('remove')
    .description('Remove a registered controller client at relay and cut access immediately')
    .option('--client-id <id>', 'Controller client id (defaults to configured client id)')
    .option('--all', 'Remove every registered controller client from relay', false)
    .action(async (opts) => {
      const config = deps.loadConfig();
      const base = deps.getRelayHttpBase(config);
      const removeAll = Boolean(opts.all);
      const explicitClientId = typeof opts.clientId === 'string' ? opts.clientId.trim() : '';
      const clientId = explicitClientId || String(config.controllerClientId ?? '').trim();
      if (removeAll && explicitClientId) {
        throw new Error('Do not combine --all with --client-id. Use one removal target.');
      }
      if (!removeAll && !clientId) {
        throw new Error('Missing client id. Pass --client-id or configure controllerClientId first.');
      }

      if (removeAll) {
        const result = (await deps.requestJson(`${base}/api/controller/remove-all`, {
          method: 'POST',
        })) as ControllerRemoveAllResponse;

        let keychainRemovedCount = 0;
        for (const removedClientId of result.removedClientIds) {
          if (await deps.deleteClientSecret(config, removedClientId)) {
            keychainRemovedCount += 1;
          }
        }

        const removedCurrentClient = Boolean(
          config.controllerClientId
          && result.removedClientIds.includes(config.controllerClientId),
        );
        const nextConfig: OttoConfig = removedCurrentClient
          ? {
              ...config,
              controllerClientId: undefined,
              controllerName: undefined,
              controllerDescription: undefined,
              controllerAccessToken: undefined,
              controllerRefreshToken: undefined,
            }
          : config;
        deps.saveConfig(nextConfig);

        deps.logJsonAware(config, {
          ...result,
          keychainRemovedCount,
          removedCurrentClient,
        });
        return;
      }

      const result = (await deps.requestJson(`${base}/api/controller/remove`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })) as ControllerRemoveResponse;

      const keychainRemoved = await deps.deleteClientSecret(config, clientId);
      const removedCurrentClient = config.controllerClientId === clientId;

      const nextConfig: OttoConfig = removedCurrentClient
        ? {
            ...config,
            controllerClientId: undefined,
            controllerName: undefined,
            controllerDescription: undefined,
            controllerAccessToken: undefined,
            controllerRefreshToken: undefined,
          }
        : config;

      deps.saveConfig(nextConfig);

      deps.logJsonAware(config, {
        ...result,
        keychainRemoved,
        removedCurrentClient,
      });
    });

  program
    .command('authcode')
    .description('List pending auth codes')
    .action(async () => {
      const config = deps.loadConfig();
      const base = config.relayHttpUrl ?? deps.deriveHttpUrl(config.relayUrl);
      const result = (await deps.requestJson(`${base}/api/pairing/pending`)) as { pending: unknown[] };
      console.log(JSON.stringify(result, null, 2));
    });

  program
    .command('pair')
    .description('Approve pairing code and store controller tokens')
    .argument('<code>', 'Pairing code like 123-456')
    .action(async (code: string) => {
      const config = deps.loadConfig();
      const base = config.relayHttpUrl ?? deps.deriveHttpUrl(config.relayUrl);
      const result = (await deps.requestJson(`${base}/api/pairing/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      })) as {
        nodeId: string;
        scopes: string[];
        controllerAccessToken: string;
        controllerRefreshToken: string;
      };

      deps.saveConfig({
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
      const config = deps.loadConfig();
      const base = config.relayHttpUrl ?? deps.deriveHttpUrl(config.relayUrl);

      if (config.controllerRefreshToken) {
        await deps.requestJson(`${base}/api/auth/revoke`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken: config.controllerRefreshToken }),
        });
      }

      deps.saveConfig({
        ...config,
        controllerAccessToken: undefined,
        controllerRefreshToken: undefined,
      });
      console.log('[otto] controller tokens cleared and refresh token revoked');
    });
}
