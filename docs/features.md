---
slug: /features
title: "Real Browsers. Remote Control. No Infrastructure."
description: What Otto can do for developers, automation teams, and AI agents.
keywords: [otto, features, browser automation, remote browser, chrome extension, cli]
sidebar_label: Features
sidebar_position: 1
---

# Real Browsers. Remote Control. No Infrastructure.

Otto is a secure remote browser automation platform that puts real Chrome tabs under CLI and script control — no browser farm, no cloud rental, no headless guessing.

Built for developers and automation teams who need live browser context for testing, monitoring, and agent-driven workflows without managing infrastructure.

---

## Real Browser Tabs, Not Headless Farms

Execute commands on live Chrome tabs via a lightweight extension node. No Docker images to pull. No Puppeteer farm to manage. No cloud browser subscription. One extension, one relay, full control.

```bash
otto cmd --action primitive.tab.open --payload '{"url":"https://example.com"}'
otto cmd --action primitive.tab.screenshot --tab-session <id>
```

---

## Remote CLI Control

Send commands from your laptop to a browser running anywhere — same machine, office network, or a remote server. The relay daemon handles routing and auth so your controller and browser node don't need to be on the same host.

```bash
otto start          # start relay daemon
otto client login   # authenticate controller
otto commands list  # verify connectivity
```

---

## Code Drives the Browser. The LLM Just Decides What to Do.

Most browser automation tools ask the LLM to reason about every click, every form field, every DOM element — burning tokens on the *how*, not just the *what*. Otto handles clicks, typing, navigation, and DOM interaction with deterministic code. Your agent only pays for strategy and decisions.

No context windows wasted on button coordinates. No hallucinations about page state. Just precise execution.

---

## Secure by Default

- **Token-based authentication** — Controllers exchange client secrets for access and refresh tokens
- **Per-node ACL grants** — The node owner decides which controllers can route commands
- **Replay protection** — Every command includes a nonce and timestamp window
- **Pre-ingress log redaction** — Sensitive fields are stripped before persistence or streaming
- **OS keychain storage** — Client secrets stored securely via the OS credential manager

Otto never automates credential submission. Users authenticate manually and rerun.

---

## Live Debugging

Stream structured logs in real time with `requestId` correlation. Trace a command from controller → relay → node and back, all in one terminal.

```bash
otto logs follow --source all
otto logs list --source node --latest 50
```

Every event is tagged with its source (`relay`, `controller`, `node`) and correlated by `requestId`. Find the root cause without grep-and-guess.

---

## Network Interception

Subscribe to HTTP traffic from managed browser tabs. Stream responses back to your controller for inspection, validation, or data extraction.

```bash
otto listener subscribe-network \
  --tab-session <id> \
  --site reddit.com \
  --request-host matrix.redditspace.com \
  --pattern 'https://matrix.redditspace.com/_matrix/client/v3/*' \
  --mode network
```

Use it for API monitoring, data scraping, integration testing, or proving network behavior during debugging.

---

## Browser-local content extraction

Extract rendered page content directly from a live Chrome tab and return it as markdown, cleaned HTML, raw HTML, or text. Otto runs extraction inside the user's browser session, so agents can surf the web locally instead of relying on remote scraping or headless farms.

```bash
otto extract-content https://example.com/article --format markdown
```

This is ideal for agent workflows because it preserves browser-rendered page state, avoids cloud scraping services, and delivers token-efficient markdown output for summarization and action planning.

---

## Site-Scoped Command Bundles

Author custom, reusable commands for any domain. Commands run inside the extension runtime and are site-scoped, so `getChatMessages` for Reddit and `getChatMessages` for LinkedIn are separate, predictable, and testable.

```bash
otto test reddit.com getChatMessages --stream-follow-ms 45000 --json
otto test ... --stream-probe  # force immediate traffic for fast iteration
```

Version your commands. Share them across controllers. Build a library of site automation primitives.

---

## Agent and CI Ready

- **Non-interactive setup** — `otto setup --non-interactive` emits deterministic JSON output
- **Machine-readable everything** — `--json` flag on commands, list, logs, and test
- **MCP server** — `otto mcp` exposes Otto tools over stdio for Claude Code, ChatGPT, Gemini, or any MCP host
- **Streaming test harness** — `otto test` with `--stream-follow-ms` for autonomous validation
- **Agent runtime registration** — `otto agent install <runtime>` for supported platforms

---

## Ready to Automate?

[Get Started →](./installation.md)

Or jump straight to the [Quickstart](./quickstart.md) and [CLI Reference](./cli/index.md).
