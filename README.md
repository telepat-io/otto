<p align="center"><img src="./assets/avatar/otto-logo.webp" width="128" alt="Otto"></p>
<h1 align="center">Otto</h1>
<p align="center"><em>Automate web workflows on real browser tabs without hosting a browser farm.</em></p>

<p align="center">
  <a href="https://docs.telepat.io/otto">📖 Docs</a>
  · <a href="./README.md">🇺🇸 English</a>
  · <a href="./README.zh-CN.md">🇨🇳 简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/telepat-io/otto/actions/workflows/ci.yml"><img src="https://github.com/telepat-io/otto/actions/workflows/ci.yml/badge.svg?branch=main" alt="Build"></a>
  <a href="https://codecov.io/gh/telepat-io/otto"><img src="https://codecov.io/gh/telepat-io/otto/graph/badge.svg" alt="Codecov"></a>
  <a href="https://www.npmjs.com/package/@telepat/otto"><img src="https://img.shields.io/npm/v/@telepat/otto" alt="npm"></a>
  <a href="https://github.com/telepat-io/otto/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-yellow.svg" alt="License"></a>
</p>

Otto is a secure remote browser automation platform that lets you control real browser tabs from your CLI or scripts — no browser farm, no infrastructure overhead. Send commands over WebSocket to a relay daemon, which routes them to a Chrome extension that executes actions on live tabs.

Built for developers and automation teams who need real browser context for testing, monitoring, and agent-driven workflows without managing headless infrastructure.

## Features

- **Real browser tabs, not headless farms** — Execute commands on live Chrome tabs via a lightweight extension node. No Docker, no Puppeteer farm, no cloud browser rental.
- **Remote CLI control** — Send commands from your laptop to a browser running anywhere. The relay handles routing and auth so controller and node don't need to be on the same host.
- **Code drives the browser. The LLM just decides what to do.** — Otto handles clicks, typing, navigation, and DOM interaction with deterministic code. Your agent only burns tokens on strategy, not on every interaction.
- **Secure by default** — Token auth, replay protection, per-node ACL grants, and pre-ingress log redaction. Secrets stored in OS keychain.
- **Live debugging** — Stream logs by `requestId` with `otto logs follow --source all`. Correlate relay, controller, and node events in real time.
- **Network interception** — Subscribe to HTTP traffic from managed browser tabs. Stream responses back for inspection, validation, or data extraction.
- **Site-scoped command bundles** — Author custom, reusable commands for any domain that run inside the extension. Versioned, shareable, testable.
- **Agent and CI ready** — Non-interactive setup, `--json` output, MCP server, streaming test harness, and agent runtime registration.

## Quick Start

Requirements: Node.js 20+, Chrome, and an npm installation.

1. Install the CLI globally:

```bash
npm install -g @telepat/otto
```

2. Run guided setup:

```bash
otto setup
```

3. Load the unpacked extension into Chrome (the exact path is printed by `otto setup`).

4. Register a controller identity:

```bash
otto client register --name "my-laptop" --description "Local controller"
otto client login
```

5. Verify the stack:

```bash
otto commands list
```

For the full walkthrough, see the [Installation](https://docs.telepat.io/otto/installation) and [Quickstart](https://docs.telepat.io/otto/quickstart) guides.

## Available Commands

Use `otto commands list --site <site>` to inspect the live command surface for your connected node.

### Site Commands

| Site | Available commands |
|---|---|
| `reddit.com` | `getFeed`, `getUserInfo`, `sendChatMessage`, `getChatMessages`, `commentOnPost` |
| `linkedin.com` | `getFeed`, `commentOnPost` |
| `news.ycombinator.com` | `getFrontPage` |
| `google.com` | `getSearchResults` |

### Primitives (Universal)

| Category | Available primitives |
|---|---|
| Tab | `open`, `close`, `navigate`, `query` |
| DOM extraction | `extract_text`, `extract_markdown`, `extract_clean_html`, `extract_distilled_html`, `extract_html` |
| Page | `screenshot` (viewport or full-page) |
| High-level | `otto extract-content [url]` (recommended for markdown/HTML extraction) |

For command payloads, behavior notes, and examples, see the [Commands Reference](https://docs.telepat.io/otto/commands).

## Requirements

- Node.js 20+
- npm 10+
- Chrome (latest stable)
- macOS, Linux, or Windows

## How It Works

```
Controller (otto CLI / script)
        |  WebSocket (authenticated)
        v
  Relay daemon  (:8787)
        |  WebSocket (authenticated, node)
        v
  Extension node (Chrome)
        |  chrome.tabs / chrome.scripting
        v
  Browser tab (managed, site-scoped)
```

1. Controller sends command envelopes over WebSocket to relay.
2. Relay authenticates, authorizes by action scope, and routes by `targetNodeId`.
3. Node executes the action and returns terminal `result` or `error`.
4. Relay forwards terminal outcome back to the originating controller.

Execution guarantees:

- `targetNodeId` is required for all commands.
- Per-tab execution is serial; cross-tab execution is parallel.
- Replay protection is enforced (`replayNonce` plus timestamp window).
- Sensitive fields are redacted before log persistence and streaming.

## Using With AI Agents

Otto is designed for headless automation and agent-driven workflows:

- **Non-interactive setup** — `otto setup --non-interactive` emits deterministic JSON output with no TTY prompts.
- **Machine-readable output** — Append `--json` to most CLI commands (`otto commands list`, `otto test`, `otto logs list`) for structured consumption.
- **Programmatic API** — The relay exposes HTTP and WebSocket endpoints for direct integration. See the [Protocol](https://docs.telepat.io/otto/protocol) docs for message schemas.
- **Live log streaming** — `otto logs follow --source all` streams structured events by `requestId` for real-time agent debugging.
- **Agent docs** — [For Agents](https://docs.telepat.io/otto/for-agents) provides automation runbooks, command development guides, and curl snippets.

## Security And Trust

- Controller authentication uses client-secret token exchange; secrets are stored in the OS keychain when available.
- Node-side ACL grants are required before a controller can route commands to a given node.
- Replay protection and timestamp windows prevent command replay.
- Sensitive fields are redacted from logs and streams before persistence.
- Otto never automates credential submission; users authenticate manually and rerun.

To report a security issue, open a private report through the repository security flow.

## Documentation And Support

- [Documentation site](https://docs.telepat.io/otto)
- [Installation](https://docs.telepat.io/otto/installation)
- [Quickstart](https://docs.telepat.io/otto/quickstart)
- [Architecture](https://docs.telepat.io/otto/overview)
- [Protocol](https://docs.telepat.io/otto/protocol)
- [CLI reference](https://docs.telepat.io/otto/cli)
- [Security](https://docs.telepat.io/otto/security)
- [For Agents](https://docs.telepat.io/otto/for-agents)
- [Repository](https://github.com/telepat-io/otto)
- [npm package](https://www.npmjs.com/package/@telepat/otto)

## Contributing

Contributions are welcome. See [Development](https://docs.telepat.io/otto/development) for local setup, build commands, and test workflows.

## License

MIT. See [LICENSE](./LICENSE).
