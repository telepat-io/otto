# Command Authoring Templates

Last Updated: 2026-04-14
Owner: Browser Runtime

Copy-ready templates for common command types.

## Minimal read command template

```ts
import type { SiteCommand } from '../types.js';

export const getItemsCommand: SiteCommand = {
  metadata: {
    site: 'example.com',
    id: 'getItems',
    displayName: 'Get Items',
    requiresAuth: false,
    inputFields: [{ name: 'limit', type: 'number', optional: true, description: 'Max items' }]
  },
  async execute(ctx, input) {
    const limit = Number((input as { limit?: number }).limit ?? 20);
    const items = await ctx.executeScript((max: number) => {
      return Array.from(document.querySelectorAll('[data-item]')).slice(0, max).map((el) => ({
        text: (el.textContent ?? '').trim()
      }));
    }, [limit]);
    return { count: items.length, items };
  }
};
```

## Auth-required command template

```ts
import type { SiteCommand } from '../types.js';

export const getPrivateDataCommand: SiteCommand = {
  metadata: {
    site: 'example.com',
    id: 'getPrivateData',
    displayName: 'Get Private Data',
    requiresAuth: true,
    preloadHost: 'example.com',
    inputFields: []
  },
  async execute(ctx) {
    const profile = await ctx.executeScript(async () => {
      const res = await fetch('/api/me');
      if (!res.ok) throw new Error('profile_fetch_failed');
      return await res.json();
    });
    return { profile };
  }
};
```

## Stream command test-hook template

```ts
async test(ctx, input, helpers) {
  const options = {
    tabSessionId: ctx.tabSessionId,
    site: 'example.com',
    streamAdapter: 'example.events.v1',
    mode: 'fetch',
    includeBody: true,
    urlPatterns: ['https://api.example.com/events*']
  };

  const intercept = await ctx.startNetworkInterception(options);
  try {
    await ctx.navigateTab('https://example.com/app');
    const updates = intercept.takeUpdates();
    if (updates.length > 0) {
      return { ready: true, stream: { listeners: [{ listener: 'network.http_intercept', options }] } };
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
```

## Related Docs

- docs/command-authoring.md
- docs/listener-development.md
- docs/snippets.md
