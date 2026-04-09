# FAQ

Last Updated: 2026-04-10
Owner: Platform

## Source-of-Truth Code Paths

- Relay routing/auth/locks: `packages/relay/src/index.ts`
- CLI command surface: `packages/cli/src/index.ts`
- Extension runtime behavior: `extension/entrypoints/background.ts`, `extension/src/runtime/offscreen-client.ts`

## Why does `otto cmd` return node offline?
Your `targetNodeId` is not connected to Relay. Verify Extension Node relay URL and node ID.

## Why does the Otto extension look grayed out or idle?
Open the Otto toolbar popup and check setup state. A fresh node often waits for pairing approval and shows a pairing code. Approve it with `otto pair <code>` and wait for popup status to become Connected.

## Why is a tab command failing with lock conflict?
Another controller currently holds a lock on that `tabSessionId`.

## Why is a command marked failed after reconnect?
v1 uses fail-fast in-flight behavior and expects idempotent retry.

## Why does `otto test <site> <command>` return `manual_login_required`?
The command is marked `requiresAuth` and the current website session is not authenticated. Complete login in the browser tab and rerun the same command.

## Why does `otto test` fail with `acl_missing_node_grant` even after client registration?
Controller registration and node access are separate controls. Open the extension popup, go to "Controller Access", and grant that controller client for the target node. Commands are denied until that node-owned ACL grant exists.

## Why does popup show a controller row as "awaiting approval"?
The controller is registered/authenticated at relay level but has not yet been granted access by that node. Use the row action button in popup to grant access.

## Why does `command.run` return `site_mismatch`?
The resolved tab URL does not match the command site bundle. Open or navigate to the target site, then run again.

## Why does `command.run` return `unexpected_command_input`?
The command metadata declares strict `inputFields`, and your payload included keys that are not declared. Remove extra keys or update command metadata.

## Why does `command.run` return `missing_command_input_one_of`?
The command metadata declares `inputAtLeastOneOf`, which means at least one key from that list must be present in payload input.

## Why does `command.run` return `preload_host_mismatch`?
The command declares `preloadHost`, runtime attempted to navigate there before execute, and the committed URL host still did not match. This can happen with redirects, blocked navigation, or site-side interstitials.

## Why did chat stream lines appear duplicated in `otto test reddit.com getChatMessages`?
Two sources were involved:

1. Matrix sync payloads can replay prior events across subsequent responses.
2. In earlier versions, hybrid interception could also observe the same response through both CDP `Network` and `Fetch` paths.

Current behavior now suppresses duplicates in two layers:

1. Runtime interception suppresses equivalent hybrid cross-source response emissions.
2. Reddit command adapter suppresses repeated semantic chat objects.

## Why did `otto test` open a different host than `<site>`?
`otto test` now prefers command `preloadHost` from `command.list` metadata when available so preconditions are satisfied before command execution.

## Why does `otto commands list` fail with `forbidden_action`?
Your controller token scopes do not include `command.list`. Re-pair with broader scopes or adjust relay default scopes.

## Why does non-interactive CLI output look different from TUI mode?
TTY sessions use Ink UI (`runCommandTui`), while non-TTY sessions return machine-parseable JSON and set exit code on terminal errors.

## Why does `otto client remove --all` return zero on a second run?
Bulk remove now purges controller client records after revocation. Once all clients are removed, the next `--all` run is expected to return `removedCount: 0` until new clients are registered.

## Why did `otto setup` not print Chrome install steps?
`otto setup` prints human guidance in interactive TTY mode. If you pass `--non-interactive` (or run in a non-TTY environment), setup emits deterministic JSON output instead.

## Does `otto setup` start relay daemon automatically?
Yes. Setup now ensures relay daemon readiness for the selected setup relay URL port. If no daemon is running, setup starts one. If matching daemon is already running, setup reuses it.

## Do I need to install `@telepat/otto-relay` separately when I install `@telepat/otto`?
No. Global `@telepat/otto` installation already includes relay runtime dependencies needed for `otto start`, `otto stop`, `otto status`, and setup daemon readiness.

## Why does `otto setup` fail with download or checksum errors?
`otto setup` retrieves extension artifacts from release assets and verifies SHA-256 checksums. Failures usually mean missing/misnamed release files, network issues, or a mismatched checksum file.

## How does `otto setup --strategy auto` decide between build and download?
`auto` prefers local build when setup runs in a full Otto repo checkout (or when `--repo-path` points to one). Outside a repo checkout, it uses release download.

## Why does `otto setup` fail with a relay daemon port conflict?
Setup now ensures relay daemon readiness. If a daemon is already running on a different port than the selected setup relay URL, setup fails to avoid hidden port drift. Stop the existing daemon with `otto stop` and rerun setup with the intended relay URL.

## Why did interactive `otto setup` show guidance even with non-interactive defaults in config?
Setup non-interactive mode is now explicit for TTY usage. In an interactive terminal, setup stays human-guided unless you pass `--non-interactive`.

## Where are controller and extension settings stored?
Controller settings are stored in `~/.otto/config.json`. Extension node settings are stored in `chrome.storage.*` and configured from extension options. They are intentionally separate.

## Why does `otto extension get --strategy build` fail?
Build mode is dev-only and requires `--repo-path` that points to a full Otto checkout containing `extension/package.json`.

## How do I edit controller-global settings safely?
Use `otto settings`. Navigate with up/down, edit with Enter, save with `s`, and exit with `q` or `Esc`. While editing a field, `Esc` cancels the edit.
