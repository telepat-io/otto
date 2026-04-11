import { nanoid } from 'nanoid';
import type {
  NetworkInterceptListenerOptions,
  NetworkInterceptListenerUpdate,
  NetworkInterceptMode,
} from '@telepat/otto-protocol';
import { isSiteMatch } from '../../commands/index.js';

type ChromeLike = typeof chrome;

type SubscriptionState = {
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

type SubscriptionHooks = {
  emitToRelay?: boolean;
  onUpdate?: (updateType: string, data: unknown) => void | Promise<void>;
};

type TabState = {
  tabId: number;
  attached: boolean;
  ownsAttachment: boolean;
  subscriptions: Set<string>;
};

type ResponseMetadata = {
  url: string;
  status: number;
  mimeType?: string;
  method?: string;
  responseHeaders?: Record<string, string>;
  requestHeaders?: Record<string, string>;
};

type WebSocketMetadata = {
  url: string;
};

async function emitDebugLog(chromeApi: ChromeLike, type: string, data: Record<string, unknown>): Promise<void> {
  try {
    await chromeApi.runtime.sendMessage({
      type: 'otto.extensionLog',
      payload: {
        level: 'debug',
        type,
        data,
      },
    });
  } catch {
    // Debug logging is best-effort only.
  }
}

type FetchPausedEvent = {
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

const DEFAULT_MAX_BODY_BYTES = 256_000;
const MAX_MAX_BODY_BYTES = 2_000_000;
const HYBRID_DUPLICATE_SUPPRESSION_WINDOW_MS = 1_200;
const MAX_SIGNATURES_PER_SUBSCRIPTION = 256;
const DEFAULT_MIME_TYPES = [
  'application/json',
  'text/plain',
  'text/html',
  'text/css',
  'application/javascript',
  'text/javascript',
  'application/xml',
  'text/xml',
] as const;

function normalizeSite(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePatterns(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);

  return Array.from(new Set(normalized));
}

function normalizeHostAllowlist(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
    .filter((entry) => entry.length > 0);

  return Array.from(new Set(normalized));
}

function normalizeMimeTypes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_MIME_TYPES];
  }

  const normalized = value
    .map((entry) => (typeof entry === 'string' ? entry.trim().toLowerCase() : ''))
    .filter((entry) => entry.length > 0);

  return normalized.length > 0 ? Array.from(new Set(normalized)) : [...DEFAULT_MIME_TYPES];
}

function normalizeBodyLimit(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_MAX_BODY_BYTES;
  }
  return Math.max(1_024, Math.min(MAX_MAX_BODY_BYTES, Math.floor(value)));
}

function headerArrayToRecord(headers: Array<{ name?: string; value?: string }> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) {
    return out;
  }

  for (const header of headers) {
    const key = typeof header.name === 'string' ? header.name : '';
    if (!key) {
      continue;
    }
    out[key] = typeof header.value === 'string' ? header.value : '';
  }

  return out;
}

function getHeaderValue(headers: Record<string, string>, key: string): string | undefined {
  const lowered = key.toLowerCase();
  for (const [headerName, value] of Object.entries(headers)) {
    if (headerName.toLowerCase() === lowered) {
      return value;
    }
  }
  return undefined;
}

function redactHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (/^(authorization|cookie|set-cookie|proxy-authorization)$/i.test(key)) {
      out[key] = '<redacted>';
      continue;
    }
    out[key] = value;
  }
  return out;
}

function matchesAnyPattern(url: string, patterns: string[]): boolean {
  if (patterns.length === 0) {
    return true;
  }

  for (const pattern of patterns) {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    const regex = new RegExp(`^${escaped}$`, 'i');
    if (regex.test(url)) {
      return true;
    }
  }

  return false;
}

function approximateBodyBytes(body: string, base64Encoded: boolean): number {
  if (base64Encoded) {
    return Math.floor((body.length * 3) / 4);
  }
  return new TextEncoder().encode(body).byteLength;
}

function responseSignature(
  metadata: ResponseMetadata,
  _bodyData?: { body: string; base64Encoded: boolean },
  error?: string,
): string {
  return [
    metadata.url,
    metadata.status,
    error ?? '',
  ].join('|');
}

