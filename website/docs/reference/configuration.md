---
title: Configuration
sidebar_position: 3
---

# Configuration Reference

Last Updated: 2026-04-14  
Owner: Platform

This page consolidates relay environment variables, controller config behavior, and extension runtime settings.

## Relay Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `OTTO_RELAY_PORT` | `4317` | Relay HTTP and WebSocket listen port |
| `OTTO_TOKEN_SECRET` | generated | Signing secret for access/refresh tokens |
| `OTTO_TOKEN_PREVIOUS_SECRET` | empty | Previous signing secret for rotation |
| `OTTO_TOKEN_ISSUER` | `otto-relay` | JWT issuer claim |
| `OTTO_TOKEN_AUDIENCE` | `otto-clients` | JWT audience claim |
| `OTTO_TOKEN_TTL_MINUTES` | `15` | Access token lifetime |
| `OTTO_REFRESH_TTL_DAYS` | `30` | Refresh token lifetime |
| `OTTO_EXTENSION_ORIGIN` | extension origin | Allowed extension origin |
| `OTTO_LOG_DIR` | platform default | Persistent relay log directory |
| `OTTO_LOG_MAX_FILE_BYTES` | configured default | JSONL file rollover size |
| `OTTO_RATE_LIMIT_PER_MIN` | configured default | HTTP/auth rate limiting |
| `OTTO_REPLAY_WINDOW_MS` | `60000` | Replay and timestamp acceptance window |
| `OTTO_TAB_QUEUE_LIMIT` | configured default | Max queued commands per tab |
| `OTTO_CONTROLLER_QUEUE_LIMIT` | configured default | Max queued commands per controller |
| `OTTO_DEFAULT_CONTROLLER_SCOPES` | relay default set | Scopes applied at client registration |
| `OTTO_ALLOW_REMOTE_CONTROLLER_REGISTRATION` | `false` | Enables remote controller registration |
| `OTTO_CONTROLLER_REGISTRATION_SECRET` | empty | Shared secret for remote registration |
| `OTTO_CONTROLLER_HEARTBEAT_INTERVAL_MS` | `8000` | Controller heartbeat interval |
| `OTTO_CONTROLLER_HEARTBEAT_MISS_LIMIT` | `3` | Missed heartbeat threshold |

## Controller Config File

CLI stores config in `~/.otto/config.json`.

Typical fields:

| Field | Purpose |
|---|---|
| `relayUrl` | WebSocket relay URL |
| `relayHttpUrl` | HTTP API relay base URL |
| `targetNodeId` | Preferred target node |
| `controllerAccessToken` | Current access token |
| `controllerRefreshToken` | Refresh token |
| `outputFormat` | `text` or `json` |
| `setup` preferences | Setup strategy and defaults |

Notes:

- Token fields are optional and can be cleared by revoke flows.
- Secrets may be persisted via keychain-backed paths depending on platform and config.

## Extension Runtime Settings

Extension state is stored in chrome storage namespaces and is role-specific (node side), not shared with CLI config.

Common settings categories:

| Category | Examples |
|---|---|
| Relay connectivity | Relay URL, reconnect metadata |
| Node identity | Node id and node tokens |
| Pairing state | Active challenges and auth completion |
| Local dev logging | Toggle for local dev extension log streaming |

## Setup and Build Strategy Notes

Current local build path contract:

- `extension/output/chrome-mv3`

Setup strategy behavior:

- In repo checkouts, auto strategy prefers local build artifact path.
- Otherwise setup may fetch release artifacts.

## Security Configuration Guidance

1. Rotate `OTTO_TOKEN_SECRET` periodically with previous-secret overlap.
2. Keep controller registration disabled remotely unless explicitly needed.
3. Restrict relay network exposure and use TLS when remote.
4. Keep logs redacted and size-bounded.

## Change Management Checklist

- [ ] Document any new env variable and default.
- [ ] Update relay operations docs and setup docs.
- [ ] Add tests for behavior toggled by new config.
- [ ] Validate docs examples after release.

## Related Docs

- `reference/relay-operations`
- `reference/relay-api`
- `technical/security`
