---
name: otto-cli
description: Use this skill when users need to install, configure, run, automate, debug, and troubleshoot the Otto CLI for remote browser automation (including MCP server and agent framework registration) from zero context.
---

# Otto CLI Skill

## What this skill does

This skill helps users operate Otto as a remote browser automation platform, not just a command runner.

Otto connects a controller (CLI or agent) to a Chrome extension node through a relay server. It enables programmatic browser automation: opening tabs, running site-specific commands, capturing screenshots, monitoring network traffic, and streaming real-time updates — all from the terminal or an AI agent.

Use this skill to move from install -> setup -> first automation -> iterative improvements -> debugging, without assuming prior Otto knowledge.

## Installation

Prerequisites:

- Node.js 18+
- npm 9+
- Google Chrome (for the extension node)

Install paths:

```bash
# Global install
npm install -g @telepat/otto

# Verify install
otto --help
otto --version
```

## Setup and first run

Interactive setup path:

```bash
otto setup
```

Non-interactive setup path (CI/agents):

```bash
otto setup --relay-url ws://127.0.0.1:8787?role=controller --non-interactive
```

Setup does the following:

1. Confirms relay URL (defaults to `ws://127.0.0.1:8787?role=controller`).
2. Starts the relay daemon if not running.
3. Downloads the extension artifact from release assets.
4. Prints the extension folder path for Chrome.

Extension handoff (required after setup):

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (toggle in top right).
3. Click **Load unpacked** and select the extension path from setup output.
4. Open the extension popup and set the relay URL.

Setup verification checks:

```bash
# Confirm relay is running and identify available nodes
otto status --nodes --json

# Confirm full stack is reachable
otto commands list --json
```

## Agent onboarding: first-run decision tree

When an agent first encounters Otto, it must determine which onboarding phase the user is in and guide them forward. This section is the canonical first-run decision tree for agents. Do not skip steps — each gateway must pass before proceeding.

### Decision tree

```
1. IS OTTO INSTALLED?
   ├─ Run: otto --version
   ├─ NO  → npm install -g @telepat/otto
   │        Then: otto setup --non-interactive
   │        Parse JSON output for extensionPath and relay URL.
   │        Proceed to step 5 (extension handoff).
   └─ YES → Continue to step 2.

2. IS THE RELAY RUNNING?
   ├─ Run: otto status
   ├─ NO  → otto start
   │        Verify with: otto status
   └─ YES → Continue to step 3.

3. ARE NODES CONNECTED?
   ├─ Run: otto commands list --json
   ├─ EMPTY [] OR ERROR →
   │        See "Empty nodes handling" below.
   │        (This is a normal first-run state — not a failure.)
   └─ HAS COMMAND LIST → Continue to step 4.

4. IS THE CONTROLLER AUTHENTICATED?
   ├─ Run: otto client status --json
   ├─ NO client registered → otto client register --name "agent-worker" --json
   │        Then: otto client login
   │        (For auto-register flows, otto test handles this automatically.)
   └─ YES → Continue to step 6.

5. EXTENSION HANDOFF (user must perform these):
   Tell the user to:
   1. Open chrome://extensions in Chrome.
   2. Enable Developer mode (toggle in top right).
   3. Click Load unpacked and select the extension path from setup output.
   4. Open the extension popup and set the relay URL.
   5. Return here when done → return to step 3.

6. ACL GRANTED?
   ├─ If commands return acl_missing_node_grant → tell the user to:
   │   1. Open the extension popup.
   │   2. Navigate to Controller Access.
   │   3. Approve the controller client.
   │   Then retry the command.
   └─ YES → The full stack is operational. Proceed to commands.
```

### Empty nodes handling

When `otto commands list --json` returns `[]` or fails with a connectivity error, diagnose in this order:

| Scenario | How to detect | What to tell the user |
|----------|--------------|-----------------------|
| Extension not loaded at all | `otto status` shows relay running but no extension entry in Chrome's `chrome://extensions` | "The Otto extension needs to be loaded in Chrome. Open `chrome://extensions`, enable Developer mode, click Load unpacked, and select the extension folder." |
| Extension loaded but wrong relay URL | Extension appears in Chrome but shows "disconnected" | "Open the extension popup and set the relay URL to `<relay-url>`. The relay is running at that address." |
| Extension running, relay URL correct, but unpaired | Extension shows "Waiting" or a pairing code | Proceed to "Pin-based pairing flow" below. |
| Remote relay deployment | Relay lives on a different server from the controller | "The relay lives at `<relay-url>`. You need to: (1) ensure the relay is running on that server (`otto start` there), and (2) enter that URL in the extension popup. Note: `otto setup` runs on the controller machine — if the relay is remote, it must be started separately on the relay host." |

