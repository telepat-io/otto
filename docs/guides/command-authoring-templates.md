---
title: Command Authoring Templates
sidebar_position: 4
description: Copy-ready TypeScript templates for minimal read commands, auth-required commands, and stream command test hooks.
keywords:
  - command template
  - site command
  - stream command
  - auth required command
  - typescript template
---

# Command Authoring Templates

This page provides copy-ready templates for the three most common command types. Copy the template that matches your use case and fill in site-specific logic.

For implementation details, see [Command Authoring](./command-authoring.md).

## Template index

| Template | When to use |
|---|---|
| [Minimal read command](#minimal-read-command) | Reading public data from a page without auth or network interception |
| [Auth-required command](#auth-required-command) | Reading private data that requires the user to be logged in |
| [Stream command test hook](#stream-command-test-hook) | Commands that declare a network interception stream via `command.test` |

## Minimal read command

Use this for public page data extraction. No auth preflight, no stream setup.

```typescript
import type { SiteCommand } from '../types.js';

export const getItemsCommand: SiteCommand = {
  metadata: {
    site: 'example.com',
    id: 'getItems',
    displayName: 'Get Items',
    requiresAuth: false,
    inputFields: [
      { name: 'limit', type: 'number', optional: true, description: 'Max items to return' }
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

## Auth-required command

Use this when the command requires the user to be logged into the site. Runtime runs `checkLogin` before `execute` and may emit `manual_login_required` if the user is not authenticated.

```typescript
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

:::warning
Never automate credential submission. If the user is not logged in, `requiresAuth: true` triggers `manual_login_required` and pauses execution for the user to log in manually.
:::

## Stream command test hook

Use this for commands that declare a network interception stream via `command.test`. The hook runs a bounded probe to confirm traffic is available before committing to the stream path. If the probe fails, it falls back to `execute`.

```typescript
import type { SiteCommand } from '../types.js';

export const getChatMessagesCommand: SiteCommand = {
  metadata: {
    site: 'example.com',
    id: 'getChatMessages',
    displayName: 'Get Chat Messages',
    requiresAuth: true,
    preloadHost: 'chat.example.com',
    inputFields: []
  },
  async execute(ctx) {
    // Fallback: return buffered messages via DOM or fetch
    return { messages: [] };
  },
  async test(ctx, input, helpers) {
    const options = {
      tabSessionId: ctx.tabSessionId,
      site: 'example.com',
      streamAdapter: 'example.chat.v1',
      mode: 'fetch' as const,
      includeBody: true,
      urlPatterns: ['https://api.example.com/chat/events*']
    };

    const intercept = await ctx.startNetworkInterception(options);
    try {
      await ctx.navigateTab('https://chat.example.com');
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

    // Probe found no traffic — fall back to execute
    const bufferedResult = await helpers.execute(input);
    return {
      ready: false,
      fallback: { strategy: 'command_poll', reason: 'intercept_probe_unavailable' },
      bufferedResult
    };
  }
};
```

## Next steps

- [Command Authoring](./command-authoring.md) — full implementation guide.
- [Listener Development](./listener-development.md) — stream integration patterns.
- [Reusable Snippets](../snippets.md) — copy-paste curl and WebSocket examples.