function clampBody(body: string, base64Encoded: boolean, maxBodyBytes: number): { body: string; truncated: boolean; bodyBytes: number } {
  const bodyBytes = approximateBodyBytes(body, base64Encoded);
  if (bodyBytes <= maxBodyBytes) {
    return { body, truncated: false, bodyBytes };
  }

  if (base64Encoded) {
    const charsLimit = Math.max(8, Math.floor((maxBodyBytes / 3) * 4));
    return {
      body: body.slice(0, charsLimit),
      truncated: true,
      bodyBytes,
    };
  }

  const bytes = new TextEncoder().encode(body);
  const limited = bytes.slice(0, maxBodyBytes);
  return {
    body: new TextDecoder().decode(limited),
    truncated: true,
    bodyBytes,
  };
}

function shouldCaptureMimeType(mimeType: string | undefined, allowed: string[]): boolean {
  if (!mimeType) {
    return false;
  }

  const normalized = mimeType.toLowerCase();
  return allowed.some((value) => normalized.startsWith(value));
}

function matchesRequestHostAllowlist(url: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) {
    return false;
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }

  return allowlist.some((allowedHost) => {
    return hostname === allowedHost || hostname.endsWith(`.${allowedHost}`);
  });
}

function normalizeMode(value: unknown): NetworkInterceptMode {
  if (value === 'fetch' || value === 'hybrid' || value === 'network') {
    return value;
  }
  return 'network';
}

async function resolveTabSession(chromeApi: ChromeLike, tabSessionId: string): Promise<{ tabId: number; tabUrl: string }> {
  const storage = await chromeApi.storage.session.get(['tabSessions']);
  const sessions = (storage.tabSessions ?? {}) as Record<string, unknown>;
  const rawTabId = sessions[tabSessionId];
  if (typeof rawTabId !== 'number') {
    throw new Error('network_listener_unknown_tab_session');
  }

  const tab = await chromeApi.tabs.get(rawTabId);
  if (!tab.id) {
    throw new Error('network_listener_tab_not_found');
  }

  const tabUrl = typeof tab.url === 'string' ? tab.url : '';
  if (!tabUrl) {
    throw new Error('network_listener_tab_url_missing');
  }

  return { tabId: tab.id, tabUrl };
}

