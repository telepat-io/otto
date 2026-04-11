import { nanoid } from 'nanoid';
import type {
  CommandPayload,
  NetworkInterceptListenerOptions,
  CommandAuthMode,
  CommandDescriptor,
  CommandInputFieldDescriptor,
  CommandInputFieldType,
  CommandRunPayload,
} from '@telepat/otto-protocol';
import { findSiteBundle, findSiteCommand, isSiteMatch, listCommandDescriptors } from '../commands/index.js';
import type { CommandExecutionContext } from '../commands/types.js';
import { CommandExecutionError } from './execution-error.js';
import { DebuggerFocusEmulationError } from './debugger-focus-emulation.js';
import { getDebuggerFocusEmulationManager, getNetworkInterceptListenerManager } from './listener-managers.js';

type ChromeLike = typeof chrome;

const TAB_URL_READY_TIMEOUT_MS = 1200;
const TAB_URL_POLL_INTERVAL_MS = 75;

type CommandRun = {
  site: string;
  commandId: string;
  input: Record<string, unknown>;
  authMode: CommandAuthMode;
};

const COMMAND_INPUT_TYPES: CommandInputFieldType[] = ['string', 'number', 'boolean', 'object', 'array'];

type CommandMode = 'run' | 'test';

function parseCommandRunPayload(command: CommandPayload): CommandRun {
  if (command.action === 'command.reddit_feed') {
    return {
      site: 'reddit.com',
      commandId: 'getFeed',
      input: {},
      authMode: 'auto',
    };
  }

  const payload = command.payload as Partial<CommandRunPayload>;
  const actionName = command.action === 'command.test' ? 'command.test' : 'command.run';
  const site = String(payload.site ?? '');
  const commandId = String(payload.command ?? '');
  const authMode = payload.authMode ?? 'auto';

  if (!site) {
    throw new CommandExecutionError(`${actionName} requires payload.site`, 'missing_site', 'validation', false);
  }
  if (!commandId) {
    throw new CommandExecutionError(`${actionName} requires payload.command`, 'missing_command', 'validation', false);
  }
  if (!['auto', 'strict_fail', 'skip'].includes(authMode)) {
    throw new CommandExecutionError(
      `${actionName} payload.authMode must be one of auto|strict_fail|skip`,
      'invalid_auth_mode',
      'validation',
      false,
    );
  }

  const input = payload.input && typeof payload.input === 'object' && !Array.isArray(payload.input)
    ? (payload.input as Record<string, unknown>)
    : {};

  return { site, commandId, input, authMode };
}

function normalizeCommandInputFieldName(name: string): string {
  return name.trim();
}

function isSupportedCommandInputType(value: string): value is CommandInputFieldType {
  return COMMAND_INPUT_TYPES.includes(value as CommandInputFieldType);
}

function isTypeMatch(value: unknown, expectedType: CommandInputFieldType): boolean {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    default:
      return false;
  }
}

