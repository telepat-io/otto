import { z } from 'zod';

export const ottoStatusToolInputSchema = {
  nodes: z.boolean().optional().describe('Include connected node IDs in the status response.'),
};

export const ottoCommandsListToolInputSchema = {
  nodeId: z.string().optional().describe('Target node ID. Auto-resolved if only one node is connected.'),
  site: z.string().optional().describe('Filter commands by site (e.g. "reddit.com").'),
  timeout: z.coerce.number().int().positive().optional().describe('Request timeout in milliseconds.'),
};

export const ottoCmdToolInputSchema = {
  action: z.string().min(1).describe('Action identifier (e.g. "primitive.tab.open", "command.run").'),
  tabSession: z.string().optional().describe('Tab session ID for scoped execution.'),
  nodeId: z.string().optional().describe('Target node ID. Auto-resolved if only one node is connected.'),
  payload: z.string().optional().describe('JSON payload string for the action. Defaults to "{}".'),
  timeout: z.coerce.number().int().positive().optional().describe('Command timeout in milliseconds. Default: 30000.'),
};

export const ottoTestToolInputSchema = {
  site: z.string().min(1).describe('Site identifier (e.g. "reddit.com").'),
  command: z.string().min(1).describe('Command name on the site (e.g. "getPosts", "getChatMessages").'),
  nodeId: z.string().optional().describe('Target node ID.'),
  payload: z.string().optional().describe('JSON payload string for the command input.'),
  timeout: z.coerce.number().int().positive().optional().describe('Command timeout in milliseconds.'),
  controllerName: z.string().optional().describe('Controller name for auto-registration.'),
  controllerDescription: z.string().optional().describe('Controller description for auto-registration.'),
  controllerAvatarSeed: z.string().optional().describe('Controller avatar seed for auto-registration.'),
  cleanupTestController: z.boolean().optional().describe('Remove auto-registered controller after test.'),
  authMode: z.enum(['auto', 'strict_fail', 'skip']).optional().describe('Auth mode for command execution.'),
  streamFollowMs: z.coerce.number().int().positive().optional().describe('Duration to follow stream updates in ms.'),
  streamProbe: z.boolean().optional().describe('Force immediate traffic after subscribe to validate listener wiring.'),
  streamListenerMode: z.enum(['network', 'fetch', 'hybrid']).optional().describe('Network intercept capture mode.'),
  streamPollIntervalMs: z.coerce.number().int().positive().optional().describe('Polling interval for stream updates.'),
};

export const ottoScreenshotToolInputSchema = {
  url: z.string().min(1).describe('URL to capture.'),
  nodeId: z.string().optional().describe('Target node ID.'),
  mode: z.string().optional().describe('Screenshot mode.'),
  format: z.string().optional().describe('Image format (e.g. "png", "jpeg").'),
  quality: z.coerce.number().int().optional().describe('Image quality (0-100).'),
  maxBytes: z.coerce.number().int().positive().optional().describe('Max output size in bytes.'),
  timeout: z.coerce.number().int().positive().optional().describe('Timeout in milliseconds.'),
  out: z.string().optional().describe('Output file path.'),
};

export const ottoExtractContentToolInputSchema = {
  url: z.string().optional().describe('URL to extract from. Optional when tabSession is provided.'),
  tabSession: z.string().optional().describe('Tab session ID to extract from.'),
  format: z.enum(['markdown', 'distilled_html', 'clean_html', 'raw_html', 'text']).optional()
    .describe('Extraction output format. Default: "markdown".'),
  selector: z.string().optional().describe('CSS selector for raw_html, clean_html, and text extraction.'),
  distillMode: z.enum(['readability', 'dom-distiller']).optional()
    .describe('Distillation mode for markdown and distilled_html. Default: "readability".'),
  fallbackToReadability: z.boolean().optional().describe('Fallback to readability when distiller output is unavailable.'),
  maxChars: z.coerce.number().int().positive().optional().describe('Maximum extracted characters for supported formats.'),
  nodeId: z.string().optional().describe('Target node ID.'),
  timeout: z.coerce.number().int().positive().optional().describe('Timeout in milliseconds. Default: 60000.'),
};

