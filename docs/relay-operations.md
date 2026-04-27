---
title: Relay Operations
sidebar_position: 7
description: Operational reference for the Otto relay daemon. Covers startup, environment variables, endpoints, runtime responsibilities, log storage model, and controller lifecycle management.
keywords:
  - relay operations
  - relay daemon
  - otto start
  - log storage
  - controller lifecycle
---

# Relay Operations

This page is the operational reference for the Otto relay daemon. Use it when configuring a relay deployment, diagnosing routing issues, or integrating controller clients.

## Source-of-truth code paths

| Concern | Source |
|---|---|
| Relay HTTP + WebSocket server | `packages/relay/src/index.ts` |
- Integration validation suite: `packages/relay/test/integration.test.mjs`
- Shared protocol contracts: `packages/shared-protocol/src/index.ts`

## Startup

Relay starts on port `8787` by default. Global `@telepat/otto` installs include relay runtime dependencies so daemon lifecycle commands do not require separate `@telepat/otto-relay` installation.

| Command | Behavior |
|---|---|
| `otto start` | Start relay daemon |
| `otto stop` | Stop relay daemon |
| `otto status` | Report running or stopped; when stopped suggests `otto start` |
| `otto setup` | Ensures relay daemon is running on the setup relay URL port before setup completes |

Setup daemon outcomes: `started` (setup launched daemon for selected port), `already_running` (existing daemon reused). Setup fails on daemon port mismatch with explicit remediation: run `otto stop`, then rerun setup with the intended relay URL.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `OTTO_RELAY_PORT` | `8787` | HTTP and WebSocket listen port |
| `OTTO_TOKEN_SECRET` | — | **Required.** JWT signing secret |
| `OTTO_TOKEN_PREVIOUS_SECRET` | — | Grace-period verification for secret rotation |
| `OTTO_TOKEN_ISSUER` | — | JWT `iss` claim |
| `OTTO_TOKEN_AUDIENCE` | — | JWT `aud` claim |
| `OTTO_TOKEN_TTL_MINUTES` | — | Access-token lifetime |
| `OTTO_REFRESH_TTL_DAYS` | — | Refresh-token lifetime |
| `OTTO_EXTENSION_ORIGIN` | — | Allowed browser extension origin |
| `OTTO_LOG_DIR` | — | Directory for JSONL operation logs |
| `OTTO_LOG_MAX_FILE_BYTES` | `100MB` | Day-file size before spillover |
| `OTTO_RATE_LIMIT_PER_MIN` | — | WebSocket frame rate limit per client |
| `OTTO_REPLAY_WINDOW_MS` | — | Nonce deduplication window |
| `OTTO_TAB_QUEUE_LIMIT` | — | Max queued commands per tab |
| `OTTO_CONTROLLER_QUEUE_LIMIT` | — | Max queued commands per controller |
| `OTTO_DEFAULT_CONTROLLER_SCOPES` | — | Scopes applied to newly registered controllers |
| `OTTO_ALLOW_REMOTE_CONTROLLER_REGISTRATION` | — | Allow unauthenticated remote controller registration |
| `OTTO_CONTROLLER_REGISTRATION_SECRET` | — | Required when remote registration is enabled |
| `OTTO_CONTROLLER_HEARTBEAT_INTERVAL_MS` | `8000` | Heartbeat check interval |
| `OTTO_CONTROLLER_HEARTBEAT_MISS_LIMIT` | `3` | Missed heartbeats before stale disconnect |

:::warning
`OTTO_TOKEN_SECRET` is required and must be kept secret. Do not commit it to source control or expose it in logs.
:::



## Endpoints

### Pairing and auth

| Method | Path | Auth |
|---|---|---|
| `POST` | `/api/pairing/request` | None |
| `GET` | `/api/pairing/pending` | None |
| `POST` | `/api/pairing/approve` | Node bearer |
| `GET` | `/api/pairing/status` | None |
| `POST` | `/api/auth/refresh` | Refresh token |
| `POST` | `/api/auth/revoke` | Refresh token |
| `GET` | `/api/nodes/connected` | Controller bearer |