function validateAndSanitizeCommandInput(
  metadata: CommandDescriptor,
  input: Record<string, unknown>,
  inputFields: CommandInputFieldDescriptor[] | undefined,
): Record<string, unknown> {
  const commandId = metadata.id;

  if (!inputFields) {
    return input;
  }

  const normalizedFields = inputFields.map((field) => ({
    ...field,
    name: normalizeCommandInputFieldName(field.name),
  }));

  const fieldByName = new Map<string, CommandInputFieldDescriptor>();
  for (const field of normalizedFields) {
    if (!field.name) {
      throw new CommandExecutionError(
        `Command ${commandId} has an input field with an empty name`,
        'invalid_command_input_schema',
        'validation',
        false,
      );
    }
    if (!isSupportedCommandInputType(field.type)) {
      throw new CommandExecutionError(
        `Command ${commandId} has unsupported input type "${field.type}" for field ${field.name}`,
        'invalid_command_input_schema',
        'validation',
        false,
      );
    }
    if (fieldByName.has(field.name)) {
      throw new CommandExecutionError(
        `Command ${commandId} has duplicated input field ${field.name}`,
        'invalid_command_input_schema',
        'validation',
        false,
      );
    }
    fieldByName.set(field.name, field);
  }

  const unknownFields = Object.keys(input).filter((key) => !fieldByName.has(key));
  if (unknownFields.length > 0) {
    throw new CommandExecutionError(
      `Command ${commandId} does not support input field(s): ${unknownFields.join(', ')}`,
      'unexpected_command_input',
      'validation',
      false,
    );
  }

  const sanitized: Record<string, unknown> = {};
  for (const field of normalizedFields) {
    const hasValue = Object.prototype.hasOwnProperty.call(input, field.name);
    const fieldOptional = field.optional === true;
    if (!hasValue) {
      if (!fieldOptional) {
        throw new CommandExecutionError(
          `Command ${commandId} requires input.${field.name}`,
          'missing_command_input',
          'validation',
          false,
        );
      }
      continue;
    }

    const value = input[field.name];
    if (!isTypeMatch(value, field.type)) {
      throw new CommandExecutionError(
        `Command ${commandId} expects input.${field.name} to be ${field.type}`,
        'invalid_command_input_type',
        'validation',
        false,
      );
    }
    sanitized[field.name] = value;
  }

  const atLeastOneOf = Array.isArray(metadata.inputAtLeastOneOf)
    ? metadata.inputAtLeastOneOf
      .map((name) => normalizeCommandInputFieldName(String(name ?? '')))
      .filter((name) => name.length > 0)
    : [];

  if (atLeastOneOf.length > 0) {
    const hasAny = atLeastOneOf.some((name) => Object.prototype.hasOwnProperty.call(sanitized, name));
    if (!hasAny) {
      throw new CommandExecutionError(
        `Command ${commandId} requires at least one of: ${atLeastOneOf.join(', ')}`,
        'missing_command_input_one_of',
        'validation',
        false,
      );
    }
  }

  return sanitized;
}

async function ensureCommandPreloadHost(
  chromeApi: ChromeLike,
  tabId: number,
  commandId: string,
  preloadHost: string | undefined,
): Promise<void> {
  if (!preloadHost) {
    return;
  }

  const trimmedPreloadHost = preloadHost.trim();
  if (!trimmedPreloadHost) {
    return;
  }

  const preloadUrl = /^https?:\/\//i.test(trimmedPreloadHost)
    ? trimmedPreloadHost
    : `https://${trimmedPreloadHost}`;

  const expectedHost = (() => {
    try {
      return new URL(preloadUrl).hostname;
    } catch {
      return trimmedPreloadHost;
    }
  })();

  const urlProbe = await waitForCommittedTabUrl(chromeApi, tabId);
  const tabUrl = urlProbe.url;

  if (!tabUrl || !isSiteMatch(tabUrl, expectedHost)) {
    await chromeApi.tabs.update(tabId, { url: preloadUrl });
  }

  const postNavigationProbe = await waitForCommittedTabUrl(chromeApi, tabId);
  const postNavigationUrl = postNavigationProbe.url;
  if (!postNavigationUrl) {
    throw new CommandExecutionError(
      `Tab URL not ready yet for preload host navigation on ${trimmedPreloadHost}`,
      'tab_url_not_ready',
      'validation',
      true,
    );
  }

  if (!isSiteMatch(postNavigationUrl, expectedHost)) {
    throw new CommandExecutionError(
      `Command ${commandId} requires tab host ${expectedHost} before execution: ${postNavigationUrl}`,
      'preload_host_mismatch',
      'validation',
      false,
    );
  }
}

