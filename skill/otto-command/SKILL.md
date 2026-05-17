---
name: otto-command
description: Create or debug Otto site commands end-to-end with minimal user input. Use when asked to build a new command, fix a command, add command tests, tune command metadata, or diagnose command.run/command.test failures in extension command modules.
argument-hint: site, command intent, target output shape, and success criteria
---

# Otto Command Skill

## What this skill does

This skill helps an agent create and debug Otto extension commands with minimal user input.

It is intentionally narrow:
- In scope: command authoring, command debugging, metadata and input contracts, command-level listener logic, and command-level logging or error diagnosis.
- Out of scope: broad CLI onboarding, relay operations, agent framework registration, and release workflows.

If the task becomes setup-heavy (no running relay, no reachable nodes, pairing or ACL issues), stop command authoring and hand off to the broader Otto setup and operations workflow.

## Trigger phrases

Use this skill when user requests mention terms like:
- create otto command
- add new site command
- debug command.run or command.test
- fix otto command metadata
- add network interception to command
- make command output stable for agents

## Inputs to collect first

Ask only for missing essentials:
1. Target site and command goal.
2. Starting page URL or host to open.
3. Exact steps the command should perform in page context.
4. Expected output shape (top-level fields and types).
5. Success validation (what proves command works).
6. Node preference if multiple nodes are connected.

If any item is unclear, ask for it before writing code.

## Readiness gate (required before coding)

Run this gate when entering a command-authoring session (or when connection state is unclear):
1. `otto status --nodes --json`
   - If relay not running or node list is unavailable, stop and hand off to the broader Otto setup and operations workflow.
2. `otto commands list --json`
   - If empty or error, stop and hand off to the broader Otto setup and operations workflow.
3. Node targeting policy:
   - If exactly one node is available, auto-select it.
   - If two or more nodes are available, ask user which node to target.

Do not continue command authoring when readiness gate fails.

## Deterministic workflow

1. Inspect existing commands first.
   - Prefer extending an existing pattern from the same site bundle.
2. Define command contract before implementation.
   - Metadata fields, input fields, and output schema first.
3. Implement minimal happy path.
   - Keep logic bounded and deterministic.
4. Add defensive checks.
   - Input validation, preconditions, and structured error paths.
5. Add extraction and interaction resilience.
   - Prefer stable selectors, deep DOM helpers when needed.
   - Prefer programmatic readiness checks before extraction or interaction. Wait for concrete page conditions such as the target container, a stable heading, expected buttons, timestamps, or post/body elements instead of guessing with fixed delays.
   - Use bounded polling loops tied to page state when possible.
   - For extraction-heavy tasks, start with **markdown** (easiest to parse) or **clean_html** (removes scripts/styles/obfuscated classes to reveal clean page structure for selector building). Raw HTML is rarely needed; skip it unless you need full page exact structure.
   - Fixed timeouts are acceptable as a bounded fallback, especially while debugging or when the page offers no reliable readiness signal, but they should not be the first choice when a concrete readiness condition exists.
6. Add or tune test mode behavior.
   - Implement `test(...)` by default so the command is directly testable via CLI.
   - If a dedicated test flow is unnecessary, keep `test(...)` thin and delegate to `execute(...)`.
7. Build and validate after each code change.
   - Rebuild extension.
   - Pause and ask user to manually refresh extension in Chrome.
   - Resume only after user confirms refresh.
8. Re-run validation loop.
   - Iterate code -> build -> user refresh -> validate until success criteria are met.
   - Validation must inspect the returned payload itself, not just command success.
   - Treat obviously wrong items, repeated containers, nav chrome, follow cards, suggested cards, ads, or malformed fields as validation failures even when `otto test` returns `ok: true`.
   - Summarize what the command returned and call out any suspicious rows before declaring success.
   - When semantic validation fails, do not stop at reporting the bad rows if a nearby debugging step exists.
   - For extraction issues, immediately inspect page structure with `otto extract-content <url> --format clean_html`, `otto extract-content <url> --format markdown`, or the equivalent primitive DOM extraction commands, then refine selectors and retry.
   - Use returned bogus rows as clues to the selector mistake: identify which surrounding UI region they came from and tighten acceptance rules before the next run.
   - If the command intermittently returns empty or partial results, suspect readiness timing. Add a bounded wait for concrete page signals before widening selectors or adding heuristic filters.

