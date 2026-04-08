# Protocol

Last Updated: 2026-04-07
Owner: Platform

Current shared protocol types live in `packages/shared-protocol/src/index.ts`.

## Source-of-Truth Code Paths

- Protocol contracts: `packages/shared-protocol/src/index.ts`
- Relay protocol handling: `packages/relay/src/index.ts`
- CLI command envelope emission: `packages/cli/src/index.ts`

## Envelope

All WebSocket frames use a shared envelope:

- `protocolVersion`
- `messageType`
- `requestId`
- `timestamp`
- `senderRole`
- `payload`

Envelope requirements:

- `protocolVersion` is currently `1.0`.
- `timestamp` must be valid ISO-8601 and inside replay acceptance window.
- `requestId` is the cross-component correlation key.

## Core Message Families

- `hello` / `hello_ack` for role+capability negotiation.
- `auth` / `auth_ack` for token authentication.
- `command` for controller-issued browser actions.
- `result` / `error` for terminal outcomes.
- `event` for progress and operational events.
- `ping` / `pong` for liveness.
- `refresh` / `refresh_ack` for access token renewal.
- `tab_lock` / `tab_unlock` for lock lifecycle.
- `command_cancel` reserved for cancellation pipeline.

## Listener Commands

Listener lifecycle uses normal command frames with action values:

- `listener.subscribe`
- `listener.unsubscribe`

Listener semantics:

- Subscribe is terminal immediately: node responds with normal `result` or `error`.
- Relay preserves normal command outcomes for subscribe/unsubscribe (`completed`, `failed`, `timed_out`, `cancelled`).
- Active listener updates are emitted later as `event` frames using the original subscribe `requestId`.
- Unsubscribe is terminal immediately and targets a prior subscribe via `payload.targetRequestId`.
- After successful unsubscribe, further updates on the original subscribe `requestId` are rejected.

Listener command payload expectations:

- `listener.subscribe`: payload includes `listener` (string) and optional `options` object.
- `listener.unsubscribe`: payload includes `targetRequestId` (string).

Implemented listener source notes:

- `listener.subscribe` with `listener=network.http_intercept` starts response interception on a managed tab session via `chrome.debugger` CDP domains.
- Supported `options` keys for this source:
- `tabSessionId` (required)
- `site` (required)
- `urlPatterns` (optional glob list)
- `requestHostAllowlist` (optional explicit cross-host hostname allowlist)
- `mode` (`network`, `fetch`, or `hybrid`; default `network`)
- `includeBody` (default `true`)
- `includeHeaders` (default `false`, sensitive headers are redacted)
- `maxBodyBytes` (default `256000`)
- `mimeTypes` (optional MIME prefix allowlist)

Validation and normalization rules for `network.http_intercept` options:

- `tabSessionId` and `site` are required, trimmed, and `site` is normalized to lowercase.
- `mode` is case-insensitive after trim and must resolve to `network|fetch|hybrid`.
- `maxBodyBytes` must be numeric and positive; accepted values are normalized to integer.
- `includeBody` and `includeHeaders` must be booleans when provided.
- `urlPatterns`, `mimeTypes`, and `requestHostAllowlist` must be string arrays when provided; entries are trimmed, normalized (lowercased for `mimeTypes`/`requestHostAllowlist`), deduplicated, and empty entries are dropped.

Network interception behavior notes:

- Runtime is scoped to command-managed tabs only; `tabSessionId` must resolve to an active session.
- Runtime validates the tab URL against `site` before attaching debugger session state.
- `network` mode retrieves bodies only after `Network.loadingFinished` to reduce empty-body failures.
- `fetch` and `hybrid` modes use `Fetch.requestPaused` at response stage; paused requests are always continued by runtime.

## Tab Ownership and Orphan Cleanup

- Relay injects internal ownership metadata for controller-created tabs by setting `payload.__controllerClientId` on forwarded `primitive.tab.open` command payloads.
- This ownership metadata is relay-owned and must not be trusted when supplied directly by controller clients.
- Node runtime persists ownership by `tabSessionId` to support deterministic orphan cleanup.
- Relay may dispatch internal `primitive.tab.close_owned` commands to node runtimes when a controller disconnects or times out on heartbeat.
- `primitive.tab.close_owned` payload includes `controllerClientId` and closes only tabs owned by that controller identity.
- Body capture is best-effort and may emit `payload.data.error=response_body_unavailable` for redirects, cache hits, and evicted buffers.

Listener update event shape:

- `messageType: event`
- `requestId: <original subscribe requestId>`
- `payload.type: listener_update`
- `payload.data: <arbitrary JSON>`
- `payload.updateType` optional short event name
- `payload.emittedAt` optional ISO timestamp

Network listener update types:

- `network.response`
- `network.error`
- `network.detached`

Command test streaming:

- `command.test` can return a `stream` object in `result.payload.data`.
- `stream.listeners` is an array of listener manifests with `listener` and optional `options`.
- CLI treats this as command-native streaming intent and subscribes until interrupted.
- Controller implementations should keep `command.test`, follow-up `listener.subscribe`, stream updates, and optional `command_cancel` on the same authenticated websocket session so relay stream ownership and correlation remain valid.
- `timeoutMs` on `command.test` applies to the initial command response window only.
- After a successful `command.test` response activates streaming listeners, stream lifetime is unbounded at relay and ends via explicit `command_cancel`, unsubscribe/teardown, or socket disconnect cleanup.
- Controllers should send periodic heartbeat frames (`ping`) during long-lived sessions and handle relay `pong` responses.
- Relay may proxy `listener_update` events to the original `command.test` `requestId` for active stream sessions.
- `command_cancel` targeting the original `command.test` `requestId` terminates active stream sessions and returns a terminal `result.payload.commandOutcome` (for example `cancelled`).

## Command Payload

`command` payload fields:

- `targetNodeId` (required)
- `tabSessionId` (optional but required for tab-scoped actions)
- `action` (required)
- `payload` (action-specific JSON object)
- `timeoutMs` (optional)
- `waitPolicy` (`fail_fast` or `wait_with_timeout`)
- `idempotencyKey` (optional)
- `replayNonce` (required for command acceptance)

## Command Commands

- `command.list` returns available command metadata advertised by the node runtime.
- Command metadata now optionally includes:
- `preloadHost`: required host before command execute logic runs.
- `inputFields`: declarative input field descriptors (`name`, `type`, `description`, `optional`).
- `inputAtLeastOneOf`: list of field names where at least one key must be present in payload input.
- `command.run` executes a site-scoped command using payload:
- `site`: website domain (for example `reddit.com`)
- `command`: command id (for example `getFeed`)
- `input`: optional JSON object passed to command execution
- `authMode`: `auto`, `strict_fail`, or `skip`
- `command.test` executes command test path with the same payload shape as `command.run`.
- Runtime behavior for `command.test`:
- If command defines `test` hook, runtime executes it.
- If no `test` hook is defined, runtime falls back to `execute`.
- Legacy `command.reddit_feed` remains as a compatibility alias mapped to `command.run` (`site=reddit.com`, `command=getFeed`).

Current Reddit command ids:

- `getFeed`
- `getUserInfo`
- `sendChatMessage`
- `getChatMessages`

Command result/error behavior:

- Successful `command.run` returns normalized metadata fields (`site`, `command`) plus command output.
- Successful `command.test` returns the same result envelope shape as `command.run`.
- If tab URL is not yet committed during immediate post-open execution, runtime returns transient execution error (`tab_url_not_ready`, `retryable=true`).
- Site mismatch after URL commit returns deterministic execution error (`site_mismatch`, `retryable=false`).
- If a command declares `preloadHost`, runtime auto-navigates to that host before execute and returns `preload_host_mismatch` only when post-navigation host still does not match.
- If a command declares `inputFields`, runtime validates required/typed input and rejects unknown keys before command logic (`missing_command_input`, `invalid_command_input_type`, `unexpected_command_input`).
- If a command declares `inputAtLeastOneOf`, runtime rejects missing cross-field requirements before command logic (`missing_command_input_one_of`).
- Unauthenticated website session on `requiresAuth` command returns `manual_login_required` after optional login navigation.

## Routing Rules

- Every command must include `targetNodeId`.
- Every command must include `replayNonce` in payload.
- Relay routes each command to exactly one node connection.
- Relay tracks `requestId -> controllerId` so results/errors return to origin controller.

Queueing rules:

- Same tab (`targetNodeId:tabSessionId`) executes FIFO.
- Cross-tab commands can route in parallel.
- Queue depth limits are enforced per-tab and per-controller.

## Reliability Rules

- Relay emits terminal timeout if command exceeds timeout window.
- Node disconnect during in-flight command yields synthetic `node_disconnected` failure.
- Lock conflicts produce deterministic `lock_conflict` errors.
- Relay rejects replayed nonces within a configurable replay window.
- Relay rejects stale/future command timestamps outside replay skew window.
- Commands queued with `wait_with_timeout` receive terminal `queue_wait_timed_out` when they exceed queue wait budget.
- Relay enforces per-tab and per-controller queued-command depth limits and rejects excess queue attempts deterministically.
- On controller disconnect or heartbeat timeout, relay purges queued commands owned by that controller and triggers owner-scoped tab cleanup on connected nodes.

## Locking

- Lock key is `targetNodeId:tabSessionId`.
- Only one controller may hold lock at a time.
- Lease expiration auto-releases lock.
- Lock events include `lockOwnerControllerId`, `lockLeaseMs`, and `lockExpiresAt` when applicable.
- Lock contention emits both `tab_locked` error and `lock_conflict` event for observability.

## Versioning

Protocol currently uses `1.0`.

Setup boundary note:

- Setup and extension artifact acquisition (`otto setup`, `otto extension get`) are out-of-band from this protocol.
- `otto setup` additionally ensures local relay daemon readiness for the selected setup relay URL port before setup completion.
- In non-interactive mode, `otto setup` emits deterministic JSON summaries that include daemon readiness outcome and extension metadata.

Additive changes are preferred; breaking changes require a new major protocol version.

Current additive compatibility:

- `command.reddit_feed` alias is maintained during migration to `command.run`.