function buildContext(
  chromeApi: ChromeLike,
  tabId: number,
  tabSessionId: string,
  site: string,
): { context: CommandExecutionContext; cleanup: () => Promise<void> } {
  const interceptionStops = new Map<string, () => Promise<void>>();

  const context: CommandExecutionContext = {
    chromeApi,
    tabId,
    tabSessionId,
    async getTabUrl() {
      const tab = await chromeApi.tabs.get(tabId);
      return tab.url ?? null;
    },
    async navigateTab(url: string) {
      await chromeApi.tabs.update(tabId, { url });
    },
    async executeScript(func, args) {
      return await executeScriptWithRetry(
        chromeApi,
        tabId,
        func,
        args,
      );
    },
    async startNetworkInterception(options = {}) {
      const networkInterceptListenerManager = getNetworkInterceptListenerManager(chromeApi);
      const requestId = `command_listener_${nanoid(10)}`;
      const updates: Array<{ updateType: string; emittedAt: string; data: unknown }> = [];
      let stopped = false;

      const subscribeOptions: NetworkInterceptListenerOptions = {
        tabSessionId,
        site,
        ...options,
      };

      await networkInterceptListenerManager.subscribe(requestId, subscribeOptions, {
        emitToRelay: false,
        onUpdate(updateType, data) {
          updates.push({
            updateType,
            emittedAt: new Date().toISOString(),
            data,
          });
        },
      });

      const stop = async (): Promise<void> => {
        if (stopped) {
          return;
        }
        stopped = true;
        interceptionStops.delete(requestId);
        await networkInterceptListenerManager.unsubscribe(requestId);
      };

      interceptionStops.set(requestId, stop);

      return {
        requestId,
        takeUpdates() {
          const snapshot = updates.slice();
          updates.length = 0;
          return snapshot;
        },
        stop,
      };
    },
  };

  const cleanup = async (): Promise<void> => {
    const stops = Array.from(interceptionStops.values());
    interceptionStops.clear();
    await Promise.allSettled(stops.map((stop) => stop()));
  };

  return { context, cleanup };
}

type TabUrlProbe = {
  url: string | null;
  pendingUrl: string | null;
};

function normalizeTabUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function readTabUrlProbe(chromeApi: ChromeLike, tabId: number): Promise<TabUrlProbe> {
  const tab = await chromeApi.tabs.get(tabId);
  return {
    url: normalizeTabUrl(tab.url),
    pendingUrl: normalizeTabUrl(tab.pendingUrl),
  };
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function isTransientFrameExecutionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const message = 'message' in error && typeof (error as { message?: unknown }).message === 'string'
    ? (error as { message: string }).message
    : '';
  if (!message) {
    return false;
  }

  return message.includes('Frame with ID 0 was removed')
    || message.includes('No frame with id 0')
    || message.includes('The tab was closed');
}

async function executeScriptWithRetry<TArgs extends unknown[], TResult>(
  chromeApi: ChromeLike,
  tabId: number,
  func: (...args: TArgs) => TResult,
  args: TArgs,
): Promise<TResult> {
  const maxAttempts = 4;
  const retryDelayMs = 150;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await chromeApi.scripting.executeScript({
        target: { tabId },
        func,
        args,
      });
      return result[0]?.result as TResult;
    } catch (error) {
      if (!isTransientFrameExecutionError(error) || attempt >= maxAttempts) {
        throw error;
      }
      await wait(retryDelayMs);
    }
  }

  throw new Error('execute_script_retry_exhausted');
}

async function waitForCommittedTabUrl(chromeApi: ChromeLike, tabId: number): Promise<TabUrlProbe> {
  const deadline = Date.now() + TAB_URL_READY_TIMEOUT_MS;
  let lastProbe: TabUrlProbe = { url: null, pendingUrl: null };

  while (Date.now() <= deadline) {
    lastProbe = await readTabUrlProbe(chromeApi, tabId);
    if (lastProbe.url) {
      return lastProbe;
    }
    await wait(TAB_URL_POLL_INTERVAL_MS);
  }

  return lastProbe;
}

export function listCommandsForRuntime() {
  return listCommandDescriptors();
}

