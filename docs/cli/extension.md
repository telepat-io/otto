---
title: Extension Management
sidebar_position: 5
description: CLI reference for otto extension update and otto extension info — download and inspect the packaged Otto Chrome extension asset.
keywords:
  - otto extension
  - extension update
  - extension info
  - chrome extension
  - extension download
---

# Extension Management

Download and inspect the packaged Otto Chrome extension asset.

## `otto extension update`

Downloads the latest (or specified) version of the Otto extension and saves it locally.

### Usage

```bash
otto extension update [options]
```

### Flags

| Flag | Shorthand | Required | Type | Default | Description |
|---|---|---|---|---|---|
| `--version` | | No | string | latest | Specific extension version to download |
| `--output` | `-o` | No | string | | Output path for the downloaded extension zip |

### Examples

```bash
# Download latest extension
otto extension update

# Download specific version
otto extension update --version 1.2.0

# Download to a specific path
otto extension update --output ./my-extension.zip
```

The downloaded zip is checksum-verified before extraction. A mismatch fails with an explicit checksum error.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Extension downloaded and verified successfully |
| `1` | Download failed, checksum mismatch, or network error |

---

## `otto extension info`

Prints metadata about the currently installed extension asset.

### Usage

```bash
otto extension info
```

### Examples

```bash
otto extension info
```

Output includes version, file path, and checksum status.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Info printed successfully |
| `1` | No extension found or metadata unreadable |

---

## Related commands

- [otto setup](./setup.md) — downloads extension as part of first-run setup.