### Controller client registration and ACL

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/controller/register` | None or registration secret | Body: `{ name, description, avatarSeed? }` |
| `POST` | `/api/controller/token` | Client secret | Returns access + refresh token pair |
| `POST` | `/api/controller/remove` | Controller bearer | Body: `{ clientId }` — revokes record, tears down ACL, refresh, and sessions |
| `POST` | `/api/controller/remove-all` | Controller bearer | Revokes and purges all controller client records |
| `GET` | `/api/controller/access` | Node bearer | List active ACL grants |
| `POST` | `/api/controller/access` | Node bearer | Grant controller access |

ACL enforcement: node-targeted controller commands without an active grant return `acl_missing_node_grant`. Client secret is only used for `/api/controller/token`; runtime authorization uses access-token scopes and node ACL grants.

### Logs

| Method | Path | Query params |
|---|---|---|
| `GET` | `/api/logs` | `since`, `level`, `source`, `latest`, `nodeId`, `requestId` |
| `GET` | `/api/logs/status` | — |
| `GET` | `/api/logs/export` | Same as `/api/logs` |

`source` supports `relay`, `controller`, `node`, `all`. `latest` limits to newest N entries. Invalid filter values return `400`.

### WebSocket

| Role | URL |
|---|---|
| Controller | `ws://host:port?role=controller` |
| Node | `ws://host:port?role=node` |

## Runtime responsibilities

- Enforce `hello`/`auth` frame sequencing before routing any command
- Validate and route command frames to the correct node session by `targetNodeId`
- Maintain command correlation and terminal timeout tracking
- Emit synthetic disconnect failures for in-flight requests when nodes go offline
- Manage tab lock leases, detect conflicts, and emit lock lifecycle events
- Persist and stream structured operation logs
- Disconnect stale controllers by heartbeat policy and trigger owner-scoped orphan tab cleanup

## Log storage model

Relay writes logs into day-windowed JSONL files in `OTTO_LOG_DIR`:

- Active day file: `operations-YYYY-MM-DD.jsonl`
- Spillover on file size: `operations-YYYY-MM-DD-1.jsonl`, `-2.jsonl`, etc.
- File retention: 14 days
- `/api/logs/status` reports aggregate byte size across all operation log files

Extension-originated node logs are ingested when authenticated node clients send `event` frames with `type=extension_log`. Relay binds each entry to the authenticated node identity, applies redaction, and stores as `source=node`.

## Listener management

- Relay activates a listener subscription only after a successful `result` for `listener.subscribe`
- Active listener ownership is keyed by subscribe `requestId` and bound to controller + node identity
- `listener.unsubscribe` validates `payload.targetRequestId`, ownership, and node match before routing
- Successful unsubscribe removes listener state; future updates on that `requestId` are rejected with `listener_not_found`
- Listener state is cleaned up on controller disconnect and node disconnect

## Controller disconnect behavior

Relay marks a controller stale when no authenticated frames arrive within `OTTO_CONTROLLER_HEARTBEAT_INTERVAL_MS x OTTO_CONTROLLER_HEARTBEAT_MISS_LIMIT`. On disconnect or timeout:

1. Relay removes that controller's listener and command stream state.
2. Relay drops queued commands owned by the disconnected controller immediately.
3. Relay dispatches `primitive.tab.close_owned` to connected nodes with the disconnected controller `clientId`.
4. Node runtime closes only tabs owned by that controller identity.

## Operational notes

- Terminal outcomes for accepted commands are guaranteed: `result` or `error` frame.
- Per-tab command execution is FIFO; cross-tab execution is parallelized.
- Refresh sessions persist in `OTTO_LOG_DIR/refresh-sessions.jsonl` across relay restarts.
- Refresh tokens are rotated on successful `/api/auth/refresh`; the previous token is invalidated immediately.
- Relay startup logs include effective TTL configuration and load stats for refresh sessions, controller clients, and ACL stores.

**Operational troubleshooting checklist:**

1. Confirm controller is authenticated (`auth_ack` observed in logs).
2. Confirm action is included in controller scopes.
3. Confirm target node is online (`node_offline` means the node has not connected or has disconnected).
4. Check queue limits if commands are piling up (`tab_queue_overflow`, `controller_queue_overflow`).
5. Check rate limits if commands are dropping under high frequency.

## Next steps

- [Relay API Reference](./relay-api.md) — full HTTP endpoint request and response schemas.
- [Configuration Reference](./configuration.md) — all environment variable defaults and descriptions.
- [Logging and Debugging](./logging-debugging.md) — correlate log events during incident response.

