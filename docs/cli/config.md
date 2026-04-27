---
title: Configuration
sidebar_position: 4
description: CLI reference for otto config and otto settings — read and interactively edit the Otto controller configuration stored at ~/.otto/config.json.
keywords:
  - otto config
  - otto settings
  - controller configuration
  - config.json
---

# Configuration

Read and edit the Otto controller configuration. Configuration is stored at `~/.otto/config.json`.

## `otto config`

Prints the current controller configuration as JSON.

### Usage

```bash
otto config
```

### Examples

```bash
# Print current configuration
otto config
```

Output is JSON to stdout. Fields include relay URL, client identity, and stored settings.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Configuration printed successfully |
| `1` | Config file missing or unreadable |

---

## `otto settings`

Opens an interactive settings editor to update controller-global configuration values.

### Usage

```bash
otto settings
```

### Keyboard shortcuts

| Key | Action |
|---|---|
| `↑` / `↓` | Navigate settings |
| `Enter` | Edit selected setting |
| `s` | Save changes |
| `q` / `Esc` | Quit without saving |

### Examples

```bash
otto settings
```

Editable fields include relay URL and other controller-global values. Changes are persisted to `~/.otto/config.json` after save.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Settings saved or exited cleanly |
| `1` | Failed to write config |

---

## Related commands

- [otto setup](./setup.md) — first-run setup that populates initial configuration.
- [otto client status](./client.md) — inspect registered client identity.