## Hard-debug escalation path (use selectively)

Use this path when normal iteration is not yielding enough signal and keeping the live tab open can unlock useful observations.

1. Start a validation run with `--wait-for-interrupt` in the background.
   - Prefer JSON output for easier inspection while the process is running.
2. Keep the tab open and ask focused user questions tied to the suspected failure.
   - Ask only high-value questions (for example: what is visible in the feed area, whether auth interstitials appeared, whether timestamps/buttons rendered, whether lazy content loaded).
3. Refine hypotheses using both CLI output and user observations.
4. Stop the background run when enough data is collected.
   - Send interrupt or kill the background process so tabs and stream sessions do not linger.
5. Apply the next code or selector change and return to the normal build -> reload -> validate loop.

Rules:
- Do not leave `--wait-for-interrupt` runs orphaned.
- Keep this as an escalation path, not the default for every iteration.
- Still follow the mandatory extension reload pause after each code change.

## Mandatory pause after each code change

CRITICAL RULE: After every command code update and build, the agent must pause and ask the user to manually refresh/reload the Chrome extension before running any validation. Do not continue until the user confirms reload is complete.

After every command code update:
1. Build extension.
2. Ask user to reload the extension in browser manually.
3. Wait for explicit confirmation.
4. Only then run command validation.

Do not skip this pause. Results are unreliable without reload.

## Practical examples

### Example: minimal command boilerplate

Use this as a starting point for most new commands.

```ts
import type { SiteCommand } from '../types.js';
import type { Post, SearchResult, UserProfile, Article } from '@telepat/otto-protocol';

type GetItemsInput = {
   limit?: number;
};

export const getItemsCommand: SiteCommand = {
   metadata: {
      site: 'example.com',
      id: 'getItems',
      displayName: 'Get Items',
      description: 'Extracts items from the current page',
      tags: ['extract', 'items'],
      requiresAuth: false,
      requiresDebuggerFocus: false,
      inputFields: [
         { name: 'limit', type: 'number', optional: true, description: 'Max items to return' },
      ],
   },
   async execute(ctx, input) {
      const normalized: GetItemsInput = {
         limit: typeof input.limit === 'number' ? Math.max(1, Math.min(100, Math.floor(input.limit))) : 20,
      };

      const result = await ctx.executeScript((limit: number) => {
         try {
            const items = Array.from(document.querySelectorAll('[data-item]'))
               .slice(0, limit)
               .map((el, index) => ({
                  kind: 'content.article',
                  id: `item-${index + 1}`,
                  title: (el.textContent ?? '').trim(),
               }));
            return { items, count: items.length };
         } catch (error) {
            return {
               __ottoSerializedCommandError: true,
               code: 'example_extract_failed',
               message: error instanceof Error ? error.message : 'example_extract_failed',
            };
         }
      }, [normalized.limit ?? 20]);

      if (ctx.isSerializedScriptError(result)) {
         return result;
      }

      return result;
   },
   async test(ctx, input, helpers) {
      return helpers.execute(input);
   },
};
```

## Shared output types for command results
When building extraction commands, prefer the shared protocol domain types from `@telepat/otto-protocol` so the output is normalized and agent-friendly.

Common returned kinds include:
- `entity.user`
- `content.post`
- `content.post_comment`
- `content.search_result`
- `content.article`
- `chat.message`
- `chat.typing`
- `chat.participant`
- `chat.message_deleted`

Import types directly in command modules when they are a useful contract aid:

```ts
import type {
  Post,
  PostComment,
  SearchResult,
  Article,
  UserProfile,
} from '@telepat/otto-protocol';
```

Best practice:
- Always return objects with `kind` set to a stable shared-domain value.
- Populate only fields that are semantically meaningful for the source content; omit optional fields that do not naturally exist for that platform or artifact.
- Include `originalEntity` only when it helps debugging or preserves necessary raw payload context.
- Prefer existing kinds over inventing new ones for similar content shapes.

