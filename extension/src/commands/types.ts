import type {
  NetworkInterceptListenerOptions,
  CommandAuthMode,
  CommandDescriptor,
  CommandTestStream,
} from '@telepat/otto-protocol';

type ChromeLike = typeof chrome;

export type CommandNetworkInterceptionOptions = Omit<NetworkInterceptListenerOptions, 'tabSessionId' | 'site'>;

export type CommandNetworkInterceptionEvent = {
  updateType: string;
  emittedAt: string;
  data: unknown;
};

export type CommandNetworkInterceptionHandle = {
  requestId: string;
  takeUpdates: () => CommandNetworkInterceptionEvent[];
  stop: () => Promise<void>;
};

export type CommandExecutionContext = {
  chromeApi: ChromeLike;
  tabId: number;
  tabSessionId: string;
  getTabUrl: () => Promise<string | null>;
  navigateTab: (url: string) => Promise<void>;
  executeScript: <TArgs extends unknown[], TResult>(
    func: (...args: TArgs) => TResult,
    args: TArgs,
  ) => Promise<TResult>;
  startNetworkInterception: (options?: CommandNetworkInterceptionOptions) => Promise<CommandNetworkInterceptionHandle>;
};

export type CommandExecuteFn = (
  ctx: CommandExecutionContext,
  input: Record<string, unknown>,
  authMode: CommandAuthMode,
) => Promise<unknown>;

export type CommandTestFn = (
  ctx: CommandExecutionContext,
  input: Record<string, unknown>,
  helpers: {
    authMode: CommandAuthMode;
    execute: (inputOverride?: Record<string, unknown>) => Promise<unknown>;
  },
) => Promise<unknown | { stream?: CommandTestStream }>;

export type SiteCommand = {
  metadata: CommandDescriptor;
  execute: CommandExecuteFn;
  test?: CommandTestFn;
};

export type SiteCommandBundle = {
  site: string;
  checkLogin: SiteCommand;
  gotoLogin: SiteCommand;
  commands: SiteCommand[];
};
