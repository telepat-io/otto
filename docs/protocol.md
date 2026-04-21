# Protocol

Last Updated: 2026-04-14  
Owner: Platform

Use this document when you need wire-level behavior and command-routing guarantees. If you are implementing product workflows, start with the architecture and runtime guides first, then use this page as the strict contract reference.

Current protocol types are defined in `packages/shared-protocol/src/index.ts`.

## Source-of-Truth Code Paths

| Concern | Source |
| --- | --- |
| Shared envelope and payload contracts | `packages/shared-protocol/src/index.ts` |
| Relay protocol handling and routing | `packages/relay/src/index.ts` |
| Controller envelope emission | `packages/cli/src/index.ts` |

## Envelope Contract

Every websocket frame uses one envelope shape, so cross-component correlation stays stable even when payload families differ.

| Field | Notes |
| --- | --- |
| `protocolVersion` | Currently `1.0` |
| `messageType` | Frame family (`hello`, `auth`, `command`, `result`, `event`, etc.) |
| `requestId` | Primary correlation key across controller, relay, and node |
| `timestamp` | ISO-8601, enforced against replay skew windows |
| `senderRole` | `controller`, `relay`, or `node` |
| `payload` | Message-specific object |

## Message Families

The protocol is intentionally small: a handshake lane, an auth lane, a command lane, and an operations lane.

| Family | Purpose |
| --- | --- |
| `hello` / `hello_ack` | Role and capability negotiation |
| `auth` / `auth_ack` | Access-token authentication |
| `refresh` / `refresh_ack` | Access-token renewal |
| `command` | Controller-issued actions |
| `result` / `error` | Terminal outcomes |
| `event` | Progress and listener updates |
| `ping` / `pong` | Session liveness |
| `tab_lock` / `tab_unlock` | Lock lifecycle signals |
| `command_cancel` | Explicit stream/command cancellation |

## Listener Lifecycle

Listeners are terminal commands at subscribe/unsubscribe time, followed by asynchronous event updates. In other words, `listener.subscribe` and `listener.unsubscribe` each return normal terminal outcomes, while streaming data is delivered later as `event` frames tied to the original subscribe `requestId`.

| Action | Required Payload | Terminal Behavior |
| --- | --- | --- |
| `listener.subscribe` | `listener`, optional `options` | Immediate `result` or `error` |
| `listener.unsubscribe` | `targetRequestId` | Immediate `result` or `error` |

After successful unsubscribe, further updates for that subscribe request are rejected.

### `network.http_intercept` options

| Option | Required | Notes |
| --- | --- | --- |
| `tabSessionId` | Yes | Must resolve to an active managed session |
| `site` | Yes | Normalized to lowercase and validated against tab URL |
| `urlPatterns` | No | Glob filters |
| `requestHostAllowlist` | No | Explicit cross-host allowlist |
| `mode` | No | `network`, `fetch`, or `hybrid` (default `network`) |
| `includeBody` | No | Default `true` |
| `includeHeaders` | No | Default `false`, sensitive headers redacted |
| `maxBodyBytes` | No | Default `256000`, positive numeric only |
| `mimeTypes` | No | MIME prefix allowlist |
| `streamAdapter` | No | Command-owned adapter hint |
| `selfUserId` | No | Command-owned context value |

Runtime normalizes and validates options before listener activation. Arrays are trimmed and deduplicated, booleans remain strict booleans, and unsupported mode values are rejected deterministically.

### Listener update shape

Listener updates are emitted as `messageType=event` frames with `payload.type=listener_update` and `requestId` equal to the original subscribe request. `payload.data` can carry either raw transport payloads or command-owned shared domain objects.

Common shared object discriminators currently include `chat.message`, `chat.typing`, `chat.participant`, `chat.message_deleted`, `content.article`, `content.post`, and `content.post_comment`. Producers should align `payload.updateType` with `payload.data.kind` and attach `originalEntity` when source data is available and safe to emit.

## Command Contract

Every `command` payload must identify a target node and include replay protection fields. Tab-scoped actions require `tabSessionId`, but top-level actions such as capability discovery can omit it.

| Field | Required | Notes |
| --- | --- | --- |
| `targetNodeId` | Yes | Required by protocol invariant |
| `tabSessionId` | Conditional | Required for tab-scoped actions |
| `action` | Yes | Action id, including command and listener actions |
| `payload` | Yes | Action-specific data |
| `timeoutMs` | No | Relay timeout budget |
| `waitPolicy` | No | `fail_fast` or `wait_with_timeout` |
| `idempotencyKey` | No | Replay dedupe key at runtime |
| `replayNonce` | Yes | Required for acceptance |

### Command actions

`command.list` advertises site command metadata, including optional `preloadHost`, `inputFields`, and `inputAtLeastOneOf`. `command.run` executes command logic, while `command.test` executes command test hooks and falls back to `execute` when no hook is declared. The legacy alias `command.reddit_feed` remains supported and maps to `command.run` (`site=reddit.com`, `command=getFeed`).

`command.test` may return a `stream` manifest in `result.payload.data`. Controllers should keep follow-up subscribe traffic on the same authenticated websocket, maintain heartbeat (`ping`/`pong`) for long sessions, and use `command_cancel` against the original test `requestId` when shutting down active stream tests.

## Routing, Queueing, and Reliability

Relay routes each command to exactly one node session and tracks `requestId` ownership so results and errors always return to the originating controller.

Execution policy is deterministic: same-tab work (`targetNodeId:tabSessionId`) is FIFO, cross-tab work is parallel, and queue-depth limits are enforced per tab and per controller. Commands waiting under `wait_with_timeout` can terminate as `queue_wait_timed_out`.

Failure semantics are explicit. Timeout windows produce terminal timeout outcomes, node disconnects produce deterministic `node_disconnected`, and lock contention produces `lock_conflict`. Replay nonces and timestamp skew windows are enforced on ingress, and controller disconnect cleanup purges owned queued work and triggers owner-scoped tab cleanup.

## Tab Ownership and Cleanup

Relay injects internal tab ownership metadata when forwarding controller-created tab-open commands. Node stores ownership by `tabSessionId`, and relay may issue internal close-owned actions on controller disconnect or heartbeat timeout. This owner-scoped cleanup prevents orphaned tabs without affecting tabs owned by other controller identities.

Lock keys are `targetNodeId:tabSessionId`; only one controller can hold a lock at a time.

Lease expiration auto-releases locks. Lock events may include lease metadata (`lockOwnerControllerId`, `lockLeaseMs`, `lockExpiresAt`) for observability, and contention emits both `tab_locked` error semantics and `lock_conflict` event signals.

## Versioning

Protocol currently uses `1.0`.

Setup boundary note:

Setup and extension artifact acquisition (`otto setup`, `otto extension update`) are out-of-band from this protocol. `otto setup` additionally ensures local relay daemon readiness for the selected setup relay URL port before completion, and non-interactive mode emits deterministic JSON summaries that include daemon readiness outcome and extension metadata.

Additive changes are preferred; breaking changes require a new major protocol version.

Current additive compatibility:

- `command.reddit_feed` alias is maintained during migration to `command.run`.