### When `content.post` is appropriate
Use `content.post` for lightweight post/feed extraction such as Reddit feed or article cards.
The object should include at least `id`, `title`, and `kind`, and may include `url`, `author`, `publishedAt`, `content`, `community`, `score`, `commentCount`, `comments`, `meta`, and `originalEntity`.

### When `entity.user` is appropriate
Use `entity.user` for user profile lookups, login state, or session identity results.
The object should include `id`, `platform`, and typically `username`, `displayName`, `profileUrl`, `avatarUrl`, and `stats`.

### When `content.search_result` is appropriate
Use `content.search_result` for search-like result lists with fields like `title`, `url`, `description`, `rank`, and optional `links`/`image`.

### When `chat.*` is appropriate
Use the `chat.*` stream shapes for chat events and message history rather than raw network payloads.

### Standard output rule
Always make the command’s returned shape stable and predictable for automation consumers. If a page result is not a good shared-domain fit, return a smaller deterministic wrapper object rather than an unstructured blob.

Validation rule:
- After every `otto test` or `command.run` check, inspect a representative sample of the returned objects.
- Verify that each object matches the intended domain semantics, not just the schema. A `content.post` result that is actually a follow suggestion, notification card, ad, or navigation artifact is invalid.
- If the output includes bogus items, duplicates caused by selector drift, placeholder titles, or obviously wrong author/timestamp/content mappings, continue iterating instead of reporting success.
- If the output is wrong and the root cause is not obvious, inspect clean page structure next. Prefer `clean_html` or `markdown` over guessing from the live output alone.
- If the output is empty or flaky, verify whether the page had actually finished rendering the target structures before extraction. Prefer waiting on observable DOM conditions over adding arbitrary sleep values.

### Example: import section in command modules
```ts
import type { SiteCommand } from '../types.js';
import type { Post } from '@telepat/otto-protocol';
```

### Example: content result shape
```ts
const post: Post = {
  kind: 'content.post',
  id: 'post_123',
  title: 'Example title',
  url: 'https://www.reddit.com/r/example/comments/123',
  author: { kind: 'entity.user', id: 'reddit:alice', platform: 'reddit', username: 'alice' },
  publishedAt: '2026-05-15T00:00:00.000Z',
  community: 'r/example',
  meta: { site: 'reddit.com', source: 'reddit.json' },
  originalEntity: rawPostData,
};
```

### Example: user profile shape
```ts
const user: UserProfile = {
  kind: 'entity.user',
  id: 't2_abc123',
  platform: 'reddit',
  username: 'alice',
  displayName: 'alice',
  profileUrl: 'https://www.reddit.com/user/alice',
  avatarUrl: 'https://...',
};
```

### Example: search result shape
```ts
const result: SearchResult = {
  kind: 'content.search_result',
  id: '1',
  title: 'Search result title',
  url: 'https://example.com',
  description: 'Short summary',
  rank: 1,
};
```

### Example: chat message shape
```ts
const message = {
  kind: 'chat.message',
  conversation: { id: 'room_123', platform: 'reddit' },
  from: { kind: 'entity.user', id: 'alice', platform: 'reddit', username: 'alice' },
  to: { kind: 'entity.user', id: 'bob', platform: 'reddit', username: 'bob' },
  message: 'hello',
  datetime: '2026-05-15T00:00:00.000Z',
};
```

### Example: strict command result contract
```ts
return {
  posts: posts.filter((value): value is Post =>
    value.kind === 'content.post' && typeof value.id === 'string' && typeof value.title === 'string',
  ),
};
```
```

### Example: command-scoped network interception

Use this when key data is only available in responses.

```ts
const handle = await ctx.startNetworkInterception({
   urlPatterns: ['https://www.example.com/api/*'],
   mode: 'hybrid',
   includeBody: true,
   maxBodyBytes: 200000,
});

