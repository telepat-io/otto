# Logging and Debugging

Last Updated: 2026-04-14
Owner: Platform

This page is the operational runbook for diagnosing command routing, runtime execution, and stream issues. Use it as a workflow guide first, then as a command reference.

## Source-of-Truth Code Paths

| Area | Source |
| --- | --- |
| Relay log ingestion and persistence | `packages/relay/src/index.ts` |
| CLI log/listener UX | `packages/cli/src/index.ts` |
| Integration coverage for logging behavior | `packages/relay/test/integration.test.mjs` |

## Core CLI Workflows

| Goal | Command |
| --- | --- |
| Pull bounded historical evidence | `otto logs list --source all --latest 200` |
| Follow extension-runtime logs live | `otto logs follow --source node` |
| Follow with full envelopes | `otto logs follow --source node --json` |
| Export NDJSON slice | `otto logs export --source relay --latest 500` |
| Start network listener stream | `otto listener subscribe-network --tab-session <id> --site reddit.com --pattern 'https://www.reddit.com/api/*'` |
| Stop a listener stream | `otto listener unsubscribe --target-request-id <subscribeRequestId>` |

Log sources are `relay`, `controller`, `node`, and `all`. `logs follow` defaults to human-readable line output; use `--json` when machine parsing matters.

## Recommended Debugging Sequence

Start with bounded evidence, then escalate to live follow only when ordering matters:

1. Run the failing command in JSON mode and capture `requestId`.
2. Pull correlated logs with `otto logs list --request-id <requestId> --source all --latest 100`.
3. If behavior appears extension-specific, narrow to node logs.
4. If timing/race conditions are suspected, run `logs follow --json` in a bounded capture window.

For full onboarding and end-to-end controller flow guidance, see `docs/agent-automation.md`.

## Event Model

Every stored event includes stable envelope fields (`id`, `timestamp`, `level`, `source`, `type`) with optional correlation fields (`requestId`, `nodeId`) and redacted `data` payloads.

| Event family | Typical use |
| --- | --- |
| `command_routed`, `result`, `error` | Command lifecycle and terminality |
| `lock_conflict`, `lock_expired` | Queue/lock contention diagnosis |
| `pairing_requested`, `pairing_approved` | Node onboarding flow |
| `offscreen.*`, `background.*` | Extension transport/bootstrap health |
| `listener_update` | Stream payload updates (raw transport or shared-domain objects) |
| `debugger_focus.*`, `network_listener.*` | Debugger attach/reuse/teardown behavior |

Relay persists listener update metadata and shape summaries in operation logs while forwarding full listener payloads to subscribed controllers.

## Listener and Stream Diagnostics

Listener updates should always be correlated by the subscribe `requestId`. In `otto test` stream sessions, this is intentionally different from the original `command.test` request id.

When diagnosing duplicates, check both layers: interception-level hybrid suppression and adapter-level semantic dedupe. For adapter-backed streams (for example Reddit chat), expect shared-domain kinds such as `chat.message`, `chat.typing`, `chat.participant`, and `chat.message_deleted`.

## Local Dev Log Streaming

Extension local-dev log streaming is opt-in from popup/options. Once enabled, extension logs are queued as structured node events and flushed after websocket auth. Relay stores them as `source=node` entries and merges them into normal list/export/follow APIs.

Debug-log transport is intentionally separate from listener-update transport. Under load, debug-log frames can throttle or drop while listener updates continue through the data-plane path.

## Backpressure and `rate_limited` Signals

If offscreen reports `rate_limited` warnings, relay rejected one or more inbound node frames in the active minute window. In normal high-volume scenarios, dropped frames are more likely to be extension telemetry (`extension_log`) than listener updates, because relay prioritizes listener updates on node sessions.

Treat repeated rate-limit warnings as a signal to reduce debug-log volume or flush cadence before increasing global relay limits.

## Storage and Retention

| Policy | Behavior |
| --- | --- |
| Fast recent queries | In-memory ring buffer |
| Durable history | Day-windowed JSONL files (`operations-YYYY-MM-DD*.jsonl`) |
| File size control | Spillover files when active file exceeds `OTTO_LOG_MAX_FILE_BYTES` |
| Retention | 14-day cleanup window |
| Compatibility | Legacy `operations.jsonl` still readable |

Environment controls:

- `OTTO_LOG_DIR`
- `OTTO_LOG_MAX_FILE_BYTES` (minimum `1024`, default `104857600`)

## Command Failure Playbook

Use this checklist for command-level failures:

1. If `manual_login_required`, authenticate manually in browser and rerun.
2. If `site_mismatch`, verify active `tabSessionId` URL matches command site.
3. If `tab_url_not_ready`, rerun after brief delay.
4. If `forbidden_action`, verify controller token scope.
5. If `acl_missing_node_grant`, approve controller in extension popup Controller Access.
6. If socket closes before response, treat as transport interruption first, then retry after relay/node health check.

After each failure, correlate by `requestId` before broadening to global log scans.

## Setup and Pairing Troubleshooting

For setup issues, prefer `otto setup --non-interactive` and inspect deterministic JSON fields for daemon readiness, artifact retrieval, and handoff path values. Port conflicts should be resolved before rerun, and repeated runs against the same relay URL should report daemon reuse (`already_running`) instead of starting a duplicate process.

For pairing-recovery issues, capture popup status, service worker logs, and offscreen reconnect/auth traces around a refresh attempt. Expected hardened behavior is automatic cleanup of stale challenge state, immediate challenge reissue when relay no longer recognizes a challenge, and deterministic status refresh completion.