### Pin-based pairing flow (agent perspective)

The pairing flow uses a short-lived code displayed in the extension popup. The agent approves this code to establish trust between the extension node and the controller.

```
1. Agent runs: otto authcode
   → Output shows pending challenge codes, e.g.:
     {
       "pending": [
         { "code": "123-456", "nodeId": "node_abc", ... }
       ]
     }

2. IF pending codes exist:
   → Agent: "I see pending pairing codes: 123-456. Shall I approve all of them?"
   → Run: otto pair 123-456  (repeat for each code)

3. IF no pending codes (empty array):
   → Agent tells user: "Open the extension popup in Chrome. It should display a pairing code (e.g., 123-456). Please tell me the code."
   → (The extension auto-requests a challenge each time the popup opens.)
   → When user provides the code → Run: otto pair <code>

4. Verify pairing succeeded:
   → Run: otto commands list --json
   → A non-empty command list confirms the node is paired and reachable.

5. IF pairing fails (code expired, invalid, or rejected):
   → Codes are short-lived. The extension auto-reissues a fresh challenge when the popup opens.
   → Return to step 1: otto authcode
```

### Key pairing gotchas

- **Pairing codes are ephemeral** — if `otto pair <code>` returns an error, don't retry the same code. Instead, re-run `otto authcode` to get a fresh one.
- **The extension popup is the code source** — codes originate from the extension, not the CLI. If `otto authcode` shows nothing, the user needs to open the extension popup.
- **Pairing and controller auth are separate** — pairing approves the node. Controller registration (`otto client register` + `otto client login`) is a separate step for long-lived controller identities. `otto test` auto-handles controller registration for quick flows.
- **Node grant is node-owned** — after pairing, the user must still explicitly approve the controller client in the extension's Controller Access panel. This can't be automated.

## Local readiness checks

Readiness checklist:

1. CLI responds: `otto --help`
2. Relay running: `otto status`
3. Node connected and controller authenticated: `otto commands list --json`
4. Command execution works: `otto test reddit.com getFeed --json`

Expected success signals:

- `otto status` shows relay daemon running with PID.
- `otto commands list --json` returns a non-empty list of available commands.
- `otto test` exits with code 0 and returns structured result.

## Site Commands Reference

### Reddit (`reddit.com`)

#### `getFeed`

Extracts the Reddit feed with configurable post count and optional clipboard permission assist.

**Inputs:**
| Parameter | Type | Default | Notes |
|---|---|---|---|
| `minReturnedPosts` | number | `5` | Minimum posts to return (1–200) |
| `getClipboardPermission` | boolean | `false` | Permission assist mode (1 post, keep alive for user clipboard grant) |

**Returns:**
- `content.post[]` — Array of post entities with title, URL, subreddit, score, comment count, award count

**Example:**
```bash
otto test reddit.com getFeed --json
otto test reddit.com getFeed --payload '{"minReturnedPosts":10}' --json
```

#### `getUserInfo`

Looks up user profile by username or ID; defaults to current session.

**Inputs:**
| Parameter | Type | Notes |
|---|---|---|
| `username` | string | Optional; defaults to current logged-in user |

**Returns:**
- `entity.user` — User object with name, profile URL, karma, created date, profile banner

**Example:**
```bash
otto test reddit.com getUserInfo --json
otto test reddit.com getUserInfo --payload '{"username":"spez"}' --json
```

#### `commentOnPost`

Posts a top-level comment to a Reddit post.

**Inputs:**
| Parameter | Type | Required | Notes |
|---|---|---|---|
| `postUrl` | string | Yes | Full Reddit post permalink |
| `commentBody` | string | Yes | Comment text |

**Returns:**
- `sent: boolean` — Success indicator
- `commentUrl` — Permalink to the posted comment (if successful)

**Example:**
```bash
otto test reddit.com commentOnPost --payload '{"postUrl":"https://reddit.com/r/...","commentBody":"Great post!"}' --json
```

