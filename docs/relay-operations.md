# Relay Operations

Last Updated: 2026-04-12
Owner: Platform

## Source-of-Truth Code Paths

- Relay HTTP + WebSocket server: `packages/relay/src/index.ts`
- Integration validation suite: `packages/relay/test/integration.test.mjs`
- Shared protocol contracts: `packages/shared-protocol/src/index.ts`

## Startup

Relay starts on port `8787` by default.

Global `@telepat/otto` installs include relay runtime dependencies, so daemon lifecycle commands do not require separate `@telepat/otto-relay` installation.

Daemon lifecycle commands:

- `otto start`
- `otto stop`
- `otto status` (reports running or stopped; when stopped suggests `otto start`)
- `otto setup` (ensures relay daemon is running on the setup relay URL port before setup completes)

Setup daemon outcomes:

- `started`: setup launched relay daemon for selected setup relay URL port.
- `already_running`: setup detected existing daemon on selected setup relay URL port and reused it.
- setup fails on daemon port mismatch with explicit remediation (`otto stop`, rerun setup with intended relay URL).

Environment overrides:

- `OTTO_RELAY_PORT`
- `OTTO_TOKEN_SECRET`
- `OTTO_TOKEN_PREVIOUS_SECRET`
- `OTTO_TOKEN_ISSUER`
- `OTTO_TOKEN_AUDIENCE`
- `OTTO_TOKEN_TTL_MINUTES`
- `OTTO_REFRESH_TTL_DAYS`
- `OTTO_EXTENSION_ORIGIN`
- `OTTO_LOG_DIR`
- `OTTO_LOG_MAX_FILE_BYTES`
- `OTTO_RATE_LIMIT_PER_MIN`
- `OTTO_REPLAY_WINDOW_MS`
- `OTTO_TAB_QUEUE_LIMIT`
- `OTTO_CONTROLLER_QUEUE_LIMIT`
- `OTTO_DEFAULT_CONTROLLER_SCOPES`
- `OTTO_ALLOW_REMOTE_CONTROLLER_REGISTRATION`
- `OTTO_CONTROLLER_REGISTRATION_SECRET`
- `OTTO_CONTROLLER_HEARTBEAT_INTERVAL_MS` (default `8000`)
- `OTTO_CONTROLLER_HEARTBEAT_MISS_LIMIT` (default `3`)

## Endpoints

Pairing and auth:

- `POST /api/pairing/request`
- `GET /api/pairing/pending`
- `POST /api/pairing/approve`
- `GET /api/pairing/status`
- `POST /api/auth/refresh`
- `POST /api/auth/revoke`
- `GET /api/nodes/connected` (controller bearer token required)

Controller client registration and ACL:

- `POST /api/controller/register` with `{ name, description, avatarSeed? }`
- `POST /api/controller/token`
- `POST /api/controller/remove` with `{ clientId }` (revokes controller client record and tears down ACL/refresh/sessions)
- `POST /api/controller/remove-all` (revokes + purges all controller client records)
- `GET /api/controller/access` (node bearer token required)
- `POST /api/controller/access` (node bearer token required)

ACL enforcement note:

- Node-targeted controller commands without an active grant return deterministic error code `acl_missing_node_grant`.
- Client secret is only used for `/api/controller/token`; runtime command authorization uses access-token scopes and node ACL grants.

Related CLI commands:

- `otto client register`
- `otto client login`
- `otto client remove [--client-id <id> | --all]`
- `otto client status`
- `otto client forget`

Removal semantics notes:

- Single remove and bulk remove both tear down ACL grants, refresh sessions, and active controller sockets for affected clients.
- Single remove marks a controller client as revoked; bulk remove additionally purges controller records.
- Bulk remove is idempotent after purge; subsequent `remove-all` calls return zero removals until new clients are registered.

Logs:

- `GET /api/logs?since=&level=&source=&latest=&nodeId=&requestId=`
- `GET /api/logs/status`
- `GET /api/logs/export?since=&level=&source=&latest=&nodeId=&requestId=`

WebSocket:

- `ws://host:port?role=controller`
- `ws://host:port?role=node`

## Runtime Responsibilities

- Enforce hello/auth sequencing
- Validate and route command frames by node
- Maintain command correlation and terminal timeouts
- Emit synthetic node disconnect failures for in-flight requests
- Manage tab lock leases and conflicts
- Persist and stream structured logs
- Disconnect stale controllers by heartbeat policy and trigger owner-scoped orphan tab cleanup.

Log storage model:

