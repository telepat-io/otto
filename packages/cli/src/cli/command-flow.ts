import { nanoid } from 'nanoid';
import WebSocket from 'ws';
import { createEnvelope, type Envelope } from '@telepat/otto-protocol';
import type { OttoConfig } from '../config.js';
import type { LogEntry, LogSource } from '../logs-options.js';

type CommandDescriptorLike = {
  site?: string;
  id?: string;
  preloadHost?: string;
  requiresKeepAlive?: boolean;
};

export type CommandTestInfo = {
  openUrl: string;
  keepAlive: boolean;
};

export async function runCommandOnce(
  config: OttoConfig,
  targetNodeId: string,
  opts: { action: string; tabSession?: string; payload: Record<string, unknown>; timeoutMs?: number },
  openControllerSocket: (config: OttoConfig) => Promise<WebSocket>,
  runCommandWithSocket: (
    ws: WebSocket,
    targetNodeId: string,
    opts: { action: string; tabSession?: string; payload: Record<string, unknown>; timeoutMs?: number },
  ) => Promise<Envelope>,
): Promise<Envelope> {
  const ws = await openControllerSocket(config);
  try {
    return await runCommandWithSocket(ws, targetNodeId, opts);
  } finally {
    ws.close();
  }
}

export async function resolveTestInfo(params: {
  config: OttoConfig;
  targetNodeId: string;
  site: string;
  command: string;
  timeoutMs: number;
  ws?: WebSocket;
  runCommandWithSocket: (
    ws: WebSocket,
    targetNodeId: string,
    opts: { action: string; payload: Record<string, unknown>; timeoutMs?: number },
  ) => Promise<Envelope>;
  runCommandOnce: (
    config: OttoConfig,
    targetNodeId: string,
    opts: { action: string; payload: Record<string, unknown>; timeoutMs?: number },
  ) => Promise<Envelope>;
  resolveCommandAutoOpenUrl: (site: string, command: string, descriptors: CommandDescriptorLike[]) => string;
}): Promise<CommandTestInfo> {
  const fallback = params.site.startsWith('http://') || params.site.startsWith('https://')
    ? params.site
    : `https://${params.site}`;

  try {
    const response = params.ws
      ? await params.runCommandWithSocket(params.ws, params.targetNodeId, {
        action: 'command.list',
        payload: {},
        timeoutMs: params.timeoutMs,
      })
      : await params.runCommandOnce(params.config, params.targetNodeId, {
        action: 'command.list',
        payload: {},
        timeoutMs: params.timeoutMs,
      });

    if (response.messageType === 'error') {
      return { openUrl: fallback, keepAlive: false };
    }

    const payload = response.payload as { data?: { commands?: CommandDescriptorLike[] } };
    const descriptors = payload.data?.commands ?? [];
    const normalizedSite = params.site.trim().toLowerCase();
    const normalizedCommand = params.command.trim();
    const matched = descriptors.find((descriptor) => {
      const descriptorSite = String(descriptor.site ?? '').trim().toLowerCase();
      const descriptorId = String(descriptor.id ?? '').trim();
      return descriptorSite === normalizedSite && descriptorId === normalizedCommand;
    });

    return {
      openUrl: params.resolveCommandAutoOpenUrl(params.site, params.command, descriptors),
      keepAlive: matched?.requiresKeepAlive === true,
    };
  } catch {
    return { openUrl: fallback, keepAlive: false };
  }
}

export async function followLogsOnce(params: {
  config: OttoConfig;
  source: LogSource | undefined;
  jsonOutput: boolean;
  openControllerSocket: (config: OttoConfig) => Promise<WebSocket>;
  startControllerHeartbeat: (ws: WebSocket) => () => void;
  formatLogEntryJson: (entry: LogEntry) => string;
  formatLogEntryHuman: (entry: LogEntry) => string;
}): Promise<void> {
  const ws = await params.openControllerSocket(params.config);
  const stopHeartbeat = params.startControllerHeartbeat(ws);
  const requestId = nanoid();
  console.error(`[otto:cli][debug] subscribing to logs stream source=${params.source ?? 'all'}`);
  ws.send(
    JSON.stringify(
      createEnvelope('event', 'controller', requestId, {
        type: 'logs_subscribe',
        source: params.source,
      }),
    ),
  );

  ws.on('message', (data) => {
    const msg = JSON.parse(String(data)) as Envelope;
    if (msg.messageType === 'event') {
      const payload = msg.payload as { type?: string; entry?: unknown };
      if (payload.type === 'log') {
        const entry = (payload.entry ?? {}) as LogEntry;
        const line = params.jsonOutput ? params.formatLogEntryJson(entry) : params.formatLogEntryHuman(entry);
        console.log(line);
      }
    }
  });

  ws.once('close', () => {
    stopHeartbeat();
  });

  console.log('[otto] following logs, press Ctrl+C to stop');
}