#### `sendChatMessage`, `getChatMessages`

Chat operations for Reddit direct messages and chat rooms.

**`sendChatMessage` inputs:**
| Parameter | Type | Notes |
|---|---|---|
| `roomId` | string | Optional; chat room ID (uses Shadow DOM) |
| `username` | string | Optional; creates room with user if `roomId` not set |
| `message` | string | Message to send |

**`getChatMessages` returns:**
- `network.http_intercept` — Stream manifest when streaming is enabled
- `message[]` — Array of chat messages with sender, timestamp, body

### LinkedIn (`linkedin.com`)

#### `getFeed`

Extracts LinkedIn feed posts with semantic filtering and bounded scroll.

**Inputs:**
| Parameter | Type | Default | Notes |
|---|---|---|---|
| `minReturnedPosts` | number | `5` | Minimum posts to return (1–200) |
| `getClipboardPermission` | boolean | `false` | Permission assist mode |

**Returns:**
- `content.post[]` — Array of post entities with title, author, engagement (likes, comments, shares)

**Example:**
```bash
otto test linkedin.com getFeed --json
otto test linkedin.com getFeed --payload '{"minReturnedPosts":15}' --json
```

#### `commentOnPost`

Posts a top-level comment on a LinkedIn post.

**Inputs:**
| Parameter | Type | Required | Notes |
|---|---|---|---|
| `postUrl` | string | Yes | LinkedIn post URL; auto-normalized to `https://www.linkedin.com/posts/...` |
| `commentBody` | string | Yes | Comment text (non-empty) |

**Returns:**
- `sent: boolean` — Success indicator
- `postUrl` — The target post URL

**Confirmation semantics:**
- Fills the in-page comment editor (`.ql-editor[contenteditable="true"]`)
- Waits for submit button (multiple selector support)
- After submit, retries reading first `.comments-comment-item__main-content` and matches normalized text (12 attempts × 300ms = 3.6s window)

**Example:**
```bash
otto test linkedin.com commentOnPost --payload '{"postUrl":"https://www.linkedin.com/posts/...","commentBody":"Great insights!"}' --json
```

### Hacker News (`news.ycombinator.com`)

#### `getFrontPage`

Extracts the Hacker News front page stories.

**Inputs:** (none)

**Returns:**
- `content.post[]` — Array of story entities with title, URL, author, points, comment count

**Example:**
```bash
otto test news.ycombinator.com getFrontPage --json
```

### Google (`google.com`)

#### `getSearchResults`

Searches Google and extracts SERP results.

**Inputs:**
| Parameter | Type | Default | Range | Notes |
|---|---|---|---|---|
| `query` | string | (required) | — | Search query |
| `pages` | number | `1` | 1–5 | Number of SERP pages to fetch |
| `limit` | number | `10` | 1–100 | Total results cap per page |

**Returns:**
- `content.search_result[]` — Array of results with:
  - `title`, `url`, `description`, `rank`
  - `links` — Sitelinks (if any)
  - `image` — Thumbnail URL or null
  - `isAd` — Boolean marking sponsored results

**Example:**
```bash
otto test google.com getSearchResults --payload '{"query":"typescript best practices"}' --json
otto test google.com getSearchResults --payload '{"query":"typescript","pages":2,"limit":20}' --json
```

### Primitives (Universal)

Primitives are cross-site building blocks for tab/page/DOM operations.

#### Tab operations

- `primitive.tab.open` — Open URL in new managed tab → returns `tabSessionId`
- `primitive.tab.close` — Close tab by `tabSessionId`
- `primitive.tab.navigate` — Navigate tab to new URL
- `primitive.tab.query` — Get tab metadata (URL, title, status)

**Examples:**
```bash
otto cmd --action primitive.tab.open --payload '{"url":"https://example.com"}' --json
otto cmd --action primitive.tab.navigate --payload '{"tabSessionId":"...","url":"https://example.com/page"}' --json
```

#### DOM extraction

- `primitive.dom.extract_text` — Raw text content
- `primitive.dom.extract_markdown` — Markdown (recommended for readability)
- `primitive.dom.extract_clean_html` — HTML with scripts/styles removed, preserves semantic attributes (best for command development)
- `primitive.dom.extract_distilled_html` — Reader-mode-like distilled HTML
- `primitive.dom.extract_html` — Full raw HTML

