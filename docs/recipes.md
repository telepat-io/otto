# Recipes

Last Updated: 2026-04-03
Owner: Browser Runtime

## Source-of-Truth Code Paths

- Extension command execution and recipe dispatch: `extension/src/runtime/command-executor.ts`
- Extension recipe runtime orchestration: `extension/src/runtime/recipe-runtime.ts`
- Extension site recipe registry and modules: `extension/src/recipes/**`
- Shared action contracts: `packages/shared-protocol/src/index.ts`
- Relay command routing and terminalization: `packages/relay/src/index.ts`

## Design Goals

- Keep recipe authoring simple and local to extension runtime.
- Make recipes discoverable and testable by humans and agents.
- Support website-specific auth preflight without credential automation.
- Preserve relay invariants (target node, queueing, terminal outcomes).

## Implemented v1 Actions

Primitive actions:

- `primitive.tab.open`
- `primitive.tab.close`
- `primitive.tab.navigate`
- `primitive.tab.query`
- `primitive.dom.extract_text`

Recipe actions:

- `recipe.list`
- `recipe.run`
- `recipe.reddit_feed` (legacy alias)

CLI entrypoints:

- `otto recipes list [--site <site>]`
- `otto test <site> <recipe> [--payload <json>] [--auth-mode auto|strict_fail|skip]`

Site-scoped recipe model:

- Recipes are grouped by website in `extension/src/recipes/<site>/`.
- Each site bundle must provide built-ins: `checkLogin` and `gotoLogin`.
- Custom recipes export metadata plus an `execute(ctx, input)` function.
- `recipe.run` payload carries `site`, `recipe`, optional `input`, and `authMode` (`auto|strict_fail|skip`).

Recipe file shape:

- `metadata`: identity, display fields, tags, and `requiresAuth`.
- `execute(ctx, input, authMode)`: implementation logic.
- Site bundle exports: `checkLogin`, `gotoLogin`, `recipes[]`.

Auth-required flow:

- If recipe metadata declares `requiresAuth`, runtime executes `checkLogin` first.
- In `auto` mode, failed login checks trigger `gotoLogin` and return deterministic `manual_login_required`.
- End users complete authentication manually in the browser, then rerun the recipe.

Current bundled sites:

- `reddit.com` (`getFeed`)
- `news.ycombinator.com` (`getFrontPage`)

## Runtime Execution Lifecycle

1. Parse `recipe.run` payload or alias mapping (`recipe.reddit_feed`).
2. Resolve site bundle and recipe id.
3. Resolve and validate `tabSessionId`.
4. Ensure active tab URL matches target site bundle.
5. Run auth preflight if required (`checkLogin` then optional `gotoLogin`).
6. Execute recipe and return normalized recipe result object.

## Error Contract (Current)

Common deterministic codes:

- `unknown_site`
- `unknown_recipe`
- `site_mismatch`
- `missing_tab_session`
- `unknown_tab_session`
- `manual_login_required`

## Authoring Guidelines

1. Keep recipe execution bounded in time and payload size.
2. Do not include secrets or credentials in returned data.
3. Prefer stable selectors and null-safe extraction.
4. Return structured objects with predictable fields.
5. Use `requiresAuth` only when website session state is truly required.

Developer test flow:

- Use `otto test <site> <recipe>` for local execution.
- If `targetNodeId` is missing or stale and exactly one node is connected, CLI auto-selects that connected node.
- If multiple nodes are connected, CLI requires explicit `--node-id`.
- If `--tab-session` is omitted, CLI auto-opens `https://<site>` and uses returned `tabSessionId`.
- Non-TTY mode emits JSON and returns non-zero exit code on terminal errors for automation.
- Use `otto recipes list [--site <site>]` to inspect available metadata exposed by the node runtime.

Recommended setup prerequisites:

1. Run `otto setup` to prepare controller config and extension import path.
2. Load extension in Chrome and set node relay URL in extension options if needed.
3. Complete pairing (`otto authcode`, `otto pair <code>`) before recipe commands.

Ownership boundary reminder:

- `otto settings` affects controller defaults only.
- Extension runtime configuration for node connectivity is managed in extension options.

Recipe constraints:

- Bounded runtime and payload size
- Clear warning/error return schema
- Sensitivity tags for redaction policy
