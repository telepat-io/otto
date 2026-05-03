---
title: Logs
sidebar_position: 9
description: CLI reference for otto logs commands — list, follow, check status, and export relay operation logs with source and filter options.
keywords:
  - otto logs
  - logs list
  - logs follow
  - logs export
  - log sources
---

# Logs

Query, follow, and export relay operation logs. Logs include relay-native events, controller events, and extension node events streamed from the browser.

## `otto logs list`

Pulls a bounded list of historical log entries.

### Usage

```bash
otto logs list [options]
```

### Flags

| Flag | Shorthand | Required | Type | Default | Allowed values | Description |
|---|---|---|---|---|---|---|
| `--source` | | No | string | `all` | `relay`, `controller`, `node`, `all` | Filter by log source |
| `--latest` | | No | number | 100 | | Return the newest N entries |
| `--level` | | No | string | | `debug`, `info`, `warn`, `error` | Filter by log level |
| `--since` | | No | string | | ISO-8601 datetime | Return entries after this timestamp |
| `--node-id` | | No | string | | | Filter by node ID |
| `--request-id` | | No | string | | | Filter by requestId |
| `--json` | | No | boolean | false | | Output as NDJSON |

### Examples

```bash
# Pull the latest 100 entries from all sources
otto logs list

# Pull the latest 200 entries
otto logs list --latest 200

# Pull extension-originated logs only
otto logs list --source node --latest 50

# Pull logs correlated to a specific request
otto logs list --request-id <requestId> --source all

# Machine-readable output
otto logs list --json
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Logs returned |
| `1` | Relay error or invalid filter |

---

## `otto logs follow`

Streams live log events from the relay. Runs until `Ctrl+C`.

### Usage

```bash
otto logs follow [options]
```

### Flags

| Flag | Shorthand | Required | Type | Default | Allowed values | Description |
|---|---|---|---|---|---|---|
| `--source` | | No | string | `all` | `relay`, `controller`, `node`, `all` | Filter by log source |
| `--level` | | No | string | | `debug`, `info`, `warn`, `error` | Filter by level |
| `--json` | | No | boolean | false | | Output as NDJSON (one envelope per line) |

### Examples

```bash
# Follow all sources live
otto logs follow

# Follow extension runtime logs only
otto logs follow --source node

# Follow with full JSON envelopes
otto logs follow --source all --json

# Follow relay events only
otto logs follow --source relay
```

:::note
`otto logs follow` is unbounded. For automation, enforce a caller-side timeout window and pipe to your log aggregator.
:::

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Exited cleanly (Ctrl+C) |
| `1` | Connection error |

---

## `otto logs status`

Reports storage status for the relay operation log files.

### Usage

```bash
otto logs status [options]
```

### Flags

| Flag | Shorthand | Required | Type | Default | Description |
|---|---|---|---|---|---|
| `--json` | | No | boolean | false | Output as JSON |

### Examples

```bash
otto logs status

otto logs status --json
```

Output includes total bytes across all operation log files and active windowing settings.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Status reported |
| `1` | Relay error |

---

## `otto logs export`

Exports a slice of operation logs as NDJSON to stdout or a file.

### Usage

```bash
otto logs export [options]
```

### Flags

| Flag | Shorthand | Required | Type | Default | Allowed values | Description |
|---|---|---|---|---|---|---|
| `--source` | | No | string | `all` | `relay`, `controller`, `node`, `all` | Filter by source |
| `--latest` | | No | number | | | Export newest N entries |
| `--since` | | No | string | | ISO-8601 datetime | Export entries after this timestamp |
| `--level` | | No | string | | `debug`, `info`, `warn`, `error` | Filter by level |
| `--node-id` | | No | string | | | Filter by node ID |
| `--request-id` | | No | string | | | Filter by requestId |
| `--output` | `-o` | No | string | stdout | | Output file path |

### Examples

```bash
# Export latest 500 relay entries
otto logs export --source relay --latest 500

# Export to file
otto logs export --source all --latest 1000 --output ./logs.ndjson

# Export correlated logs for an incident
otto logs export --request-id <requestId> --source all
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Export completed |
| `1` | Relay error or write failure |

---

## Related commands

- [otto listener subscribe-network](./listener.md) — subscribe to network interception streams.
- [Logging and Debugging](../logging-debugging.md) — debugging workflows and event model.
- [RequestId Correlation Runbook](../guides/requestid-correlation-runbook.md) — incident correlation guide.
