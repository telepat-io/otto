---
title: Commands Reference
sidebar_position: 5
description: Complete reference for Otto command actions, site command model, runtime execution flow, input metadata, network interception API, and bundled site commands.
keywords:
  - commands reference
  - action surface
  - site commands
  - command.run
  - network interception
---

# Commands Reference

Otto commands serve two audiences: command authors implementing extension bundles, and controller users validating behavior through CLI execution. The command model is site-scoped, metadata-driven, and strictly validated so handlers receive sanitized inputs in a valid tab context.

## Source-of-truth code paths

| Concern | Source |
|---|---|
| Command dispatch and execution | `extension/src/runtime/command-executor.ts` |
| Site command orchestration | `extension/src/runtime/command-runtime.ts` |
| Site command bundles | `extension/src/commands/**` |
| Shared action contracts | `packages/shared-protocol/src/index.ts` |
| Relay terminalization and routing | `packages/relay/src/index.ts` |

## Action surface

| Group | Actions |
|---|---|
| Primitive tab | `primitive.tab.open`, `primitive.tab.close`, `primitive.tab.navigate`, `primitive.tab.query` |
| Primitive DOM | `primitive.dom.extract_text`, `primitive.dom.extract_html`, `primitive.dom.extract_clean_html`, `primitive.dom.extract_distilled_html`, `primitive.dom.extract_markdown` |
| Primitive page | `primitive.page.screenshot` |
| Command | `command.list`, `command.run`, `command.test`, `command.reddit_feed` (legacy alias) |
| Listener | `listener.subscribe`, `listener.unsubscribe` |
| Common CLI entrypoints | `otto commands list`, `otto test <site> <command>`, `otto extract-content [url]`, `otto cmd --action ...` |

`otto extract-content` is the recommended high-level CLI path for content extraction and defaults to markdown output. It maps to primitive actions under the hood (`primitive.dom.extract_markdown`, `primitive.dom.extract_clean_html`, `primitive.dom.extract_distilled_html`, `primitive.dom.extract_html`, and `primitive.dom.extract_text`) based on `--format`.

For DOM/selector debugging, `--format clean_html` is typically the most useful mode.

## Site command model

Commands are grouped by site under `extension/src/commands/<site>/`. Each site bundle provides auth primitives (`checkLogin`, `gotoLogin`) plus one or more command modules exporting metadata and execution logic.

Runtime exposes `executeScript(...)` and `executeScriptWithDomHelpers(...)`. Use the DOM-helper variant when selectors must traverse nested Shadow DOM.

`primitive.page.screenshot` accepts either `tabSessionId` or `url` target resolution. URL-only calls use a temporary background tab and return terminal payloads with image metadata and `contentBase64`. `mode=viewport` uses tab capture APIs; `mode=full_page` uses CDP.

## Command contract

Each command module combines declarative metadata with execution hooks.

| Field | Required | Purpose |
|---|---|---|
| `metadata` | Yes | Identity, display metadata, tags, auth requirement |
| `metadata.requiresDebuggerFocus` | No | Opt-in focus emulation for throttling-sensitive flows |
| `metadata.inputFields` | No | Declarative input schema (`name`, `type`, `description`, `optional`) |
| `metadata.inputAtLeastOneOf` | No | Cross-field minimum presence constraint |
| `metadata.preloadHost` | No | Host gate enforced before execute path |
| `execute(ctx, input, authMode)` | Yes | Main command behavior |
| `test(ctx, input, helpers)` | No | Dedicated `command.test` hook |

Supported declarative input types: `string`, `number`, `boolean`, `object`, `array`.

When `metadata.inputFields` is present, runtime enforces required fields, exact type checking (no coercion), unknown-key rejection, optional `inputAtLeastOneOf` checks, and sanitization to declared keys only.

## Runtime execution flow

Otto's command execution is intentionally ordered for deterministic failure:

