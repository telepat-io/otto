import type { NetworkInterceptMode } from '@telepat/otto-protocol';

export type ChromeLike = typeof chrome;

export type SubscriptionState = {
  requestId: string;
  tabId: number;
  tabSessionId: string;
  site: string;
  urlPatterns: string[];
  requestHostAllowlist: string[];
  includeBody: boolean;
  includeHeaders: boolean;
  maxBodyBytes: number;
  mode: NetworkInterceptMode;
  mimeTypes: string[];
  emitToRelay: boolean;
  onUpdate?: (updateType: string, data: unknown) => void | Promise<void>;
};

export type SubscriptionHooks = {
  emitToRelay?: boolean;
  onUpdate?: (updateType: string, data: unknown) => void | Promise<void>;
};

export type TabState = {
  tabId: number;
  attached: boolean;
  subscriptions: Set<string>;
};

export type ResponseMetadata = {
  url: string;
  status: number;
  mimeType?: string;
  method?: string;
  responseHeaders?: Record<string, string>;
  requestHeaders?: Record<string, string>;
};

export type WebSocketMetadata = {
  url: string;
};

export type FetchPausedEvent = {
  requestId: string;
  request?: {
    url?: string;
    method?: string;
    headers?: Record<string, string>;
  };
  responseStatusCode?: number;
  responseHeaders?: Array<{ name?: string; value?: string }>;
  responseStatusText?: string;
  resourceType?: string;
};