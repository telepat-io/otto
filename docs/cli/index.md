---
title: CLI Reference
sidebar_position: 1
description: Complete reference for all Otto CLI commands, organized by command group. Covers relay lifecycle, setup, configuration, pairing, client management, command execution, logs, and listeners.
keywords:
  - CLI reference
  - otto commands
  - command groups
  - otto CLI
---

# CLI Reference

The `otto` CLI manages the relay daemon, pairs extension nodes, registers controller clients, executes browser commands, and tails operation logs. All commands support `--help` for inline usage.

## Command groups

| Group | Commands | Purpose |
|---|---|---|
| [Relay lifecycle](./start.md) | `otto start`, `otto stop`, `otto status` | Start, stop, and inspect the relay daemon |
| [Setup](./setup.md) | `otto setup` | Interactive or non-interactive first-run setup |
| [Configuration](./config.md) | `otto config`, `otto settings` | Read and edit controller configuration |
| [Extension](./extension.md) | `otto extension update`, `otto extension info` | Manage the packaged extension asset |
| [Pairing](./pairing.md) | `otto authcode`, `otto pair`, `otto revoke` | Pair extension nodes with the relay |
| [Client](./client.md) | `otto client register/login/status/forget/remove` | Manage controller client identities |
| [Commands](./commands.md) | `otto commands list`, `otto cmd`, `otto test` | Browse, run, and stream browser commands |
| [Logs](./logs.md) | `otto logs list/follow/status/export` | Query and stream relay operation logs |
| [Listener](./listener.md) | `otto listener subscribe-network/unsubscribe/list` | Manage network interception streams |

## Global behavior

- All commands accept `--help` for usage and flag descriptions.
- Use `--json` on supported commands for machine-readable output. Non-interactive mode removes TTY formatting.
- Commands exit `0` on success, non-zero on failure.
- When exactly one node is connected, `targetNodeId` is auto-selected. With multiple nodes, pass `--node-id`.

## Configuration file

Controller configuration is stored at `~/.otto/config.json`. Use `otto config` to read it and `otto settings` to edit it interactively.

## Related pages

- [Installation](../installation.md) — install the CLI and relay.
- [Quickstart](../quickstart.md) — first-run walkthrough.
- [Configuration Reference](../configuration.md) — all relay environment variables.
