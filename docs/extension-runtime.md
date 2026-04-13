# Extension Runtime

Last Updated: 2026-04-12
Owner: Browser Runtime

## Runtime Components

- `entrypoints/background.ts`: orchestration, alarms, command dispatch
- `entrypoints/popup.html`: primary end-user onboarding surface from toolbar icon
- `src/runtime/background-bootstrap.ts`: startup, pairing checks, keep-warm reconciliation
- `src/runtime/offscreen-client.ts`: persistent relay WebSocket and heartbeat
- `src/runtime/command-executor.ts`: primitive and command command execution
- `src/runtime/command-runtime.ts`: site command resolution, auth preflight, and execution orchestration
- `src/runtime/network-intercept-listener.ts`: per-tab debugger session management for response interception
- `src/runtime/listener-managers.ts`: singleton listener-manager access for background and command runtime
- `src/runtime/options-ui.ts`: relay URL configuration UI logic

## Source-of-Truth Code Paths

- Background entrypoint: `extension/entrypoints/background.ts`
- Bootstrap and reconciliation: `extension/src/runtime/background-bootstrap.ts`
- Offscreen transport owner: `extension/src/runtime/offscreen-client.ts`
- Command execution/runtime errors: `extension/src/runtime/command-executor.ts`
- Replay ledger: `extension/src/runtime/command-replay.ts`
- Command registry: `extension/src/commands/index.ts`
- Command bundles: `extension/src/commands/**`

## Pairing + Auth Behavior

1. Background ensures persistent `nodeId` in `chrome.storage.local`.
2. If node tokens do not exist, background requests pairing challenge from relay.
3. Pairing code is stored locally and shown in options UI.
4. Background polls pairing status during keep-warm cycle.
5. When approved, background stores node tokens.
6. Offscreen WebSocket authenticates with node access token.

Onboarding status model (popup/options):

- `needs_relay_url`: relay URL missing or invalid
- `requesting_pairing_code`: no token and no active pairing code yet
- `waiting_for_pair_approval`: pairing code present; approval expected via CLI
- `authenticated_connecting`: node token present; socket is still establishing
- `authenticated_connected`: relay auth acknowledged and command transport active
- `error`: latest relay/socket/auth failure surfaced for user recovery

User flow (v1):

1. Load extension and click Otto toolbar icon.
2. Enter relay URL (saved automatically).
3. If code is shown, run `otto pair <code>` from terminal.
4. Popup auto-refreshes while waiting for approval and transitions to connected once relay auth succeeds.

Controller Access panel (popup):

- Once node auth is available, popup shows a "Controller Access" card with a node summary (`<granted> granted / <total> total`).
- Card rows render avatar + controller identity + description + grant action in a stable two-column layout.
- Grant/revoke action buttons use fixed-width styling so row alignment remains consistent across grant-state text changes.
- The panel refresh action is icon-only (with accessible label/title) and re-queries ACL rows without altering node auth state.
- Row metadata is intentionally concise in popup view: `Last used ... • granted` or `Last used ... • awaiting approval`.
- Long labels/descriptions are bounded via ellipsis/line clamp to keep rows inside panel bounds.

Refresh behavior (deterministic):

- Popup and options "Refresh" action waits for background keep-warm maintenance completion before returning success.
- Maintenance completion includes pairing-state reconciliation, offscreen-document ensure, and action-badge sync.
- Refresh now surfaces an immediate in-progress status message in UI so users can see the action is running.
- During maintenance, stored node credentials are revalidated via refresh-token exchange. If refresh is rejected, extension clears stale node tokens and re-enters pairing challenge flow automatically.

Configuration ownership:

- Extension relay URL and pairing/token state are stored in extension storage (`chrome.storage.*`).
- Controller CLI setup (`otto setup`) and controller settings (`~/.otto/config.json`) are separate and not required for extension persistence.

## Command Execution

1. Offscreen receives `command` frame and forwards to background.
2. Background executes primitive operation.
3. Background returns `result` or structured `error` envelope.
4. Offscreen sends envelope back to relay.
5. If WebSocket is temporarily unavailable, offscreen queues outbound envelopes and flushes after `auth_ack` on reconnect.
6. Background deduplicates replayed commands by `idempotencyKey` (or `requestId` fallback) and returns cached terminal response.

Listener infrastructure:

