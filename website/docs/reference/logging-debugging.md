---
title: Logging and Debugging
sidebar_position: 6
---

# Logging and Debugging

Last Updated: 2026-04-12
Owner: Platform

## Source-of-Truth Code Paths

- Relay log ingestion and persistence: `packages/relay/src/index.ts`
- CLI logs UX and filtering commands: `packages/cli/src/index.ts`
- Test coverage for log-related behavior: `packages/relay/test/integration.test.mjs`

## CLI Usage

- Historical logs:

`otto logs list --since 2026-04-03T00:00:00Z --level error --source all --latest 200 --node-id node_abc`

- Live tail:

`otto logs follow --source node`

- Live tail with full JSON events:

`otto logs follow --source node --json`

- Export NDJSON:

`otto logs export --since 2026-04-03T00:00:00Z --source relay --latest 500`

- Subscribe network interception stream:

`otto listener subscribe-network --tab-session tab_abc --site reddit.com --pattern 'https://www.reddit.com/api/*' --mode hybrid --max-body-bytes 200000`

- Unsubscribe listener stream:

`otto listener unsubscribe --target-request-id <subscribeRequestId>`

Sources:

- `relay`: relay-emitted operational events
- `controller`: controller-originated events (when present)
- `node`: extension node-originated events, including local-dev extension runtime logs
- `all`: merged stream across all sources

`logs follow` output defaults to a human-readable line format optimized for scanning: timestamp, source, level, event type, and key message metadata. Use `--json` for full structured event objects.

## Agent Automation Patterns

Use these patterns for deterministic autonomous debugging workflows.

Historical queries (bounded and machine-readable):

- Prefer `otto logs list` or `otto logs export` over `logs follow` when an agent only needs recent evidence.
- Always bound result size/time (`--since`, `--latest`) to avoid unexpectedly large payloads.
- Use source filters early (`--source node` for extension runtime traces).

Live stream capture (follow mode):

- `otto logs follow` is TTY-sensitive.
- In interactive TTY sessions, it renders a live TUI view and exits with `q`, `Esc`, or `Ctrl+C`.
- In non-TTY sessions, it streams lines indefinitely until the parent process stops it.
- For automation, use `--json` and a bounded runtime (runner timeout or external process timeout wrapper).

Example correlation loop for agents:

1. Run command in non-TTY mode and capture `requestId` from JSON output.
2. Pull correlated logs:

`otto logs list --request-id <requestId> --latest 100 --source all`

3. If extension behavior is suspected, narrow to node logs:

`otto logs list --request-id <requestId> --source node --latest 100`

Exit behavior for automation:

- Empty filtered log results are valid and should be handled as non-error outcomes.
- Invalid log options (`--source`, `--level`, `--latest`) fail fast with non-zero exit.
- `logs follow` is intentionally unbounded and must be interrupted by the caller.

## Event Shape

Each event includes:

- `id`
- `timestamp`
- `level`
- `source`
- `type`
- `requestId` (when available)
- `nodeId` (when available)
- `data` (redacted)

Useful event types:

- `command_routed`
- `result`
- `error`
- `lock_conflict`
- `lock_expired`
- `pairing_requested`
- `pairing_approved`
- `offscreen.connect_attempt`
- `offscreen.authenticated_connected`
- `background.refresh_setup_completed`
- `listener_update` with transport updates (`network.response|network.error|network.detached`) for raw network listeners, or shared domain kinds (`chat.message|chat.typing|chat.participant|chat.message_deleted`) for command-adapted chat streams
- `debugger_focus.ensure_requested`
- `debugger_focus.attach_attempt`
- `debugger_focus.attach_succeeded`
- `debugger_focus.attach_conflict_detected`
- `debugger_focus.reused_existing_attachment`
- `debugger_focus.reuse_failed`
- `debugger_focus.enabled`
- `debugger_focus.enable_failed`
- `debugger_focus.detach_after_enable_failure`
- `debugger_focus.stop_requested`
- `debugger_focus.detached_owned_attachment`
- `debugger_focus.detach_skipped_shared_attachment`
- `network_listener.attach_requested`
- `network_listener.attach_succeeded`
- `network_listener.attach_conflict_detected`
- `network_listener.reused_existing_attachment`
- `network_listener.reuse_failed`
- `network_listener.detached_owned_attachment`
- `network_listener.detach_skipped_shared_attachment`

Listener update log persistence note:

- Relay forwards full `listener_update` payloads to subscribed controllers.
- Relay operation logs store listener update metadata plus payload shape summary, not full raw listener payload bodies.

