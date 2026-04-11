# Commands

Last Updated: 2026-04-10
Owner: Browser Runtime

## Source-of-Truth Code Paths

- Extension command execution and command dispatch: `extension/src/runtime/command-executor.ts`
- Extension command runtime orchestration: `extension/src/runtime/command-runtime.ts`
- Extension site command registry and modules: `extension/src/commands/**`
- Shared action contracts: `packages/shared-protocol/src/index.ts`
- Relay command routing and terminalization: `packages/relay/src/index.ts`

## Design Goals

- Keep command authoring simple and local to extension runtime.
- Make commands discoverable and testable by humans and agents.
- Support website-specific auth preflight without credential automation.
- Preserve relay invariants (target node, queueing, terminal outcomes).

## Implemented v1 Actions

Primitive actions:

- `primitive.tab.open`
- `primitive.tab.close`
- `primitive.tab.navigate`
- `primitive.tab.query`
- `primitive.dom.extract_text`

Command actions:

- `command.list`
- `command.run`
- `command.test`
- `command.reddit_feed` (legacy alias)

CLI entrypoints:

- `otto commands list [--site <site>]`
- `otto test <site> <command> [--payload <json>] [--timeout <ms>] [--auth-mode auto|strict_fail|skip] [--json]`
- `otto test` retains auto-registered `otto-tester` controller identity by default; pass `--cleanup-test-controller` to remove it after the run.

Site-scoped command model:

- Commands are grouped by website in `extension/src/commands/<site>/`.
- Each site bundle must provide built-ins: `checkLogin` and `gotoLogin`.
- Custom commands export metadata plus an `execute(ctx, input, authMode)` function.
- Commands can optionally export `test(ctx, input, helpers)` for `otto test` setup/assertion flows.
- `command.run` payload carries `site`, `command`, optional `input`, and `authMode` (`auto|strict_fail|skip`).
- `command.test` payload carries the same fields and runs command-specific test logic when present.

Command file shape:

- `metadata`: identity, display fields, tags, and `requiresAuth`.
- `metadata.requiresKeepAlive` (optional): when `true`, runtime requires the target `tabSessionId` to be an active keepalive-mode tab.
- `metadata.inputFields` (optional): declarative command inputs with field `name`, `type`, `description`, `optional`.
- `metadata.preloadHost` (optional): host that must be loaded before command `execute` runs.
- `metadata.inputAtLeastOneOf` (optional): list of input field names where at least one must be provided.
- `execute(ctx, input, authMode)`: implementation logic.
- `test(ctx, input, helpers)` (optional): programmatic test entrypoint used by `command.test`.
- Site bundle exports: `checkLogin`, `gotoLogin`, `commands[]`.

Input field type support (v1):

- `string`
- `number`
- `boolean`
- `object`
- `array`

Framework input validation behavior:

- When `metadata.inputFields` is present, runtime validates payload input before command logic.
- Required fields (default) must exist unless `optional=true`.
- Declared types must match exactly (no coercion).
- `inputAtLeastOneOf` enforces cross-field minimum presence for conditional input contracts.
- Unknown extra input keys are rejected.
- Runtime passes a sanitized object with only declared fields to command logic.
- Commands without `metadata.inputFields` remain permissive for backward compatibility.
- Keepalive enforcement is descriptor-driven and runs before command logic when `metadata.requiresKeepAlive=true`.
- If tab keepalive mode/readiness state is missing or inactive, runtime rejects with `keepalive_required_tab_mode_mismatch`.

Auth-required flow:

- If command metadata declares `requiresAuth`, runtime executes `checkLogin` first.
- In `auto` mode, failed login checks trigger `gotoLogin` and return deterministic `manual_login_required`.
- End users complete authentication manually in the browser, then rerun the command.

Current bundled sites:

- `reddit.com` (`getFeed`, `getUserInfo`, `sendChatMessage`, `getChatMessages`)
- `news.ycombinator.com` (`getFrontPage`)

Reddit command notes:

- `checkLogin` now uses Reddit API session probe (`/api/me.json`) with selector fallback to reduce false `manual_login_required` outcomes when the user is already authenticated.
- `sendChatMessage` supports either existing `roomId` or room creation via `username`, then sends text through Reddit chat composer.
- `getChatMessages` supports two modes: with `roomId`, it loads room-scoped history from Matrix `/rooms/{roomId}/messages`; without `roomId`, it loads a bounded recent multi-room snapshot from Matrix `/sync` timeline events. Output is grouped by room (`rooms[]`) with per-room message lists and counts.
- `getChatMessages` command test streaming subscribes with `listener=network.http_intercept` in `fetch` mode for Reddit Matrix v3 sync traffic (`https://matrix.redditspace.com/_matrix/client/v3/sync*`) and declares command-owned adapter metadata (`options.streamAdapter=reddit.chat.v1`).
- Adapter mapping converts raw Matrix sync payloads into shared domain chat objects (`chat.message`, `chat.typing`, `chat.participant`, `chat.message_deleted`) before controller-visible stream forwarding.
- Root cause of prior duplicate stream lines was dual transport visibility in hybrid mode (`Network` + `Fetch`) plus replayed Matrix sync payload semantics.
- Duplicate suppression now runs in two layers:
- interception layer suppresses equivalent hybrid cross-source response updates
- command adapter layer suppresses repeated semantic chat object emissions
- Shared domain objects emitted by command adapters should include `originalEntity` when source entities are available (including nested refs like `from`/`to`/`conversation`) so controllers can keep normalized + source-specific context together.
- `getUserInfo` supports lookup by `username` or account id and returns normalized profile metadata plus enrollment-relevant flags when available.
- `sendChatMessage` includes a command-level `test` hook used by `otto test` for non-side-effect readiness checks, while `command.run` still performs message delivery.
- `getChatMessages` `test` returns a command-native stream manifest with listener subscription details and includes command-owned poll fallback metadata (`fallback.strategy=command_poll`) for bounded recovery flows.
- `getFeed` now collects feed post permalinks from `#main-content`, hydrates each post via Reddit `.json` endpoints, and returns generic `content.post` objects with recursive `content.post_comment` trees when available.
- `getFeed` and `getChatMessages` currently declare `metadata.requiresKeepAlive=true` and are expected to run in keepalive-mode tab sessions.
- `getFeed` supports optional input `minReturnedPosts` (number). Runtime scrolls page-by-page (`scroll -> wait -> collect`) until at least that many post URLs are discovered or a bounded pagination limit is reached. Returning more than requested is allowed.
- `getFeed` keeps Reddit-specific extraction and JSON mapping logic scoped under `extension/src/commands/reddit.com/`, while output types remain shared and site-agnostic.

## Runtime Execution Lifecycle

1. Parse `command.run`/`command.test` payload or alias mapping (`command.reddit_feed`).
2. Resolve site bundle and command id.
3. Resolve and validate `tabSessionId`.
4. Ensure active tab URL matches target site bundle.
5. Validate and sanitize command input from metadata when declared.
6. Run auth preflight if required (`checkLogin` then optional `gotoLogin`).
7. Run command execution path:
- `command.run`: call `execute` directly.
- `command.test`: call `test` when defined, otherwise fall back to `execute`.
- For commands returning `stream.listeners` from `test`, CLI subscribes to listener updates and stays active until `Ctrl+C`; cancellation targets the original `command.test` request so relay can deterministically close stream sessions.
- `otto test` defaults to human-readable stream lines for easier debugging; use `--json` to print full raw envelope objects for every command and stream frame.
- For non-stream commands that return structured payload data (for example `getFeed` posts), `otto test` now prints compact summary lines in non-JSON mode after command status.
- For streaming commands, `otto test --timeout` bounds only the initial `command.test` response window; once stream listeners are active, relay does not enforce a stream duration timeout.
- Long-running controller sessions should send heartbeat `ping` frames and expect relay `pong` responses.
8. Enforce `metadata.preloadHost` before any call into `execute`.
9. Return normalized command result object.

Preload host notes:

- Matching is host-based using runtime site match semantics.
- Runtime auto-navigates to `preloadHost` before `execute` when needed.
- If navigation finishes on a different host, runtime returns `preload_host_mismatch`.

## Command Network Interception API

Commands can start response interception within the currently managed `tabSessionId` using the runtime context helper:

