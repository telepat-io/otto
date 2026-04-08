# Logging and Debugging

Last Updated: 2026-04-03
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
- `listener_update` with `updateType=network.response|network.error|network.detached`

## Extension Local-Dev Log Streaming

In extension popup/options UI, enabling "Send extension debug logs to relay (local dev)" turns on extension-originated structured logs.

Behavior:

- Once relay URL is saved, extension starts queueing log objects immediately (including pre-connect stages).
- Queued entries flush to relay after node websocket auth succeeds.
- Relay persists these entries as `source: node` and includes them in list/export/follow alongside relay logs.
- Redaction still applies at relay ingress before persistence/streaming.

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

## Recipe Debugging Playbook

1. List runtime recipes:

`otto recipes list`

2. Run recipe directly:

`otto test reddit.com getFeed`

3. If `manual_login_required`, complete login in the opened tab and rerun.

4. If `site_mismatch`, verify `tabSessionId` points to the intended website.

5. If `tab_url_not_ready`, rerun once after a brief delay; this is a transient post-open timing state where tab URL has not committed yet.

6. If `forbidden_action`, confirm controller token scope includes `recipe.run`.

7. If `acl_missing_node_grant`, open extension popup -> Controller Access and grant that controller client for the node before retrying.

8. Use `requestId` from command output to filter relay logs for that execution.

Unattended capture example (auto-stops listener follow after 45s):

`otto test reddit.com getChatMessages --stream-follow-ms 45000`

Force a deterministic probe request after listener subscribe (helpful when passive chat traffic is quiet):

`otto test reddit.com getChatMessages --stream-probe --stream-follow-ms 45000`

## Network Interception Debugging Playbook

1. Confirm subscription result first.
2. Keep the `listener.subscribe` `requestId`; it is the correlation key for all `listener_update` events.
3. In `otto test ...` stream sessions, expect listener updates to be keyed by the subscribe `requestId` (not the `recipe.test` command `requestId`).
4. If no body is present in `network` mode, verify that request reached `Network.loadingFinished` and response is not redirect/cache-evicted.
5. If reliability is required for narrow patterns, use `--mode hybrid` or `--mode fetch`.
6. If traffic appears stalled in fetch/hybrid mode, verify the node is healthy and that update stream still advances (runtime always continues paused requests in `finally`).
7. If attach fails, inspect error for debugger conflicts (for example DevTools already attached to target tab).
8. For `otto test reddit.com getChatMessages`, expected stream scope is Reddit Matrix v3 (`https://matrix.redditspace.com/_matrix/client/v3/*`).
9. Use node logs for isolation:

`otto logs list --request-id <subscribeRequestId> --source node --latest 200`

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
