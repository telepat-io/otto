import { spawn, type ChildProcess } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { CONFIG_DIR } from './config.js';

export type RelayDaemonState = {
  pid: number;
  port: number;
  logPath: string;
  startedAt: string;
};

const RELAY_ENTRYPOINT_OVERRIDE_ENV = 'OTTO_RELAY_ENTRYPOINT';
const RELAY_RUNTIME_DIR_ENV = 'OTTO_RUNTIME_DIR';

type ResolveModulePath = (specifier: string) => string;

function getRuntimeDir(): string {
  return process.env[RELAY_RUNTIME_DIR_ENV] ?? join(CONFIG_DIR, 'runtime');
}

function getRelayStatePath(): string {
  return join(getRuntimeDir(), 'relay-daemon.json');
}

const require = createRequire(import.meta.url);

function defaultResolveModulePath(specifier: string): string {
  return require.resolve(specifier);
}

function normalizeRelayEntrypoint(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed;
}

export function resolveRelayEntrypoint(options: {
  env?: NodeJS.ProcessEnv;
  resolveModulePath?: ResolveModulePath;
} = {}): string {
  const env = options.env ?? process.env;
  const resolveModulePath = options.resolveModulePath ?? defaultResolveModulePath;

  const override = normalizeRelayEntrypoint(env[RELAY_ENTRYPOINT_OVERRIDE_ENV]);
  if (override) {
    return override;
  }

  const candidates = [
    '@telepat/otto-relay/dist/index.js',
  ];

  for (const candidate of candidates) {
    try {
      return resolveModulePath(candidate);
    } catch {
      continue;
    }
  }

  throw new Error(
    'Unable to resolve relay runtime entrypoint. Reinstall @telepat/otto or set OTTO_RELAY_ENTRYPOINT to a valid relay dist/index.js path.',
  );
}

export function createRelayLaunchSpec(port: number, options: {
  env?: NodeJS.ProcessEnv;
  resolveModulePath?: ResolveModulePath;
} = {}): { command: string; args: string[]; env: NodeJS.ProcessEnv } {
  const env = options.env ?? process.env;
  const relayEntrypoint = resolveRelayEntrypoint({
    env,
    resolveModulePath: options.resolveModulePath,
  });

  return {
    command: process.execPath,
    args: [relayEntrypoint],
    env: {
      ...env,
      OTTO_RELAY_PORT: String(port),
    },
  };
}

function ensureRuntimeDir(): void {
  const runtimeDir = getRuntimeDir();
  if (!existsSync(runtimeDir)) {
    mkdirSync(runtimeDir, { recursive: true });
  }
}

function relayLogPath(port: number): string {
  return join(getRuntimeDir(), `relay-${port}.log`);
}

function isProcessRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'ESRCH') {
      return false;
    }
    if (code === 'EPERM') {
      return true;
    }
    throw error;
  }
}

function readRelayState(): RelayDaemonState | null {
  const statePath = getRelayStatePath();
  if (!existsSync(statePath)) {
    return null;
  }

  const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  const state = parsed as Partial<RelayDaemonState>;
  const pid = state.pid;
  const port = state.port;
  const logPath = state.logPath;
  const startedAt = state.startedAt;

  if (typeof pid !== 'number' || !Number.isInteger(pid)) {
    return null;
  }
  if (typeof port !== 'number' || !Number.isInteger(port)) {
    return null;
  }
  if (typeof logPath !== 'string' || logPath.length === 0) {
    return null;
  }
  if (typeof startedAt !== 'string' || startedAt.length === 0) {
    return null;
  }

  return {
    pid,
    port,
    logPath,
    startedAt,
  };
}

function writeRelayState(state: RelayDaemonState): void {
  ensureRuntimeDir();
  writeFileSync(getRelayStatePath(), JSON.stringify(state, null, 2));
}

function clearRelayState(): void {
  rmSync(getRelayStatePath(), { force: true });
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isProcessRunning(pid)) {
      return true;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  return !isProcessRunning(pid);
}

function signalRelayProcess(pid: number, signal: NodeJS.Signals): void {
  if (process.platform !== 'win32') {
    try {
      // Detached relay runs in its own process group, so signal the group.
      process.kill(-pid, signal);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code !== 'ESRCH') {
        throw error;
      }
    }
  }

  process.kill(pid, signal);
}

export function readRelayDaemonState(): RelayDaemonState | null {
  const state = readRelayState();
  if (!state) {
    return null;
  }
  if (!isProcessRunning(state.pid)) {
    clearRelayState();
    return null;
  }
  return state;
}

export function startRelayAttached(port: number): ChildProcess {
  const launch = createRelayLaunchSpec(port);
  return spawn(launch.command, launch.args, {
    stdio: 'inherit',
    env: launch.env,
  });
}

export function startRelayDaemon(port: number): RelayDaemonState {
  const existing = readRelayDaemonState();
  if (existing) {
    return existing;
  }

  ensureRuntimeDir();
  const logPath = relayLogPath(port);
  const logFd = openSync(logPath, 'a');
  try {
    const launch = createRelayLaunchSpec(port);
    const child = spawn(launch.command, launch.args, {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: launch.env,
    });
    child.unref();

    if (!child.pid) {
      throw new Error('Failed to start relay daemon: child process has no pid');
    }

    const state: RelayDaemonState = {
      pid: child.pid,
      port,
      logPath,
      startedAt: new Date().toISOString(),
    };
    writeRelayState(state);
    return state;
  } finally {
    closeSync(logFd);
  }
}

export async function restartRelayDaemon(port?: number): Promise<RelayDaemonState> {
  const existing = readRelayDaemonState();
  const restartPort = port ?? existing?.port ?? 8787;

  if (existing) {
    const result = await stopRelayDaemon();
    if (!result.stopped && result.state) {
      throw new Error(`Failed to stop existing relay daemon (pid ${result.state.pid})`);
    }
  }

  return startRelayDaemon(restartPort);
}

export async function stopRelayDaemon(): Promise<{ stopped: boolean; state: RelayDaemonState | null }> {
  const state = readRelayDaemonState();
  if (!state) {
    clearRelayState();
    return { stopped: false, state: null };
  }

  signalRelayProcess(state.pid, 'SIGTERM');
  const exited = await waitForExit(state.pid, 4000);
  if (!exited) {
    signalRelayProcess(state.pid, 'SIGKILL');
    await waitForExit(state.pid, 1000);
  }

  clearRelayState();
  return { stopped: true, state };
}
