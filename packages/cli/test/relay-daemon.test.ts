import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveRelayEntrypoint,
  createRelayLaunchSpec,
  restartRelayDaemon,
  startRelayDaemon,
  stopRelayDaemon,
} from '../src/relay-daemon.js';

test('resolveRelayEntrypoint returns override env when set', () => {
  const result = resolveRelayEntrypoint({
    env: { OTTO_RELAY_ENTRYPOINT: '/custom/relay.js' },
  });
  assert.equal(result, '/custom/relay.js');
});

test('resolveRelayEntrypoint resolves candidate module', () => {
  const result = resolveRelayEntrypoint({
    resolveModulePath: (specifier) => `/resolved/${specifier}`,
  });
  assert.equal(result, '/resolved/@telepat/otto-relay/dist/index.js');
});

test('resolveRelayEntrypoint throws when unable to resolve', () => {
  assert.throws(() => resolveRelayEntrypoint({
    resolveModulePath: () => { throw new Error('not found'); },
  }), /Unable to resolve relay runtime entrypoint/);
});

test('createRelayLaunchSpec returns correct spec', () => {
  const spec = createRelayLaunchSpec(8787, {
    env: { PATH: '/usr/bin' },
    resolveModulePath: (specifier) => `/resolved/${specifier}`,
  });
  assert.equal(spec.command, process.execPath);
  assert.deepEqual(spec.args, ['/resolved/@telepat/otto-relay/dist/index.js']);
  assert.equal(spec.env.OTTO_RELAY_PORT, '8787');
  assert.equal(spec.env.PATH, '/usr/bin');
});

test('restartRelayDaemon stops the existing daemon and starts a new instance', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'otto-restart-test-'));
  const dummyRelay = join(tempDir, 'relay.js');
  writeFileSync(dummyRelay, 'setInterval(() => {}, 1000);\n');

  const originalEntrypoint = process.env.OTTO_RELAY_ENTRYPOINT;
  const originalRuntimeDir = process.env.OTTO_RUNTIME_DIR;
  process.env.OTTO_RELAY_ENTRYPOINT = dummyRelay;
  process.env.OTTO_RUNTIME_DIR = join(tempDir, 'runtime');

  function isRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  try {
    const firstState = startRelayDaemon(8901);
    assert.equal(firstState.port, 8901);
    assert.ok(isRunning(firstState.pid));

    const secondState = await restartRelayDaemon(8901);
    assert.equal(secondState.port, 8901);
    assert.notEqual(secondState.pid, firstState.pid);
    assert.ok(!isRunning(firstState.pid));
    assert.ok(isRunning(secondState.pid));

    const stopResult = await stopRelayDaemon();
    assert.equal(stopResult.stopped, true);
    assert.ok(stopResult.state);
    assert.equal(stopResult.state?.pid, secondState.pid);
  } finally {
    process.env.OTTO_RELAY_ENTRYPOINT = originalEntrypoint;
    process.env.OTTO_RUNTIME_DIR = originalRuntimeDir;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('restartRelayDaemon starts a daemon on requested port when none is running', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'otto-restart-test-'));
  const dummyRelay = join(tempDir, 'relay.js');
  writeFileSync(dummyRelay, 'setInterval(() => {}, 1000);\n');

  const originalEntrypoint = process.env.OTTO_RELAY_ENTRYPOINT;
  const originalRuntimeDir = process.env.OTTO_RUNTIME_DIR;
  process.env.OTTO_RELAY_ENTRYPOINT = dummyRelay;
  process.env.OTTO_RUNTIME_DIR = join(tempDir, 'runtime');

  try {
    const state = await restartRelayDaemon(8902);
    assert.equal(state.port, 8902);
    assert.ok(state.pid > 0);

    const stopResult = await stopRelayDaemon();
    assert.equal(stopResult.stopped, true);
    assert.ok(stopResult.state);
    assert.equal(stopResult.state?.pid, state.pid);
  } finally {
    process.env.OTTO_RELAY_ENTRYPOINT = originalEntrypoint;
    process.env.OTTO_RUNTIME_DIR = originalRuntimeDir;
    rmSync(tempDir, { recursive: true, force: true });
  }
});