- `listener.subscribe` and `listener.unsubscribe` are supported command actions in runtime scaffolding.
- Subscribe/unsubscribe return terminal `result`/`error` immediately like any other command.
- Background tracks active listener subscribe `requestId` values in-memory.
- Runtime includes `network.http_intercept` listener source, backed by `chrome.debugger` with CDP `Network` and optional `Fetch` domains.
- `network.http_intercept` emits update types: `network.response`, `network.error`, and `network.detached`.
- Site-specific stream parsing and fallback policies are command-owned; runtime listener routing remains generic and listener-name agnostic beyond supported listener contracts.
- Command-owned stream adapters can be selected via listener options metadata (for example `streamAdapter=reddit.chat.v1`) so background subscription hooks transform raw network updates into shared domain objects before offscreen relay emission.
- Network listener manager waits for `Network.loadingFinished` before `Network.getResponseBody`, supports optional `Fetch` fallback modes, and always continues paused fetch requests.
- Hybrid mode includes bounded cross-source duplicate suppression so equivalent response updates seen from both `Network` and `Fetch` paths are emitted once per subscription window.
- Network listener manager redacts sensitive headers (`Authorization`, `Cookie`, `Set-Cookie`, `Proxy-Authorization`) before emitting updates.
- Listener manager instances are shared through runtime singleton getters so background listener routing and command-started interception operate on one coherent per-tab debugger state map.

Command-started interception behavior:

- Command runtime context now exposes `startNetworkInterception(options?)`.
- Command-started interception is local to the active command execution and does not forward updates to relay listener streams.
- Command code consumes buffered updates via handle `takeUpdates()`.
- Runtime guarantees deterministic teardown by unsubscribing all command-started interception handles in `finally`, including on command throw.
- Any extension component can emit listener JSON updates by sending runtime message `type=otto.listenerUpdate` with:
- `requestId` (original subscribe requestId)
- `data` (JSON payload)
- optional `updateType`
- optional `emittedAt`
- Background rejects updates for unknown/inactive listener request ids.
- Accepted updates are forwarded to offscreen via `otto.offscreen.emitListenerUpdate` and emitted to relay as `event` with `payload.type=listener_update`.
- For adapter-backed listeners, forwarded updates should be shared-domain object frames (`payload.data.kind` set) while preserving original subscribe `requestId` correlation.
- Command adapters should apply semantic dedupe against replayed source payloads (for example repeated Matrix sync event snapshots) before forwarding mapped objects.

Command commands:

- `command.list` returns runtime-advertised command metadata.
- `command.run` executes site-scoped commands using payload `site`, `command`, `input`, and `authMode`.
- `command.test` executes command test hooks for `otto test` while preserving command context/auth behavior.
- `command.reddit_feed` is supported as a migration alias.

Command metadata surfaced by `command.list`:

- `inputFields` (optional) declarative command input contract.
- `inputAtLeastOneOf` (optional) cross-field minimum presence contract.
- `preloadHost` (optional) host requirement enforced before command execute path.

Command auth flow:

1. Resolve site bundle and command metadata.
2. Wait briefly for tab URL commit when a tab was just opened, then validate URL belongs to target site.
3. If command metadata declares `inputFields`, validate required fields, strict types, and reject unknown keys.
4. If command metadata declares `inputAtLeastOneOf`, validate at least one field from that set is provided.
5. If `requiresAuth` and `authMode` is not `skip`, run `checkLogin`.
6. If unauthenticated and `authMode=auto`, run `gotoLogin` then return `manual_login_required`.
7. Invoke command mode:
- `command.run`: execute command `execute` function.
- `command.test`: invoke optional command `test` hook; if absent, run `execute` directly.
8. Ensure `preloadHost` before every call into command `execute` (auto-navigate when current host does not match).
9. After preload host URL commit, runtime waits in a bounded loop for page readiness (`document.readyState === complete`) before entering command `execute`.
10. User logs in manually and reruns command when required.

Reddit auth details:

- `reddit.com/checkLogin` performs an API-backed probe against `/api/me.json` and returns auth metadata (`username`, `id`, `avatar`) when available.
- If API probe is unavailable, runtime falls back to bounded DOM signal checks to avoid hard false negatives during transient rendering.

URL readiness behavior:

- Command runtime applies a short bounded poll window before site validation to avoid false negatives immediately after `primitive.tab.open`.
- If committed tab URL remains unavailable after the window, runtime returns transient execution error `tab_url_not_ready` (`retryable=true`).
- If committed URL is present but does not match command site, runtime returns `site_mismatch` (`retryable=false`).
- Runtime still never executes command logic before site validation succeeds.
- When `preloadHost` is configured, runtime auto-navigates to the host before execute and returns `preload_host_mismatch` only if the committed URL host still does not match.
- The same preload gate is shared by `command.run` and `command.test` execute paths, including test-hook fallback via `helpers.execute(...)`.

## MV3 Resilience

- Offscreen document for long-lived WebSocket
- Alarm keep-warm fallback for worker lifecycle interruptions
- Background maintenance tasks are serialized to avoid overlapping startup/keep-warm races
- Offscreen creation is guarded with keyed single-flight and tolerates benign duplicate-create races
- Exponential reconnect backoff with jitter for offscreen relay socket
- Bounded outbound replay queue to preserve background responses during transient relay disconnects

Offscreen lifecycle details:

