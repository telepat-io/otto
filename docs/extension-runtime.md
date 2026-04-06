# Extension Runtime

Last Updated: 2026-04-05
Owner: Browser Runtime

## Runtime Components

- `entrypoints/background.ts`: orchestration, alarms, command dispatch
- `entrypoints/popup.html`: primary end-user onboarding surface from toolbar icon
- `src/runtime/background-bootstrap.ts`: startup, pairing checks, keep-warm reconciliation
- `src/runtime/offscreen-client.ts`: persistent relay WebSocket and heartbeat
- `src/runtime/command-executor.ts`: primitive and recipe command execution
- `src/runtime/recipe-runtime.ts`: site recipe resolution, auth preflight, and execution orchestration
- `src/runtime/network-intercept-listener.ts`: per-tab debugger session management for response interception
- `src/runtime/listener-managers.ts`: singleton listener-manager access for background and recipe runtime
- `src/runtime/options-ui.ts`: relay URL configuration UI logic

## Source-of-Truth Code Paths

- Background entrypoint: `extension/entrypoints/background.ts`
- Bootstrap and reconciliation: `extension/src/runtime/background-bootstrap.ts`
- Offscreen transport owner: `extension/src/runtime/offscreen-client.ts`
- Command execution/runtime errors: `extension/src/runtime/command-executor.ts`
- Replay ledger: `extension/src/runtime/command-replay.ts`
- Recipe registry: `extension/src/recipes/index.ts`
- Recipe bundles: `extension/src/recipes/**`

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
- Network listener manager waits for `Network.loadingFinished` before `Network.getResponseBody`, supports optional `Fetch` fallback modes, and always continues paused fetch requests.
- Network listener manager redacts sensitive headers (`Authorization`, `Cookie`, `Set-Cookie`, `Proxy-Authorization`) before emitting updates.
- Listener manager instances are shared through runtime singleton getters so command-driven listeners and recipe-driven listeners operate on one coherent per-tab debugger state map.

Recipe-started interception behavior:

- Recipe runtime context now exposes `startNetworkInterception(options?)`.
- Recipe-started interception is local to the active recipe execution and does not forward updates to relay listener streams.
- Recipe code consumes buffered updates via handle `takeUpdates()`.
- Runtime guarantees deterministic teardown by unsubscribing all recipe-started interception handles in `finally`, including on recipe throw.
- Any extension component can emit listener JSON updates by sending runtime message `type=otto.listenerUpdate` with:
- `requestId` (original subscribe requestId)
- `data` (JSON payload)
- optional `updateType`
- optional `emittedAt`
- Background rejects updates for unknown/inactive listener request ids.
- Accepted updates are forwarded to offscreen via `otto.offscreen.emitListenerUpdate` and emitted to relay as `event` with `payload.type=listener_update`.

Recipe commands:

- `recipe.list` returns runtime-advertised recipe metadata.
- `recipe.run` executes site-scoped recipes using payload `site`, `recipe`, `input`, and `authMode`.
- `recipe.test` executes recipe test hooks for `otto test` while preserving recipe context/auth behavior.
- `recipe.reddit_feed` is supported as a migration alias.

Recipe metadata surfaced by `recipe.list`:

- `inputFields` (optional) declarative recipe input contract.
- `inputAtLeastOneOf` (optional) cross-field minimum presence contract.
- `preloadHost` (optional) host requirement enforced before recipe execute path.

Recipe auth flow:

1. Resolve site bundle and recipe metadata.
2. Wait briefly for tab URL commit when a tab was just opened, then validate URL belongs to target site.
3. If recipe metadata declares `inputFields`, validate required fields, strict types, and reject unknown keys.
4. If recipe metadata declares `inputAtLeastOneOf`, validate at least one field from that set is provided.
5. If `requiresAuth` and `authMode` is not `skip`, run `checkLogin`.
6. If unauthenticated and `authMode=auto`, run `gotoLogin` then return `manual_login_required`.
7. Invoke recipe mode:
- `recipe.run`: execute recipe `execute` function.
- `recipe.test`: invoke optional recipe `test` hook; if absent, run `execute` directly.
8. Ensure `preloadHost` before every call into recipe `execute` (auto-navigate when current host does not match).
9. User logs in manually and reruns command when required.

Reddit auth details:

- `reddit.com/checkLogin` performs an API-backed probe against `/api/me.json` and returns auth metadata (`username`, `id`, `avatar`) when available.
- If API probe is unavailable, runtime falls back to bounded DOM signal checks to avoid hard false negatives during transient rendering.

URL readiness behavior:

- Recipe runtime applies a short bounded poll window before site validation to avoid false negatives immediately after `primitive.tab.open`.
- If committed tab URL remains unavailable after the window, runtime returns transient execution error `tab_url_not_ready` (`retryable=true`).
- If committed URL is present but does not match recipe site, runtime returns `site_mismatch` (`retryable=false`).
- Runtime still never executes recipe logic before site validation succeeds.
- When `preloadHost` is configured, runtime auto-navigates to the host before execute and returns `preload_host_mismatch` only if the committed URL host still does not match.

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

## tabSessionId Model

- New tab operations mint `tabSessionId`.
- Mapping is stored in `chrome.storage.session`.
- Tab group state is tracked with `automationGroupId`.
- Automation group initialization is single-flight guarded to avoid duplicate group creation under concurrent `primitive.tab.open` calls.

Compatibility behavior:

- Runtime accepts `tabSessionId` from command top-level field or payload field.
- Stale mappings are pruned when tab lookup fails.

Persistence notes:

- `chrome.storage.local` holds durable node state across browser restarts (`nodeId`, relay URL, node tokens, pairing metadata).
- `chrome.storage.session` holds reconstructable runtime state (`tabSessions`, automation group id, replay ledger) and is reconciled during bootstrap.
