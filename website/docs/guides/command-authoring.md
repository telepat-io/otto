---
title: Command Authoring
sidebar_position: 3
---

# Command Authoring Guide

Last Updated: 2026-04-14  
Owner: Browser Runtime

This guide explains how to add a new site command in Otto extension runtime, including registration, input contracts, auth behavior, and command.test streaming hooks.

## Scope

Use this guide when adding files under `extension/src/commands/<site>/` and exposing them through `command.list`, `command.run`, and optionally `command.test`.

Primary source files:

- `extension/src/commands/types.ts`
- `extension/src/commands/index.ts`
- `extension/src/runtime/command-runtime.ts`
- `extension/src/runtime/command-executor.ts`

## Command Lifecycle

1. Controller sends `command.run` or `command.test`.
2. Runtime resolves site bundle and command id.
3. Runtime validates tab session and site URL.
4. Runtime validates and sanitizes `input` against command metadata.
5. Runtime runs auth preflight (`checkLogin`, optional `gotoLogin`) for `requiresAuth` commands.
6. Runtime ensures optional `preloadHost` and page readiness.
7. Runtime executes `execute`, or `test` with execute fallback helpers.
8. Runtime returns structured result or deterministic error code.

## Step 1: Create Command File

Create a file such as `extension/src/commands/example.com/get-items.ts`:

```ts
import type { SiteCommand } from '../types.js';

export const getItemsCommand: SiteCommand = {
  metadata: {
    site: 'example.com',
    id: 'getItems',
    displayName: 'Get Items',
    description: 'Collect visible items from the current page.',
    tags: ['content'],
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
        .map((el) => ({
          id: (el as HTMLElement).dataset.item ?? '',
          text: (el.textContent ?? '').trim()
        }));
    }, [limit]);

    return { count: items.length, items };
  }
};
```

## Step 2: Define Metadata Correctly

Metadata fields drive safety and compatibility:

| Field | Required | Meaning |
|---|---|---|
| `site` | Yes | Site bundle ownership, for example `reddit.com` |
| `id` | Yes | Command id used by CLI, for example `getFeed` |
| `requiresAuth` | Yes | Triggers auth preflight gates |
| `requiresDebuggerFocus` | No | Opt-in to debugger focus emulation |
| `preloadHost` | No | Host runtime navigates to before execute |
| `inputFields` | No | Declarative input schema |
| `inputAtLeastOneOf` | No | Conditional cross-field requirement |

Validation behavior to expect:

- Unknown keys are rejected as `unexpected_command_input`.
- Missing required keys are rejected as `missing_command_input`.
- Wrong types are rejected as `invalid_command_input_type`.
- Missing conditional groups are rejected as `missing_command_input_one_of`.

## Step 3: Register Command in Site Bundle

Update `extension/src/commands/<site>/index.ts`:

```ts
import { getItemsCommand } from './get-items.js';

export const exampleCommands: SiteCommandBundle = {
  site: 'example.com',
  checkLogin: checkLoginCommand,
  gotoLogin: gotoLoginCommand,
  commands: [getItemsCommand]
};
```

If the site is new, register the bundle in `extension/src/commands/index.ts`.

## Step 4: Add command.test Hook for Stream Readiness

Use `test` when command behavior needs readiness checks or stream declarations:

```ts
async test(ctx, input, helpers) {
  const options = {
    tabSessionId: ctx.tabSessionId,
    site: 'example.com',
    listener: 'network.http_intercept'
  };

  const intercept = await ctx.startNetworkInterception({
    mode: 'fetch',
    includeBody: true,
    urlPatterns: ['https://api.example.com/v1/events*']
  });

  try {
    await ctx.navigateTab('https://example.com/app');
    const updates = intercept.takeUpdates();
    if (updates.length > 0) {
      return {
        ready: true,
        stream: {
          listeners: [
            {
              listener: 'network.http_intercept',
              options: {
                tabSessionId: ctx.tabSessionId,
                site: 'example.com',
                mode: 'fetch',
                includeBody: true,
                urlPatterns: ['https://api.example.com/v1/events*']
              }
            }
          ]
        }
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
```

## Step 5: Keep Auth and Security Boundaries

Rules to preserve:

- Never automate credential submission.
- Return `manual_login_required` when session is missing.
- Keep command logic site-scoped and reject mismatched tabs.
- Do not expose secrets in command output or `originalEntity` objects.

## Step 6: Add Tests

Recommended locations:

- Runtime behavior: `extension/test/command-executor.test.ts`
- Command-specific parsing/logic: `extension/src/commands/<site>/<command>.test.ts`

Minimum test matrix:

1. Valid input returns expected result shape.
2. Missing required input fails with deterministic code.
3. Unknown key is rejected.
4. `requiresAuth` command returns `manual_login_required` in unauthenticated mode.
5. `test` hook stream declaration path and fallback path both work.

## Authoring Checklist

- [ ] Metadata includes accurate `site`, `id`, and auth settings.
- [ ] `inputFields` and `inputAtLeastOneOf` reflect real runtime requirements.
- [ ] `execute` logic is bounded and deterministic.
- [ ] Optional `test` hook returns command-native stream listener manifests.
- [ ] Command registered in site bundle and command index.
- [ ] Tests added for validation, auth, and stream/fallback behavior.
- [ ] Output shape is stable and does not leak sensitive data.

## Related Docs

- `reference/commands`
- `reference/protocol`
- `guides/listener-development`
- `reference/error-codes`
