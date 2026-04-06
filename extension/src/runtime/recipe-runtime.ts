import { nanoid } from 'nanoid';
import type {
  CommandPayload,
  NetworkInterceptListenerOptions,
  RecipeAuthMode,
  RecipeDescriptor,
  RecipeInputFieldDescriptor,
  RecipeInputFieldType,
  RecipeRunPayload,
} from '@telepat/otto-protocol';
import { findSiteBundle, findSiteRecipe, isSiteMatch, listRecipeDescriptors } from '../recipes/index.js';
import type { RecipeExecutionContext } from '../recipes/types.js';
import { CommandExecutionError } from './execution-error.js';
import { getNetworkInterceptListenerManager } from './listener-managers.js';

type ChromeLike = typeof chrome;

const TAB_URL_READY_TIMEOUT_MS = 1200;
const TAB_URL_POLL_INTERVAL_MS = 75;

type RecipeRun = {
  site: string;
  recipe: string;
  input: Record<string, unknown>;
  authMode: RecipeAuthMode;
};

const RECIPE_INPUT_TYPES: RecipeInputFieldType[] = ['string', 'number', 'boolean', 'object', 'array'];

type RecipeCommandMode = 'run' | 'test';

function parseRecipeRunPayload(command: CommandPayload): RecipeRun {
  if (command.action === 'recipe.reddit_feed') {
    return {
      site: 'reddit.com',
      recipe: 'getFeed',
      input: {},
      authMode: 'auto',
    };
  }

  const payload = command.payload as Partial<RecipeRunPayload>;
  const actionName = command.action === 'recipe.test' ? 'recipe.test' : 'recipe.run';
  const site = String(payload.site ?? '');
  const recipe = String(payload.recipe ?? '');
  const authMode = payload.authMode ?? 'auto';

  if (!site) {
    throw new CommandExecutionError(`${actionName} requires payload.site`, 'missing_site', 'validation', false);
  }
  if (!recipe) {
    throw new CommandExecutionError(`${actionName} requires payload.recipe`, 'missing_recipe', 'validation', false);
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

  return { site, recipe, input, authMode };
}

function normalizeRecipeInputFieldName(name: string): string {
  return name.trim();
}

function isSupportedRecipeInputType(value: string): value is RecipeInputFieldType {
  return RECIPE_INPUT_TYPES.includes(value as RecipeInputFieldType);
}

function isTypeMatch(value: unknown, expectedType: RecipeInputFieldType): boolean {
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

function validateAndSanitizeRecipeInput(
  metadata: RecipeDescriptor,
  input: Record<string, unknown>,
  inputFields: RecipeInputFieldDescriptor[] | undefined,
): Record<string, unknown> {
  const recipeId = metadata.id;

  if (!inputFields) {
    return input;
  }

  const normalizedFields = inputFields.map((field) => ({
    ...field,
    name: normalizeRecipeInputFieldName(field.name),
  }));

  const fieldByName = new Map<string, RecipeInputFieldDescriptor>();
  for (const field of normalizedFields) {
    if (!field.name) {
      throw new CommandExecutionError(
        `Recipe ${recipeId} has an input field with an empty name`,
        'invalid_recipe_input_schema',
        'validation',
        false,
      );
    }
    if (!isSupportedRecipeInputType(field.type)) {
      throw new CommandExecutionError(
        `Recipe ${recipeId} has unsupported input type "${field.type}" for field ${field.name}`,
        'invalid_recipe_input_schema',
        'validation',
        false,
      );
    }
    if (fieldByName.has(field.name)) {
      throw new CommandExecutionError(
        `Recipe ${recipeId} has duplicated input field ${field.name}`,
        'invalid_recipe_input_schema',
        'validation',
        false,
      );
    }
    fieldByName.set(field.name, field);
  }

  const unknownFields = Object.keys(input).filter((key) => !fieldByName.has(key));
  if (unknownFields.length > 0) {
    throw new CommandExecutionError(
      `Recipe ${recipeId} does not support input field(s): ${unknownFields.join(', ')}`,
      'unexpected_recipe_input',
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
          `Recipe ${recipeId} requires input.${field.name}`,
          'missing_recipe_input',
          'validation',
          false,
        );
      }
      continue;
    }

    const value = input[field.name];
    if (!isTypeMatch(value, field.type)) {
      throw new CommandExecutionError(
        `Recipe ${recipeId} expects input.${field.name} to be ${field.type}`,
        'invalid_recipe_input_type',
        'validation',
        false,
      );
    }
    sanitized[field.name] = value;
  }

  const atLeastOneOf = Array.isArray(metadata.inputAtLeastOneOf)
    ? metadata.inputAtLeastOneOf
      .map((name) => normalizeRecipeInputFieldName(String(name ?? '')))
      .filter((name) => name.length > 0)
    : [];

  if (atLeastOneOf.length > 0) {
    const hasAny = atLeastOneOf.some((name) => Object.prototype.hasOwnProperty.call(sanitized, name));
    if (!hasAny) {
      throw new CommandExecutionError(
        `Recipe ${recipeId} requires at least one of: ${atLeastOneOf.join(', ')}`,
        'missing_recipe_input_one_of',
        'validation',
        false,
      );
    }
  }

  return sanitized;
}

