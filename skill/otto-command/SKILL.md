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
   - For extraction-heavy tasks, try markdown or distilled HTML before raw HTML parsing.
6. Add or tune test mode behavior.
   - Implement `test(...)` by default so the command is directly testable via CLI.
   - If a dedicated test flow is unnecessary, keep `test(...)` thin and delegate to `execute(...)`.
7. Build and validate after each code change.
   - Rebuild extension.
   - Pause and ask user to manually refresh extension in Chrome.
   - Resume only after user confirms refresh.
8. Re-run validation loop.
   - Iterate code -> build -> user refresh -> validate until success criteria are met.

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

# 4) Content extraction shortcut for debugging page structure
otto extract-content <url> --format markdown
otto extract-content <url> --format distilled_html
```

### Example: primitives via CLI

Use this when you need direct primitive checks while debugging command behavior.

```bash
# Open a managed tab and capture tabSessionId from output
otto cmd --action primitive.tab.open --payload '{"url":"https://www.reddit.com"}' --json

# Query current tab metadata
otto cmd --action primitive.tab.query --payload '{"tabSessionId":"<tabSessionId>"}' --json

# Navigate the managed tab
otto cmd --action primitive.tab.navigate --payload '{"tabSessionId":"<tabSessionId>","url":"https://www.reddit.com/r/programming"}' --json

# Extract markdown (often easiest for parser debugging)
otto cmd --action primitive.dom.extract_markdown --payload '{"tabSessionId":"<tabSessionId>"}' --json

# Extract distilled html for structural debugging
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
4. Command exposes a `test(...)` path suitable for `otto test`.
5. Failure cases return deterministic, actionable errors.
6. Extension rebuild and manual reload confirmation was performed after every code change.
7. Validation run confirms success criteria from the user.

## Quick scope boundary

If the user asks for any of the following, switch to the broader "otto-cli" skill and stop command authoring flow:
- installation or setup from scratch
- relay daemon lifecycle troubleshooting
- pairing or ACL recovery
- agent integration setup

## How this skill is built

For maintenance notes and structure principles, see:
- [skill-construction](./references/skill-construction.md)
