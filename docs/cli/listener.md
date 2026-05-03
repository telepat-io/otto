---
title: Listener
sidebar_position: 10
description: CLI reference for otto listener commands — subscribe to network interception streams, unsubscribe, and list active listeners.
keywords:
  - otto listener
  - subscribe-network
  - network interception
  - listener unsubscribe
  - otto listener list
---

# Listener

Subscribe to network interception streams, manage active listeners, and unsubscribe.

## `otto listener subscribe-network`

Subscribes to a network interception listener on a managed tab, streaming captured HTTP responses.

### Usage

```bash
otto listener subscribe-network [options]
```

### Flags

| Flag | Shorthand | Required | Type | Default | Allowed values | Description |
|---|---|---|---|---|---|---|
| `--tab-session` | | Yes | string | | | Tab session ID to attach the listener to |
| `--site` | `-s` | Yes | string | | | Site scope (e.g. `reddit.com`) — validated against tab URL |
| `--pattern` | | No | string[] | | | URL glob patterns to capture (repeatable) |
| `--request-host` | | No | string[] | | | Explicit cross-host allowlist (repeatable) |
| `--mode` | | No | string | `network` | `network`, `fetch`, `hybrid` | Interception capture mode |
| `--include-body` | | No | boolean | true | | Include response body in updates |
| `--include-headers` | | No | boolean | false | | Include response headers (sensitive headers redacted) |
| `--max-body-bytes` | | No | number | 256000 | | Maximum response body bytes to capture |
| `--mime-types` | | No | string[] | | | MIME prefix allowlist (repeatable) |
| `--node-id` | | No | string | Auto-selected | | Target node ID |
| `--json` | | No | boolean | false | | Output stream updates as NDJSON |

### Examples

```bash
# Basic network subscription for Reddit API traffic
otto listener subscribe-network \
  --tab-session <tabSessionId> \
  --site reddit.com \
  --pattern 'https://www.reddit.com/api/*'

# High-volume capture with body limit
otto listener subscribe-network \
  --tab-session <tabSessionId> \
  --site reddit.com \
  --request-host matrix.redditspace.com \
  --pattern 'https://matrix.redditspace.com/_matrix/client/v3/*' \
  --mode network \
  --max-body-bytes 200000

# Hybrid capture with headers and JSON output
otto listener subscribe-network \
  --tab-session <tabSessionId> \
  --site reddit.com \
  --mode hybrid \
  --include-headers \
  --json
```

### Stream output

Each captured response is emitted as a `listener_update` frame. The stream continues until:

- `otto listener unsubscribe` is called with the subscribe `requestId`
- The tab session closes
- `Ctrl+C` is pressed (sends unsubscribe automatically)

The subscribe `requestId` is printed on start — save it to unsubscribe later from another terminal.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Subscribed and streaming |
| `1` | Subscription failed (invalid tab session, site mismatch, etc.) |

---

## `otto listener unsubscribe`

Unsubscribes an active network listener by its subscribe `requestId`.

### Usage

```bash
otto listener unsubscribe [options]
```

### Flags

| Flag | Shorthand | Required | Type | Default | Description |
|---|---|---|---|---|---|
| `--target-request-id` | | Yes | string | | The `requestId` returned by `subscribe-network` |
| `--node-id` | | No | string | Auto-selected | Target node ID |

### Examples

```bash
otto listener unsubscribe --target-request-id <subscribeRequestId>
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Unsubscribed successfully |
| `1` | Listener not found or relay error |

---

## `otto listener list`

Lists active network listeners on the connected node.

### Usage

```bash
otto listener list [options]
```

### Flags

| Flag | Shorthand | Required | Type | Default | Description |
|---|---|---|---|---|---|
| `--node-id` | | No | string | Auto-selected | Target node ID |
| `--json` | | No | boolean | false | Output as JSON |

### Examples

```bash
otto listener list

otto listener list --json
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Listeners listed |
| `1` | Relay or node error |

---

## Related commands

- [otto test](./commands.md) — run stream-capable commands with built-in listener management.
- [Listener Development](../guides/listener-development.md) — build stream-capable commands.
- [Logging and Debugging](../logging-debugging.md) — diagnose listener and stream issues.
