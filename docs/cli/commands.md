---
title: Command Execution
sidebar_position: 8
description: CLI reference for otto commands list, otto cmd, otto extract-content, and otto test — browse available browser commands, run one-shot actions, extract page content, and stream test sessions.
keywords:
  - otto commands list
  - otto cmd
  - otto extract-content
  - otto test
  - command execution
  - stream follow
---

# Command Execution

Browse available browser commands, run one-shot actions, extract content from pages, and run streaming test sessions.

## `otto commands list`

Lists all commands available on a connected node, optionally filtered by site.

### Usage

```bash
otto commands list [options]
```

### Flags

| Flag | Shorthand | Required | Type | Default | Description |
|---|---|---|---|---|---|
| `--site` | `-s` | No | string | | Filter by site (e.g. `reddit.com`) |
| `--node-id` | | No | string | Auto-selected | Target node ID |
| `--json` | | No | boolean | false | Output as JSON |

### Examples

```bash
# List all commands
otto commands list

# List commands for a specific site
otto commands list --site reddit.com

# Machine-readable output
otto commands list --json
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Commands listed |
| `1` | No node connected or relay error |

---

## `otto cmd`

Executes a single command action on a connected node. Useful for primitives and one-shot commands.

### Usage

```bash
otto cmd [options]
```

### Flags

| Flag | Shorthand | Required | Type | Default | Description |
|---|---|---|---|---|---|
| `--action` | `-a` | Yes | string | | Action to execute (e.g. `primitive.tab.open`) |
| `--payload` | `-p` | No | string | `{}` | JSON payload string |
| `--node-id` | | No | string | Auto-selected | Target node ID |
| `--tab-session` | | No | string | | Tab session ID for tab-scoped actions |
| `--timeout` | | No | number | 30000 | Command timeout in milliseconds |
| `--json` | | No | boolean | false | Output result as JSON and skip interactive TUI |

### Examples

```bash
# Open a managed tab
otto cmd --action primitive.tab.open --payload '{"url":"https://www.reddit.com"}'

# Extract text from an open tab
otto cmd --action primitive.dom.extract_text --tab-session <tabSessionId>

# Take a screenshot by URL
otto cmd --action primitive.page.screenshot --payload '{"url":"https://example.com"}'

# Run a site command directly
otto cmd --action command.run --payload '{"site":"reddit.com","command":"getPosts"}'
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Command completed successfully |
| `1` | Command failed, timed out, or relay error |

---

## `otto test`

Runs a site command in test mode, with optional stream follow for streaming commands.

### Usage

```bash
otto test <site> <command> [options]
```

### Arguments

| Argument | Required | Description |
|---|---|---|
| `<site>` | Yes | Site identifier (e.g. `reddit.com`) |
| `<command>` | Yes | Command name (e.g. `getChatMessages`) |

### Flags

| Flag | Shorthand | Required | Type | Default | Description |
|---|---|---|---|---|---|
| `--payload` | `-p` | No | string | `{}` | JSON payload for the command |
| `--node-id` | | No | string | Auto-selected | Target node ID |
| `--tab-session` | | No | string | | Existing tab session ID (skips auto-open) |
| `--timeout` | | No | number | 30000 | Command timeout in milliseconds |
| `--stream-follow-ms` | | No | number | | How long to follow stream updates after command completes (ms) |
| `--stream-probe` | | No | boolean | false | Force traffic probe immediately after stream subscribe |
| `--stream-poll-interval-ms` | | No | number | | Poll interval override for stream listener modes that support polling |
| `--wait-for-interrupt` | | No | boolean | false | Keep the managed tab open until Ctrl+C |
| `--json` | | No | boolean | false | Output as JSON (machine-readable stream frames) |

### Examples

```bash
# Run a simple site command test
otto test reddit.com getPosts

# Run with payload
otto test reddit.com getPosts --payload '{"limit":5}'

# Stream-follow a chat command for 45 seconds
otto test reddit.com getChatMessages --stream-follow-ms 45000

# Stream with probe and JSON output for automation
otto test reddit.com getChatMessages --stream-probe --stream-follow-ms 45000 --json

# Keep the tab open after test
otto test reddit.com getPosts --wait-for-interrupt
```

### Stream follow behavior

When `--stream-follow-ms` is set, `otto test` subscribes to any stream manifest returned by the command and follows listener updates until the timeout elapses. Press `Ctrl+C` to cancel early — this sends `command_cancel` for active stream tests and closes the auto-opened tab.

### Tab auto-open

If `--tab-session` is omitted, `otto test` auto-opens a tab to the command's `preloadHost` if available, otherwise `https://<site>`. The tab is auto-closed after the test unless `--wait-for-interrupt` is set.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Test completed successfully |
| `1` | Test failed, timed out, `manual_login_required`, or relay error |

---

## `otto extract-content`

Extracts page content through one command with selectable output format. Default format is `markdown`.
For selector development and command authoring, prefer `clean_html`.

### Usage

```bash
otto extract-content [url] [options]
```

### Arguments

| Argument | Required | Description |
|---|---|---|
| `[url]` | No | Page URL to extract from. Optional when `--tab-session` is provided. |

### Flags

| Flag | Shorthand | Required | Type | Default | Description |
|---|---|---|---|---|---|
| `--format` | | No | enum | `markdown` | `markdown`, `distilled_html`, `clean_html`, `raw_html`, or `text` |
| `--tab-session` | | No | string | | Existing tab session ID to extract from |
| `--selector` | | No | string | `body` | CSS selector (supported for `clean_html`, `raw_html`, and `text`) |
| `--distill-mode` | | No | enum | `readability` | `readability` or `dom-distiller` (for `markdown` and `distilled_html`) |
| `--no-fallback-to-readability` | | No | boolean | false | Disable readability fallback when `dom-distiller` is selected |
| `--max-chars` | | No | number | | Maximum extracted characters for supported formats |
| `--node-id` | | No | string | Auto-selected | Target node ID |
| `--timeout` | | No | number | 60000 | Command timeout in milliseconds |
| `--json` | | No | boolean | false | Output full JSON result |

### Examples

```bash
# Extract markdown (default)
otto extract-content https://example.com

# Extract distilled HTML
otto extract-content https://example.com --format distilled_html

# Extract clean HTML (recommended for selector building)
otto extract-content https://example.com --format clean_html --selector article

# Extract raw HTML from a selector
otto extract-content https://example.com --format raw_html --selector article

# Extract text from an existing managed tab
otto extract-content --format text --tab-session <tabSessionId>
```

### Behavior notes

- Provide either `[url]` or `--tab-session`.
- For `--format text` and URL-only calls, Otto auto-opens a temporary managed tab, extracts text, and closes the tab.
- `--selector` is rejected for `markdown` and `distilled_html`.
- `clean_html` preserves semantic attributes while removing scripts/styles/inline handlers, which is usually the best format for DOM debugging.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Extraction completed successfully |
| `1` | Extraction failed, input validation failed, or relay error |

---

## Related commands

- [otto listener subscribe-network](./listener.md) — manually subscribe to network events.
- [Commands Reference](../commands.md) — full action surface and site command model.
