---
title: Use Cases
sidebar_position: 6
---

# Practical Use Cases

Last Updated: 2026-04-14  
Owner: Platform

This page provides end-to-end workflows with copy-paste snippets for common Otto scenarios.

## 1) First Controller Command on a Fresh Node

Goal:

- Pair controller
- discover node
- run first command

Commands:

```bash
otto authcode
otto pair <PAIRING_CODE>
otto commands list
otto cmd --action primitive.tab.open --payload '{"url":"https://www.reddit.com"}'
otto cmd --action command.run --payload '{"site":"reddit.com","command":"getFeed"}' --tab-session <TAB_SESSION_ID>
```

What to verify:

- `command.list` includes expected site command descriptors.
- command result includes terminal outcome `completed`.

## 2) Implement and Validate a New Site Command

Goal:

- add command module
- run command-level tests
- validate runtime contracts

Workflow:

1. Add command file in extension command bundle.
2. Register command in site index.
3. Add metadata input schema.
4. Add optional command.test hook.
5. Run repository checks.

Validation commands:

```bash
npm run check
npm run lint
npm run build
npm run -ws --if-present test
```

## 3) Streaming Test Session with Listener Updates

Goal:

- run stream-capable command test
- follow listener updates
- cancel cleanly

Commands:

```bash
otto test reddit.com getChatMessages --stream-follow-ms 45000 --json
```

Expected behavior:

- Initial command.test result may include stream listener manifests.
- Listener updates arrive as event frames correlated by subscribe request id.
- Ctrl+C triggers cancel and deterministic teardown.

## 4) ACL Grant Flow for a Registered Controller Client

Goal:

- register controller client
- issue token
- grant node ACL
- run command

HTTP sequence:

1. POST /api/controller/register
2. POST /api/controller/token
3. POST /api/controller/access (node token)
4. run websocket commands with target node id

Failure signature:

- missing ACL grant returns `acl_missing_node_grant`.

## 5) Troubleshoot site_mismatch and tab_url_not_ready

Goal:

- resolve tab-session race and host mismatch quickly

Checklist:

1. Re-open tab session with primitive.tab.open.
2. Confirm committed URL host matches command site.
3. Retry once for transient URL commit delay.
4. Verify preload host behavior for command metadata.

## 6) Production Log Correlation by requestId

Goal:

- correlate controller, relay, and node logs for one failing action

Commands:

```bash
otto logs follow --source all
otto logs list --source node --latest 300
```

Checklist:

1. find request id from controller frame
2. trace same id in relay logs
3. isolate node runtime events for same id
4. map error code to remediation in error reference

## Related Docs

- guides/command-authoring
- guides/controller-implementation
- guides/listener-development
- guides/troubleshooting-advanced
- reference/error-codes
