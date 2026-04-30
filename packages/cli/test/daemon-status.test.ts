import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRelayStatusReport, renderRelayStatusPretty } from '../src/daemon-status.js';

test('buildRelayStatusReport returns not running when state is null', () => {
  const report = buildRelayStatusReport(null);
  assert.equal(report.running, false);
  assert.equal(report.suggestedCommand, 'otto start');
});

test('buildRelayStatusReport returns running when state exists', () => {
  const report = buildRelayStatusReport({ pid: 123, port: 8787, logPath: '/tmp', startedAt: 'now' } as import('../src/relay-daemon.js').RelayDaemonState);
  assert.equal(report.running, true);
  assert.equal(report.logsFollowCommand, 'otto logs follow');
});

test('renderRelayStatusPretty shows not running', () => {
  const pretty = renderRelayStatusPretty(buildRelayStatusReport(null));
  assert.ok(pretty.includes('not running'));
});

test('renderRelayStatusPretty shows running with logsFollowCommand fallback', () => {
  const pretty = renderRelayStatusPretty({
    running: true,
    daemon: { pid: 123, port: 8787, logPath: '/tmp', startedAt: 'now' } as import('../src/relay-daemon.js').RelayDaemonState,
    suggestedCommand: null,
    logsFollowCommand: null,
  });
  assert.ok(pretty.includes('otto logs follow'));
});
