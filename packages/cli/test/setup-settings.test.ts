import assert from 'node:assert/strict';
import test from 'node:test';
import { parseChecksum } from '../src/extension-manager.js';
import { buildRelayStatusReport, renderRelayStatusPretty } from '../src/daemon-status.js';
import { ensureRelayDaemonReadyForSetup, shouldReuseCachedInstall, shouldRunSetupNonInteractive } from '../src/setup-logic.js';
import { resolveSettingsResult, settingsEscapeAction } from '../src/settings-logic.js';
import { type OttoConfig } from '../src/config.js';
import { type RelayDaemonState } from '../src/relay-daemon.js';

test('shouldReuseCachedInstall honors version, force, and path existence', () => {
  const baseConfig: OttoConfig = {
    relayUrl: 'ws://127.0.0.1:8787?role=controller',
    extension: {
      version: '0.1.0',
      source: 'download',
      unpackedPath: '/tmp/otto/chrome-mv3',
      installedAt: '2026-04-03T00:00:00.000Z',
    },
  };

  assert.equal(
    shouldReuseCachedInstall(baseConfig, '0.1.0', false, (path) => path === '/tmp/otto/chrome-mv3'),
    true,
  );

  assert.equal(
    shouldReuseCachedInstall(baseConfig, '0.1.0', true, () => true),
    false,
  );

  assert.equal(
    shouldReuseCachedInstall(baseConfig, '0.2.0', false, () => true),
    false,
  );

  assert.equal(
    shouldReuseCachedInstall(baseConfig, '0.1.0', false, () => false),
    false,
  );

  const legacyBuildConfig: OttoConfig = {
    relayUrl: 'ws://127.0.0.1:8787?role=controller',
    extension: {
      version: '0.1.0',
      source: 'build',
      unpackedPath: '/Users/user/projects/Telepat/otto/extension/.output/chrome-mv3',
      installedAt: '2026-04-03T00:00:00.000Z',
    },
  };

  assert.equal(
    shouldReuseCachedInstall(legacyBuildConfig, '0.1.0', false, () => true),
    false,
  );
});

test('parseChecksum supports common sha256 file formats', () => {
  const hex = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  assert.equal(parseChecksum(`${hex}  otto-extension-0.1.0-chrome-mv3.zip`), hex);
  assert.equal(parseChecksum(`SHA256(otto-extension-0.1.0-chrome-mv3.zip)= ${hex.toUpperCase()}`), hex);

  assert.throws(() => parseChecksum(''), /empty/i);
  assert.throws(() => parseChecksum('not-a-checksum-file'), /valid sha256/i);
});

test('settings Esc behavior and save semantics are deterministic', () => {
  assert.equal(settingsEscapeAction(null), 'exit');
  assert.equal(settingsEscapeAction(2), 'cancel-edit');

  const initial: OttoConfig = {
    relayUrl: 'ws://127.0.0.1:8787?role=controller',
    outputFormat: 'pretty',
  };

  const candidate: OttoConfig = {
    ...initial,
    outputFormat: 'json',
  };

  assert.deepEqual(resolveSettingsResult(initial, candidate, false), initial);
  assert.deepEqual(resolveSettingsResult(initial, candidate, true), candidate);
});

test('relay status report suggests start command when daemon is not running', () => {
  const report = buildRelayStatusReport(null);
  const pretty = renderRelayStatusPretty(report);

  assert.equal(report.running, false);
  assert.equal(report.suggestedCommand, 'otto start');
  assert.match(pretty, /not running/i);
  assert.match(pretty, /otto start/);
});

test('relay status report includes runtime details when daemon is running', () => {
  const report = buildRelayStatusReport({
    pid: 4242,
    port: 8787,
    logPath: '/tmp/otto-relay.log',
    startedAt: '2026-04-03T00:00:00.000Z',
  });
  const pretty = renderRelayStatusPretty(report);

  assert.equal(report.running, true);
  assert.equal(report.logsFollowCommand, 'otto logs follow');
  assert.match(pretty, /running/i);
  assert.match(pretty, /4242/);
  assert.match(pretty, /8787/);
  assert.match(pretty, /otto logs follow/);
});

test('setup non-interactive mode depends on explicit flag and tty availability', () => {
  assert.equal(shouldRunSetupNonInteractive(true, false), false);
  assert.equal(shouldRunSetupNonInteractive(true, true), true);
  assert.equal(shouldRunSetupNonInteractive(false, false), true);
});

test('setup starts relay daemon when not already running', () => {
  let startedPort: number | null = null;

  const result = ensureRelayDaemonReadyForSetup(
    'ws://127.0.0.1:8787/?role=controller',
    () => null,
    (port) => {
      startedPort = port;
      return {
        pid: 5001,
        port,
        logPath: '/tmp/relay.log',
        startedAt: '2026-04-03T00:00:00.000Z',
      };
    },
  );

  assert.equal(startedPort, 8787);
  assert.equal(result.status, 'started');
  assert.equal(result.state.pid, 5001);
});

test('setup reuses running relay daemon when ports match', () => {
  const existing: RelayDaemonState = {
    pid: 6002,
    port: 8787,
    logPath: '/tmp/existing.log',
    startedAt: '2026-04-03T00:00:00.000Z',
  };

  const result = ensureRelayDaemonReadyForSetup(
    'ws://127.0.0.1:8787/?role=controller',
    () => existing,
    () => {
      throw new Error('start should not be called when daemon already running on target port');
    },
  );

  assert.equal(result.status, 'already_running');
  assert.deepEqual(result.state, existing);
});

test('setup fails when running relay daemon port conflicts with setup relay url', () => {
  const existing: RelayDaemonState = {
    pid: 7003,
    port: 8787,
    logPath: '/tmp/existing.log',
    startedAt: '2026-04-03T00:00:00.000Z',
  };

  assert.throws(
    () =>
      ensureRelayDaemonReadyForSetup(
        'ws://127.0.0.1:8899/?role=controller',
        () => existing,
        () => {
          throw new Error('should not start daemon on conflict');
        },
      ),
    /already running on port 8787/i,
  );
});
