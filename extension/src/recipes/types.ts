import type { RecipeAuthMode, RecipeDescriptor } from '@telepat/otto-protocol';

type ChromeLike = typeof chrome;

export type RecipeExecutionContext = {
  chromeApi: ChromeLike;
  tabId: number;
  tabSessionId: string;
  getTabUrl: () => Promise<string | null>;
  navigateTab: (url: string) => Promise<void>;
  executeScript: <TArgs extends unknown[], TResult>(
    func: (...args: TArgs) => TResult,
    args: TArgs,
  ) => Promise<TResult>;
};

export type SiteRecipe = {
  metadata: RecipeDescriptor;
  execute: (ctx: RecipeExecutionContext, input: Record<string, unknown>, authMode: RecipeAuthMode) => Promise<unknown>;
};

export type SiteRecipeBundle = {
  site: string;
  checkLogin: SiteRecipe;
  gotoLogin: SiteRecipe;
  recipes: SiteRecipe[];
};