**Examples:**
```bash
# High-level CLI (recommended)
otto extract-content https://example.com --json
otto extract-content https://example.com --format markdown --json
otto extract-content https://example.com --format clean_html --selector '.main-content' --json

# Low-level primitive
otto cmd --action primitive.dom.extract_markdown --payload '{"tabSessionId":"..."}' --json
otto cmd --action primitive.dom.extract_clean_html --payload '{"url":"https://example.com"}' --json
```

#### Page screenshot

- `primitive.page.screenshot` — Capture viewport or full page

**Modes:**
- `viewport` — Active tab viewport snapshot
- `full_page` — Full-page capture via Chrome DevTools Protocol

**Examples:**
```bash
otto screenshot https://example.com --json
otto screenshot https://example.com --mode full_page --json
otto cmd --action primitive.page.screenshot --payload '{"tabSessionId":"...","mode":"viewport"}' --json
```

### High-level CLI

- `otto extract-content [url]` — Recommended for all extraction; defaults to markdown; supports `--format`, `--selector`, `--tab-session`
- `otto test <site> <command>` — Recommended for site commands
- `otto commands list --json` — Always authoritative; lists all available commands at runtime

For full command details, inputs, and examples, see the [Commands Reference](https://docs.telepat.io/otto/commands).

## When to use this skill

Use this skill when:

- You need to automate browser tasks programmatically from CLI or an agent.
- You need to install and configure Otto from scratch.
- You need reliable non-automation for CI/agents.
- You need to debug relay/extension connectivity or command failures.
- You need MCP server usage with Otto tools.
- You need to register Otto with agent frameworks (Claude, Cursor, VS Code, etc.).

Do not use this skill when:

- You only need a quick explanation of one flag.
- You need to build Chrome extensions (Otto's extension is pre-built).
- You need product architecture discussion without CLI execution.

## Inputs to collect from user

| Input | Required | Why it matters |
| --- | --- | --- |
| Relay URL | No | Defaults to `ws://127.0.0.1:8787?role=controller`. Override for remote deployments. |
| Site | Yes (for commands) | The website to automate (e.g. "reddit.com"). |
| Command | Yes (for commands) | The site-specific command to run (e.g. "getFeed"). |
| Node ID | No | Auto-resolved if only one node is connected. |
| Tab session | No | For scoped tab execution. Obtained from `primitive.tab.open`. |
| Auth mode | No | `auto` (default), `strict_fail`, or `skip`. |

## Deterministic workflow

1. Discover user intent and risk class.
2. Confirm install and setup state using readiness checks.
3. Choose operation path:
   - Start/stop/restart relay: `otto start` / `otto stop` / `otto restart`
   - Run site command: `otto cmd --action command.run --payload '{"site":"...","command":"..."}'`
   - Extract content: `otto extract-content <url> --format markdown|distilled_html|raw_html|text`
   - Test command: `otto test <site> <command> --json`
   - Capture screenshot: `otto screenshot <url>`
   - View logs: `otto logs list --json` / `otto logs follow`
   - Monitor network: `otto listener subscribe-network`
   - Manage config: `otto config --relay-url <url>`
   - Start MCP server: `otto mcp`
   - Register with agent: `otto agent install <runtime>`
4. Run minimal safe command first (`otto commands list --json`).
5. Escalate to full workflow only after verification succeeds.
6. Report:
   - command run
   - result/outcome
   - exit code
   - next safe step

Create-if-missing and update-if-existing behavior for this package:

- If this skill package is missing, create all files in this folder.
- If it exists, update in place and remove stale claims that conflict with current code/docs.

## Operations lifecycle

Start / run:

```bash
# Start relay daemon
otto start

# Start relay attached (development)
otto start --attached
```

Common operations:

```bash
# Open a managed tab
otto cmd --action primitive.tab.open --payload '{"url":"https://www.reddit.com"}'

# Run a site command
otto cmd --action command.run --tab-session <tabSessionId> --payload '{"site":"reddit.com","command":"getFeed"}'

# Test a Reddit command
otto test reddit.com getFeed --json

# Test a LinkedIn command
otto test linkedin.com commentOnPost --payload '{"postUrl":"https://www.linkedin.com/posts/...","commentBody":"Great post!"}' --json

# Test with streaming
otto test reddit.com getChatMessages --stream-follow-ms 30000 --json

# Capture screenshot
otto screenshot https://www.reddit.com --json

# Extract content (default format = markdown)
otto extract-content https://www.reddit.com --json

# Extract distilled HTML
otto extract-content https://www.reddit.com --format distilled_html --json

# Extract text from an existing tab session
otto extract-content --format text --tab-session <tabSessionId> --json

# List available commands
otto commands list --json
```

Monitoring / status:

```bash
otto status
otto logs list --source all --latest 100 --json
otto logs follow --source all
```

Update / upgrade:

```bash
npm i -g @telepat/otto@latest
otto --version
otto extension update
```

Cleanup / uninstall:

```bash
otto stop
npm uninstall -g @telepat/otto
```

## MCP and integrations

First-party MCP server:

```bash
otto mcp
```

Documented MCP characteristics:

- Transport: stdio
- Intended usage: local process-spawned MCP clients
- Tool set (25 tools): `otto_status`, `otto_commands_list`, `otto_cmd`, `otto_test`, `otto_screenshot`, `otto_extract_content`, `otto_logs_list`, `otto_logs_follow`, `otto_logs_export`, `otto_listener_subscribe_network`, `otto_listener_unsubscribe`, `otto_setup`, `otto_start`, `otto_stop`, `otto_config`, `otto_pair`, `otto_authcode`, `otto_revoke`, `otto_client_register`, `otto_client_login`, `otto_client_status`, `otto_client_forget`, `otto_client_remove`, `otto_extension_update`, `otto_extension_info`

Agent framework registration:

```bash
otto agent install <runtime>
otto agent uninstall <runtime>
otto agent status
```

Supported runtimes: `claude`, `claude-desktop`, `chatgpt`, `gemini`, `codex`, `cursor`, `vscode`, `opencode`, `generic-mcp`.

## Argument semantics and constraints

Command execution:

- `--action` is required for `otto cmd`. Common values: `primitive.tab.open`, `command.run`, `command.list`.
- `--payload` must be a JSON string. Defaults to `{}`.
- `--tab-session` is required for tab-scoped commands. Obtain from `primitive.tab.open` response.
- `--timeout` defaults to 30000ms.

Test command:

- `site` and `command` are required positional arguments.
- `--stream-follow-ms` enables streaming mode for the specified duration.
- `--stream-probe` forces immediate traffic after subscribe.
- `--stream-poll-interval-ms` overrides polling cadence for stream listener modes that support polling.
- `--json` always recommended for agent/CI use.

Extract content command:

- `otto extract-content` defaults to `--format markdown`.
- Supported formats: `markdown`, `distilled_html`, `clean_html`, `raw_html`, `text`.
- Use URL or `--tab-session` as the extraction target.
- `--selector` is supported for `clean_html`, `raw_html`, and `text`.
- `--distill-mode` and `--fallback-to-readability` apply to `markdown` and `distilled_html`.
- Text extraction with URL auto-opens a temporary managed tab and closes it after extraction.
- `clean_html` is optimized for command development: removes scripts/styles but preserves DOM structure and semantic attributes (data-*, aria-*) for easy selector building.

Node resolution:

- If only one node is connected, `targetNodeId` is auto-resolved.
- If multiple nodes are connected, `--node-id` is required.
- `otto config --node-id <id>` sets a persistent default.

Auth modes:

- `auto`: uses stored credentials, attempts refresh on auth errors.
- `strict_fail`: fails immediately on auth errors.
- `skip`: skips auth checks (for testing).

## Configuration precedence and discovery

Precedence (highest to lowest):

1. CLI args
2. Environment variables
3. Config file (`~/.otto/config.json`)
4. Defaults

Key config paths:

- Config: `~/.otto/config.json`
- Runtime state: `~/.otto/runtime/relay-daemon.json`
- Relay logs: `~/.otto/runtime/relay-{port}.log`

## Output and exit semantics

Machine-readable outputs:

- All commands support `--json` for structured output.
- `otto commands list --json` returns command descriptors with input field schemas.
- `otto test <site> <command> --json` returns command result with outcome.
- `otto setup --non-interactive` always emits JSON.

Common exit semantics:

- `0`: success
- `1`: validation/runtime error
- `130`: interrupted by Ctrl+C

Command outcomes:

- `completed`: command finished successfully.
- `failed`: command hit an error.
- `timed_out`: command exceeded its timeout.
- `cancelled`: command was explicitly cancelled.

## Gotchas and sharp edges

- **`manual_login_required`**: When a site requires login, Otto returns this instead of automating credentials. Ask the human to log in manually, then retry. This is intentional and non-negotiable.
- **`acl_missing_node_grant`**: Controller access must be approved in the extension popup. Ask the user to approve, then retry.
- **Multi-node resolution**: If multiple nodes are connected and no `--node-id` is specified, commands fail. Always specify `--node-id` in multi-node setups.
- **Extension handoff**: After `otto setup`, the user must manually load the extension in Chrome. There is no way to automate this step.
- **Signal handling**: `otto logs follow` and `otto listener subscribe-network` run until interrupted. Use Ctrl+C or a caller-side timeout for agent/CI use.
- **Non-interactive mode**: `otto setup --non-interactive` requires the relay URL to be pre-configured or passed explicitly.
- **Empty `otto commands list` is a normal first-run state**: A non-existent or empty node list means no extension node is connected yet. Don't treat it as an error — follow the empty nodes handling decision tree. The answer is never "retry the same command."
- **Remote relay**: `otto setup` runs on the **controller** machine. If the relay lives on a different server, the user must start it there separately and configure the extension's relay URL to point to that remote address. The controller does not start the remote relay.
- **Pin codes are short-lived**: If `otto pair <code>` fails with an invalid/expired response, do not retry the same code. Re-run `otto authcode` to get a fresh challenge. The extension auto-reissues a new code each time its popup opens.
- **Pairing ≠ controller auth**: Pairing (`otto pair`) establishes trust between the extension node and the relay. Controller authentication (`otto client register` + `otto client login`) creates a long-lived controller identity. Both are required before commands can be routed.

## Clarifying questions for risky operations

Destructive:

1. Are you sure you want to stop the relay daemon? Active connections will be dropped.
2. Do you want to remove all controller clients, or just a specific one?

Multi-node:

1. Multiple nodes are connected. Which node ID should this command target?
2. Should this become the persistent default node (`otto config --node-id`)?

Credential:

1. Should the client secret be stored in the OS keychain or passed via environment variable?
2. Are you running in a container where keychain access should be disabled?

## Failure handling

| Failure | Action |
| --- | --- |
| `manual_login_required` | Pause and ask the human to log in to the site in the browser, then retry |
| `acl_missing_node_grant` | Pause and ask the human to approve controller access in extension popup, then retry |
| `node_offline` | Wait for node to reconnect or re-pair; do not loop indefinitely |
| `tab_url_not_ready` | Retry after a brief delay (2-5 seconds) |
| `site_mismatch` | Open a fresh tab to the correct URL with `primitive.tab.open`, then retry |
| `replay_rejected` | Do not replay; generate a new command with a fresh `replayNonce` |
| `forbidden_action` | Verify controller token scopes; escalate if scopes cannot be widened |
| `rate_limited` | Back off and retry; do not increase rate limits without operator approval |
| Relay not running | Run `otto start` or `otto setup` |
| Extension not loaded | Ask user to load extension at `chrome://extensions` |
| Controller not authenticated | Run `otto client register` then `otto client login` |
| `otto commands list` returns empty `[]` | No extension node connected — this is normal on first run. Follow the [empty nodes handling](#empty-nodes-handling) decision tree: check extension loaded, relay URL in popup, then pairing flow |
| `otto authcode` returns empty | No node has requested a pairing challenge. Ask the user to open the extension popup — it auto-requests a challenge on open |

For all failures: correlate by `requestId` using `otto logs list --request-id <id> --source all`.

## Verification prompts

Should trigger:

1. Set up Otto for browser automation from scratch.
2. Run Otto MCP server and register with Claude/Cursor/VS Code.
3. Debug a failed Otto command using logs and requestId correlation.

Should not trigger:

1. Explain one Otto flag quickly.
2. Build a Chrome extension.
3. Summarize repo architecture without running CLI workflows.

## Companion references

- See `references/command-catalog.md` for full command/argument matrix.
- See `references/troubleshooting.md` for detailed failure diagnostics.
- See `references/framework-patterns.md` for reusable workflow patterns.