async function ensureRecipePreloadHost(
  chromeApi: ChromeLike,
  tabId: number,
  recipeId: string,
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
      `Recipe ${recipeId} requires tab host ${expectedHost} before execution: ${postNavigationUrl}`,
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
): { context: RecipeExecutionContext; cleanup: () => Promise<void> } {
  const interceptionStops = new Map<string, () => Promise<void>>();

  const context: RecipeExecutionContext = {
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
      const result = await chromeApi.scripting.executeScript({
        target: { tabId },
        func,
        args,
      });
      return result[0]?.result as Awaited<ReturnType<typeof func>>;
    },
    async startNetworkInterception(options = {}) {
      const networkInterceptListenerManager = getNetworkInterceptListenerManager(chromeApi);
      const requestId = `recipe_listener_${nanoid(10)}`;
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

export function listRecipesForRuntime() {
  return listRecipeDescriptors();
}

async function executeRecipeCommand(
  chromeApi: ChromeLike,
  command: CommandPayload,
  tabId: number,
  tabSessionId: string,
  mode: RecipeCommandMode,
): Promise<unknown> {
  const run = parseRecipeRunPayload(command);
  const bundle = findSiteBundle(run.site);
  const actionName = mode === 'test' ? 'recipe.test' : 'recipe.run';
  if (!bundle) {
    throw new CommandExecutionError(`Unknown recipe site: ${run.site}`, 'unknown_site', actionName, false);
  }

  const recipe = findSiteRecipe(bundle, run.recipe);
  if (!recipe) {
    throw new CommandExecutionError(`Unknown recipe: ${run.site}/${run.recipe}`, 'unknown_recipe', actionName, false);
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

  const sanitizedInput = validateAndSanitizeRecipeInput(recipe.metadata, run.input, recipe.metadata.inputFields);

  if (recipe.metadata.requiresAuth && run.authMode !== 'skip') {
    const check = await bundle.checkLogin.execute(ctx, sanitizedInput, run.authMode);
    const authenticated = Boolean((check as { authenticated?: unknown }).authenticated);
    if (!authenticated) {
      if (run.authMode === 'auto') {
        await bundle.gotoLogin.execute(ctx, sanitizedInput, run.authMode);
      }
      throw new CommandExecutionError(
        `Manual login required for ${bundle.site}; complete login and rerun ${run.recipe}`,
        'manual_login_required',
        'recipe.auth',
        false,
      );
    }
  }

  try {
    const executeRecipe = (inputOverride?: Record<string, unknown>) => ensureRecipePreloadHost(
      chromeApi,
      tabId,
      recipe.metadata.id,
      recipe.metadata.preloadHost,
    ).then(() => recipe.execute(ctx, inputOverride ?? sanitizedInput, run.authMode));

    const recipeResult = mode === 'test' && recipe.test
      ? await recipe.test(ctx, sanitizedInput, {
        authMode: run.authMode,
        execute: executeRecipe,
      })
      : await executeRecipe();

    return {
      site: bundle.site,
      recipe: recipe.metadata.id,
      ...((recipeResult && typeof recipeResult === 'object' && !Array.isArray(recipeResult))
        ? recipeResult as Record<string, unknown>
        : { result: recipeResult }),
    };
  } finally {
    await cleanup();
  }
}

export async function runRecipeCommand(
  chromeApi: ChromeLike,
  command: CommandPayload,
  tabId: number,
  tabSessionId: string,
): Promise<unknown> {
  return executeRecipeCommand(chromeApi, command, tabId, tabSessionId, 'run');
}

export async function runRecipeTestCommand(
  chromeApi: ChromeLike,
  command: CommandPayload,
  tabId: number,
  tabSessionId: string,
): Promise<unknown> {
  return executeRecipeCommand(chromeApi, command, tabId, tabSessionId, 'test');
}
