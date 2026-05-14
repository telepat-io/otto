import { existsSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Envelope, NetworkInterceptListenerOptions } from '@telepat/otto-protocol';
import { createRequire } from 'node:module';
import {
  ottoAuthcodeToolInputSchema,
  ottoClientForgetToolInputSchema,
  ottoClientLoginToolInputSchema,
  ottoClientRegisterToolInputSchema,
  ottoClientRemoveToolInputSchema,
  ottoClientStatusToolInputSchema,
  ottoCmdToolInputSchema,
  ottoCommandsListToolInputSchema,
  ottoConfigToolInputSchema,
  ottoExtractContentToolInputSchema,
  ottoExtensionInfoToolInputSchema,
  ottoExtensionUpdateToolInputSchema,
  ottoListenerSubscribeNetworkToolInputSchema,
  ottoListenerUnsubscribeToolInputSchema,
  ottoLogsExportToolInputSchema,
  ottoLogsFollowToolInputSchema,
  ottoLogsListToolInputSchema,
  ottoPairToolInputSchema,
  ottoRevokeToolInputSchema,
  ottoScreenshotToolInputSchema,
  ottoSetupToolInputSchema,
  ottoStartToolInputSchema,
  ottoStatusToolInputSchema,
  ottoStopToolInputSchema,
  ottoTestToolInputSchema,
} from './tools.js';
import { runExtractContentHandler } from '../cli/extract-content-handler.js';
import {
  buildRelayStatusReport,
  deleteClientSecret,
  getRelayHttpBase,
  loadConfig,
  maybeSelfRegisterControllerForTest,
  normalizeControllerRelayUrl,
  openControllerSocket,
  readRelayDaemonState,
  removeControllerClientAtRelay,
  requestJson,
  resolveClientSecret,
  resolveTargetNodeId,
  runCommandOnce,
  saveConfig,
  startRelayDaemon,
  stopRelayDaemon,
  storeClientSecret,
  type ControllerRegisterResponse,
  type ControllerTokenResponse,
  type ControllerRemoveResponse,
  type ControllerRemoveAllResponse,
} from './otto-mcp-helpers.js';
import { ensureRelayDaemonReadyForSetup, shouldRunSetupNonInteractive } from '../setup-logic.js';
import { installExtensionArtifact } from '../extension-manager.js';
import { fetchConnectedNodeIds } from '../node-resolution.js';
import type { LogLevel, LogSource } from '../logs-options.js';

const require = createRequire(import.meta.url);

function parseJsonObject(value: string | undefined, label: string): Record<string, unknown> {
  if (!value) {
    return {};
  }
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function formatToolError(error: unknown): { content: { type: 'text'; text: string }[]; isError: true } {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
  };
}