try {
   await ctx.navigateTab('https://www.example.com');

   const deadline = Date.now() + 5000;
   const updates: unknown[] = [];
   while (Date.now() < deadline) {
      const batch = handle.takeUpdates();
      if (batch.length > 0) {
         updates.push(...batch);
         break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
   }

   return { captured: updates.length };
} finally {
   await handle.stop();
}
```

### Example: bounded readiness wait in page context

Use this pattern when the page needs time to render posts, cards, or controls after navigation.

```ts
const result = await ctx.executeScript(
   async () => {
      const sleep = (delayMs: number): Promise<void> => new Promise((resolve) => {
         window.setTimeout(resolve, delayMs);
      });

      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
         const ready = Array.from(document.querySelectorAll('[role="listitem"]')).some((node) => {
            return node.querySelector('[data-testid="expandable-text-box"]')
               && /\b\d+[smhdw]|today|yesterday\b/i.test(node.textContent ?? '');
         });

         if (ready) {
            break;
         }

         await sleep(250);
      }

      return Array.from(document.querySelectorAll('[role="listitem"]')).length;
   },
   [],
);
```

Guidance:
- Prefer waiting for the exact structures your extractor needs.
- Keep waits bounded with a deadline and short polling interval.
- Only fall back to fixed delays when the page exposes no reliable signal.

### Example: validation commands during iteration

Use these in the build -> reload -> validate loop.

Important: after each build, stop here and request manual extension refresh confirmation from the user before executing any validation command.

```bash
# 1) Relay and node readiness (run when entering session)
otto status
otto commands list --json

# 2) Quick command metadata check
otto commands list --site <site>
#    Confirm the newly added command appears in the active node after extension reload.

# 3) Command validation
otto test <site> <command> --json
otto test <site> <command> --payload '{"limit":5}' --json

# Keep the auto-opened tab alive for iterative debugging (Ctrl+C when done)
# `--wait-for-interrupt` is the keep-alive mode for `otto test`.
otto test <site> <command> --payload '{"limit":5}' --wait-for-interrupt --json

# Reuse an existing managed tab session (no auto-open/auto-close behavior)
otto test <site> <command> --tab-session <tabSessionId> --payload '{"limit":5}' --json

# Hard-debug escalation: run in background, ask targeted user questions, then stop it.
# (Agent runtime: start this command async/background, then interrupt/kill after collecting signals.)
otto test <site> <command> --payload '{"limit":5}' --wait-for-interrupt --json

#    Inspect the returned objects, not just `ok: true`.
#    Confirm that sampled rows are real command targets rather than UI chrome,
#    ads, suggestions, follow cards, duplicated containers, or placeholder values.
#    If sampled rows are wrong, inspect `clean_html` or `markdown` for the same page
#    before making the next selector change.

# 4) Content extraction shortcut for debugging page structure
# Recommended: try markdown (easiest to parse) or clean_html (best for selectors)
otto extract-content <url> --format markdown
otto extract-content <url> --format clean_html
otto extract-content <url> --format distilled_html  # rarely needed
```

### Example: primitives via CLI

Use this when you need direct primitive checks while debugging command behavior.

```bash
# Open a managed tab and capture tabSessionId from output
otto cmd --action primitive.tab.open --payload '{"url":"https://www.reddit.com"}' --json

# Reuse that tab in command.run for stable iteration without tab churn
otto cmd --action command.run --payload '{"site":"reddit.com","command":"getFeed","tabSessionId":"<tabSessionId>"}' --json

# Query current tab metadata
otto cmd --action primitive.tab.query --payload '{"tabSessionId":"<tabSessionId>"}' --json

# Navigate the managed tab
otto cmd --action primitive.tab.navigate --payload '{"tabSessionId":"<tabSessionId>","url":"https://www.reddit.com/r/programming"}' --json

# RECOMMENDED: Extract markdown (easiest to parse for extraction tasks)
otto cmd --action primitive.dom.extract_markdown --payload '{"tabSessionId":"<tabSessionId>"}' --json

# RECOMMENDED: Extract clean HTML (best for identifying stable selectors)
# Clean HTML removes scripts, styles, inline event handlers, and obfuscated classes.
# This produces readable HTML with preserved semantic attributes (role, data-*, aria-*),
# making it ideal for DOM inspection and building reliable CSS selectors.
otto cmd --action primitive.dom.extract_clean_html --payload '{"tabSessionId":"<tabSessionId>"}' --json

# Extract distilled html (rarely needed; skip raw html—it's usually not worth retrieving)
otto cmd --action primitive.dom.extract_distilled_html --payload '{"tabSessionId":"<tabSessionId>"}' --json

