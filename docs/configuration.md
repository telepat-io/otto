---
title: Configuration Reference
sidebar_position: 2
description: Complete configuration reference for Otto relay environment variables, CLI config file, extension runtime settings, and build path contract.
keywords:
  - configuration
  - environment variables
  - relay config
  - cli config
  - extension settings
---

# Configuration Reference

This page covers all configurable settings for Otto: relay environment variables, CLI config file, extension runtime settings, and the build path contract.

## Relay environment variables

Set these in the relay process environment before starting with `otto start` or `otto relay:start`.

| Variable | Default | Description |
|---|---|---|
| `OTTO_RELAY_PORT` | `8787` | Relay HTTP and WebSocket listen port |
| `OTTO_TOKEN_SECRET` | auto-generated | JWT signing secret for all tokens |
| `OTTO_TOKEN_PREVIOUS_SECRET` | (empty) | Previous secret for rotation compatibility |
| `OTTO_TOKEN_ISSUER` | `otto-relay` | JWT `iss` claim |
| `OTTO_TOKEN_AUDIENCE` | `otto-clients` | JWT `aud` claim |
| `OTTO_TOKEN_TTL_MINUTES` | `15` | Access token lifetime in minutes |
| `OTTO_REFRESH_TTL_DAYS` | `30` | Refresh token lifetime in days |
| `OTTO_EXTENSION_ORIGIN` | (extension origin) | Allowed origin for node WebSocket connections |
| `OTTO_LOG_DIR` | (runtime default) | Directory for JSONL operation log files |
| `OTTO_LOG_MAX_FILE_BYTES` | `104857600` (100 MB) | Max size per log file before spillover |
| `OTTO_RATE_LIMIT_PER_MIN` | (runtime default) | Max authenticated frames per session per minute |
| `OTTO_REPLAY_WINDOW_MS` | `60000` | Timestamp skew window for replay protection |
| `OTTO_TAB_QUEUE_LIMIT` | (runtime default) | Max queued commands per tab session |
| `OTTO_CONTROLLER_QUEUE_LIMIT` | (runtime default) | Max queued commands per controller session |
| `OTTO_DEFAULT_CONTROLLER_SCOPES` | (runtime default) | Scopes assigned to newly registered controller clients |
| `OTTO_ALLOW_REMOTE_CONTROLLER_REGISTRATION` | `false` | Set to `true` to allow unauthenticated remote client registration |
| `OTTO_CONTROLLER_REGISTRATION_SECRET` | (empty) | Shared secret required for remote controller registration |
| `OTTO_CONTROLLER_HEARTBEAT_INTERVAL_MS` | `8000` | Heartbeat check interval for controller sessions |
| `OTTO_CONTROLLER_HEARTBEAT_MISS_LIMIT` | `3` | Number of missed heartbeats before controller is marked stale |

:::warning
Set `OTTO_TOKEN_SECRET` explicitly in production. The auto-generated value is rotated on every relay restart, invalidating all existing tokens.
:::

## CLI config file

Path: `~/.otto/config.json`

Managed by the `otto config` and `otto client` commands. Common fields:

| Field | Description |
|---|---|
| `relayUrl` | WebSocket URL for the relay (e.g. `ws://localhost:8787`) |
| `relayHttpUrl` | HTTP URL for the relay (e.g. `http://localhost:8787`) |
| `nodeId` | Target node ID for CLI commands |
| `clientId` | Registered controller client ID |
| `accessToken` | Current controller access token |
| `refreshToken` | Current controller refresh token |

:::note
Do not edit `~/.otto/config.json` directly. Use `otto config` to set relay URLs and `otto client login` to manage tokens.
:::

## Extension runtime settings

Stored in `chrome.storage.*` and managed from the extension popup and options pages.

| Setting | Description |
|---|---|
| Relay URL | WebSocket URL the extension node connects to |
| Node ID | Node identity for this browser instance |
| Node token state | Pairing and auth token lifecycle |
| Reconnect state | Offscreen WebSocket reconnect backoff metadata |
| Local dev log streaming | Toggle to stream structured extension logs to relay (`source=node`) |

Extension settings are intentionally independent from `~/.otto/config.json`, even when both point to the same relay host.

## Build path contract

Local extension build output path (used by `otto extension update` and `otto setup`):

```
extension/output/chrome-mv3
```

This path is the source for local extension loading instructions in Chrome.

## Next steps

- [Relay Operations](./relay-operations.md) — startup, daemon lifecycle, and operational notes.
- [Security Controls](./security.md) — token signing and rotation guidance.
- [Installation](./installation.md) — `otto setup` automated configuration flow.
