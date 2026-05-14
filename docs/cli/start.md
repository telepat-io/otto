---
title: Relay Lifecycle
sidebar_position: 2
description: CLI commands for starting, stopping, and inspecting the Otto relay daemon. Covers otto start, otto stop, and otto status with all flags.
keywords:
  - otto start
  - otto stop
  - otto status
  - relay daemon
  - relay lifecycle
---

# Relay Lifecycle

Start, stop, and inspect the Otto relay daemon.

## `otto start`

Starts the relay daemon as a background process.

### Usage

```bash
otto start [options]
```

### Flags

| Flag | Shorthand | Required | Type | Default | Description |
|---|---|---|---|---|---|
| `--attached` | | No | boolean | false | Run in attached mode with logs streamed to stdout instead of daemonizing |
| `--port` | | No | number | 8787 | Port to start the relay on |

### Examples

```bash
# Start relay daemon in background
otto start

# Start relay with logs attached to terminal (dev mode)
otto start --attached

# Start relay on a custom port
otto start --port 9000
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Relay started successfully |
| `1` | Failed to start (port conflict, missing config, etc.) |

---

## `otto stop`

Stops the running relay daemon.

### Usage

```bash
otto stop
```

### Examples

```bash
otto stop
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Relay stopped successfully |
| `1` | No relay running or failed to stop |

---

## `otto status`

Reports whether the relay daemon is running. Use `--nodes` to include connected node IDs.

### Usage

```bash
otto status [--nodes] [--json]
```

### Examples

```bash
otto status
otto status --nodes
otto status --nodes --json
```

When stopped, `otto status` suggests running `otto start`.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Status reported successfully |

---

## Related commands

- [otto setup](./setup.md) — first-run setup, also ensures daemon readiness.
- [otto logs follow](./logs.md) — tail live relay logs after starting.