1. Parse command payload (`command.run`, `command.test`, or legacy alias mapping).
2. Resolve site bundle and command metadata.
3. Resolve and validate `tabSessionId` and site URL match.
4. Validate and sanitize declared input metadata when present.
5. Run auth preflight for `requiresAuth` commands.
6. Apply `preloadHost` gate when configured.
7. Execute command mode (`execute` for run, `test` hook with execute fallback for test).
8. Return normalized terminal result or structured error.

Commands requiring auth never automate credential entry. In `authMode=auto`, runtime may navigate to login and returns `manual_login_required` for explicit human handoff.

## Focus emulation and DOM helper guidance

`requiresDebuggerFocus` activates focus emulation only after site/tab validation succeeds. Activation failures are deterministic: `debugger_focus_unavailable`, `debugger_focus_conflict`, `debugger_focus_permission_denied`, `debugger_focus_attach_failed`, `debugger_focus_command_failed`.

`executeScriptWithDomHelpers(...)` installs idempotent deep-query helpers in page context:

- `window.__ottoDeepQuerySelector(root, selector)`
- `window.__ottoDeepQuerySelectorAll(root, selector)`

## Bundled sites

| Site | Commands |
|---|---|
| `reddit.com` | `getFeed`, `getUserInfo`, `sendChatMessage`, `getChatMessages`, `commentOnPost` |
| `linkedin.com` | `getFeed`, `commentOnPost` |
| `news.ycombinator.com` | `getFrontPage` |
| `google.com` | `getSearchResults` |

### Google command notes

| Command | Key behavior |
|---|---|
| `getSearchResults` | Requires `query`; navigates to Google Search and extracts first-page results by default. Optional `pages` (1–5, default 1) controls how many SERP pages to fetch. Optional `limit` (1–100, default 10) caps total results returned. Each result carries `title`, `url`, `description`, `links` (sitelinks), `image` (thumbnail or null), `rank`, and `isAd`. Returns `content.search_result` entities. |

### Reddit command notes

| Command | Key behavior |
|---|---|
| `getFeed` | Hydrates post permalinks via `.json`; supports `minReturnedPosts`; returns `content.post` trees |
| `getUserInfo` | Looks up by username/ID or defaults to current session; returns `entity.user` |
| `sendChatMessage` | Supports `roomId` direct send or username-based room create + send via Shadow DOM |
| `commentOnPost` | Navigates to post URL; fills `shreddit-composer`; submits top-level comment |
| `getChatMessages` | Reads Matrix history/sync; can emit stream manifest with `network.http_intercept` |

### LinkedIn command notes

| Command | Key behavior |
|---|---|
| `getFeed` | Extracts LinkedIn feed posts with semantic filtering, canonical post URL capture via control-menu copy link, bounded scroll hydration, and timeout-policy scaling by `minReturnedPosts` |
| `commentOnPost` | Navigates to a LinkedIn post URL, fills the in-page comment editor, submits comment, and confirms send by matching the newest rendered comment text |

#### linkedin.com commentOnPost inputs

| Field | Type | Required | Notes |
|---|---|---|---|
| `postUrl` | string | Yes | LinkedIn post URL on `linkedin.com`; normalized to canonical `https://www.linkedin.com/...` form. |
| `commentBody` | string | Yes | Comment text to submit. Empty or whitespace-only values are rejected. |

#### linkedin.com commentOnPost confirmation semantics

- The command waits for a comment editor (`.ql-editor[contenteditable="true"]`) and injects `commentBody`.
- It waits for a submit control to appear/be enabled (supports multiple submit button selectors).
- After submit click, it retries reading the first `.comments-comment-item__main-content` node with short delays.
- Success requires normalized rendered text to match normalized `commentBody`; otherwise returns deterministic unconfirmed diagnostics.

#### linkedin.com commentOnPost examples

```bash
# Submit a top-level comment on a LinkedIn post
otto test linkedin.com commentOnPost --payload '{"postUrl":"https://www.linkedin.com/posts/example_post-id","commentBody":"Looks great"}'
```

#### linkedin.com getFeed inputs

