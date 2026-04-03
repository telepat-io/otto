import { type RelayDaemonState } from './relay-daemon.js';

export type RelayStatusReport = {
  running: boolean;
  daemon: RelayDaemonState | null;
  suggestedCommand: string | null;
  logsFollowCommand: string | null;
};

export function buildRelayStatusReport(state: RelayDaemonState | null): RelayStatusReport {
  if (!state) {
    return {
      running: false,
      daemon: null,
      suggestedCommand: 'otto start',
      logsFollowCommand: null,
    };
  }

  return {
    running: true,
    daemon: state,
    suggestedCommand: null,
    logsFollowCommand: 'otto logs follow',
  };
}

export function renderRelayStatusPretty(report: RelayStatusReport): string {
  if (!report.running || !report.daemon) {
    return '[otto] relay daemon is not running\n[otto] start it with: otto start';
  }

  return [
    `[otto] relay daemon running (pid ${report.daemon.pid})`,
    `[otto] port: ${report.daemon.port}`,
    `[otto] logs: ${report.daemon.logPath}`,
    `[otto] started: ${report.daemon.startedAt}`,
    `[otto] follow logs: ${report.logsFollowCommand ?? 'otto logs follow'}`,
  ].join('\n');
}