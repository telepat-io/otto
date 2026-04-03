# Protocol

Last Updated: 2026-04-03
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

## Recipe Commands

- `recipe.list` returns available recipe metadata advertised by the node runtime.
- `recipe.run` executes a site-scoped recipe using payload:
- `site`: website domain (for example `reddit.com`)
- `recipe`: recipe id (for example `getFeed`)
- `input`: optional JSON object passed to recipe execution
- `authMode`: `auto`, `strict_fail`, or `skip`
- Legacy `recipe.reddit_feed` remains as a compatibility alias mapped to `recipe.run` (`site=reddit.com`, `recipe=getFeed`).

Recipe result/error behavior:

- Successful `recipe.run` returns normalized metadata fields (`site`, `recipe`) plus recipe output.
- Site mismatch returns deterministic execution error (`site_mismatch`).
- Unauthenticated website session on `requiresAuth` recipe returns `manual_login_required` after optional login navigation.

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

- `recipe.reddit_feed` alias is maintained during migration to `recipe.run`.