async function executeCommandAction(
  chromeApi: ChromeLike,
  commandPayload: CommandPayload,
  tabId: number,
  tabSessionId: string,
  mode: CommandMode,
): Promise<unknown> {
  const run = parseCommandRunPayload(commandPayload);
  const bundle = findSiteBundle(run.site);
  const actionName = mode === 'test' ? 'command.test' : 'command.run';
  if (!bundle) {
    throw new CommandExecutionError(`Unknown command site: ${run.site}`, 'unknown_site', actionName, false);
  }

  const command = findSiteCommand(bundle, run.commandId);
  if (!command) {
    throw new CommandExecutionError(`Unknown command: ${run.site}/${run.commandId}`, 'unknown_command', actionName, false);
  }

  const { context: ctx, cleanup } = buildContext(chromeApi, tabId, tabSessionId, bundle.site);
  const urlProbe = await waitForCommittedTabUrl(chromeApi, tabId);
  const tabUrl = urlProbe.url;
  if (!tabUrl) {
    const pendingDetails = urlProbe.pendingUrl ? ` (pending: ${urlProbe.pendingUrl})` : '';
    throw new CommandExecutionError(
      `Tab URL not ready yet for site validation on ${bundle.site}${pendingDetails}`,
      'tab_url_not_ready',
      actionName,
      true,
    );
  }

  if (!isSiteMatch(tabUrl, bundle.site)) {
    throw new CommandExecutionError(
      `Tab URL does not match site ${bundle.site}: ${tabUrl}`,
      'site_mismatch',
      actionName,
      false,
    );
  }

  if (command.metadata.requiresDebuggerFocus === true) {
    try {
      await getDebuggerFocusEmulationManager(chromeApi).ensureForTab(tabId);
    } catch (error) {
      if (error instanceof DebuggerFocusEmulationError) {
        throw new CommandExecutionError(error.message, error.code, actionName, error.retryable);
      }

      throw new CommandExecutionError(
        'Unexpected failure while enabling debugger focus emulation',
        'debugger_focus_attach_failed',
        actionName,
        true,
      );
    }
  }

  const sanitizedInput = validateAndSanitizeCommandInput(command.metadata, run.input, command.metadata.inputFields);

  if (command.metadata.requiresAuth && run.authMode !== 'skip') {
    const check = await bundle.checkLogin.execute(ctx, sanitizedInput, run.authMode);
    const authenticated = Boolean((check as { authenticated?: unknown }).authenticated);
    if (!authenticated) {
      if (run.authMode === 'auto') {
        await bundle.gotoLogin.execute(ctx, sanitizedInput, run.authMode);
      }
      throw new CommandExecutionError(
        `Manual login required for ${bundle.site}; complete login and rerun ${run.commandId}`,
        'manual_login_required',
        'command.auth',
        false,
      );
    }
  }

  try {
    const executeCommand = (inputOverride?: Record<string, unknown>) => ensureCommandPreloadHost(
      chromeApi,
      tabId,
      command.metadata.id,
      command.metadata.preloadHost,
    ).then(() => command.execute(ctx, inputOverride ?? sanitizedInput, run.authMode));

    const commandResult = mode === 'test' && command.test
      ? await command.test(ctx, sanitizedInput, {
        authMode: run.authMode,
        execute: executeCommand,
      })
      : await executeCommand();

    return {
      site: bundle.site,
      command: command.metadata.id,
      ...((commandResult && typeof commandResult === 'object' && !Array.isArray(commandResult))
        ? commandResult as Record<string, unknown>
        : { result: commandResult }),
    };
  } finally {
    await cleanup();
  }
}

export async function runCommandAction(
  chromeApi: ChromeLike,
  commandPayload: CommandPayload,
  tabId: number,
  tabSessionId: string,
): Promise<unknown> {
  return executeCommandAction(chromeApi, commandPayload, tabId, tabSessionId, 'run');
}

export async function runCommandTestAction(
  chromeApi: ChromeLike,
  commandPayload: CommandPayload,
  tabId: number,
  tabSessionId: string,
): Promise<unknown> {
  return executeCommandAction(chromeApi, commandPayload, tabId, tabSessionId, 'test');
}