- Relay writes logs into day-windowed JSONL files in `OTTO_LOG_DIR` (`operations-YYYY-MM-DD.jsonl`).
- When the active day file exceeds `OTTO_LOG_MAX_FILE_BYTES` (default `100MB`), relay spills over into suffixed files (`operations-YYYY-MM-DD-1.jsonl`, etc.).
- `/api/logs/status` reports aggregate byte size across all operation log files plus active windowing settings.
- Retention cleanup deletes operation log files older than 14 days.

Log filtering semantics:

- `source` supports `relay|controller|node|all`
- `latest` limits responses to the newest N matching entries while preserving chronological order in output
- invalid `source`, `latest`, `level`, or `since` values return deterministic `400` responses

Extension-originated log ingestion:

- Authenticated node clients may send `event` payload `type=extension_log` with structured entry metadata.
- Relay binds ingested entry to authenticated node identity and stores as `source: node`.
- Relay applies redaction before persistence and stream fan-out.
- Controller subscribers can filter stream delivery via `logs_subscribe` source filter.

Command-related routing:

- Routes `command.list` and `command.run` like any other command action.
- Enforces action-scope auth before routing command actions.
- Preserves queue and timeout semantics for command commands.

Operational goals:

- Route commands from controllers to target nodes
- Maintain lock registry for tabSessionId state
- Enforce auth, role checks, and origin policy for browser-originated node sockets

Listener operations:

- Relay activates a listener subscription only after successful `result` for `listener.subscribe`.
- Active listener ownership is keyed by subscribe `requestId` and bound to controller + node.
- Node-originated `event` payload `type=listener_update` is forwarded only when:
- subscribe `requestId` is active
- sending node identity matches listener owner node
- owning controller connection is still authenticated
- `listener.unsubscribe` validates `payload.targetRequestId`, ownership, and node match before routing.
- Successful unsubscribe result removes listener state; future updates on that subscribe `requestId` are rejected with `listener_not_found`.
- Listener state is cleaned up on controller disconnect and node disconnect.
- For hybrid interception listeners, node runtime suppresses equivalent duplicate response emissions before relay forwarding, reducing duplicate listener_update traffic at source.

Controller disconnect behavior:

- Relay marks a controller stale when no authenticated frames are received for `OTTO_CONTROLLER_HEARTBEAT_INTERVAL_MS * OTTO_CONTROLLER_HEARTBEAT_MISS_LIMIT`.
- On disconnect/timeout, relay removes that controller's listener and command stream state.
- Relay drops queued commands owned by the disconnected controller immediately (without waiting for queue timeout).
- Relay dispatches internal `primitive.tab.close_owned` commands to connected nodes with the disconnected controller `clientId`.
- Node runtime closes only tabs owned by that controller identity.

## Operational Notes

- Terminal outcomes for accepted commands are guaranteed: `result` or `error` terminal frame.
- Per-tab command execution is FIFO; cross-tab execution is parallelized.
- Queue depth and rate limits are enforced to prevent noisy-neighbor starvation.
- Refresh sessions are persisted in relay runtime storage under `OTTO_LOG_DIR/refresh-sessions.jsonl`, allowing valid refresh tokens to survive relay restarts.
- Refresh tokens are rotated on successful HTTP refresh (`/api/auth/refresh`) and the previous token is invalidated.
- Relay startup logs include effective access/refresh TTL configuration and load stats for refresh sessions, controller clients, and ACL stores.

Operational troubleshooting checklist:

1. Confirm controller is authenticated (`auth_ack` observed).
2. Confirm action is included in controller scopes.
3. Confirm target node is online (`node_offline` otherwise).
4. Confirm replay timestamp/nonce validity (`replay_rejected` and `timestamp_out_of_window`).
5. Confirm per-tab queue pressure (`tab_busy`, `tab_queue_limit_exceeded`, `queue_wait_timed_out`).

Rate-limit behavior details:

1. Relay enforces session rate limiting across authenticated frames with `OTTO_RATE_LIMIT_PER_MIN`.
2. Rejected frames receive error envelope `code=rate_limited` and are not processed.
3. Node `event` frames with `payload.type=listener_update` bypass session rate limiting so high-volume stream updates can continue.
4. Node `event` frames with `payload.type=extension_log` remain rate-limited and may be dropped under telemetry bursts.
5. Tuning guidance: reduce extension debug-log production and burst flush size before increasing global `OTTO_RATE_LIMIT_PER_MIN`.

Setup-related operational notes:

1. `otto setup` ensures relay daemon readiness (start or reuse) before final setup handoff.
2. Pairing and command routing remain relay responsibilities after setup handoff.
3. Controller config (`~/.otto/config.json`) and extension settings (`chrome.storage.*`) are independent by design.
4. In non-interactive mode, setup JSON output includes relay daemon readiness metadata for automation diagnostics.
