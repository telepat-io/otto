---
title: Automation Guide
sidebar_position: 2
description: End-to-end runbook for AI agents and automation systems operating Otto. Covers install, extension handoff, pairing, controller registration, ACL approval, and command execution.
keywords:
  - automation guide
  - AI agent
  - end-to-end automation
  - controller automation
  - agent runbook
---

# Automation Guide

This is the end-to-end runbook for AI agents and automation systems operating Otto programmatically. Before starting, review [For Agents](./index.md) for constraints and decision flow.

## Prerequisites

- Node.js 18+ and npm
- Google Chrome installed
- Network access between relay, browser node, and controller

## Step 1: Install and set up

```bash
npm install -g @telepat/otto
otto setup --relay-url http://localhost:8787 --non-interactive
```

Parse the JSON output for:
- `daemonStatus`: `started` or `already_running`
- `extensionPath`: path to the unpacked extension
- `extensionVersion`: installed version

## Step 2: Extension handoff

`otto setup` provides the unpacked extension path. Present the following instructions to the human:

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (toggle in top right).
3. Click **Load unpacked** and select the extension path from setup output.
4. Open the extension popup.
5. Set the relay URL to `http://localhost:8787` (or your relay URL).

For remote relay deployments, the relay endpoint must be reachable from both the browser node and the controller. Use `https://` / `wss://` for remote traffic.

## Step 3: Pairing

```bash
# Generate an authcode for the node to use
otto authcode

# After the user enters the code in the extension popup, approve it:
otto pair <code>
```

If the user cannot locate the pairing code field in the extension popup, guide them to **Options** → **Pairing** in the extension.

## Step 4: Register controller and authenticate

```bash
otto client register --name "agent-worker" --description "Autonomous Otto controller" --json
otto client login --client-id <clientId>
```

Secret handling:
- Store the returned client secret in an environment variable or keychain.
- Never print it to shared logs.
- Hand it off out-of-band for external controllers.

## Step 5: ACL approval

If commands return `acl_missing_node_grant`, the user must grant access:

1. Open the extension popup.
2. Navigate to **Controller Access**.
3. Approve the controller client.

After approval, retry the failing command.

## Step 6: Verify the full stack

```bash
otto commands list --json
```

A successful response confirms relay, node, controller, and ACL are all operational.

## Step 7: Execute commands

```bash
# Open a managed tab
otto cmd --action primitive.tab.open --payload '{"url":"https://www.reddit.com"}'

# Run a site command using the returned tabSessionId
otto cmd --action command.run \
  --tab-session <tabSessionId> \
  --payload '{"site":"reddit.com","command":"getFeed"}'

# Run with otto test for stream-capable commands
otto test reddit.com getChatMessages --stream-follow-ms 30000 --json
```

## Handling `manual_login_required`

When a command returns `manual_login_required`:

1. Tell the human: the site requires login before this command can run.
2. Ask them to log in to the site in the open browser tab.
3. Once confirmed, retry the command using the same `--tab-session`.

Do not attempt to automate credential entry. This behavior is intentional and non-negotiable.

## Correlating failures

Every command response includes a `requestId`. Use it to pull correlated logs:

```bash
otto logs list --request-id <requestId> --source all --latest 100 --json
```

For extension-specific issues:

```bash
otto logs list --source node --latest 50 --json
```

For live debugging:

```bash
otto logs follow --source all --json
```

## Multi-machine deployments

When relay, browser node, and controller are on different machines:

- The relay endpoint must be reachable from both the node and controller network paths.
- Configure `OTTO_EXTENSION_ORIGIN` to match the extension origin in production.
- Use `wss://` and `https://` for remote deployments.
- Firewall rules must allow WebSocket upgrades on the relay port.

## Security boundaries

- Never automate credential submission — always use explicit `manual_login_required` handoff.
- Never expose `OTTO_TOKEN_SECRET`, client secrets, or node tokens in logs or output.
- Verify ACL grants are node-owned; do not attempt to inject ACL state directly.
- Keep payloads bounded — do not loop unboundedly or capture unlimited stream data.

## Related pages

- [For Agents](./index.md) — constraints, decision flow, and failure handling reference.
- [MCP Server](./mcp-server.md) — MCP server documentation and tool list.
- [Agent Setup](./agent-setup.md) — register Otto with agent frameworks.
- [Controller Implementation Guide](../guides/controller-implementation.md) — WebSocket controller integration.
- [Use Cases](../guides/use-cases.md) — runnable examples for common automation patterns.
- [Troubleshooting Advanced](../guides/troubleshooting-advanced.md) — stream and routing diagnostics.

## MCP server usage

For agents using Otto via MCP instead of CLI commands:

### Start MCP server

```bash
otto mcp
```

### Register with agent framework

```bash
otto agent install claude  # or cursor, vscode, etc.
```

### MCP workflow

1. Call `otto_status` to verify relay is running.
2. Call `otto_commands_list` to discover available commands.
3. Call `otto_cmd` with `action: "primitive.tab.open"` to open a tab.
4. Call `otto_cmd` with `action: "command.run"` to execute site commands.
5. Handle `manual_login_required` by asking user to log in.
6. Handle `acl_missing_node_grant` by asking user to approve access.

### Example MCP tool calls

**Check status:**
```json
{ "name": "otto_status", "arguments": {} }
```

**List commands:**
```json
{ "name": "otto_commands_list", "arguments": { "nodeId": "node_123" } }
```

**Open a tab:**
```json
{ "name": "otto_cmd", "arguments": { "action": "primitive.tab.open", "payload": "{\"url\":\"https://www.reddit.com\"}" } }
```

**Run a site command:**
```json
{ "name": "otto_cmd", "arguments": { "action": "command.run", "tabSession": "tab_abc", "payload": "{\"site\":\"reddit.com\",\"command\":\"getFeed\"}" } }
```
