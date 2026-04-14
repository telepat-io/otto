---
title: Command Authoring Templates
sidebar_position: 9
---

# Command Authoring Templates

Last Updated: 2026-04-14  
Owner: Browser Runtime

Ready-to-copy templates for common command implementation patterns.

## Template 1: Minimal Read Command

Use when command reads page state and returns structured output.

```ts
import type { SiteCommand } from '../types.js';

export const getItemsCommand: SiteCommand = {
  metadata: {
    site: 'example.com',
    id: 'getItems',
    displayName: 'Get Items',
    description: 'Collect visible items from page.',
    tags: ['content'],
    requiresAuth: false,
    inputFields: [
      { name: 'limit', type: 'number', optional: true, description: 'Max items' }
    ]
  },
  async execute(ctx, input) {
    const limit = Number((input as { limit?: number }).limit ?? 20);
    const items = await ctx.executeScript((max: number) => {
      return Array.from(document.querySelectorAll('[data-item]'))
        .slice(0, max)
        .map((el) => ({ text: (el.textContent ?? '').trim() }));
    }, [limit]);

    return { count: items.length, items };
  }
};
```

## Template 2: Auth-required Command

Use when command depends on authenticated website session.

```ts
import type { SiteCommand } from '../types.js';

export const getPrivateDataCommand: SiteCommand = {
  metadata: {
    site: 'example.com',
    id: 'getPrivateData',
    displayName: 'Get Private Data',
    description: 'Reads authenticated account data.',
    tags: ['auth'],
    requiresAuth: true,
    preloadHost: 'example.com',
    inputFields: []
  },
  async execute(ctx) {
    const profile = await ctx.executeScript(async () => {
      const res = await fetch('/api/me');
      if (!res.ok) {
        throw new Error('profile_fetch_failed');
      }
      return await res.json();
    });

    return { profile };
  }
};
```

## Template 3: Stream-capable Command with test Hook

Use when command exposes listener-driven updates via `command.test`.

```ts
import type { SiteCommand } from '../types.js';

function createListenerOptions(tabSessionId: string) {
  return {
    tabSessionId,
    site: 'example.com',
    streamAdapter: 'example.events.v1',
    mode: 'fetch',
    includeBody: true,
    urlPatterns: ['https://api.example.com/events*']
  };
}

export const getEventsCommand: SiteCommand = {
  metadata: {
    site: 'example.com',
    id: 'getEvents',
    displayName: 'Get Events',
    description: 'Streams event updates.',
    tags: ['stream'],
    requiresAuth: true,
    requiresDebuggerFocus: true,
    inputFields: []
  },
  async execute(ctx) {
    const snapshot = await ctx.executeScript(async () => {
      const res = await fetch('/api/events/snapshot');
      return await res.json();
    });
    return { snapshot };
  },
  async test(ctx, input, helpers) {
    const options = createListenerOptions(ctx.tabSessionId);
    const intercept = await ctx.startNetworkInterception(options);

    try {
      await ctx.navigateTab('https://example.com/app');
      const updates = intercept.takeUpdates();
      if (updates.length > 0) {
        return {
          ready: true,
          stream: { listeners: [{ listener: 'network.http_intercept', options }] }
        };
      }
    } finally {
      await intercept.stop();
    }

    const bufferedResult = await helpers.execute(input);
    return {
      ready: false,
      fallback: { strategy: 'command_poll', reason: 'intercept_probe_unavailable' },
      bufferedResult
    };
  }
};
```

## Template 4: Site Bundle Registration

```ts
import type { SiteCommandBundle } from '../types.js';
import { checkLoginCommand } from './check-login.js';
import { gotoLoginCommand } from './goto-login.js';
import { getItemsCommand } from './get-items.js';

export const exampleCommands: SiteCommandBundle = {
  site: 'example.com',
  checkLogin: checkLoginCommand,
  gotoLogin: gotoLoginCommand,
  commands: [getItemsCommand]
};
```

## Required Validation Checklist

- [ ] metadata fields are accurate and minimal
- [ ] input schema matches runtime behavior
- [ ] output does not expose sensitive data
- [ ] stream hooks return deterministic listener manifests
- [ ] fallback path is explicit and bounded
- [ ] tests cover success and deterministic failure paths

## Related Docs

- guides/command-authoring
- guides/listener-development
- reference/snippets
- technical/testing
