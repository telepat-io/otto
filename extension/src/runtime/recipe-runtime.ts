import type { CommandPayload, RecipeAuthMode, RecipeRunPayload } from '@telepat/otto-protocol';
import { findSiteBundle, findSiteRecipe, isSiteMatch, listRecipeDescriptors } from '../recipes/index.js';
import type { RecipeExecutionContext } from '../recipes/types.js';
import { CommandExecutionError } from './execution-error.js';

type ChromeLike = typeof chrome;

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
  const tabUrl = await ctx.getTabUrl();
  if (!isSiteMatch(tabUrl, bundle.site)) {
    throw new CommandExecutionError(
      `Tab URL does not match site ${bundle.site}: ${tabUrl ?? 'unknown'}`,
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