- `ctx.startNetworkInterception(options?)`

Context API behavior:

- Interception is always bound to the command's managed `tabSessionId`.
- Site scope is enforced from the resolved command bundle site.
- Returned handle exposes bounded pull-style event consumption.
- Runtime automatically stops all active command-started interceptions when command execution completes or throws.

Type-level contract (simplified):

```ts
type CommandNetworkInterceptionOptions = {
	urlPatterns?: string[];
	mode?: 'network' | 'fetch' | 'hybrid';
	includeBody?: boolean;
	includeHeaders?: boolean;
	maxBodyBytes?: number;
	mimeTypes?: string[];
};

type CommandNetworkInterceptionEvent = {
	updateType: string;
	emittedAt: string;
	data: unknown;
};

type CommandNetworkInterceptionHandle = {
	requestId: string;
	takeUpdates: () => CommandNetworkInterceptionEvent[];
	stop: () => Promise<void>;
};
```

Recommended usage pattern inside a command:

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

Hybrid interception semantics:

- `mode=hybrid` may observe both CDP surfaces for the same response.
- Runtime suppression emits at most one equivalent response update per subscription in a short bounded window.
- Command adapters should still defend against replayed source payload semantics with object-level dedupe.

Operational limits and caveats:

- `mode=network` is passive and may miss bodies for redirects/cache/evicted buffers.
- `mode=fetch` and `mode=hybrid` may add latency because requests are paused at response stage.
- Body payloads are capped (`maxBodyBytes`) and may be flagged as truncated.
- Sensitive headers are redacted when `includeHeaders=true`.
- Binary bodies may be base64-encoded in emitted data.

## Error Contract (Current)

Common deterministic codes:

- `unknown_site`
- `unknown_command`
- `site_mismatch`
- `missing_tab_session`
- `unknown_tab_session`
- `manual_login_required`

Reddit-specific execution errors (command-level messages/codes):

- `reddit_user_not_found`
- `reddit_user_unmessageable`
- `reddit_rate_limited`
- `reddit_matrix_token_missing`

## Authoring Guidelines

1. Keep command execution bounded in time and payload size.
2. Do not include secrets or credentials in returned data.
3. Prefer stable selectors and null-safe extraction.
4. Return structured objects with predictable fields.
5. Use `requiresAuth` only when website session state is truly required.
6. For shared domain outputs, attach `originalEntity` whenever source payloads are available and safe to expose.

Developer test flow:

- Use `otto test <site> <command>` for local execution.
- `otto test reddit.com getFeed` defaults `input.minReturnedPosts=20` when `--payload` does not provide it.
- If `targetNodeId` is missing or stale and exactly one node is connected, CLI auto-selects that connected node.
- If multiple nodes are connected, CLI requires explicit `--node-id`.
- If `--tab-session` is omitted, CLI auto-opens command `preloadHost` when metadata provides it, otherwise falls back to `https://<site>`.
- Auto-opened test tabs are closed automatically when the command completes; pass `--wait-for-interrupt` to keep the test session attached until `Ctrl+C` so you can inspect the tab before teardown.
- Non-TTY mode emits JSON and returns non-zero exit code on terminal errors for automation.
- Use `otto commands list [--site <site>]` to inspect available metadata exposed by the node runtime.
- `otto test` now sends `command.test` action.
- If a command does not define `test`, runtime automatically falls back to `execute`.

Command test hook contract:

- `test(ctx, input, helpers)` is optional.
- `helpers.authMode` mirrors the command payload auth mode.
- `helpers.execute(inputOverride?)` runs the normal command execute path with preload validation.
- Recommended pattern: do deterministic setup/assertions in `test`, then call `helpers.execute()`.

Recommended setup prerequisites:

1. Run `otto setup` to prepare controller config and extension import path.
2. Load extension in Chrome and set node relay URL in extension options if needed.
3. Complete pairing (`otto authcode`, `otto pair <code>`) before command commands.

Ownership boundary reminder:

- `otto settings` affects controller defaults only.
- Extension runtime configuration for node connectivity is managed in extension options.

Command constraints:

- Bounded runtime and payload size
- Clear warning/error return schema
- Sensitivity tags for redaction policy
