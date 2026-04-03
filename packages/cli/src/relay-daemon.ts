import { spawn, type ChildProcess } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR } from './config.js';

export type RelayDaemonState = {
  pid: number;
  port: number;
  logPath: string;
  startedAt: string;
};

const RUNTIME_DIR = join(CONFIG_DIR, 'runtime');
const RELAY_STATE_PATH = join(RUNTIME_DIR, 'relay-daemon.json');

function ensureRuntimeDir(): void {
  if (!existsSync(RUNTIME_DIR)) {
    mkdirSync(RUNTIME_DIR, { recursive: true });
  }
}

function relayLogPath(port: number): string {
  return join(RUNTIME_DIR, `relay-${port}.log`);
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
  if (!existsSync(RELAY_STATE_PATH)) {
    return null;
  }

  const parsed = JSON.parse(readFileSync(RELAY_STATE_PATH, 'utf8')) as unknown;
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
  writeFileSync(RELAY_STATE_PATH, JSON.stringify(state, null, 2));
}

function clearRelayState(): void {
  rmSync(RELAY_STATE_PATH, { force: true });
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
  return spawn('npm', ['--workspace', '@telepat/otto-relay', 'run', 'dev'], {
    stdio: 'inherit',
    env: { ...process.env, OTTO_RELAY_PORT: String(port) },
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
    const child = spawn('npm', ['--workspace', '@telepat/otto-relay', 'run', 'dev'], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      env: { ...process.env, OTTO_RELAY_PORT: String(port) },
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
