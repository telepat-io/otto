# Commands

Last Updated: 2026-04-14
Owner: Browser Runtime

Otto command docs serve two audiences at once: command authors implementing extension bundles, and controller users validating behavior through CLI execution. The command model is site-scoped, metadata-driven, and intentionally strict at runtime so handlers receive sanitized inputs in a validated tab context.

## Source-of-Truth Code Paths

| Concern | Source |
| --- | --- |
| Command dispatch and execution | `extension/src/runtime/command-executor.ts` |
| Site command orchestration | `extension/src/runtime/command-runtime.ts` |
| Site command bundles | `extension/src/commands/**` |
| Shared action contracts | `packages/shared-protocol/src/index.ts` |
| Relay terminalization and routing | `packages/relay/src/index.ts` |

## Action Surface

The protocol exposes low-level primitive actions and higher-level site command actions. CLI entrypoints wrap these actions and keep the controller-side workflow consistent for both humans and automation.

| Group | Actions |
| --- | --- |
| Primitive | `primitive.tab.open`, `primitive.tab.close`, `primitive.tab.navigate`, `primitive.tab.query`, `primitive.dom.extract_text` |
| Command | `command.list`, `command.run`, `command.test`, `command.reddit_feed` (legacy alias) |
| Common CLI entrypoints | `otto commands list`, `otto test <site> <command>`, `otto cmd --action ...` |

`otto test` keeps the auto-registered tester controller identity by default. Pass `--cleanup-test-controller` when you need ephemeral test-controller lifecycle.

## Site Command Model

Commands are grouped by site under `extension/src/commands/<site>/`. Each site bundle provides auth primitives (`checkLogin`, `gotoLogin`) plus one or more command modules exporting metadata and execution logic. Runtime payloads for `command.run` and `command.test` share the same shape (`site`, `command`, optional `input`, optional `authMode`) so test paths can mirror production execution.

For command script execution, runtime exposes both `executeScript(...)` and `executeScriptWithDomHelpers(...)`. Use the DOM-helper variant when selectors can traverse nested shadow roots.

## Command Contract

Each command file combines declarative metadata with execution hooks.

| Field | Required | Purpose |
| --- | --- | --- |
| `metadata` | Yes | Identity, display metadata, tags, auth requirement |
| `metadata.requiresDebuggerFocus` | No | Opt-in focus emulation gate for throttling-sensitive flows |
| `metadata.inputFields` | No | Declarative input schema (`name`, `type`, `description`, `optional`) |
| `metadata.inputAtLeastOneOf` | No | Cross-field minimum presence constraint |
| `metadata.preloadHost` | No | Host gate enforced before execute path |
| `execute(ctx, input, authMode)` | Yes | Main command behavior |
| `test(ctx, input, helpers)` | No | Dedicated `command.test` hook |

Supported declarative input types are `string`, `number`, `boolean`, `object`, and `array`.

When `metadata.inputFields` is present, runtime performs strict validation before command logic: required-field enforcement, exact type checking (no coercion), unknown-key rejection, optional `inputAtLeastOneOf` checks, and sanitization to declared keys only. Commands without `inputFields` remain permissive for compatibility.

## Runtime Execution Flow

Runtime command orchestration is intentionally ordered so failures are deterministic and easy to debug.

1. Parse command payload (`command.run`, `command.test`, or legacy alias mapping).
2. Resolve site bundle and command metadata.
3. Resolve and validate `tabSessionId` plus site URL match.
4. Validate/sanitize declared input metadata when present.
5. Run auth preflight for `requiresAuth` commands.
6. Apply preload host gate when configured.
7. Execute command mode (`execute` for run, `test` hook with execute fallback for test).
8. Return normalized terminal result or structured error.

Commands requiring auth never automate credential entry. In `authMode=auto`, runtime may navigate to login and returns `manual_login_required` for explicit human handoff.

## Focus Emulation and DOM Helper Guidance

`requiresDebuggerFocus` is a command-scoped opt-in for flows affected by background-tab throttling. Runtime activates focus emulation only after site/tab validation succeeds, and activation failures remain deterministic (`debugger_focus_unavailable`, `debugger_focus_conflict`, `debugger_focus_permission_denied`, `debugger_focus_attach_failed`, `debugger_focus_command_failed`).

`executeScriptWithDomHelpers(...)` installs idempotent deep-query helpers in page context:

- `window.__ottoDeepQuerySelector(root, selector)`
- `window.__ottoDeepQuerySelectorAll(root, selector)`

Command logic should still fail explicitly if helper install is unexpectedly unavailable.

Current bundled sites:

- `reddit.com` (`getFeed`, `getUserInfo`, `sendChatMessage`, `getChatMessages`)
- `news.ycombinator.com` (`getFrontPage`)

## Reddit Bundle Notes