export const ottoLogsListToolInputSchema = {
  since: z.string().optional().describe('ISO timestamp to filter logs from.'),
  level: z.enum(['debug', 'info', 'warn', 'error']).optional().describe('Log level filter.'),
  source: z.enum(['relay', 'controller', 'node', 'all']).optional().describe('Log source filter.'),
  latest: z.coerce.number().int().positive().optional().describe('Number of latest log entries to return.'),
  nodeId: z.string().optional().describe('Filter by node ID.'),
  requestId: z.string().optional().describe('Filter by request ID.'),
};

export const ottoLogsFollowToolInputSchema = {
  level: z.enum(['debug', 'info', 'warn', 'error']).optional().describe('Log level filter.'),
  source: z.enum(['relay', 'controller', 'node', 'all']).optional().describe('Log source filter.'),
};

export const ottoLogsExportToolInputSchema = {
  since: z.string().optional().describe('ISO timestamp to filter logs from.'),
  level: z.enum(['debug', 'info', 'warn', 'error']).optional().describe('Log level filter.'),
  source: z.enum(['relay', 'controller', 'node', 'all']).optional().describe('Log source filter.'),
  latest: z.coerce.number().int().positive().optional().describe('Number of latest log entries.'),
  nodeId: z.string().optional().describe('Filter by node ID.'),
  requestId: z.string().optional().describe('Filter by request ID.'),
};

export const ottoListenerSubscribeNetworkToolInputSchema = {
  tabSession: z.string().min(1).describe('Tab session ID to subscribe on.'),
  site: z.string().min(1).describe('Site identifier.'),
  pattern: z.string().optional().describe('URL pattern to match.'),
  requestHost: z.string().optional().describe('Filter by request host.'),
  mode: z.enum(['network', 'fetch', 'hybrid']).optional().describe('Capture mode. Default: "network".'),
  maxBodyBytes: z.coerce.number().int().positive().optional().describe('Max body bytes to capture.'),
  includeHeaders: z.boolean().optional().describe('Include request/response headers.'),
  includeBody: z.boolean().optional().describe('Include response body.'),
  mime: z.string().optional().describe('MIME type filter.'),
  nodeId: z.string().optional().describe('Target node ID.'),
  timeout: z.coerce.number().int().positive().optional().describe('Timeout in milliseconds.'),
  followMs: z.coerce.number().int().positive().optional().describe('Duration to follow updates in ms. Default: 30000.'),
};

export const ottoListenerUnsubscribeToolInputSchema = {
  targetRequestId: z.string().min(1).describe('The subscribe request ID to unsubscribe from.'),
  nodeId: z.string().optional().describe('Target node ID.'),
  timeout: z.coerce.number().int().positive().optional().describe('Timeout in milliseconds.'),
};

export const ottoSetupToolInputSchema = {
  relayUrl: z.string().optional().describe('Relay WebSocket URL. Default: "ws://127.0.0.1:8787?role=controller".'),
  yes: z.boolean().optional().describe('Skip confirmation prompts.'),
  force: z.boolean().optional().describe('Force re-setup even if already configured.'),
  nonInteractive: z.boolean().optional().describe('Run in non-interactive mode.'),
  outputDir: z.string().optional().describe('Directory for extension artifacts.'),
  releaseBaseUrl: z.string().optional().describe('Base URL for release downloads.'),
  downloadTimeoutMs: z.coerce.number().int().positive().optional().describe('Download timeout in milliseconds.'),
};

export const ottoStartToolInputSchema = {
  port: z.coerce.number().int().positive().optional().describe('Relay port. Default: 8787.'),
  attached: z.boolean().optional().describe('Run in attached (foreground) mode.'),
};

export const ottoStopToolInputSchema = {};

export const ottoConfigToolInputSchema = {
  relayUrl: z.string().optional().describe('Set the relay WebSocket URL.'),
  relayHttpUrl: z.string().optional().describe('Set the relay HTTP URL override.'),
  nodeId: z.string().optional().describe('Set the default target node ID.'),
};