1. Runtime checks for existing offscreen context using `runtime.getContexts` for `offscreen.html`.
2. If absent, runtime attempts `offscreen.createDocument` under single-flight key `offscreen.ensure`.
3. If Chrome reports `Only a single offscreen document may be created.`, runtime treats it as benign race completion.
4. All other offscreen creation failures remain hard errors and are logged by background runtime error handling.

Reconnect diagnostics:

- Offscreen runtime logs reconnect attempt number and selected backoff delay.
- Offscreen runtime logs whether it is waiting for pairing with or without an available pairing code.
- Relay auth failures received as auth-category error envelopes are logged and mirrored to onboarding error state.

## Local Dev Log Streaming

- Popup/options expose `localDevLogStreamingEnabled` toggle for local development debugging.
- When enabled, extension runtime starts queueing structured extension log objects as soon as relay URL is saved.
- Offscreen client flushes queued extension logs after websocket auth completes and continues streaming live runtime log events.
- Relay persists these as `source: node` and merges them into standard relay log APIs/streams.
- Sensitive fields remain redacted at relay ingress; extension log payloads must avoid raw credentials.

Command script debugging behavior:

- Runtime adds a command debug context (`ctx.debug`) for all site commands.
- Command code emits bounded structured debug events via `ctx.debug.log(...)` by default.
- In-page `ctx.executeScript(...)` code can emit `console.log` checkpoints; these appear in the target tab DevTools console.
- Runtime forwards command debug events as node extension logs with type `command.script_debug`, visible via `otto logs follow --source node`.

Transport details:

- Extension debug logs are sent through a dedicated bounded outbound queue in offscreen runtime (separate from listener update queue).
- Extension debug log flushing is batched and paced; flush pauses when websocket `bufferedAmount` exceeds threshold.
- When local-dev log streaming is disabled, pending extension debug-log buffers are cleared.
- Relay `rate_limited` error frames are treated as traffic backpressure signals (not authentication failures) in offscreen runtime.
- Offscreen warning logs for relay rate-limit signals are throttled to avoid console flood.

Operational implication:

- Under heavy stream traffic, relay `rate_limited` warnings typically indicate dropped extension telemetry frames.
- Data-plane listener updates continue through their own outbound path and are prioritized over debug-log traffic.

## tabSessionId Model

- New tab operations mint `tabSessionId`.
- Mapping is stored in `chrome.storage.session`.
- Controller ownership metadata is stored in `chrome.storage.session.tabSessionOwners` (keyed by `tabSessionId`) when relay injects owner identity on `primitive.tab.open`.
- Tab group state is tracked with `automationGroupId`.
- Automation group initialization is single-flight guarded to avoid duplicate group creation under concurrent `primitive.tab.open` calls.

Compatibility behavior:

- Runtime accepts `tabSessionId` from command top-level field or payload field.
- Stale mappings are pruned when tab lookup fails.
- Internal `primitive.tab.close_owned` closes only sessions whose owner matches provided `controllerClientId`; stale session ownership entries are pruned during close/lookup cleanup.

Debugger focus emulation behavior:

- Commands can opt in using metadata `requiresDebuggerFocus=true`.
- Runtime enables debugger focus emulation (`Emulation.setFocusEmulationEnabled`) only after tab URL site validation succeeds.
- Activation failures are deterministic and command-scoped (`debugger_focus_unavailable`, `debugger_focus_conflict`, `debugger_focus_permission_denied`, `debugger_focus_attach_failed`, `debugger_focus_command_failed`).
- When network interception is also active on the same tab, runtime reuses the existing debugger attachment instead of requiring a second attach.
- Runtime detaches debugger focus emulation when managed tabs close (`primitive.tab.close` and `primitive.tab.close_owned`).

Why this runtime path was added:

- Certain command flows can stall in background tabs when callback cadence changes under throttling.
- Focus emulation is a targeted mitigation to improve command progress reliability without forcing every command into debugger mode.
- Opt-in metadata keeps the behavior explicit, reviewable, and site/command scoped.

Shared debugger-session ownership model:

- Runtime tracks whether each feature path owns debugger attachment for a tab.
- If debugger is already attached by another Otto feature path, runtime attempts to reuse the active session.
- Detach happens only for owner paths; shared/reused paths skip detach to avoid breaking sibling feature flows.
- This is especially important when command runtime focus emulation and network interception are active together on one tab.

Operational notes:

- If external DevTools/debugger owns attachment and runtime cannot issue required commands, activation fails with deterministic conflict-style errors.
- Successful reuse and ownership decisions are now logged as structured node debug events to support live troubleshooting (`otto logs follow --source node`).

Persistence notes:

- `chrome.storage.local` holds durable node state across browser restarts (`nodeId`, relay URL, node tokens, pairing metadata).
- `chrome.storage.session` holds reconstructable runtime state (`tabSessions`, `tabSessionOwners`, automation group id, replay ledger) and is reconciled during bootstrap.
