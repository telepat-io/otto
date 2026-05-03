---
title: Frequently Asked Questions
sidebar_position: 12
description: Answers to common Otto questions, organized by category. Covers setup, auth, errors, debugging, and extension management.
keywords:
  - faq
  - troubleshooting
  - setup questions
  - auth errors
  - otto commands
---

# Frequently Asked Questions

## Setup

**Do I need to install `@telepat/otto-relay` separately?**

No. Global `@telepat/otto` installation already includes relay runtime dependencies for `otto start`, `otto stop`, `otto status`, and setup daemon readiness.

**Does `otto setup` start the relay daemon automatically?**

Yes. `otto setup` ensures relay daemon readiness for the selected relay URL port. If no daemon is running, setup starts one. If a matching daemon is already running, setup reuses it.

**Why does `otto setup` fail with a relay daemon port conflict?**

Setup detects a running daemon on a different port than the selected relay URL. Stop the existing daemon with `otto stop`, then rerun setup with the intended relay URL.

**Why did `otto setup` not print Chrome install steps?**

`otto setup` prints human guidance in interactive TTY mode. Pass `--non-interactive` or run in a non-TTY environment to emit deterministic JSON output instead.

**Why does `otto setup` fail with download or checksum errors?**

`otto setup` retrieves extension artifacts from release assets and verifies SHA-256 checksums. Failures usually indicate missing or misnamed release files, network issues, or a checksum mismatch. Check your internet connection and retry.

**How do I update the extension after setup?**

```bash
otto extension update
```

Then reload the extension in `chrome://extensions` (or restart your browser) so the updated extension runtime reconnects.

**Where are controller and extension settings stored?**

Controller settings are stored in `~/.otto/config.json`. Extension node settings are stored in `chrome.storage.*` and configured from the extension popup and options pages. These stores are intentionally separate, even when both point to the same relay host.

---

## Auth and pairing

**Why does the Otto extension look grayed out or idle?**

Open the Otto toolbar popup and check setup status. A fresh node waits for pairing approval and shows a pairing code. Approve it with `otto pair <code>` and wait for popup status to show Connected.

**Why does popup show a controller row as "awaiting approval"?**

The controller is registered at relay level but has not yet been granted node-level access. Use the row action button in the extension popup to grant access.

**Why does `otto test <site> <command>` return `manual_login_required`?**

The command requires authentication and the current browser session is not logged in for that site. Complete login in the browser tab and rerun the command.

**Why does `otto test` fail with `acl_missing_node_grant` even after client registration?**

Controller registration and node access are separate controls. Open the extension popup, go to Controller Access, and grant that controller client for the target node. Commands are denied until that node-owned ACL grant exists.

**Why does popup show an extension update warning while connected?**

The extension version differs from the relay version it authenticated against. Run `otto extension update`, then reload the extension in `chrome://extensions` or restart the browser.

---

## Command errors

**Why does `otto cmd` return `node_offline`?**

Your `targetNodeId` is not connected to the relay. Verify the extension node relay URL and node ID in the extension popup.

**Why is a tab command failing with lock conflict?**

Another controller currently holds a lock on that `tabSessionId`. Retry with bounded backoff, or switch to `waitPolicy: wait_with_timeout`.

**Why does `command.run` return `site_mismatch`?**

The resolved tab URL does not match the command site bundle. Navigate to the correct site or reopen the tab with `primitive.tab.open`.

**Why does `command.run` return `unexpected_command_input`?**

The command declares strict `inputFields` and your payload included undeclared keys. Remove the extra keys or update the command metadata.

**Why does `command.run` return `missing_command_input_one_of`?**

The command declares `inputAtLeastOneOf`. At least one field from that list must be present in the input payload.

**Why does `command.run` return `preload_host_mismatch`?**

The command declares `preloadHost`, runtime navigated there before execution, and the committed URL host still did not match. This can happen with redirects, blocked navigation, or site-side interstitials.

**Why does `otto commands list` fail with `forbidden_action`?**

Your controller token scopes do not include `command.list`. Re-register with broader scopes or adjust `OTTO_DEFAULT_CONTROLLER_SCOPES` in relay config.

---

## Debugging

**Why is a command marked failed after reconnect?**

Otto uses fail-fast in-flight behavior during disconnect. Commands in-flight when the connection drops return `node_disconnected`. Retry after reconnect.

**Why did chat stream lines appear duplicated in `otto test reddit.com getChatMessages`?**

Otto suppresses duplicates in two layers:
1. Runtime interception suppresses equivalent hybrid cross-source response emissions.
2. Reddit command adapter suppresses repeated semantic chat objects.

If you still see duplicates, check the adapter layer. Run `otto logs list --source node --latest 50` to inspect extension-side deduplication behavior.

**Why did `otto test` open a different host than `<site>`?**

`otto test` uses command `preloadHost` from `command.list` metadata when available, so preconditions are satisfied before command execution. The host may differ from the site if `preloadHost` points to a login or entry path.

**Why does non-interactive CLI output look different from TUI mode?**

TTY sessions use Ink UI, while non-TTY sessions return machine-parseable JSON and set exit codes on terminal errors.

**Why does `otto client remove --all` return zero on a second run?**

Bulk remove purges controller client records after revocation. Once all clients are removed, subsequent `--all` runs return `removedCount: 0` until new clients are registered.

## Next steps

- [Advanced Troubleshooting](./guides/troubleshooting-advanced.md) — error-to-action workflows.
- [Error Codes](./error-codes.md) — full error catalog with retryability.
- [Logging and Debugging](./logging-debugging.md) — log commands and diagnostic sequence.

## How do I edit controller-global settings safely?
Use `otto settings`. Navigate with up/down, edit with Enter, save with `s`, and exit with `q` or `Esc`. While editing a field, `Esc` cancels the edit.