| Field | Type | Default | Notes |
|---|---|---|---|
| `minReturnedPosts` | number | `5` | Minimum number of posts to attempt to return. Runtime clamps to `1..200`. |
| `getClipboardPermission` | boolean | `false` | Permission assist mode. Keeps page alive briefly to let user grant clipboard-read and retries extraction. In this mode, command targets one post. |

#### linkedin.com getFeed output semantics

- Returns `{ posts: content.post[] }`.
- `title` is intentionally empty for LinkedIn feed posts.
- `content` is required and non-empty; posts with missing/empty content are dropped.
- `url` is the canonical post link copied from the post control menu, not a profile URL.
- `id` is normalized as `linkedin:<post-slug-from-url>`.
- `author` carries normalized identity fields and preserves source profile URL in `author.originalEntity.profileUrl`.

#### linkedin.com getFeed timeout policy

The command descriptor advertises timeout hints via `timeoutPolicy`:

- `defaultMs`: `60000`
- Scaling: `baseMs + (minReturnedPosts * perUnitMs)`
- Current scaling values: `baseMs=45000`, `perUnitMs=4000`, `minMs=45000`, `maxMs=300000`

Controllers can use this metadata when user timeout is left at default.

#### linkedin.com getFeed auth and permission errors

- `manual_login_required`: user must log into LinkedIn manually, then rerun.
- `clipboard_permission_prompt_pending`: clipboard permission is still in prompt state; allow permission and rerun with `getClipboardPermission=true`.
- `clipboard_permission_denied`: clipboard permission denied; enable clipboard access in site settings and rerun.

#### linkedin.com getFeed examples

```bash
# Default extraction
otto test linkedin.com getFeed

# Request at least 15 posts
otto test linkedin.com getFeed --payload '{"minReturnedPosts":15}'

# Permission assist flow for clipboard-read
otto test linkedin.com getFeed --payload '{"getClipboardPermission":true}'
```

## Command network interception API

Commands can start response interception using the runtime context helper:

```typescript
const stream = await ctx.startNetworkInterception({
  urlPatterns: ['https://www.reddit.com/api/*'],
  mode: 'hybrid',
  includeBody: true,
  maxBodyBytes: 200_000,
});

await ctx.navigateTab('https://www.reddit.com/');

const deadline = Date.now() + 5000;
const captured: unknown[] = [];
while (Date.now() < deadline) {
  const updates = stream.takeUpdates();
  if (updates.length > 0) {
    captured.push(...updates);
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
}

await stream.stop();
return { capturedCount: captured.length, captured };
```

Interception is always bound to the command's managed `tabSessionId`. Runtime automatically stops all active command-started interceptions when command execution completes or throws.

Update types emitted by runtime interception manager: `network.response`, `network.error`, `network.detached`.

## Error codes

| Class | Codes |
|---|---|
| Common deterministic | `unknown_site`, `unknown_command`, `site_mismatch`, `missing_tab_session`, `unknown_tab_session`, `manual_login_required` |
| Reddit-specific | `reddit_user_not_found`, `reddit_user_unmessageable`, `reddit_rate_limited`, `reddit_matrix_token_missing` |

See [Error Codes](./error-codes.md) for the complete catalog.

## Authoring guidelines

1. Keep command execution bounded in time and payload size.
2. Do not include secrets or credentials in returned data.
3. Prefer stable selectors and null-safe extraction.
4. Return structured objects with predictable fields.
5. Use `requiresAuth` only when website session state is required.
6. Attach `originalEntity` when source payloads are safe to expose.

## Developer test flow

```bash
# Inspect command metadata and declared inputs
otto commands list --site <site>

# Run a local execution test
otto test <site> <command>

# Run with payload
otto test <site> <command> --payload '{"limit": 5}'
```

## Next steps

- [Command Authoring](./guides/command-authoring.md) — build a new site command.
- [Command Authoring Templates](./guides/command-authoring-templates.md) — copy-ready TypeScript templates.
- [Listener Development](./guides/listener-development.md) — stream-capable command integration.

