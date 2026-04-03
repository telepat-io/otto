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

- Export NDJSON:

`otto logs export --since 2026-04-03T00:00:00Z --source relay --latest 500`

Sources:

- `relay`: relay-emitted operational events
- `controller`: controller-originated events (when present)
- `node`: extension node-originated events, including local-dev extension runtime logs
- `all`: merged stream across all sources

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

## Extension Local-Dev Log Streaming

In extension popup/options UI, enabling "Send extension debug logs to relay (local dev)" turns on extension-originated structured logs.

Behavior:

- Once relay URL is saved, extension starts queueing log objects immediately (including pre-connect stages).
- Queued entries flush to relay after node websocket auth succeeds.
- Relay persists these entries as `source: node` and includes them in list/export/follow alongside relay logs.
- Redaction still applies at relay ingress before persistence/streaming.

## Storage Model

- In-memory log ring for quick API filtering.
- JSONL append file in relay log directory (`.otto-relay/operations.jsonl`).
- Retention cleanup removes entries older than 14 days.

Default policy:

- Redact sensitive fields before storage and streaming.
- Keep 14-day retention with disk budget.

## Diagnostic Expectations

- `requestId` should be used as the primary cross-component correlation key.
- Node disconnect during in-flight execution is surfaced as deterministic terminal `node_disconnected`.
- Lock lifecycle events (`lock_acquired`, `lock_conflict`, `lock_released`, `lock_expired`) are emitted for troubleshooting concurrency issues.

## Recipe Debugging Playbook

1. List runtime recipes:

`otto recipes list`

2. Run recipe directly:

`otto test reddit.com getFeed`

3. If `manual_login_required`, complete login in the opened tab and rerun.

4. If `site_mismatch`, verify `tabSessionId` points to the intended website.

5. If `forbidden_action`, confirm controller token scope includes `recipe.run`.

6. Use `requestId` from command output to filter relay logs for that execution.

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
