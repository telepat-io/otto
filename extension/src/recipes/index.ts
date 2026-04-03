import type { RecipeDescriptor } from '@telepat/otto-protocol';
import { hackerNewsRecipes } from './hackernews.com/index.js';
import { redditRecipes } from './reddit.com/index.js';
import type { SiteRecipe, SiteRecipeBundle } from './types.js';

const bundles = [redditRecipes, hackerNewsRecipes];

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

export function isSiteMatch(url: string | null | undefined, expectedSite: string): boolean {
  if (!url) return false;
  try {
    const hostname = normalizeHost(new URL(url).hostname);
    const expected = normalizeHost(expectedSite);
    return hostname === expected || hostname.endsWith(`.${expected}`);
  } catch {
    return false;
  }
}

export function listRecipeDescriptors(): RecipeDescriptor[] {
  const descriptors: RecipeDescriptor[] = [];
  for (const bundle of bundles) {
    descriptors.push(bundle.checkLogin.metadata, bundle.gotoLogin.metadata);
    for (const recipe of bundle.recipes) {
      descriptors.push(recipe.metadata);
    }
  }
  return descriptors;
}

export function findSiteBundle(site: string): SiteRecipeBundle | undefined {
  const normalized = normalizeHost(site);
  return bundles.find((bundle) => normalizeHost(bundle.site) === normalized);
}

export function findSiteRecipe(bundle: SiteRecipeBundle, recipeId: string): SiteRecipe | undefined {
  return bundle.recipes.find((recipe) => recipe.metadata.id === recipeId);
}