Debugger focus and shared-session diagnostics:

1. Follow node logs while reproducing unfocused-tab command flow:

`otto logs follow --source node`

2. Confirm focus emulation activation path appears before command progress events:
- `debugger_focus.ensure_requested`
- `debugger_focus.attach_attempt|debugger_focus.attach_conflict_detected`
- `debugger_focus.enabled|debugger_focus.reused_existing_attachment`

3. For commands that also run interception, confirm shared session behavior:
- `network_listener.attach_conflict_detected` followed by `network_listener.reused_existing_attachment`
- or `debugger_focus.attach_conflict_detected` followed by `debugger_focus.reused_existing_attachment`

4. Validate ownership-safe teardown on command/tab cleanup:
- owner path logs `*_detached_owned_attachment`
- non-owner path logs `*_detach_skipped_shared_attachment`

5. If attach reuse fails, check for external debugger ownership (open DevTools on target tab) and deterministic command error codes.

## Extension Local-Dev Log Streaming

In extension popup/options UI, enabling "Send extension debug logs to relay (local dev)" turns on extension-originated structured logs.

Command-level DOM automation debugging traces are enabled by default via command runtime debug events and are intended for local troubleshooting.

Behavior:

- Once relay URL is saved, extension starts queueing log objects immediately (including pre-connect stages).
- Queued entries flush to relay after node websocket auth succeeds.
- Relay persists these entries as `source: node` and includes them in list/export/follow alongside relay logs.
- Redaction still applies at relay ingress before persistence/streaming.

Where command debug output appears:

- Target tab DevTools console: `console.log` calls inside `ctx.executeScript(...)` functions.
- CLI command failures/results: enriched error payload fragments from command code.
- Node logs: structured `command.script_debug` entries visible in `otto logs follow --source node`.

### Backpressure, Queueing, and Drop Semantics

- Extension debug-log transport is separate from listener update transport in offscreen runtime.
- Extension debug logs use a dedicated bounded outbound queue and batched flush with websocket `bufferedAmount` checks.
- If extension debug-log queue is full, oldest log entries are dropped first (newest entries are retained).
- Listener updates are routed through command/listener event transport and are not dropped by extension-log queue limits.
- Relay session rate limiting can reject inbound frames with error code `rate_limited`; rejected frames are not processed.
- Relay now bypasses session rate limiting for node `listener_update` frames, so stream delivery remains data-plane prioritized.
- Node `extension_log` frames are still subject to relay session rate limiting.

### Interpreting `rate_limited` Warnings

When offscreen logs `relay rate limited node traffic: Rate limit exceeded for this session`:

- It indicates relay rejected at least one inbound node frame in that minute window.
- In current runtime, the most likely dropped class is `extension_log` (telemetry), not listener updates.
- Listener-update stream traffic may still be healthy even while warnings appear.
- Treat warnings as a signal to reduce debug-log volume, sampling frequency, or flush batch budget before increasing global relay limits.

## Storage Model

- In-memory log ring for quick API filtering.
- JSONL append files in relay log directory using daily windows (`.otto-relay/operations-YYYY-MM-DD.jsonl`).
- Size spillover creates additional same-day files when active file exceeds `OTTO_LOG_MAX_FILE_BYTES` (default `100MB`), for example `operations-YYYY-MM-DD-1.jsonl`.
- Retention cleanup removes window files older than 14 days.
- Legacy single-file storage (`operations.jsonl`) is still read for compatibility with older local relay data.

Default policy:

- Redact sensitive fields before storage and streaming.
- Keep 14-day retention with bounded per-file size.

Relevant environment variables:

- `OTTO_LOG_DIR`: relay runtime/log directory
- `OTTO_LOG_MAX_FILE_BYTES`: max bytes for active window file before spillover (minimum `1024`, default `104857600`)

## Diagnostic Expectations

- `requestId` should be used as the primary cross-component correlation key.
- Node disconnect during in-flight execution is surfaced as deterministic terminal `node_disconnected`.
- Lock lifecycle events (`lock_acquired`, `lock_conflict`, `lock_released`, `lock_expired`) are emitted for troubleshooting concurrency issues.
- For autonomous debugging, prefer non-TTY + JSON output and bounded log pulls before starting long-lived follow sessions.
- For high-volume listener streams (for example chat backlog capture), prioritize `--source node` and request-id scoping to avoid unrelated log noise.

## Command Debugging Playbook

1. List runtime commands:

