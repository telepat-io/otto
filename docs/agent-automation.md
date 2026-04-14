# Autonomous Agent Guide

Last Updated: 2026-04-14
Owner: Platform

In-depth runbook for AI agents operating Otto end-to-end.

## Scope

Covers install/setup, extension handoff, relay networking, pairing, controller registration and secrets, ACL approval, and command execution as controller.

## Core Sequence

1. Install Otto CLI and run setup.
2. Provide extension unpacked path and Chrome load-unpacked instructions.
3. Start relay and confirm network visibility for node and controller.
4. Run pairing (`otto authcode` and `otto pair <code>`).
5. Register controller (`otto client register`) and login (`otto client login`).
6. Ask user to approve new controller access in extension UI when required.
7. Execute commands as controller.

## Setup and Extension Handoff

```bash
npm install -g @telepat/otto
otto setup --relay-url ws://localhost:8787 --non-interactive
```

Provide user instructions:

1. Open `chrome://extensions`
2. Enable Developer mode
3. Load unpacked extension path from setup output
4. Open popup and set relay URL

## Multi-machine Requirement

If relay, browser node, and controller are on different machines:

- relay endpoint must be reachable from both node and controller
- firewall and DNS must allow connection
- prefer `wss://` for remote traffic

## Pairing and Authorization

```bash
otto authcode
otto pair <code>
```

Agent asks user for pairing code if needed and confirms extension state.

## Register Controller and Secret Handoff

```bash
otto client register --name "agent-worker" --description "Autonomous Otto controller"
otto client login --client-id <clientId>
```

Secret handling rules:

- do not print secrets to shared logs
- prefer keychain/env vars
- hand off out-of-band for external controllers

## ACL Approval for New Controllers

If command routing fails with `acl_missing_node_grant`, user must approve controller via extension UI, then agent retries.

## Agent as Controller

```bash
otto commands list --target-node-id <nodeId>
otto cmd --action primitive.tab.open --target-node-id <nodeId> --payload '{"url":"https://www.reddit.com"}'
otto cmd --action command.run --target-node-id <nodeId> --tab-session <tabSessionId> --payload '{"site":"reddit.com","command":"getFeed"}'
```

## Must-ask User Prompts

- extension installed and popup state confirmation
- pairing code request
- ACL approval confirmation for new controllers
- manual login confirmation when `manual_login_required` appears

## Security Boundaries

Agents must never automate credential submission, bypass ACL, or expose secrets.

## Related Docs

- docs/controller-implementation.md
- docs/use-cases.md
- docs/troubleshooting-advanced.md
- docs/relay-api.md
- docs/snippets.md
- docs/error-codes.md
