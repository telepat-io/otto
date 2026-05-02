---
title: Command Authoring
sidebar_position: 3
description: Add a site command to the Otto extension runtime. Covers metadata contracts, runtime validation, error surfacing patterns, safety rules, and the testing matrix.
keywords:
  - command authoring
  - site command
  - extension runtime
  - command metadata
  - browser automation
---

# Command Authoring

This guide explains how to add a site command in the Otto extension runtime without breaking protocol, auth, or lifecycle guarantees. After completing these steps, your command will be discoverable via `otto commands list`, executable via `otto cmd`, and testable via `otto test`.

## Before you start

- Familiarity with the [Architecture overview](./architecture.md) and [Extension Runtime](./extension-runtime.md).
- A working monorepo build (`npm install && npm run build`).
- Understanding of the target site's DOM and network behavior.

## Source of truth

| Concern | Path |
|---|---|
| Command types and metadata contracts | `extension/src/commands/types.ts` |
| Site command registration | `extension/src/commands/index.ts` |
| Site command orchestration | `extension/src/runtime/command-runtime.ts` |
| Action execution dispatch | `extension/src/runtime/command-executor.ts` |

## Steps

### 1. Create a command module

Create `extension/src/commands/<site>/<command-id>.ts`. Declare metadata that matches actual runtime behavior — runtime uses metadata to gate execution and sanitize inputs before your handler runs.

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

### 2. Understand the metadata contract

| Field | Required | Purpose |
|---|---|---|
| `site` | Yes | Site bundle ownership and tab URL validation |
| `id` | Yes | Command identifier used in `command.run` / `command.test` |
| `requiresAuth` | Yes | Whether auth preflight runs before execute |
| `requiresDebuggerFocus` | No | Opt in to focus emulation via `chrome.debugger` |
| `preloadHost` | No | Guarantee navigation to host before execute |
| `inputFields` | No | Declarative input schema; drives runtime validation |
| `inputAtLeastOneOf` | No | Cross-field conditional requirement |

### 3. Implement execute with bounded, deterministic logic

Keep `execute(ctx, input, authMode)` bounded: no infinite loops, no unbounded DOM scraping. Return deterministic errors instead of silent retries. Never automate credential submission.

### 4. Handle inside-page errors explicitly

When using `ctx.executeScript` or `ctx.executeScriptWithDomHelpers`, Chromium can silently swallow in-page throws. Use this pattern to preserve page-level errors:

```typescript
const result = await ctx.executeScriptWithDomHelpers(async () => {
  try {
    // Your page logic here
    return { ok: true };
  } catch (error) {
    return {
      __ottoSerializedCommandError: true,
      code: 'site_specific_error_code',
      message: error instanceof Error ? error.message : 'site_specific_error_code',
    };
  }
}, []);

if (ctx.isSerializedScriptError(result)) {
  return result;
}
```

This keeps command failures deterministic and surfaces specific inside-page diagnostics (for example `reddit_post_comment_composer_missing`) in `otto test` output.

### 5. Add a test hook for stream commands (optional)

For commands that stream network events, add `test(ctx, input, helpers)`. See [Command Authoring Templates](./command-authoring-templates.md) for a copy-ready stream test hook template.

### 6. Register the command in the site bundle

Add your command to `extension/src/commands/index.ts` in the relevant site bundle. The command is now discoverable via `command.list`.

### 7. Write tests

Add tests covering validation gating, auth preflight behavior, and execute/test fallback semantics. See the testing matrix below.

## Runtime validation behavior

Runtime validates inputs strictly when `inputFields` is declared:

| Condition | Error code |
|---|---|
| Unknown input key | `unexpected_command_input` |
| Missing required field | `missing_command_input` |
| Type mismatch | `invalid_command_input_type` |
| Unmet cross-field constraint | `missing_command_input_one_of` |

Validation errors reject the command before `execute` runs. Command handlers always receive sanitized, validated input.

## Verify success

After registering your command:

```bash
# Confirm it appears in discovery
otto commands list --site example.com

# Run it with otto test
otto test example.com getItems

# Run with explicit input
otto test example.com getItems --payload '{"limit": 5}'

# Inspect target page content quickly (defaults to markdown)
otto extract-content https://example.com
```

A successful run returns a JSON result with `messageType: result` and exits with code `0`.

For extraction-heavy debugging, prefer `otto extract-content` over hand-written primitive sequences. It consolidates output selection in one place:

- `--format markdown` (default) for quick page understanding
- `--format distilled_html` for readability-safe HTML capture
- `--format raw_html --selector <css>` for precise DOM snapshots
- `--format text --tab-session <id>` for visible text extraction from managed tabs

## Safety rules

- Never automate credential submission. Use `manual_login_required` handoff for auth-required commands.
- Keep site URL validation strict. Commands run only on matching tab domains.
- Return deterministic precondition errors instead of silent retries.
- Keep command output free of sensitive values.
- Keep output shape stable enough for CLI and agent parsing.

## Testing matrix

| Scenario | Why it matters |
|---|---|
| Successful execution with valid input | Confirms happy-path contract and payload shape |
| Missing required input | Verifies metadata validation gating |
| Unexpected input key | Prevents hidden/legacy payload drift |
| `requiresAuth` command on unauthenticated page | Verifies explicit `manual_login_required` handoff |
| `command.test` stream declaration path | Confirms stream lifecycle and listener manifest behavior |
| `command.test` execute fallback path | Ensures compatibility for commands without custom test hook |

## Next steps

- [Command Authoring Templates](./command-authoring-templates.md) — copy-ready code templates.
- [Listener Development](./listener-development.md) — stream integration patterns.
- [Commands Reference](./commands.md) — action surface and runtime execution flow.
- [Error Codes](./error-codes.md) — all command validation error codes.
