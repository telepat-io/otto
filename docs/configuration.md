# Configuration

Last Updated: 2026-04-14
Owner: Platform

This page consolidates relay env vars, CLI config behavior, and extension runtime settings.

## Relay Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `OTTO_RELAY_PORT` | `4317` | Relay listen port |
| `OTTO_TOKEN_SECRET` | generated | Token signing secret |
| `OTTO_TOKEN_PREVIOUS_SECRET` | empty | Rotation compatibility secret |
| `OTTO_TOKEN_ISSUER` | `otto-relay` | JWT issuer |
| `OTTO_TOKEN_AUDIENCE` | `otto-clients` | JWT audience |
| `OTTO_TOKEN_TTL_MINUTES` | `15` | Access token lifetime |
| `OTTO_REFRESH_TTL_DAYS` | `30` | Refresh token lifetime |
| `OTTO_EXTENSION_ORIGIN` | extension origin | Allowed extension origin |
| `OTTO_LOG_DIR` | runtime default | Log storage directory |
| `OTTO_LOG_MAX_FILE_BYTES` | runtime default | Log rollover size |
| `OTTO_RATE_LIMIT_PER_MIN` | runtime default | API/auth rate limit |
| `OTTO_REPLAY_WINDOW_MS` | `60000` | Replay acceptance window |
| `OTTO_TAB_QUEUE_LIMIT` | runtime default | Per-tab queue max |
| `OTTO_CONTROLLER_QUEUE_LIMIT` | runtime default | Per-controller queue max |
| `OTTO_DEFAULT_CONTROLLER_SCOPES` | runtime default | New client scopes |
| `OTTO_ALLOW_REMOTE_CONTROLLER_REGISTRATION` | `false` | Remote registration gate |
| `OTTO_CONTROLLER_REGISTRATION_SECRET` | empty | Registration shared secret |
| `OTTO_CONTROLLER_HEARTBEAT_INTERVAL_MS` | `8000` | Heartbeat interval |
| `OTTO_CONTROLLER_HEARTBEAT_MISS_LIMIT` | `3` | Missed ping threshold |

## CLI Config

Path: `~/.otto/config.json`

Common fields:

- relay URL fields
- target node id
- controller access and refresh tokens
- output format and setup preferences

## Extension Runtime Settings

Stored in chrome storage with node role ownership. Typical categories:

- relay connectivity and reconnect state
- node identity and node token state
- pairing challenge lifecycle
- local dev log streaming toggle

## Build Path Contract

Local extension build path:

- `extension/output/chrome-mv3`

## Related Docs

- `docs/relay-operations.md`
- `docs/relay-api.md`
- `docs/security.md`
