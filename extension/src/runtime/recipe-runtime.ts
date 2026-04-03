import type { CommandPayload, RecipeAuthMode, RecipeRunPayload } from '@telepat/otto-protocol';
import { findSiteBundle, findSiteRecipe, isSiteMatch, listRecipeDescriptors } from '../recipes/index.js';
import type { RecipeExecutionContext } from '../recipes/types.js';
import { CommandExecutionError } from './execution-error.js';

type ChromeLike = typeof chrome;

const TAB_URL_READY_TIMEOUT_MS = 1200;
const TAB_URL_POLL_INTERVAL_MS = 75;

type RecipeRun = {
  site: string;
  recipe: string;
  input: Record<string, unknown>;
  authMode: RecipeAuthMode;
};

function parseRecipeRunPayload(command: CommandPayload): RecipeRun {
  if (command.action === 'recipe.reddit_feed') {
    return {
      site: 'reddit.com',
      recipe: 'getFeed',
      input: command.payload,
      authMode: 'auto',
    };
  }

  const payload = command.payload as Partial<RecipeRunPayload>;
  const site = String(payload.site ?? '');
  const recipe = String(payload.recipe ?? '');
  const authMode = payload.authMode ?? 'auto';

  if (!site) {
    throw new CommandExecutionError('recipe.run requires payload.site', 'missing_site', 'validation', false);
  }
  if (!recipe) {
    throw new CommandExecutionError('recipe.run requires payload.recipe', 'missing_recipe', 'validation', false);
  }
  if (!['auto', 'strict_fail', 'skip'].includes(authMode)) {
    throw new CommandExecutionError('recipe.run payload.authMode must be one of auto|strict_fail|skip', 'invalid_auth_mode', 'validation', false);
  }

  const input = payload.input && typeof payload.input === 'object' && !Array.isArray(payload.input)
    ? (payload.input as Record<string, unknown>)
    : {};

  return { site, recipe, input, authMode };
}

function buildContext(chromeApi: ChromeLike, tabId: number, tabSessionId: string): RecipeExecutionContext {
  return {
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
  };
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

export async function runRecipeCommand(
  chromeApi: ChromeLike,
  command: CommandPayload,
  tabId: number,
  tabSessionId: string,
): Promise<unknown> {
  const run = parseRecipeRunPayload(command);
  const bundle = findSiteBundle(run.site);
  if (!bundle) {
    throw new CommandExecutionError(`Unknown recipe site: ${run.site}`, 'unknown_site', 'recipe.run', false);
  }

  const recipe = findSiteRecipe(bundle, run.recipe);
  if (!recipe) {
    throw new CommandExecutionError(`Unknown recipe: ${run.site}/${run.recipe}`, 'unknown_recipe', 'recipe.run', false);
  }

  const ctx = buildContext(chromeApi, tabId, tabSessionId);
  const urlProbe = await waitForCommittedTabUrl(chromeApi, tabId);
  const tabUrl = urlProbe.url;
  if (!tabUrl) {
    const pendingDetails = urlProbe.pendingUrl ? ` (pending: ${urlProbe.pendingUrl})` : '';
    throw new CommandExecutionError(
      `Tab URL not ready yet for site validation on ${bundle.site}${pendingDetails}`,
      'tab_url_not_ready',
      'recipe.run',
      true,
    );
  }

  if (!isSiteMatch(tabUrl, bundle.site)) {
    throw new CommandExecutionError(
      `Tab URL does not match site ${bundle.site}: ${tabUrl}`,
      'site_mismatch',
      'recipe.run',
      false,
    );
  }

  if (recipe.metadata.requiresAuth && run.authMode !== 'skip') {
    const check = await bundle.checkLogin.execute(ctx, run.input, run.authMode);
    const authenticated = Boolean((check as { authenticated?: unknown }).authenticated);
    if (!authenticated) {
      if (run.authMode === 'auto') {
        await bundle.gotoLogin.execute(ctx, run.input, run.authMode);
      }
      throw new CommandExecutionError(
        `Manual login required for ${bundle.site}; complete login and rerun ${run.recipe}`,
        'manual_login_required',
        'recipe.auth',
        false,
      );
    }
  }

  const recipeResult = await recipe.execute(ctx, run.input, run.authMode);
  return {
    site: bundle.site,
    recipe: recipe.metadata.id,
    ...((recipeResult && typeof recipeResult === 'object' && !Array.isArray(recipeResult))
      ? recipeResult as Record<string, unknown>
      : { result: recipeResult }),
  };
}
