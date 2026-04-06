# Recipes

Last Updated: 2026-04-04
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
- `recipe.test`
- `recipe.reddit_feed` (legacy alias)

CLI entrypoints:

- `otto recipes list [--site <site>]`
- `otto test <site> <recipe> [--payload <json>] [--auth-mode auto|strict_fail|skip]`

Site-scoped recipe model:

- Recipes are grouped by website in `extension/src/recipes/<site>/`.
- Each site bundle must provide built-ins: `checkLogin` and `gotoLogin`.
- Custom recipes export metadata plus an `execute(ctx, input, authMode)` function.
- Recipes can optionally export `test(ctx, input, helpers)` for `otto test` setup/assertion flows.
- `recipe.run` payload carries `site`, `recipe`, optional `input`, and `authMode` (`auto|strict_fail|skip`).
- `recipe.test` payload carries the same fields and runs recipe-specific test logic when present.

Recipe file shape:

- `metadata`: identity, display fields, tags, and `requiresAuth`.
- `metadata.inputFields` (optional): declarative command inputs with field `name`, `type`, `description`, `optional`.
- `metadata.preloadHost` (optional): host that must be loaded before recipe `execute` runs.
- `metadata.inputAtLeastOneOf` (optional): list of input field names where at least one must be provided.
- `execute(ctx, input, authMode)`: implementation logic.
- `test(ctx, input, helpers)` (optional): programmatic test entrypoint used by `recipe.test`.
- Site bundle exports: `checkLogin`, `gotoLogin`, `recipes[]`.

Input field type support (v1):

- `string`
- `number`
- `boolean`
- `object`
- `array`

Framework input validation behavior:

- When `metadata.inputFields` is present, runtime validates payload input before recipe logic.
- Required fields (default) must exist unless `optional=true`.
- Declared types must match exactly (no coercion).
- `inputAtLeastOneOf` enforces cross-field minimum presence for conditional input contracts.
- Unknown extra input keys are rejected.
- Runtime passes a sanitized object with only declared fields to recipe logic.
- Recipes without `metadata.inputFields` remain permissive for backward compatibility.

Auth-required flow:

- If recipe metadata declares `requiresAuth`, runtime executes `checkLogin` first.
- In `auto` mode, failed login checks trigger `gotoLogin` and return deterministic `manual_login_required`.
- End users complete authentication manually in the browser, then rerun the recipe.

Current bundled sites:

- `reddit.com` (`getFeed`, `getUserInfo`, `sendChatMessage`, `getChatMessages`)
- `news.ycombinator.com` (`getFrontPage`)

Reddit recipe notes:

- `checkLogin` now uses Reddit API session probe (`/api/me.json`) with selector fallback to reduce false `manual_login_required` outcomes when the user is already authenticated.
- `sendChatMessage` supports either existing `roomId` or room creation via `username`, then sends text through Reddit chat composer.
- `getChatMessages` supports two modes: with `roomId`, it loads room-scoped history from Matrix `/rooms/{roomId}/messages`; without `roomId`, it loads a bounded recent multi-room snapshot from Matrix `/sync` timeline events. Output is grouped by room (`rooms[]`) with per-room message lists and counts.
- `getUserInfo` supports lookup by `username` or account id and returns normalized profile metadata plus enrollment-relevant flags when available.
- `sendChatMessage` includes a recipe-level `test` hook used by `otto test` for non-side-effect readiness checks, while `recipe.run` still performs message delivery.
- `getChatMessages` `test` returns a recipe-native stream manifest with listener subscription details so CLI can stream updates until interrupted.

## Runtime Execution Lifecycle

1. Parse `recipe.run`/`recipe.test` payload or alias mapping (`recipe.reddit_feed`).
2. Resolve site bundle and recipe id.
3. Resolve and validate `tabSessionId`.
4. Ensure active tab URL matches target site bundle.
5. Validate and sanitize recipe input from metadata when declared.
6. Run auth preflight if required (`checkLogin` then optional `gotoLogin`).
7. Run recipe execution path:
- `recipe.run`: call `execute` directly.
- `recipe.test`: call `test` when defined, otherwise fall back to `execute`.
- For recipes returning `stream.listeners` from `test`, CLI subscribes to listener updates and stays active until `Ctrl+C`; cancellation targets the original `recipe.test` request so relay can deterministically close stream sessions.
8. Enforce `metadata.preloadHost` before any call into `execute`.
9. Return normalized recipe result object.

Preload host notes:

- Matching is host-based using runtime site match semantics.
- Runtime auto-navigates to `preloadHost` before `execute` when needed.
- If navigation finishes on a different host, runtime returns `preload_host_mismatch`.

## Recipe Network Interception API

Recipes can start response interception within the currently managed `tabSessionId` using the runtime context helper:

- `ctx.startNetworkInterception(options?)`

Context API behavior:

- Interception is always bound to the recipe's managed `tabSessionId`.
- Site scope is enforced from the resolved recipe bundle site.
- Returned handle exposes bounded pull-style event consumption.
- Runtime automatically stops all active recipe-started interceptions when recipe execution completes or throws.

Type-level contract (simplified):

```ts
type RecipeNetworkInterceptionOptions = {
	urlPatterns?: string[];
	mode?: 'network' | 'fetch' | 'hybrid';
	includeBody?: boolean;
	includeHeaders?: boolean;
	maxBodyBytes?: number;
	mimeTypes?: string[];
};

type RecipeNetworkInterceptionEvent = {
	updateType: string;
	emittedAt: string;
	data: unknown;
};

type RecipeNetworkInterceptionHandle = {
	requestId: string;
	takeUpdates: () => RecipeNetworkInterceptionEvent[];
	stop: () => Promise<void>;
};
```

Recommended usage pattern inside a recipe:

```ts
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

Update types emitted by runtime interception manager:

- `network.response`
- `network.error`
- `network.detached`

Operational limits and caveats:

- `mode=network` is passive and may miss bodies for redirects/cache/evicted buffers.
- `mode=fetch` and `mode=hybrid` may add latency because requests are paused at response stage.
- Body payloads are capped (`maxBodyBytes`) and may be flagged as truncated.
- Sensitive headers are redacted when `includeHeaders=true`.
- Binary bodies may be base64-encoded in emitted data.

## Error Contract (Current)

Common deterministic codes:

- `unknown_site`
- `unknown_recipe`
- `site_mismatch`
- `missing_tab_session`
- `unknown_tab_session`
- `manual_login_required`

Reddit-specific execution errors (recipe-level messages/codes):

- `reddit_user_not_found`
- `reddit_user_unmessageable`
- `reddit_rate_limited`
- `reddit_matrix_token_missing`

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
- If `--tab-session` is omitted, CLI auto-opens recipe `preloadHost` when metadata provides it, otherwise falls back to `https://<site>`.
- Auto-opened test tabs are closed automatically when the command completes; pass `--keep-tab-open` to keep the tab for manual inspection.
- Non-TTY mode emits JSON and returns non-zero exit code on terminal errors for automation.
- Use `otto recipes list [--site <site>]` to inspect available metadata exposed by the node runtime.
- `otto test` now sends `recipe.test` action.
- If a recipe does not define `test`, runtime automatically falls back to `execute`.

Recipe test hook contract:

- `test(ctx, input, helpers)` is optional.
- `helpers.authMode` mirrors the command payload auth mode.
- `helpers.execute(inputOverride?)` runs the normal recipe execute path with preload validation.
- Recommended pattern: do deterministic setup/assertions in `test`, then call `helpers.execute()`.

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
