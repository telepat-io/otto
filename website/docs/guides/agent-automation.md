---
title: Autonomous Agent Guide
sidebar_position: 6
---

# Autonomous Agent Guide

Last Updated: 2026-04-14  
Owner: Platform

This guide is the end-to-end runbook for AI agents operating Otto with human checkpoints.

## Scope

This runbook covers:

1. Installing and setting up Otto.
2. Providing extension artifact and Chrome installation instructions to the user.
3. Starting relay and handling multi-machine network visibility.
4. Pairing and authorization with relay.
5. Registering new controller clients and handling secrets.
6. Onboarding new controllers with required user ACL approval in extension UI.
7. Agent-issued commands as a first-class controller.

## Quick Checklist

- Relay reachable from node and controller.
- Extension installed and connected.
- Pairing completed.
- Controller identity registered and logged in.
- ACL approved for target node.
- Command execution validated with deterministic outcome.

## Phase 1: Install and Setup Otto

Install CLI:

```bash
npm install -g @telepat/otto
otto --version
```

Run setup:

```bash
otto setup --relay-url ws://localhost:8787 --non-interactive
```

Expected setup outputs include:

- relay URL and daemon readiness
- extension unpacked path
- next steps for pairing

## Phase 2: Provide Extension and Chrome Installation Instructions

After setup, agent should provide user explicit instructions:

1. Open Chrome and visit `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select extension path from setup output.
5. Open extension popup and set relay URL.

Agent prompt template:

```text
Please install the Otto extension in Chrome:
1) Open chrome://extensions
2) Enable Developer mode
3) Click Load unpacked
4) Select this folder: <UNPACKED_EXTENSION_PATH>
5) Open Otto popup and set relay URL: <RELAY_URL>
Reply "done" when the popup shows a pairing or connected state.
```

## Phase 3: Relay Startup and Network Topology

Start relay locally:

```bash
otto start
```

If browser, relay, and controller are on different machines:

1. Relay must be reachable by both node and controller over network.
2. Use hostnames/IP and open firewall port for relay.
3. Prefer `wss://` for remote networks.
4. Ensure extension popup relay URL points to reachable relay endpoint.

Topology checklist:

- Node machine can connect to relay URL.
- Controller machine can connect to same relay URL.
- DNS/firewall rules allow bidirectional WebSocket traffic.

## Phase 4: Pairing and Authorization

Legacy pairing flow:

```bash
otto authcode
otto pair <code>
```

Agent prompt template:

```text
Please send me the pairing code shown in the extension popup.
After you share it, I will run: otto pair <code>
```

If user cannot copy code, agent can run `otto authcode` and ask user to confirm matching pending entry.

Validation step:

```bash
otto commands list
```

If this returns ACL errors, continue to ACL phase.

## Phase 5: Register Controller and Handle Secret

Register a new controller client:

```bash
otto client register --name "agent-worker" --description "Autonomous Otto controller"
```

Login for tokens:

```bash
otto client login --client-id <clientId>
```

Secret handoff guidance:

1. Never print secrets in public logs.
2. Prefer keychain or environment variable handoff.
3. For external controller, provide secret out-of-band.

Recommended environment variable handoff:

```bash
export OTTO_CONTROLLER_CLIENT_SECRET='<secret>'
otto client login --client-id <clientId>
```

## Phase 6: New Controller Approval in Extension UI

For newly registered controllers, user must approve access in extension UI.

Failure signature:

- `acl_missing_node_grant`

Agent prompt template:

```text
This controller needs approval in extension UI.
Please open Otto extension settings/options and grant access for controller: <controller-name-or-clientId>.
Reply "granted" when done.
```

Retry after user confirmation:

```bash
otto commands list
```

## Phase 7: Agent as Controller (Issue Commands)

Discover commands:

```bash
otto commands list --target-node-id <nodeId>
```

Open a managed tab:

```bash
otto cmd --action primitive.tab.open --target-node-id <nodeId> --payload '{"url":"https://www.reddit.com"}'
```

Run a command:

```bash
otto cmd --action command.run --target-node-id <nodeId> --tab-session <tabSessionId> --payload '{"site":"reddit.com","command":"getFeed"}'
```

Run stream test:

```bash
otto test reddit.com getChatMessages --target-node-id <nodeId> --stream-follow-ms 45000 --json
```

## Phase 8: Failure Handling Decision Tree

1. Auth failure (`invalid_access_token`): refresh/login and reconnect.
2. ACL failure (`acl_missing_node_grant`): user approval required.
3. Routing failure (`node_offline`): verify relay/node connectivity.
4. Tab/site failure (`unknown_tab_session`, `site_mismatch`, `tab_url_not_ready`): reopen/retarget and retry.
5. Lock/queue failure (`tab_busy`, `tab_locked`, `queue_wait_timed_out`): backoff and retry with bounded policy.
6. Login handoff (`manual_login_required`): user logs in manually, then rerun.

## Security Boundaries for Agents

Agents must never:

- automate username/password submission
- log or expose tokens/client secrets
- bypass ACL requirements
- assume ownership of tabs from other controllers
- route secrets through unsafe channels

Agents should:

- use bounded retries based on retryable errors
- correlate failures by requestId
- keep teardown deterministic for streams and tabs

## Use Cases

1. Local bootstrap: single machine setup for first command.
2. Distributed setup: relay on server, node and controller on separate machines.
3. External controller onboarding: register, hand off secret, user grants ACL.
4. Agent-owned controller: autonomous command loop with stream cancellation.
5. Multi-controller environment: repeated approval and isolation checks.

## Related Docs

- guides/controller-implementation
- guides/use-cases
- guides/troubleshooting-advanced
- reference/relay-api
- reference/snippets
- reference/error-codes