Reddit commands are the most feature-rich bundle and therefore the best reference for advanced patterns. `checkLogin` uses an API-first session probe (`/api/me.json`) with bounded selector fallback. `sendChatMessage` supports either direct room sends (`roomId`) or room creation flow (`username`), and both flows rely on deep Shadow DOM helper execution. `getChatMessages` supports room-scoped history and multi-room snapshots, and its test path can return stream manifests for command-native follow mode.

`getFeed` and `getChatMessages` both opt into `requiresDebuggerFocus` because these flows are sensitive to background-tab throttling. Listener adapters map Matrix traffic into shared-domain objects (`chat.message`, `chat.typing`, `chat.participant`, `chat.message_deleted`) and apply semantic dedupe on top of interception-layer dedupe. Where source payloads are available, adapters should include `originalEntity` (including nested references) so controllers can reconcile normalized data with source-specific context.

| Reddit command | Key behavior |
| --- | --- |
| `getFeed` | Hydrates post permalinks via `.json`, supports optional `minReturnedPosts`, returns shared `content.post` trees |
| `getUserInfo` | Looks up by username/id or defaults to current session, returns shared `entity.user` profile |
| `sendChatMessage` | Supports `roomId` direct send or username-based room create + send; test hook covers end-to-end flow |
| `getChatMessages` | Reads Matrix history/sync and can emit stream manifest with `network.http_intercept` + adapter hint |

## Command Test and Stream Lifecycle

`otto test` invokes `command.test` first. If a command does not export a `test` hook, runtime falls back to `execute`. For stream-capable commands, `test` can return `stream.listeners`; CLI then subscribes and keeps the session open until interrupted. `--timeout` applies only to the initial `command.test` response window, not to active stream follow duration.

Non-JSON output remains human-oriented, including compact summary lines for structured command payloads, while `--json` preserves full envelope objects. Long-lived streams should keep heartbeat traffic active (`ping`/`pong`) and teardown should target the original `command.test` request via `command_cancel` so relay can terminalize stream sessions deterministically.

Preload host gates are host-based and enforced before execute logic. If runtime auto-navigation lands on a mismatched host, the command fails with `preload_host_mismatch`.

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

Update types emitted by runtime interception manager are `network.response`, `network.error`, and `network.detached`.

`mode=hybrid` may observe both CDP surfaces for the same response. Runtime suppression emits at most one equivalent response update per subscription within a bounded window, and command adapters should still apply object-level dedupe against replayed source semantics.

Operationally, `mode=network` is passive and can miss bodies for redirect/cache/eviction cases, while `mode=fetch`/`hybrid` can add latency because requests are paused at response stage. Body size is capped by `maxBodyBytes`, sensitive headers are redacted when included, and binary bodies may be base64-encoded.

## Error Contract (Current)

| Class | Codes |
| --- | --- |
| Common deterministic codes | `unknown_site`, `unknown_command`, `site_mismatch`, `missing_tab_session`, `unknown_tab_session`, `manual_login_required` |
| Reddit-specific execution codes | `reddit_user_not_found`, `reddit_user_unmessageable`, `reddit_rate_limited`, `reddit_matrix_token_missing` |

## Authoring Guidelines

1. Keep command execution bounded in time and payload size.
2. Do not include secrets or credentials in returned data.
3. Prefer stable selectors and null-safe extraction.
4. Return structured objects with predictable fields.
5. Use `requiresAuth` only when website session state is truly required.
6. For shared domain outputs, attach `originalEntity` whenever source payloads are available and safe to expose.

Developer test flow:

1. Use `otto commands list [--site <site>]` to inspect command metadata and declared inputs.
2. Run `otto test <site> <command>` for local execution.
3. If `targetNodeId` is missing/stale and only one node is connected, CLI auto-selects it; with multiple nodes, pass `--node-id`.
4. If `--tab-session` is omitted, CLI auto-opens `preloadHost` when present, otherwise `https://<site>`.
5. For streaming tests, keep session open until `Ctrl+C` (or use `--wait-for-interrupt` to inspect tab state before cleanup).

`otto test reddit.com getFeed` defaults `input.minReturnedPosts=20` when payload omits it. Non-TTY mode emits JSON and returns non-zero on terminal errors.

Command test hook contract:

- `test(ctx, input, helpers)` is optional.
- `helpers.authMode` mirrors command payload auth mode.
- `helpers.execute(inputOverride?)` runs the normal execute path with preload checks.
- Recommended pattern is bounded setup/assertions in `test`, then `helpers.execute()`.

Recommended setup prerequisites:

1. Run `otto setup` to prepare controller config and extension import path.
2. Load extension in Chrome and set node relay URL in extension options if needed.
3. Complete pairing (`otto authcode`, `otto pair <code>`) before command commands.

Ownership boundary reminder:

- `otto settings` affects controller defaults only.
- Extension runtime configuration for node connectivity is managed in extension options.

Command constraints remain the same: bounded runtime and payloads, explicit warning/error schemas, and sensitivity-aware output suitable for redaction policy.
