---
title: Quickstart
sidebar_position: 3
description: Get Otto running in five minutes. Start relay, register a controller, pair the extension node, and run your first site command.
keywords:
  - quickstart
  - otto start
  - pair node
  - first command
  - otto test
---

# Quickstart

By the end of this guide you will have relay running, the controller paired to the extension node, and your first command returning results.

## Before you start

- Otto CLI installed globally: `npm install -g @telepat/otto`
- Extension loaded in Chrome (run `otto setup` if you haven't yet — see [Installation](./installation.md))
- Chrome with the Otto extension running and visible in the toolbar

## Steps

### 1. Start the relay

```bash
otto start
```

This starts the relay as a background daemon. Verify it is running:

```bash
otto status
```

Expected output: `relay running` with a process ID and log path.

### 2. Register a controller identity

If this is your first run, create a controller client and log in:

```bash
otto client register --name "my-laptop"
otto client login
```

This stores your controller credentials in `~/.otto/config.json`. If you already have a registered client, run `otto client login` to refresh your tokens.

### 3. Pair the extension node

If the extension has not been paired to this relay yet:

```bash
# Show pending auth codes from the extension
otto authcode

# Approve the code shown (format: 123-456)
otto pair <code>
```

:::info
The pairing code appears in the Otto extension popup after you configure the relay URL in extension options. Open the extension and follow the on-screen prompt.
:::

### 4. Validate connectivity

Confirm the node is connected and commands are available:

```bash
otto commands list
```

Expected output: a JSON array of available commands from the connected node.

### 5. Run a command

```bash
otto test reddit.com getFeed
```

This opens a managed tab, runs the `getFeed` command on `reddit.com`, streams results, and closes the tab on completion.

## Verify success

A successful run prints command output JSON and exits with code `0`. If you see `manual_login_required`, the command needs you to log into the site first:

1. The tab stays open.
2. Complete login manually in the browser.
3. Rerun: `otto test reddit.com getFeed`

## Next steps

- [CLI Reference](./cli/index.md) — full command list with options, examples, and exit codes.
- [Pairing and Auth](./pairing-auth.md) — deeper look at the pairing flow and controller client model.
- [Use Cases](./use-cases.md) — practical command workflows and scenario matrix.
- [Troubleshooting](./troubleshooting-advanced.md) — error-to-action guide for common failures.
