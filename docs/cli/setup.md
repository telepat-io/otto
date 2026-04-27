---
title: Setup
sidebar_position: 3
description: CLI reference for otto setup — the interactive and non-interactive first-run wizard that installs the relay, downloads the extension, and pairs the node.
keywords:
  - otto setup
  - setup wizard
  - non-interactive setup
  - extension install
  - relay setup
---

# Setup

`otto setup` is the first-run wizard that installs relay dependencies, downloads and installs the extension, starts the relay daemon, and guides pairing.

## `otto setup`

### Usage

```bash
otto setup [options]
```

### Flags

| Flag | Shorthand | Required | Type | Default | Allowed values | Description |
|---|---|---|---|---|---|---|
| `--relay-url` | | No | string | | | Relay URL to configure (skips interactive relay URL prompt) |
| `--non-interactive` | | No | boolean | false | | Run in non-interactive mode; emits deterministic JSON summary |
| `--skip-extension` | | No | boolean | false | | Skip extension download and installation step |
| `--skip-daemon` | | No | boolean | false | | Skip relay daemon start step |

### Examples

```bash
# Interactive setup — guided walkthrough
otto setup

# Non-interactive setup for CI/automation
otto setup --non-interactive

# Set relay URL directly
otto setup --relay-url http://127.0.0.1:8787

# Skip extension download (relay-only setup)
otto setup --skip-extension
```

### Non-interactive JSON output

In non-interactive mode, `otto setup` emits a JSON summary with:

- Daemon readiness: `started` or `already_running`
- Extension metadata: version, artifact path, checksum status
- Handoff path: relay URL and next pairing steps

### Setup daemon behavior

`otto setup` ensures the relay daemon is running on the configured relay URL port before completing. If a daemon is already running on that port, setup reuses it (`already_running`). If the port conflicts with a different daemon, setup fails with explicit remediation: run `otto stop`, then rerun setup with the intended relay URL.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Setup completed successfully |
| `1` | Setup failed (port conflict, download error, etc.) |

## Related commands

- [otto start](./start.md) — start relay daemon independently.
- [otto authcode / otto pair](./pairing.md) — complete pairing after setup.
- [otto config](./config.md) — inspect or edit saved configuration.
