import type {
  NetworkInterceptListenerOptions,
  RecipeAuthMode,
  RecipeDescriptor,
  RecipeTestStream,
} from '@telepat/otto-protocol';

type ChromeLike = typeof chrome;

export type RecipeNetworkInterceptionOptions = Omit<NetworkInterceptListenerOptions, 'tabSessionId' | 'site'>;

export type RecipeNetworkInterceptionEvent = {
  updateType: string;
  emittedAt: string;
  data: unknown;
};

export type RecipeNetworkInterceptionHandle = {
  requestId: string;
  takeUpdates: () => RecipeNetworkInterceptionEvent[];
  stop: () => Promise<void>;
};

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
  startNetworkInterception: (options?: RecipeNetworkInterceptionOptions) => Promise<RecipeNetworkInterceptionHandle>;
};

export type RecipeExecuteFn = (
  ctx: RecipeExecutionContext,
  input: Record<string, unknown>,
  authMode: RecipeAuthMode,
) => Promise<unknown>;

export type RecipeTestFn = (
  ctx: RecipeExecutionContext,
  input: Record<string, unknown>,
  helpers: {
    authMode: RecipeAuthMode;
    execute: (inputOverride?: Record<string, unknown>) => Promise<unknown>;
  },
) => Promise<unknown | { stream?: RecipeTestStream }>;

export type SiteRecipe = {
  metadata: RecipeDescriptor;
  execute: RecipeExecuteFn;
  test?: RecipeTestFn;
};

export type SiteRecipeBundle = {
  site: string;
  checkLogin: SiteRecipe;
  gotoLogin: SiteRecipe;
  recipes: SiteRecipe[];
};