export function createNetworkInterceptListenerManager(chromeApi: ChromeLike) {
  const subscriptions = new Map<string, SubscriptionState>();
  const tabStates = new Map<number, TabState>();
  const responseMetaByTab = new Map<number, Map<string, ResponseMetadata>>();
  const webSocketMetaByTab = new Map<number, Map<string, WebSocketMetadata>>();
  const recentFetchSignaturesBySubscription = new Map<string, Map<string, number>>();
  const recentEmittedSignaturesBySubscription = new Map<string, Map<string, number>>();

  const rememberFetchSignature = (subscriptionRequestId: string, signature: string): void => {
    const now = Date.now();
    const signatures = recentFetchSignaturesBySubscription.get(subscriptionRequestId) ?? new Map<string, number>();
    signatures.set(signature, now);

    for (const [existingSignature, timestamp] of signatures.entries()) {
      if (now - timestamp > HYBRID_DUPLICATE_SUPPRESSION_WINDOW_MS) {
        signatures.delete(existingSignature);
      }
    }

    while (signatures.size > MAX_SIGNATURES_PER_SUBSCRIPTION) {
      const oldest = signatures.keys().next().value;
      if (!oldest) {
        break;
      }
      signatures.delete(oldest);
    }

    recentFetchSignaturesBySubscription.set(subscriptionRequestId, signatures);
  };

  const hasRecentFetchSignature = (subscriptionRequestId: string, signature: string): boolean => {
    const signatures = recentFetchSignaturesBySubscription.get(subscriptionRequestId);
    if (!signatures) {
      return false;
    }

    const timestamp = signatures.get(signature);
    if (!timestamp) {
      return false;
    }

    if (Date.now() - timestamp > HYBRID_DUPLICATE_SUPPRESSION_WINDOW_MS) {
      signatures.delete(signature);
      if (signatures.size === 0) {
        recentFetchSignaturesBySubscription.delete(subscriptionRequestId);
      }
      return false;
    }

    return true;
  };

  const rememberEmittedSignature = (subscriptionRequestId: string, signature: string): void => {
    const now = Date.now();
    const signatures = recentEmittedSignaturesBySubscription.get(subscriptionRequestId) ?? new Map<string, number>();
    signatures.set(signature, now);

    for (const [existingSignature, timestamp] of signatures.entries()) {
      if (now - timestamp > HYBRID_DUPLICATE_SUPPRESSION_WINDOW_MS) {
        signatures.delete(existingSignature);
      }
    }

    while (signatures.size > MAX_SIGNATURES_PER_SUBSCRIPTION) {
      const oldest = signatures.keys().next().value;
      if (!oldest) {
        break;
      }
      signatures.delete(oldest);
    }

    recentEmittedSignaturesBySubscription.set(subscriptionRequestId, signatures);
  };

  const hasRecentEmittedSignature = (subscriptionRequestId: string, signature: string): boolean => {
    const signatures = recentEmittedSignaturesBySubscription.get(subscriptionRequestId);
    if (!signatures) {
      return false;
    }

    const timestamp = signatures.get(signature);
    if (!timestamp) {
      return false;
    }

    if (Date.now() - timestamp > HYBRID_DUPLICATE_SUPPRESSION_WINDOW_MS) {
      signatures.delete(signature);
      if (signatures.size === 0) {
        recentEmittedSignaturesBySubscription.delete(subscriptionRequestId);
      }
      return false;
    }

    return true;
  };

  const emitUpdate = async (requestId: string, updateType: string, data: unknown): Promise<void> => {
    const emittedAt = new Date().toISOString();

    try {
      await chromeApi.runtime.sendMessage({
        type: 'otto.offscreen.emitListenerUpdate',
        payload: {
          requestId,
          updateType,
          emittedAt,
          data,
        },
      });
    } catch {
      // Ignore transient offscreen routing failures.
    }

    try {
      await chromeApi.runtime.sendMessage({
        type: 'otto.listenerUpdate',
        payload: {
          requestId,
          updateType,
          emittedAt,
          data,
        },
      });
    } catch {
      // Ignore transient bridge failures.
    }
  };

  const emitSubscriptionUpdate = async (sub: SubscriptionState, updateType: string, data: unknown): Promise<void> => {
    if (sub.emitToRelay) {
      await emitUpdate(sub.requestId, updateType, data);
    }

    if (!sub.onUpdate) {
      return;
    }

    try {
      await sub.onUpdate(updateType, data);
    } catch {
      // Listener callbacks are best-effort and should not fail interception flow.
    }
  };

  const tabRequiresFetch = (tabId: number): boolean => {
    const tabState = tabStates.get(tabId);
    if (!tabState) {
      return false;
    }

    for (const requestId of tabState.subscriptions) {
      const sub = subscriptions.get(requestId);
      if (!sub) {
        continue;
      }
      if (sub.mode === 'fetch' || sub.mode === 'hybrid') {
        return true;
      }
    }
    return false;
  };

  const buildFetchPatterns = (tabId: number): Array<{ urlPattern: string; requestStage: 'Response' }> => {
    const tabState = tabStates.get(tabId);
    if (!tabState) {
      return [];
    }

    const patterns = new Set<string>();
    for (const requestId of tabState.subscriptions) {
      const sub = subscriptions.get(requestId);
      if (!sub) {
        continue;
      }
      if (sub.mode === 'network') {
        continue;
      }
      for (const pattern of sub.urlPatterns) {
        patterns.add(pattern);
      }
    }

    if (patterns.size === 0) {
      return [{ urlPattern: '*', requestStage: 'Response' }];
    }

    return Array.from(patterns).map((urlPattern) => ({
      urlPattern,
      requestStage: 'Response',
    }));
  };

  const syncDomainsForTab = async (tabId: number): Promise<void> => {
    await chromeApi.debugger.sendCommand({ tabId }, 'Network.enable', {});
    if (tabRequiresFetch(tabId)) {
      await chromeApi.debugger.sendCommand({ tabId }, 'Fetch.enable', {
        patterns: buildFetchPatterns(tabId),
      });
      return;
    }

    try {
      await chromeApi.debugger.sendCommand({ tabId }, 'Fetch.disable', {});
    } catch {
      // Ignore when Fetch was never enabled.
    }
  };

  const ensureAttached = async (tabId: number): Promise<void> => {
    await emitDebugLog(chromeApi, 'network_listener.attach_requested', {
      tabId,
    });

    const existing = tabStates.get(tabId);
    if (existing?.attached) {
      await emitDebugLog(chromeApi, 'network_listener.attach_skipped_already_attached', {
        tabId,
        ownsAttachment: existing.ownsAttachment,
      });
      await syncDomainsForTab(tabId);
      return;
    }

    let ownsAttachment = false;

    try {
      await chromeApi.debugger.attach({ tabId }, '1.3');
      ownsAttachment = true;
      await emitDebugLog(chromeApi, 'network_listener.attach_succeeded', {
        tabId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (/another debugger is already attached/i.test(message)) {
        await emitDebugLog(chromeApi, 'network_listener.attach_conflict_detected', {
          tabId,
        });
        // Another attachment may be from this extension's focus emulation path.
        // Probe command routing; if it works, reuse the existing session.
        try {
          await chromeApi.debugger.sendCommand({ tabId }, 'Network.enable', {});
          await emitDebugLog(chromeApi, 'network_listener.reused_existing_attachment', {
            tabId,
          });
        } catch {
          await emitDebugLog(chromeApi, 'network_listener.reuse_failed', {
            tabId,
            reason: 'network_enable_failed_after_attach_conflict',
          });
          throw new Error('network_listener_debugger_conflict', { cause: error });
        }
      }
      else if (/cannot access a chrome/i.test(message)) {
        await emitDebugLog(chromeApi, 'network_listener.attach_failed', {
          tabId,
          reason: 'permission_denied',
        });
        throw new Error('network_listener_debugger_permission_denied', { cause: error });
      } else {
        await emitDebugLog(chromeApi, 'network_listener.attach_failed', {
          tabId,
          reason: 'attach_failed',
        });
        throw new Error('network_listener_attach_failed', { cause: error });
      }
    }

    tabStates.set(tabId, {
      tabId,
      attached: true,
      ownsAttachment,
      subscriptions: existing?.subscriptions ?? new Set<string>(),
    });

    await syncDomainsForTab(tabId);
  };

  const maybeDetach = async (tabId: number): Promise<void> => {
    const tabState = tabStates.get(tabId);
    if (!tabState) {
      return;
    }

    if (tabState.subscriptions.size > 0) {
      await syncDomainsForTab(tabId);
      return;
    }

    if (tabState.ownsAttachment) {
      try {
        await chromeApi.debugger.detach({ tabId });
        await emitDebugLog(chromeApi, 'network_listener.detached_owned_attachment', {
          tabId,
        });
      } catch {
        // Ignore detach failures for closed tabs.
      }
    } else {
      await emitDebugLog(chromeApi, 'network_listener.detach_skipped_shared_attachment', {
        tabId,
      });
    }

    tabStates.delete(tabId);
    responseMetaByTab.delete(tabId);
  };

  const matchingSubscriptions = (
    tabId: number,
    metadata: ResponseMetadata,
  ): SubscriptionState[] => {
    const tabState = tabStates.get(tabId);
    if (!tabState) {
      return [];
    }

    const matches: SubscriptionState[] = [];
    for (const requestId of tabState.subscriptions) {
      const sub = subscriptions.get(requestId);
      if (!sub) {
        continue;
      }

      if (!matchesAnyPattern(metadata.url, sub.urlPatterns)) {
        continue;
      }
      const siteMatched = isSiteMatch(metadata.url, sub.site);
      const hostAllowed = matchesRequestHostAllowlist(metadata.url, sub.requestHostAllowlist);
      if (!siteMatched && !hostAllowed) {
        continue;
      }
      if (!shouldCaptureMimeType(metadata.mimeType, sub.mimeTypes)) {
        continue;
      }

      matches.push(sub);
    }

    return matches;
  };

  const matchingSubscriptionsForUrl = (tabId: number, url: string): SubscriptionState[] => {
    const tabState = tabStates.get(tabId);
    if (!tabState) {
      return [];
    }

    const matches: SubscriptionState[] = [];
    for (const requestId of tabState.subscriptions) {
      const sub = subscriptions.get(requestId);
      if (!sub) {
        continue;
      }

      if (!matchesAnyPattern(url, sub.urlPatterns)) {
        continue;
      }
      const siteMatched = isSiteMatch(url, sub.site);
      const hostAllowed = matchesRequestHostAllowlist(url, sub.requestHostAllowlist);
      if (!siteMatched && !hostAllowed) {
        continue;
      }

      matches.push(sub);
    }

    return matches;
  };

  const emitNetworkUpdate = async (
    sub: SubscriptionState,
    metadata: ResponseMetadata,
    requestId: string,
    source: 'network' | 'fetch',
    bodyData?: { body: string; base64Encoded: boolean },
    error?: string,
  ): Promise<void> => {
    const emittedAt = new Date().toISOString();
    const update: NetworkInterceptListenerUpdate = {
      eventId: `net_${nanoid(10)}`,
      tabSessionId: sub.tabSessionId,
      tabId: sub.tabId,
      site: sub.site,
      url: metadata.url,
      method: metadata.method,
      status: metadata.status,
      mimeType: metadata.mimeType,
      requestId,
      captureSource: source,
      emittedAt,
    };

    if (sub.includeHeaders) {
      update.requestHeaders = redactHeaders(metadata.requestHeaders);
      update.responseHeaders = redactHeaders(metadata.responseHeaders);
    }

    if (error) {
      update.error = error;
      await emitSubscriptionUpdate(sub, 'network.error', update);
      return;
    }

    if (!sub.includeBody || !bodyData) {
      await emitSubscriptionUpdate(sub, 'network.response', update);
      return;
    }

    const clamped = clampBody(bodyData.body, bodyData.base64Encoded, sub.maxBodyBytes);
    update.body = clamped.body;
    update.base64Encoded = bodyData.base64Encoded;
    update.truncated = clamped.truncated;
    update.bodyBytes = clamped.bodyBytes;

    await emitSubscriptionUpdate(sub, 'network.response', update);
  };

  const onDebuggerEvent = async (
    source: chrome.debugger.Debuggee,
    method: string,
    params?: Record<string, unknown>,
  ): Promise<void> => {
    const tabId = source.tabId;
    if (typeof tabId !== 'number') {
      return;
    }

    if (method === 'Network.responseReceived') {
      const requestId = typeof params?.requestId === 'string' ? params.requestId : '';
      const response = (params?.response ?? {}) as Record<string, unknown>;
      const request = (params?.request ?? {}) as Record<string, unknown>;
      const url = typeof response.url === 'string' ? response.url : '';
      if (!requestId || !url) {
        return;
      }

      const status = typeof response.status === 'number' ? response.status : 0;
      const mimeType = typeof response.mimeType === 'string' ? response.mimeType : undefined;
      const methodName = typeof request.method === 'string' ? request.method : undefined;
      const responseHeaders = (response.headers && typeof response.headers === 'object')
        ? response.headers as Record<string, string>
        : undefined;
      const requestHeaders = (request.headers && typeof request.headers === 'object')
        ? request.headers as Record<string, string>
        : undefined;

      if (!responseMetaByTab.has(tabId)) {
        responseMetaByTab.set(tabId, new Map<string, ResponseMetadata>());
      }
      const byRequest = responseMetaByTab.get(tabId);
      byRequest?.set(requestId, {
        url,
        status,
        mimeType,
        method: methodName,
        responseHeaders,
        requestHeaders,
      });

      if (tabStates.get(tabId)?.subscriptions.size) {
        await emitDebugLog(chromeApi, 'network_listener.response_received', {
          tabId,
          requestId,
          url,
          mimeType,
          status,
        });
      }
      return;
    }

    if (method === 'Network.loadingFinished') {
      const requestId = typeof params?.requestId === 'string' ? params.requestId : '';
      if (!requestId) {
        return;
      }

      const byRequest = responseMetaByTab.get(tabId);
      const metadata = byRequest?.get(requestId);
      if (!metadata) {
        return;
      }
      byRequest?.delete(requestId);

      const matches = matchingSubscriptions(tabId, metadata);
      if (tabStates.get(tabId)?.subscriptions.size) {
        await emitDebugLog(chromeApi, 'network_listener.loading_finished', {
          tabId,
          requestId,
          url: metadata.url,
          mimeType: metadata.mimeType,
          status: metadata.status,
          matchCount: matches.length,
        });
      }
      if (matches.length === 0) {
        return;
      }

      let bodyData: { body: string; base64Encoded: boolean } | undefined;
      let bodyError: string | undefined;

      try {
        const bodyResult = await chromeApi.debugger.sendCommand(
          { tabId },
          'Network.getResponseBody',
          { requestId },
        ) as { body?: unknown; base64Encoded?: unknown };
        if (typeof bodyResult.body === 'string') {
          bodyData = {
            body: bodyResult.body,
            base64Encoded: bodyResult.base64Encoded === true,
          };
        }
      } catch {
        bodyError = 'response_body_unavailable';
      }

      for (const sub of matches) {
        if (sub.mode === 'fetch') {
          continue;
        }

        const signature = responseSignature(metadata, bodyData, bodyError);
        if (sub.mode === 'hybrid' && !bodyError && hasRecentEmittedSignature(sub.requestId, signature)) {
          continue;
        }

        if (sub.mode === 'hybrid' && !bodyError) {
          // Let fetch-path callback settle first when events race.
          await Promise.resolve();
          if (hasRecentEmittedSignature(sub.requestId, signature) || hasRecentFetchSignature(sub.requestId, signature)) {
            continue;
          }
        }

        if (
          sub.mode === 'hybrid'
          && !bodyError
          && hasRecentFetchSignature(sub.requestId, signature)
        ) {
          continue;
        }

        await emitNetworkUpdate(sub, metadata, requestId, 'network', bodyData, bodyError);
        if (sub.mode === 'hybrid' && !bodyError) {
          rememberEmittedSignature(sub.requestId, signature);
        }
      }
      return;
    }

    if (method === 'Fetch.requestPaused') {
      const payload = (params ?? {}) as FetchPausedEvent;
      const requestId = typeof payload.requestId === 'string' ? payload.requestId : '';
      const url = typeof payload.request?.url === 'string' ? payload.request.url : '';
      if (!requestId || !url) {
        return;
      }

      const responseHeaders = headerArrayToRecord(payload.responseHeaders);
      const metadata: ResponseMetadata = {
        url,
        status: payload.responseStatusCode ?? 0,
        method: payload.request?.method,
        mimeType: getHeaderValue(responseHeaders, 'content-type'),
        responseHeaders,
        requestHeaders: payload.request?.headers,
      };

      const matches = matchingSubscriptions(tabId, metadata).filter((sub) => sub.mode === 'fetch' || sub.mode === 'hybrid');
      if (tabStates.get(tabId)?.subscriptions.size) {
        await emitDebugLog(chromeApi, 'network_listener.fetch_paused', {
          tabId,
          requestId,
          url,
          mimeType: metadata.mimeType,
          status: metadata.status,
          matchCount: matches.length,
        });
      }
      if (matches.length === 0) {
        try {
          await chromeApi.debugger.sendCommand({ tabId }, 'Fetch.continueRequest', { requestId });
        } catch {
          // Ignore continuation errors for transient races.
        }
        return;
      }

      let bodyData: { body: string; base64Encoded: boolean } | undefined;
      let bodyError: string | undefined;

      try {
        const bodyResult = await chromeApi.debugger.sendCommand(
          { tabId },
          'Fetch.getResponseBody',
          { requestId },
        ) as { body?: unknown; base64Encoded?: unknown };
        if (typeof bodyResult.body === 'string') {
          bodyData = {
            body: bodyResult.body,
            base64Encoded: bodyResult.base64Encoded === true,
          };
        }
      } catch {
        bodyError = 'response_body_unavailable';
      } finally {
        try {
          await chromeApi.debugger.sendCommand({ tabId }, 'Fetch.continueRequest', { requestId });
        } catch {
          // Ignore continuation failures when tab closes during pause.
        }
      }

      for (const sub of matches) {
        const signature = responseSignature(metadata, bodyData, bodyError);
        if (sub.mode === 'hybrid' && !bodyError && hasRecentEmittedSignature(sub.requestId, signature)) {
          continue;
        }

        if (!bodyError) {
          rememberFetchSignature(sub.requestId, signature);
        }
        await emitNetworkUpdate(sub, metadata, requestId, 'fetch', bodyData, bodyError);
        if (sub.mode === 'hybrid' && !bodyError) {
          rememberEmittedSignature(sub.requestId, signature);
        }
      }
      return;
    }

    if (method === 'Network.webSocketCreated') {
      const requestId = typeof params?.requestId === 'string' ? params.requestId : '';
      const url = typeof params?.url === 'string' ? params.url : '';
      if (!requestId || !url) {
        return;
      }

      if (!webSocketMetaByTab.has(tabId)) {
        webSocketMetaByTab.set(tabId, new Map<string, WebSocketMetadata>());
      }
      webSocketMetaByTab.get(tabId)?.set(requestId, { url });
      return;
    }

    if (method === 'Network.webSocketClosed') {
      const requestId = typeof params?.requestId === 'string' ? params.requestId : '';
      if (!requestId) {
        return;
      }
      webSocketMetaByTab.get(tabId)?.delete(requestId);
      return;
    }

    if (method === 'Network.webSocketFrameReceived') {
      const requestId = typeof params?.requestId === 'string' ? params.requestId : '';
      if (!requestId) {
        return;
      }

      const wsMeta = webSocketMetaByTab.get(tabId)?.get(requestId);
      const url = wsMeta?.url;
      if (!url) {
        return;
      }

      const frame = (params?.response ?? {}) as Record<string, unknown>;
      const payloadData = typeof frame.payloadData === 'string' ? frame.payloadData : '';
      const opcode = typeof frame.opcode === 'number' ? frame.opcode : undefined;

      const matches = matchingSubscriptionsForUrl(tabId, url);
      if (matches.length === 0) {
        return;
      }

      for (const sub of matches) {
        const update: NetworkInterceptListenerUpdate = {
          eventId: `net_${nanoid(10)}`,
          tabSessionId: sub.tabSessionId,
          tabId: sub.tabId,
          site: sub.site,
          url,
          method: 'WEBSOCKET',
          status: 101,
          mimeType: 'application/websocket',
          requestId,
          captureSource: 'network',
          emittedAt: new Date().toISOString(),
        };

        if (typeof opcode === 'number') {
          update.responseHeaders = {
            'x-websocket-opcode': String(opcode),
          };
        }

        if (sub.includeBody && payloadData) {
          const clamped = clampBody(payloadData, false, sub.maxBodyBytes);
          update.body = clamped.body;
          update.base64Encoded = false;
          update.truncated = clamped.truncated;
          update.bodyBytes = clamped.bodyBytes;
        }

        await emitSubscriptionUpdate(sub, 'network.websocket_frame', update);
      }
    }
  };

  const onDetach = async (source: chrome.debugger.Debuggee, reason: string): Promise<void> => {
    const tabId = source.tabId;
    if (typeof tabId !== 'number') {
      return;
    }

    const tabState = tabStates.get(tabId);
    if (!tabState) {
      return;
    }

    const requestIds = Array.from(tabState.subscriptions);
    for (const requestId of requestIds) {
      const sub = subscriptions.get(requestId);
      if (!sub) {
        continue;
      }
      await emitSubscriptionUpdate(sub, 'network.detached', {
        eventId: `net_${nanoid(10)}`,
        tabSessionId: sub.tabSessionId,
        tabId,
        site: sub.site,
        requestId: 'debugger_detached',
        captureSource: 'network',
        emittedAt: new Date().toISOString(),
        url: '',
        reason,
      });
      subscriptions.delete(requestId);
      recentFetchSignaturesBySubscription.delete(requestId);
      recentEmittedSignaturesBySubscription.delete(requestId);
    }

    tabStates.delete(tabId);
    responseMetaByTab.delete(tabId);
    webSocketMetaByTab.delete(tabId);
  };

  const onTabRemoved = async (tabId: number): Promise<void> => {
    const tabState = tabStates.get(tabId);
    if (!tabState) {
      return;
    }

    const requestIds = Array.from(tabState.subscriptions);
    for (const requestId of requestIds) {
      const sub = subscriptions.get(requestId);
      if (!sub) {
        continue;
      }

      await emitSubscriptionUpdate(sub, 'network.detached', {
        eventId: `net_${nanoid(10)}`,
        tabSessionId: sub.tabSessionId,
        tabId,
        site: sub.site,
        requestId: 'tab_removed',
        captureSource: 'network',
        emittedAt: new Date().toISOString(),
        url: '',
        reason: 'tab_removed',
      });

      subscriptions.delete(requestId);
      recentFetchSignaturesBySubscription.delete(requestId);
      recentEmittedSignaturesBySubscription.delete(requestId);
    }

    tabStates.delete(tabId);
    responseMetaByTab.delete(tabId);
    webSocketMetaByTab.delete(tabId);
  };

  chromeApi.debugger.onEvent.addListener((source, method, params) => {
    void onDebuggerEvent(source, method, params as Record<string, unknown> | undefined);
  });

  chromeApi.debugger.onDetach.addListener((source, reason) => {
    void onDetach(source, reason);
  });

  chromeApi.tabs.onRemoved.addListener((tabId) => {
    void onTabRemoved(tabId);
  });

  chromeApi.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status !== 'loading') {
      return;
    }

    const tabState = tabStates.get(tabId);
    if (!tabState?.attached) {
      return;
    }

    void syncDomainsForTab(tabId).catch(() => {
      // Ignore sync races during navigation and detach churn.
    });
  });

  const subscribe = async (
    requestId: string,
    options: NetworkInterceptListenerOptions,
    hooks: SubscriptionHooks = {},
  ): Promise<{ tabId: number; mode: NetworkInterceptMode; source: string }> => {
    if (subscriptions.has(requestId)) {
      throw new Error('network_listener_already_subscribed');
    }

    const tabSessionId = String(options.tabSessionId ?? '').trim();
    const site = normalizeSite(String(options.site ?? ''));
    if (!tabSessionId) {
      throw new Error('network_listener_missing_tab_session');
    }
    if (!site) {
      throw new Error('network_listener_missing_site');
    }

    const mode = normalizeMode(options.mode);
    const includeBody = options.includeBody !== false;
    const includeHeaders = options.includeHeaders === true;
    const maxBodyBytes = normalizeBodyLimit(options.maxBodyBytes);
    const mimeTypes = normalizeMimeTypes(options.mimeTypes);
    const urlPatterns = normalizePatterns(options.urlPatterns);
    const requestHostAllowlist = normalizeHostAllowlist(options.requestHostAllowlist);

    const resolved = await resolveTabSession(chromeApi, tabSessionId);
    if (!isSiteMatch(resolved.tabUrl, site)) {
      throw new Error('network_listener_site_mismatch');
    }

    const subState: SubscriptionState = {
      requestId,
      tabId: resolved.tabId,
      tabSessionId,
      site,
      urlPatterns,
      requestHostAllowlist,
      includeBody,
      includeHeaders,
      maxBodyBytes,
      mode,
      mimeTypes,
      emitToRelay: hooks.emitToRelay !== false,
      onUpdate: hooks.onUpdate,
    };

    subscriptions.set(requestId, subState);

    const tabState = tabStates.get(resolved.tabId) ?? {
      tabId: resolved.tabId,
      attached: false,
      ownsAttachment: false,
      subscriptions: new Set<string>(),
    };
    tabState.subscriptions.add(requestId);
    tabStates.set(resolved.tabId, tabState);

    try {
      await ensureAttached(resolved.tabId);
      await emitDebugLog(chromeApi, 'network_listener.subscribed', {
        requestId,
        tabId: resolved.tabId,
        tabSessionId,
        site,
        mode,
        urlPatternCount: urlPatterns.length,
        requestHostCount: requestHostAllowlist.length,
      });
    } catch (error) {
      tabState.subscriptions.delete(requestId);
      if (tabState.subscriptions.size === 0) {
        tabStates.delete(resolved.tabId);
      }
      subscriptions.delete(requestId);
      throw error;
    }

    return {
      tabId: resolved.tabId,
      mode,
      source: 'network.http_intercept',
    };
  };

  const unsubscribe = async (requestId: string): Promise<boolean> => {
    const sub = subscriptions.get(requestId);
    if (!sub) {
      return false;
    }

    subscriptions.delete(requestId);
    recentFetchSignaturesBySubscription.delete(requestId);
    recentEmittedSignaturesBySubscription.delete(requestId);

    const tabState = tabStates.get(sub.tabId);
    if (tabState) {
      tabState.subscriptions.delete(requestId);
    }

    await maybeDetach(sub.tabId);
    return true;
  };

  const unsubscribeAll = async (): Promise<void> => {
    const requestIds = Array.from(subscriptions.keys());
    for (const requestId of requestIds) {
      await unsubscribe(requestId);
    }
  };

  return {
    subscribe,
    unsubscribe,
    unsubscribeAll,
  };
}