function getCliVersion(): string {
  try {
    const pkg = require('../package.json') as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export async function startOttoMcpServer(): Promise<void> {
  const require2 = createRequire(import.meta.url);
  let version = '0.0.0';
  try {
    const pkg = require2('../package.json') as { version?: string };
    version = pkg.version ?? '0.0.0';
  } catch {
    // fallback
  }

  const server = new McpServer({ name: 'otto', version });

  // --- otto_status ---
  server.registerTool('otto_status', {
    title: 'Otto Status',
    description: 'Show relay daemon status (running, port, pid, log path).',
    inputSchema: ottoStatusToolInputSchema,
  }, async (input) => {
    try {
      const state = readRelayDaemonState();
      const report = buildRelayStatusReport(state);
      const structuredContent: Record<string, unknown> = { ...report };

      if (input.nodes) {
        const config = loadConfig();
        structuredContent.nodes = await fetchConnectedNodeIds(config);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
        structuredContent,
      };
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_commands_list ---
  server.registerTool('otto_commands_list', {
    title: 'List Commands',
    description: 'List available commands from a connected node. Returns command descriptors with input field schemas.',
    inputSchema: ottoCommandsListToolInputSchema,
  }, async (input) => {
    try {
      const config = loadConfig();
      const targetNodeId = await resolveTargetNodeId(config, input.nodeId);
      const timeoutMs = input.timeout ?? 30_000;
      const payload: Record<string, unknown> = {};
      if (input.site) {
        payload.site = input.site;
      }
      const response = await runCommandOnce(config, targetNodeId, {
        action: 'command.list',
        payload,
        timeoutMs,
      });
      const result = response.payload;
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as Record<string, unknown>,
      };
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_cmd ---
  server.registerTool('otto_cmd', {
    title: 'Send Command',
    description: 'Send a command to a connected node. Use for tab management, site commands, and browser automation.',
    inputSchema: ottoCmdToolInputSchema,
  }, async (input) => {
    try {
      const config = loadConfig();
      const targetNodeId = await resolveTargetNodeId(config, input.nodeId);
      const payload = parseJsonObject(input.payload, 'payload');
      const timeoutMs = input.timeout ?? 30_000;
      const response = await runCommandOnce(config, targetNodeId, {
        action: input.action,
        tabSession: input.tabSession,
        payload,
        timeoutMs,
      });
      const result = response.payload;
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as Record<string, unknown>,
      };
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_test ---
  server.registerTool('otto_test', {
    title: 'Run Test Command',
    description: 'Run a site command for testing. Supports streaming with --stream-follow-ms. Auto-registers controller if needed.',
    inputSchema: ottoTestToolInputSchema,
  }, async (input) => {
    try {
      let config = loadConfig();
      const timeoutMs = input.timeout ?? 30_000;

      const { config: updatedConfig } = await maybeSelfRegisterControllerForTest(config, {
        controllerName: input.controllerName,
        controllerDescription: input.controllerDescription,
        controllerAvatarSeed: input.controllerAvatarSeed,
      });
      config = updatedConfig;

      const targetNodeId = await resolveTargetNodeId(config, input.nodeId);
      const payload = parseJsonObject(input.payload, 'payload');
      payload.site = input.site;
      payload.command = input.command;
      if (input.authMode) {
        payload.authMode = input.authMode;
      }

      const response = await runCommandOnce(config, targetNodeId, {
        action: 'command.run',
        payload,
        timeoutMs,
      });

      const result = response.payload;

      if (input.cleanupTestController && config.controllerClientId) {
        try {
          await removeControllerClientAtRelay(config, config.controllerClientId);
          await deleteClientSecret(config, config.controllerClientId);
        } catch {
          // Best-effort cleanup
        }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as Record<string, unknown>,
      };
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_screenshot ---
  server.registerTool('otto_screenshot', {
    title: 'Capture Screenshot',
    description: 'Capture a screenshot of a URL. Returns the screenshot data or path.',
    inputSchema: ottoScreenshotToolInputSchema,
  }, async (input) => {
    try {
      const config = loadConfig();
      const targetNodeId = await resolveTargetNodeId(config, input.nodeId);
      const timeoutMs = input.timeout ?? 30_000;
      const payload: Record<string, unknown> = {
        url: input.url,
      };
      if (input.mode) payload.mode = input.mode;
      if (input.format) payload.format = input.format;
      if (input.quality !== undefined) payload.quality = input.quality;
      if (input.maxBytes !== undefined) payload.maxBytes = input.maxBytes;
      if (input.out) payload.out = input.out;

      const response = await runCommandOnce(config, targetNodeId, {
        action: 'command.run',
        payload: { site: 'screenshot', command: 'screenshot', input: payload },
        timeoutMs,
      });
      const result = response.payload;
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as Record<string, unknown>,
      };
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_extract_content ---
  server.registerTool('otto_extract_content', {
    title: 'Extract Content',
    description: 'Extract page content in one tool. Formats: markdown (default), distilled_html, raw_html, text.',
    inputSchema: ottoExtractContentToolInputSchema,
  }, async (input) => {
    try {
      const result = await runExtractContentHandler(
        {
          format: input.format,
          url: input.url,
          tabSession: input.tabSession,
          nodeId: input.nodeId,
          selector: input.selector,
          maxChars: input.maxChars,
          distillMode: input.distillMode,
          fallbackToReadability: input.fallbackToReadability,
          timeout: input.timeout,
        },
        { loadConfig, resolveTargetNodeId, runCommandOnce },
      );

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_logs_list ---
  server.registerTool('otto_logs_list', {
    title: 'List Logs',
    description: 'List historical relay logs with optional filters.',
    inputSchema: ottoLogsListToolInputSchema,
  }, async (input) => {
    try {
      const config = loadConfig();
      const base = getRelayHttpBase(config);
      const params = new URLSearchParams();
      if (input.since) params.set('since', input.since);
      if (input.level) params.set('level', input.level);
      if (input.source) params.set('source', input.source);
      if (input.latest !== undefined) params.set('latest', String(input.latest));
      if (input.nodeId) params.set('nodeId', input.nodeId);
      if (input.requestId) params.set('requestId', input.requestId);

      const headers: Record<string, string> = {};
      if (config.controllerAccessToken) {
        headers.authorization = `Bearer ${config.controllerAccessToken}`;
      }

      const url = `${base}/api/logs${params.toString() ? `?${params}` : ''}`;
      const result = await requestJson(url, { headers });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as Record<string, unknown>,
      };
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_logs_follow ---
  server.registerTool('otto_logs_follow', {
    title: 'Follow Logs',
    description: 'Follow live relay logs for a bounded duration. Returns collected log entries.',
    inputSchema: ottoLogsFollowToolInputSchema,
  }, async (input) => {
    try {
      const config = loadConfig();
      const ws = await openControllerSocket(config);
      const source = (input.source ?? 'all') as LogSource;
      const level = input.level as LogLevel | undefined;
      const collectedLogs: unknown[] = [];
      const MAX_ENTRIES = 500;

      ws.send(JSON.stringify({
        protocolVersion: '1.0',
        messageType: 'event',
        requestId: 'mcp-logs-sub',
        senderRole: 'controller',
        timestamp: new Date().toISOString(),
        payload: { type: 'logs_subscribe', source: source === 'all' ? undefined : source },
      }));

      const result = await new Promise<{ content: { type: 'text'; text: string }[]; structuredContent: Record<string, unknown> }>((resolve) => {
        const timeout = setTimeout(() => {
          ws.close();
          resolve({
            content: [{ type: 'text', text: JSON.stringify(collectedLogs, null, 2) }],
            structuredContent: { entries: collectedLogs, truncated: collectedLogs.length >= MAX_ENTRIES },
          });
        }, 5000);

        ws.on('message', (data) => {
          try {
            const msg = JSON.parse(String(data)) as Envelope;
            if (msg.messageType === 'event') {
              const payload = msg.payload as { type?: string; entry?: unknown };
              if (payload.type === 'log' && payload.entry) {
                const entry = payload.entry as { level?: string };
                if (level && entry.level !== level) return;
                collectedLogs.push(payload.entry);
                if (collectedLogs.length >= MAX_ENTRIES) {
                  clearTimeout(timeout);
                  ws.close();
                  resolve({
                    content: [{ type: 'text', text: JSON.stringify(collectedLogs, null, 2) }],
                    structuredContent: { entries: collectedLogs, truncated: true },
                  });
                }
              }
            }
          } catch {
            // ignore parse errors
          }
        });

        ws.once('close', () => {
          clearTimeout(timeout);
          resolve({
            content: [{ type: 'text', text: JSON.stringify(collectedLogs, null, 2) }],
            structuredContent: { entries: collectedLogs, truncated: false },
          });
        });
      });

      return result;
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_logs_export ---
  server.registerTool('otto_logs_export', {
    title: 'Export Logs',
    description: 'Export relay logs as structured data.',
    inputSchema: ottoLogsExportToolInputSchema,
  }, async (input) => {
    try {
      const config = loadConfig();
      const base = getRelayHttpBase(config);
      const params = new URLSearchParams();
      if (input.since) params.set('since', input.since);
      if (input.level) params.set('level', input.level);
      if (input.source) params.set('source', input.source);
      if (input.latest !== undefined) params.set('latest', String(input.latest));
      if (input.nodeId) params.set('nodeId', input.nodeId);
      if (input.requestId) params.set('requestId', input.requestId);

      const headers: Record<string, string> = {};
      if (config.controllerAccessToken) {
        headers.authorization = `Bearer ${config.controllerAccessToken}`;
      }

      const url = `${base}/api/logs/export${params.toString() ? `?${params}` : ''}`;
      const result = await requestJson(url, { headers });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as Record<string, unknown>,
      };
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_listener_subscribe_network ---
  server.registerTool('otto_listener_subscribe_network', {
    title: 'Subscribe Network Listener',
    description: 'Subscribe to network interception updates on a tab. Returns captured network events for a bounded duration.',
    inputSchema: ottoListenerSubscribeNetworkToolInputSchema,
  }, async (input) => {
    try {
      const config = loadConfig();
      const targetNodeId = await resolveTargetNodeId(config, input.nodeId);
      const timeoutMs = input.timeout ?? 30_000;
      const followMs = input.followMs ?? 30_000;

      const ws = await openControllerSocket(config);
      const capturedEvents: unknown[] = [];
      const MAX_EVENTS = 200;

      const options: NetworkInterceptListenerOptions = {
        tabSessionId: input.tabSession,
        site: input.site,
        urlPatterns: input.pattern ? [input.pattern] : undefined,
        requestHostAllowlist: input.requestHost ? [input.requestHost] : undefined,
        mode: input.mode ?? 'network',
        maxBodyBytes: input.maxBodyBytes,
        includeHeaders: input.includeHeaders,
        includeBody: input.includeBody !== false,
        mimeTypes: input.mime ? [input.mime] : undefined,
      };

      const subscribeRequestId = `mcp-net-sub-${Date.now()}`;

      const result = await new Promise<{ content: { type: 'text'; text: string }[]; structuredContent: Record<string, unknown> }>((resolve) => {
        const cleanup = () => {
          try {
            ws.close();
          } catch {
            // ignore
          }
        };

        const followTimer = setTimeout(() => {
          cleanup();
          resolve({
            content: [{ type: 'text', text: JSON.stringify(capturedEvents, null, 2) }],
            structuredContent: { events: capturedEvents, truncated: capturedEvents.length >= MAX_EVENTS },
          });
        }, followMs);

        ws.on('message', (data) => {
          try {
            const msg = JSON.parse(String(data)) as Envelope;
            if (msg.requestId === subscribeRequestId && msg.messageType === 'error') {
              clearTimeout(followTimer);
              cleanup();
              const errMsg = JSON.stringify(msg.payload);
              resolve({
                content: [{ type: 'text', text: `Subscribe failed: ${errMsg}` }],
                structuredContent: { error: errMsg },
              });
              return;
            }

            if (msg.messageType === 'event') {
              const payload = msg.payload as { type?: string };
              if (payload.type === 'listener_update') {
                capturedEvents.push(msg.payload);
                if (capturedEvents.length >= MAX_EVENTS) {
                  clearTimeout(followTimer);
                  cleanup();
                  resolve({
                    content: [{ type: 'text', text: JSON.stringify(capturedEvents, null, 2) }],
                    structuredContent: { events: capturedEvents, truncated: true },
                  });
                }
              }
            }
          } catch {
            // ignore parse errors
          }
        });

        ws.once('close', () => {
          clearTimeout(followTimer);
          resolve({
            content: [{ type: 'text', text: JSON.stringify(capturedEvents, null, 2) }],
            structuredContent: { events: capturedEvents, truncated: false },
          });
        });

        ws.send(JSON.stringify({
          protocolVersion: '1.0',
          messageType: 'command',
          requestId: subscribeRequestId,
          senderRole: 'controller',
          timestamp: new Date().toISOString(),
          payload: {
            targetNodeId,
            tabSessionId: input.tabSession,
            action: 'listener.subscribe',
            payload: {
              listener: 'network.http_intercept',
              options,
            },
            timeoutMs,
            waitPolicy: 'fail_fast',
          },
        }));
      });

      return result;
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_listener_unsubscribe ---
  server.registerTool('otto_listener_unsubscribe', {
    title: 'Unsubscribe Listener',
    description: 'Unsubscribe an active listener by its subscribe request ID.',
    inputSchema: ottoListenerUnsubscribeToolInputSchema,
  }, async (input) => {
    try {
      const config = loadConfig();
      const targetNodeId = await resolveTargetNodeId(config, input.nodeId);
      const timeoutMs = input.timeout ?? 30_000;
      const response = await runCommandOnce(config, targetNodeId, {
        action: 'listener.unsubscribe',
        payload: { targetRequestId: input.targetRequestId },
        timeoutMs,
      });
      const result = response.payload;
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as Record<string, unknown>,
      };
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_setup ---
  server.registerTool('otto_setup', {
    title: 'Setup Otto',
    description: 'Run Otto setup: configure relay, start daemon, download extension.',
    inputSchema: ottoSetupToolInputSchema,
  }, async (input) => {
    try {
      let config = loadConfig();
      const relayUrl = input.relayUrl
        ? normalizeControllerRelayUrl(input.relayUrl)
        : config.relayUrl;
      const nonInteractive = shouldRunSetupNonInteractive(
        !(existsSync('/dev/stdin') && process.stdin.isTTY),
        input.nonInteractive ?? false,
      );

      const relayReadyResult = ensureRelayDaemonReadyForSetup(
        relayUrl,
        readRelayDaemonState,
        startRelayDaemon,
      );

      config = { ...config, relayUrl };
      if (nonInteractive) {
        config.setupNonInteractiveDefault = true;
      }
      saveConfig(config);

      const cliVersion = getCliVersion();
      const extResult = await installExtensionArtifact({
        version: cliVersion,
        outputDir: input.outputDir,
        releaseBaseUrl: input.releaseBaseUrl,
        timeoutMs: input.downloadTimeoutMs ?? config.downloadTimeoutMs ?? 120_000,
      });

      config = loadConfig();
      config.extension = {
        version: cliVersion,
        source: 'download',
        zipPath: extResult.zipPath,
        unpackedPath: extResult.unpackedPath,
        checksumSha256: extResult.checksumSha256,
        installedAt: new Date().toISOString(),
        releaseBaseUrl: extResult.releaseBaseUrl,
      };
      saveConfig(config);

      const result = {
        relayUrl,
        daemonStatus: relayReadyResult.status,
        extensionPath: extResult.unpackedPath,
        extensionVersion: cliVersion,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_start ---
  server.registerTool('otto_start', {
    title: 'Start Relay',
    description: 'Start the Otto relay daemon.',
    inputSchema: ottoStartToolInputSchema,
  }, async (input) => {
    try {
      const port = input.port ?? 8787;
      const state = startRelayDaemon(port);
      const result = {
        status: 'started' as const,
        pid: state.pid,
        port: state.port,
        logPath: state.logPath,
        startedAt: state.startedAt,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_stop ---
  server.registerTool('otto_stop', {
    title: 'Stop Relay',
    description: 'Stop the Otto relay daemon if running.',
    inputSchema: ottoStopToolInputSchema,
  }, async () => {
    try {
      const result = await stopRelayDaemon();
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_config ---
  server.registerTool('otto_config', {
    title: 'Configure Otto',
    description: 'Read or update Otto configuration (relay URL, node ID).',
    inputSchema: ottoConfigToolInputSchema,
  }, async (input) => {
    try {
      let config = loadConfig();
      const updated: string[] = [];

      if (input.relayUrl) {
        config.relayUrl = normalizeControllerRelayUrl(input.relayUrl);
        updated.push('relayUrl');
      }
      if (input.relayHttpUrl) {
        config.relayHttpUrl = input.relayHttpUrl;
        updated.push('relayHttpUrl');
      }
      if (input.nodeId !== undefined) {
        config.targetNodeId = input.nodeId || undefined;
        updated.push('targetNodeId');
      }

      if (updated.length > 0) {
        saveConfig(config);
      }

      const result = { config, updated };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_pair ---
  server.registerTool('otto_pair', {
    title: 'Pair Node',
    description: 'Approve a pairing code to register a node with this controller.',
    inputSchema: ottoPairToolInputSchema,
  }, async (input) => {
    try {
      const config = loadConfig();
      const base = getRelayHttpBase(config);
      const result = await requestJson(`${base}/api/pair/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code: input.code }),
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as Record<string, unknown>,
      };
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_authcode ---
  server.registerTool('otto_authcode', {
    title: 'List Auth Codes',
    description: 'List pending pairing auth codes.',
    inputSchema: ottoAuthcodeToolInputSchema,
  }, async () => {
    try {
      const config = loadConfig();
      const base = getRelayHttpBase(config);
      const headers: Record<string, string> = {};
      if (config.controllerAccessToken) {
        headers.authorization = `Bearer ${config.controllerAccessToken}`;
      }
      const result = await requestJson(`${base}/api/authcode`, { headers });
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as Record<string, unknown>,
      };
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_revoke ---
  server.registerTool('otto_revoke', {
    title: 'Revoke Token',
    description: 'Revoke stored refresh token and clear local auth state.',
    inputSchema: ottoRevokeToolInputSchema,
  }, async () => {
    try {
      const config = loadConfig();
      if (config.controllerRefreshToken) {
        try {
          const base = getRelayHttpBase(config);
          await requestJson(`${base}/api/auth/revoke`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ refreshToken: config.controllerRefreshToken }),
          });
        } catch {
          // Best-effort revoke
        }
      }

      const nextConfig = {
        ...config,
        controllerAccessToken: undefined,
        controllerRefreshToken: undefined,
      };
      saveConfig(nextConfig);

      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true, revoked: true }, null, 2) }],
        structuredContent: { ok: true, revoked: true },
      };
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_client_register ---
  server.registerTool('otto_client_register', {
    title: 'Register Controller',
    description: 'Register a new controller client with the relay. Stores client secret in keychain.',
    inputSchema: ottoClientRegisterToolInputSchema,
  }, async (input) => {
    try {
      const config = loadConfig();
      const base = getRelayHttpBase(config);
      const registration = {
        name: input.name ?? 'otto-mcp-controller',
        description: input.description ?? 'Controller registered via MCP.',
        avatarSeed: input.avatarSeed,
      };

      const registered = (await requestJson(`${base}/api/controller/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(registration),
      })) as ControllerRegisterResponse;

      const secretStored = await storeClientSecret(config, registered.clientId, registered.clientSecret);

      const tokenResult = (await requestJson(`${base}/api/controller/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId: registered.clientId,
          clientSecret: registered.clientSecret,
        }),
      })) as ControllerTokenResponse;

      const nextConfig = {
        ...config,
        relayHttpUrl: base,
        controllerClientId: tokenResult.clientId,
        controllerName: registered.name,
        controllerDescription: registered.description,
        controllerAccessToken: tokenResult.accessToken,
        controllerRefreshToken: tokenResult.refreshToken,
      };
      saveConfig(nextConfig);

      const result = {
        clientId: registered.clientId,
        name: registered.name,
        description: registered.description,
        secretStored,
        authenticated: true,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_client_login ---
  server.registerTool('otto_client_login', {
    title: 'Login Controller',
    description: 'Exchange client credentials for access/refresh tokens.',
    inputSchema: ottoClientLoginToolInputSchema,
  }, async (input) => {
    try {
      let config = loadConfig();
      const clientId = input.clientId ?? config.controllerClientId;
      if (!clientId) {
        throw new Error('No client ID provided and none stored in config. Run `otto client register` first.');
      }

      const base = getRelayHttpBase(config);
      let clientSecret = input.clientSecret;

      if (!clientSecret) {
        const resolved = await resolveClientSecret(config, clientId);
        clientSecret = resolved.secret;
      }

      const tokenResult = (await requestJson(`${base}/api/controller/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret }),
      })) as ControllerTokenResponse;

      const nextConfig = {
        ...config,
        controllerClientId: tokenResult.clientId,
        controllerAccessToken: tokenResult.accessToken,
        controllerRefreshToken: tokenResult.refreshToken,
      };
      saveConfig(nextConfig);

      const result = {
        clientId: tokenResult.clientId,
        scopes: tokenResult.scopes,
        authenticated: true,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_client_status ---
  server.registerTool('otto_client_status', {
    title: 'Controller Status',
    description: 'Show local controller client state and auth status.',
    inputSchema: ottoClientStatusToolInputSchema,
  }, async (input) => {
    try {
      const config = loadConfig();
      const clientId = input.clientId ?? config.controllerClientId;
      const result = {
        clientId: clientId ?? null,
        controllerName: config.controllerName ?? null,
        controllerDescription: config.controllerDescription ?? null,
        hasAccessToken: Boolean(config.controllerAccessToken),
        hasRefreshToken: Boolean(config.controllerRefreshToken),
        authenticated: Boolean(config.controllerAccessToken),
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      };
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_client_forget ---
  server.registerTool('otto_client_forget', {
    title: 'Forget Client',
    description: 'Delete stored client secret and clear local auth state.',
    inputSchema: ottoClientForgetToolInputSchema,
  }, async (input) => {
    try {
      const config = loadConfig();
      const clientId = input.clientId ?? config.controllerClientId;
      if (!clientId) {
        throw new Error('No client ID provided and none stored in config.');
      }

      await deleteClientSecret(config, clientId);

      const nextConfig = {
        ...config,
        controllerClientId: config.controllerClientId === clientId ? undefined : config.controllerClientId,
        controllerAccessToken: config.controllerClientId === clientId ? undefined : config.controllerAccessToken,
        controllerRefreshToken: config.controllerClientId === clientId ? undefined : config.controllerRefreshToken,
      };
      saveConfig(nextConfig);

      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true, clientId, forgotten: true }, null, 2) }],
        structuredContent: { ok: true, clientId, forgotten: true },
      };
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_client_remove ---
  server.registerTool('otto_client_remove', {
    title: 'Remove Client',
    description: 'Remove registered controller client at the relay (revokes access).',
    inputSchema: ottoClientRemoveToolInputSchema,
  }, async (input) => {
    try {
      const config = loadConfig();
      const base = getRelayHttpBase(config);

      if (input.all) {
        const result = (await requestJson(`${base}/api/controller/remove-all`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
        })) as ControllerRemoveAllResponse;

        const nextConfig = {
          ...config,
          controllerClientId: undefined,
          controllerAccessToken: undefined,
          controllerRefreshToken: undefined,
        };
        saveConfig(nextConfig);

        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      }

      const clientId = input.clientId ?? config.controllerClientId;
      if (!clientId) {
        throw new Error('No client ID provided and none stored in config.');
      }

      const result = (await requestJson(`${base}/api/controller/remove`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId }),
      })) as ControllerRemoveResponse;

      if (config.controllerClientId === clientId) {
        const nextConfig = {
          ...config,
          controllerClientId: undefined,
          controllerAccessToken: undefined,
          controllerRefreshToken: undefined,
        };
        saveConfig(nextConfig);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_extension_update ---
  server.registerTool('otto_extension_update', {
    title: 'Update Extension',
    description: 'Download and install the latest extension artifact for the current CLI version.',
    inputSchema: ottoExtensionUpdateToolInputSchema,
  }, async (input) => {
    try {
      const config = loadConfig();
      const cliVersion = getCliVersion();
      const result = await installExtensionArtifact({
        version: cliVersion,
        outputDir: input.outputDir,
        releaseBaseUrl: input.releaseBaseUrl,
        timeoutMs: input.downloadTimeoutMs ?? config.downloadTimeoutMs ?? 120_000,
      });

      const nextConfig = loadConfig();
      nextConfig.extension = {
        version: cliVersion,
        source: 'download',
        zipPath: result.zipPath,
        unpackedPath: result.unpackedPath,
        checksumSha256: result.checksumSha256,
        installedAt: new Date().toISOString(),
        releaseBaseUrl: result.releaseBaseUrl,
      };
      saveConfig(nextConfig);

      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    } catch (error) {
      return formatToolError(error);
    }
  });

  // --- otto_extension_info ---
  server.registerTool('otto_extension_info', {
    title: 'Extension Info',
    description: 'Show installed extension artifact metadata.',
    inputSchema: ottoExtensionInfoToolInputSchema,
  }, async () => {
    try {
      const config = loadConfig();
      const result = {
        installed: Boolean(config.extension),
        extension: config.extension ?? null,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        structuredContent: result as unknown as Record<string, unknown>,
      };
    } catch (error) {
      return formatToolError(error);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