# Capture viewport screenshot
otto cmd --action primitive.page.screenshot --payload '{"tabSessionId":"<tabSessionId>","mode":"viewport"}' --json

# Always close test tabs when done
otto cmd --action primitive.tab.close --payload '{"tabSessionId":"<tabSessionId>"}' --json
```

## Command authoring rules

1. Metadata must reflect runtime behavior.
2. Inputs must be declarative and validated.
3. Output must be stable, machine-parseable, and intentionally scoped.
   - Prefer existing shared output kinds when they fit (`content.post`, `content.post_comment`, `content.search_result`, `content.article`, `entity.user`, `chat.*`).
4. Command loops must be bounded.
5. Do not automate credential submission.
6. Prefer deterministic error codes over generic thrown messages.

## Command registration and discovery

Otto commands are registered by the site bundle metadata loaded by the extension runtime. In the repo, new command modules must be included in the site bundle defined in `otto/extension/src/commands/index.ts` so `listCommandDescriptors()` can return them.

Key behavior:
- `otto commands list` queries the currently active node and returns descriptors from the loaded extension bundles.
- New commands only appear after the extension is rebuilt and manually refreshed in Chrome.
- A command can be confirmed registered by running `otto commands list --site <site>` after the refresh.

Auth behavior:
- Adding a new command does not inherently require controller re-authentication.
- `otto commands list` and `otto test` use the controller session token; if that token is still valid, no extra auth step is required.
- The CLI already has a refresh path for expired tokens, so failures during command discovery are usually token expiry or relay/connectivity issues, not new command registration.

## Command surface (bundled)

Use this section when implementing or reviewing Otto command modules.

### Site command metadata

`CommandDescriptor` fields:
- Required:
   - `site`: owning site host (for tab URL gating).
   - `id`: command id used by command.run or command.test.
   - `displayName`: human-friendly name.
   - `description`: short behavior summary.
   - `tags`: discoverability tags.
   - `requiresAuth`: whether auth preflight is required.
- Optional:
   - `requiresDebuggerFocus`: opt-in background-tab focus emulation.
   - `preloadHost`: host gate enforced before execute path.
   - `inputFields`: declarative input schema.
   - `inputAtLeastOneOf`: cross-field minimum presence rule.

Source contracts:
- Otto shared protocol command descriptor
- Otto extension command execution context types
- Otto command authoring specification

### Input schema rules

When `inputFields` exists, runtime validates before execute:
- unknown keys rejected
- missing required fields rejected
- type mismatch rejected
- `inputAtLeastOneOf` enforced when declared
- handler receives sanitized keys only

Common validation error codes:
- `unexpected_command_input`
- `missing_command_input`
- `invalid_command_input_type`
- `missing_command_input_one_of`

### Action and primitive inventory

Command actions:
- `command.list`
- `command.run`
- `command.test`
- `command.reddit_feed` (legacy alias)

Primitive tab actions:
- `primitive.tab.open`
- `primitive.tab.close`
- `primitive.tab.close_owned`
- `primitive.tab.navigate`
- `primitive.tab.query`

Primitive DOM actions:
- `primitive.dom.extract_text`
- `primitive.dom.extract_html`
- `primitive.dom.extract_clean_html`
- `primitive.dom.extract_distilled_html`
- `primitive.dom.extract_markdown`

Primitive page actions:
- `primitive.page.screenshot`

Listener actions:
- `listener.subscribe`
- `listener.unsubscribe`

### Execution context APIs for commands

`CommandExecutionContext` APIs used in command handlers:
- `getTabUrl()`
- `navigateTab(url)`
- `executeScript(func, args)`
- `executeScriptWithDomHelpers(func, args)`
- `startNetworkInterception(options?)`
- `debug.log(event, data?)`
- `isSerializedScriptError(value)`

### Metadata combination guidance

Use `requiresAuth` when website session state is required.
Use `preloadHost` when command must run from a specific host.
Use `requiresDebuggerFocus` when background-tab throttling can stall command callbacks.
Use `inputFields` and `inputAtLeastOneOf` to move validation into runtime gate.

### Output contract guidance

Keep output stable and agent-friendly:
- predictable top-level fields
- explicit nullable fields
- bounded list sizes
- consistent timestamps and ids
- include `originalEntity` only when safe and useful
- semantically correct objects only; exclude UI noise that merely fits the type shape

Prefer canonical shared kinds when they match the command objective:
- `content.post`
- `content.post_comment`
- `content.search_result`
- `content.article`
- `entity.user`
- `chat.message`, `chat.typing`, `chat.participant`, `chat.message_deleted`

Primary output kind contracts:
- Otto shared protocol domain object definitions
- Otto protocol shared object discriminator guidance

### Patterns worth reusing from existing commands

- bounded scroll with stagnation break
- normalization helper exports
- stable extraction schema for search pages
- minimal clean extraction baseline

## Network, focus, logs, and error surfacing (bundled)

### Command-scoped network interception

From command context:
- `ctx.startNetworkInterception(options?)` returns handle:
   - `requestId`
   - `takeUpdates()`
   - `stop()`

Interception options include:
- `urlPatterns`
- `requestHostAllowlist`
- `mode`: `network`, `fetch`, `hybrid`
- `includeBody`
- `includeHeaders`
- `maxBodyBytes`
- `mimeTypes`

Guidelines:
1. narrow patterns first
2. prefer bounded capture windows
3. drain updates in small polling loops
4. always `stop()` interception in guaranteed teardown

### Debugger focus emulation

Use `metadata.requiresDebuggerFocus` when background tabs may throttle execution cadence (for example heavy scrolling, complex editor automation, long callback chains).

Runtime activation error codes:
- `debugger_focus_unavailable`
- `debugger_focus_conflict`
- `debugger_focus_permission_denied`
- `debugger_focus_attach_failed`
- `debugger_focus_command_failed`

Lifecycle notes:
- focus emulation activates after site validation
- attachment reuse is ownership-aware
- tab-close teardown detaches when ownership allows

### In-page error serialization pattern

Inside `executeScript` or `executeScriptWithDomHelpers`, convert page exceptions into structured command errors.

Recommended shape:
- marker: `__ottoSerializedCommandError`
- `code`
- `message`
- optional `diagnostics`
- optional `retryable`

Then in command handler:
- check `ctx.isSerializedScriptError(result)`
- return or throw deterministic error path

### Logs and failure correlation

When command fails:
1. capture request id
2. inspect bounded logs first
3. narrow by `source=node` for extension-level behavior
4. use live follow only for race and timing issues

To debug errors, ask the user to enable the extension's "Send extension debug logs to relay (local dev)" toggle on a localhost relay URL. That lets the extension stream internal runtime diagnostics as `command.script_debug` / `source=node` entries, which is especially useful for command execution issues such as:
- payload validation failures: `missing_command_input`, `invalid_command_input_type`, `unexpected_command_input`
- routing failures: `unknown_site`, `unknown_command`
- tab/site readiness failures: `site_mismatch`, `tab_url_not_ready`, `preload_host_mismatch`
- auth/login flow failures: `manual_login_required`
- debugger focus/emulation failures: `debugger_focus_attach_failed`
- in-page script/runtime errors surfaced as serialized command errors

Useful commands:
- `otto logs list --source all --latest 200`
- `otto logs list --request-id <id> --source all --latest 100`
- `otto logs follow --source node --json`

If failure is setup-related (no node, acl, pairing, relay down), stop command-authoring flow and hand off to the broader "otto-cli" skill.

## Completion checks

A command task is complete only when:
1. Readiness gate passed.
2. Command metadata and inputs are aligned with behavior.
3. Command returns expected output shape.
4. Validation confirmed the sampled output rows are semantically correct and free of obvious bogus items for the requested command goal.
5. Command exposes a `test(...)` path suitable for `otto test`.
6. Failure cases return deterministic, actionable errors.
7. Extension rebuild and manual reload confirmation was performed after every code change.
8. Validation run confirms success criteria from the user.

## Quick scope boundary

If the user asks for any of the following, switch to the broader "otto-cli" skill and stop command authoring flow:
- installation or setup from scratch
- relay daemon lifecycle troubleshooting
- pairing or ACL recovery
- agent integration setup

## How this skill is built

For maintenance notes and structure principles, see:
- [skill-construction](./references/skill-construction.md)
