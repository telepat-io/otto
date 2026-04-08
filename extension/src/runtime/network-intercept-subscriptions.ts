import { isSiteMatch } from '../commands/index.js';
import {
  matchesAnyPattern,
  matchesRequestHostAllowlist,
  shouldCaptureMimeType,
} from './network-intercept-utils.js';
import type {
  ResponseMetadata,
  SubscriptionState,
  TabState,
} from './network-intercept-types.js';

export function tabRequiresFetch(
  tabStates: Map<number, TabState>,
  subscriptions: Map<string, SubscriptionState>,
  tabId: number,
): boolean {
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
}

export function buildFetchPatterns(
  tabStates: Map<number, TabState>,
  subscriptions: Map<string, SubscriptionState>,
  tabId: number,
): Array<{ urlPattern: string; requestStage: 'Response' }> {
  const tabState = tabStates.get(tabId);
  if (!tabState) {
    return [];
  }

  const patterns = new Set<string>();
  for (const requestId of tabState.subscriptions) {
    const sub = subscriptions.get(requestId);
    if (!sub || sub.mode === 'network') {
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
}

export function matchingSubscriptions(
  tabStates: Map<number, TabState>,
  subscriptions: Map<string, SubscriptionState>,
  tabId: number,
  metadata: ResponseMetadata,
): SubscriptionState[] {
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
}

export function matchingSubscriptionsForUrl(
  tabStates: Map<number, TabState>,
  subscriptions: Map<string, SubscriptionState>,
  tabId: number,
  url: string,
): SubscriptionState[] {
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
}