`otto commands list`

2. Run command directly:

`otto test reddit.com getFeed`

3. If `manual_login_required`, complete login in the opened tab and rerun.

4. If `site_mismatch`, verify `tabSessionId` points to the intended website.

5. If `tab_url_not_ready`, rerun once after a brief delay; this is a transient post-open timing state where tab URL has not committed yet.

6. If `forbidden_action`, confirm controller token scope includes `command.run`.

7. If `acl_missing_node_grant`, open extension popup -> Controller Access and grant that controller client for the node before retrying.

8. If the CLI reports that the controller connection closed before a command response, treat it as transport interruption first: verify relay is reachable, extension node is connected, then retry. If the controller is newly created for testing, confirm node access grant in extension Controller Access.

9. Use `requestId` from command output to filter relay logs for that execution.

Unattended capture example (auto-stops listener follow after 45s):

`otto test reddit.com getChatMessages --stream-follow-ms 45000`

Force a deterministic probe request after listener subscribe (helpful when passive chat traffic is quiet):

`otto test reddit.com getChatMessages --stream-probe --stream-follow-ms 45000`

## Network Interception Debugging Playbook

1. Confirm subscription result first.
2. Keep the `listener.subscribe` `requestId`; it is the correlation key for all `listener_update` events.
3. In `otto test ...` stream sessions, expect listener updates to be keyed by the subscribe `requestId` (not the `command.test` command `requestId`).
4. If no body is present in `network` mode, verify that request reached `Network.loadingFinished` and response is not redirect/cache-evicted.
5. If reliability is required for narrow patterns, use `--mode hybrid` or `--mode fetch`.
6. If traffic appears stalled in fetch/hybrid mode, verify the node is healthy and that update stream still advances (runtime always continues paused requests in `finally`).
7. If attach fails, inspect error for debugger conflicts (for example DevTools already attached to target tab).
8. For `otto test reddit.com getChatMessages`, expected stream scope is Reddit Matrix v3 (`https://matrix.redditspace.com/_matrix/client/v3/*`) and expected controller-visible event kinds are shared chat objects (`chat.message|chat.typing|chat.participant|chat.message_deleted`).
9. Use node logs for isolation:

`otto logs list --request-id <subscribeRequestId> --source node --latest 200`

Duplicate stream diagnostics:

1. Prior duplicate root cause in chat streaming was hybrid dual-surface visibility plus replayed site payload semantics.
2. Runtime now suppresses equivalent hybrid cross-source response duplicates in interception layer.
3. Command adapters still perform object-level dedupe for replayed semantic payloads.
4. If duplicates are suspected, inspect `payload.data.captureSource` in raw `--json` output and correlate by subscribe `requestId`.

## Setup Troubleshooting

1. Run `otto setup --non-interactive` to capture deterministic JSON output for support/debugging.
2. If setup fails during extension retrieval, verify release asset names and `.sha256` file are present for the CLI version.
3. Use `otto extension info` to inspect cached extension artifact metadata in controller config.
4. Verify setup daemon status fields in JSON output:
	- `relayDaemon.status` is `started` when setup launched relay daemon.
	- `relayDaemon.status` is `already_running` when setup reused a matching daemon.
5. If setup reports a relay daemon port conflict, run `otto stop`, then rerun setup with intended relay URL/port.
6. In interactive TTY sessions, setup prints Chrome install steps; if not shown, confirm you did not pass `--non-interactive`.
7. In non-TTY environments (CI/automation), setup is JSON-only by design; parse JSON fields instead of expecting human-readable handoff text.

## Extension Pairing Recovery Troubleshooting

Symptom pattern:

- Popup shows `Connection error` and `Authenticate before sending this frame type`.
- Pairing line shows `Pairing code: waiting for challenge`.
- Refresh appears to do nothing.

Recommended capture and diagnosis:

1. Capture popup state screenshot and node id.
2. Capture background service-worker logs around one refresh click.
3. Capture offscreen logs for reconnect attempts and auth errors.
4. Inspect local storage key presence for `pairingChallengeId`, `pairingCode`, `pairingExpiresAt`, `nodeAccessToken`, `nodeRefreshToken` (do not share token values).

Expected behavior after recovery hardening:

- Orphaned or expired challenge metadata is cleared automatically.
- Missing challenge (`404` from status endpoint) triggers immediate challenge reissue.
- Repeated transient status failures trigger bounded retries, then safe reissue.
- Refresh returns only after maintenance has completed and status has been re-synced.
