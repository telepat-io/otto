import type { CommandDescriptor } from '@telepat/otto-protocol';
import { hackerNewsCommands } from './hackernews.com/index.js';
import { redditCommands } from './reddit.com/index.js';
import type { SiteCommand, SiteCommandBundle } from './types.js';

const bundles = [redditCommands, hackerNewsCommands];

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

export function listCommandDescriptors(): CommandDescriptor[] {
  const descriptors: CommandDescriptor[] = [];
  for (const bundle of bundles) {
    descriptors.push(bundle.checkLogin.metadata, bundle.gotoLogin.metadata);
    for (const command of bundle.commands) {
      descriptors.push(command.metadata);
    }
  }
  return descriptors;
}

export function findSiteBundle(site: string): SiteCommandBundle | undefined {
  const normalized = normalizeHost(site);
  return bundles.find((bundle) => normalizeHost(bundle.site) === normalized);
}

export function findSiteCommand(bundle: SiteCommandBundle, commandId: string): SiteCommand | undefined {
  return bundle.commands.find((command) => command.metadata.id === commandId);
}