export const ottoPairToolInputSchema = {
  code: z.string().min(1).describe('Pairing code (e.g. "123-456").'),
};

export const ottoAuthcodeToolInputSchema = {};

export const ottoRevokeToolInputSchema = {};

export const ottoClientRegisterToolInputSchema = {
  name: z.string().optional().describe('Controller name.'),
  description: z.string().optional().describe('Controller description.'),
  avatarSeed: z.string().optional().describe('Avatar seed for deterministic avatar generation.'),
};

export const ottoClientLoginToolInputSchema = {
  clientId: z.string().optional().describe('Controller client ID. Uses stored config if omitted.'),
  clientSecret: z.string().optional().describe('Client secret. Reads from keychain/env if omitted.'),
};

export const ottoClientStatusToolInputSchema = {
  clientId: z.string().optional().describe('Client ID to check. Uses stored config if omitted.'),
};

export const ottoClientForgetToolInputSchema = {
  clientId: z.string().optional().describe('Client ID to forget. Uses stored config if omitted.'),
};

export const ottoClientRemoveToolInputSchema = {
  clientId: z.string().optional().describe('Client ID to remove. Uses stored config if omitted.'),
  all: z.boolean().optional().describe('Remove all registered controller clients.'),
};

export const ottoExtensionUpdateToolInputSchema = {
  outputDir: z.string().optional().describe('Directory for extension artifacts.'),
  releaseBaseUrl: z.string().optional().describe('Base URL for release downloads.'),
  downloadTimeoutMs: z.coerce.number().int().positive().optional().describe('Download timeout in milliseconds.'),
};

export const ottoExtensionInfoToolInputSchema = {};

export interface ToolContract {
  name: string;
  required: string[];
  enums: Record<string, string[]>;
}

export const ottoToolContracts: ToolContract[] = [
  { name: 'otto_status', required: [], enums: {} },
  { name: 'otto_commands_list', required: [], enums: {} },
  { name: 'otto_cmd', required: ['action'], enums: {} },
  { name: 'otto_test', required: ['site', 'command'], enums: { authMode: ['auto', 'strict_fail', 'skip'], streamListenerMode: ['network', 'fetch', 'hybrid'] } },
  { name: 'otto_screenshot', required: ['url'], enums: {} },
  {
    name: 'otto_extract_content',
    required: [],
    enums: {
      format: ['markdown', 'distilled_html', 'raw_html', 'text'],
      distillMode: ['readability', 'dom-distiller'],
    },
  },
  { name: 'otto_logs_list', required: [], enums: { level: ['debug', 'info', 'warn', 'error'], source: ['relay', 'controller', 'node', 'all'] } },
  { name: 'otto_logs_follow', required: [], enums: { level: ['debug', 'info', 'warn', 'error'], source: ['relay', 'controller', 'node', 'all'] } },
  { name: 'otto_logs_export', required: [], enums: { level: ['debug', 'info', 'warn', 'error'], source: ['relay', 'controller', 'node', 'all'] } },
  { name: 'otto_listener_subscribe_network', required: ['tabSession', 'site'], enums: { mode: ['network', 'fetch', 'hybrid'] } },
  { name: 'otto_listener_unsubscribe', required: ['targetRequestId'], enums: {} },
  { name: 'otto_setup', required: [], enums: {} },
  { name: 'otto_start', required: [], enums: {} },
  { name: 'otto_stop', required: [], enums: {} },
  { name: 'otto_config', required: [], enums: {} },
  { name: 'otto_pair', required: ['code'], enums: {} },
  { name: 'otto_authcode', required: [], enums: {} },
  { name: 'otto_revoke', required: [], enums: {} },
  { name: 'otto_client_register', required: [], enums: {} },
  { name: 'otto_client_login', required: [], enums: {} },
  { name: 'otto_client_status', required: [], enums: {} },
  { name: 'otto_client_forget', required: [], enums: {} },
  { name: 'otto_client_remove', required: [], enums: {} },
  { name: 'otto_extension_update', required: [], enums: {} },
  { name: 'otto_extension_info', required: [], enums: {} },
];
