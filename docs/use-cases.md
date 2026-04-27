---
title: Practical Use Cases
sidebar_position: 7
description: Common Otto automation workflows mapped to reliable command paths. Covers fresh setup, new command validation, stream testing, ACL grants, log correlation, and screenshots.
keywords:
  - use cases
  - automation workflows
  - command examples
  - otto test
  - stream testing
---

# Practical Use Cases

This page maps common Otto automation workflows to the fastest reliable command paths. Use the scenario matrix to pick your flow, then follow the matching runbook.

## Scenario matrix

| Scenario | Primary goal | Starting command |
|---|---|---|
| First command on fresh setup | Confirm end-to-end connectivity | `otto commands list` |
| Add and validate a new command | Verify metadata, execution, and tests | `otto test <site> <command>` |
| Stream test and teardown | Confirm listener correlation and cancellation | `otto test <site> <streamCommand> --stream-follow-ms <ms> --json` |
| ACL grant for controller client | Authorize node-targeted routing | `otto client register` + node grant flow |
| requestId correlation | Trace one execution across all components | `otto logs list --request-id <id> --source all` |
| Capture page screenshots | Get visual artifact from a managed tab | `otto cmd --action primitive.page.screenshot` |

## Use case 1: First command on fresh setup

**Goal:** Validate end-to-end connectivity after installing Otto for the first time.

```bash
# Confirm pending pairing codes from extension
otto authcode

# Approve pairing code
otto pair 123-456

# Confirm node is connected and commands are visible
otto commands list

# Open a managed tab
otto cmd --action primitive.tab.open --payload '{"url":"https://www.reddit.com"}'

# Run a site command (use tabSessionId from tab.open result)
otto cmd --action command.run \
  --payload '{"site":"reddit.com","command":"getFeed"}' \
  --tab-session <tabSessionId>
```

**Verify:** `commands list` returns a JSON array. `command.run` returns `messageType: result` and exits with code `0`.

## Use case 2: Add and validate a new command

**Goal:** Implement a new site command and confirm it passes all validation gates.

1. Create the command module (see [Command Authoring](./command-authoring.md)).
2. Register it in the site bundle index.
3. Run workspace validation:

```bash
npm run check
npm run lint
npm run build
npm run -ws --if-present test
```

4. Verify discovery and execution:

```bash
otto commands list --site example.com
otto test example.com getItems
otto test example.com getItems --payload '{"limit": 5}'
```

## Use case 3: Stream test and teardown

**Goal:** Validate listener manifests, stream follow behavior, and cancellation teardown semantics.

```bash
otto test reddit.com getChatMessages --stream-follow-ms 45000 --json
```

**Expected:** Listener updates correlate by subscribe `requestId`. Ctrl+C triggers `command_cancel` and closes the auto-opened tab.

For raw listener validation before debugging command plumbing:

```bash
otto listener subscribe-network \
  --tab-session <tabSessionId> \
  --site reddit.com \
  --pattern 'https://matrix.redditspace.com/_matrix/client/v3/*' \
  --mode network \
  --max-body-bytes 200000
```

## Use case 4: ACL grant for a controller client

**Goal:** Authorize a registered controller client to route commands to a node.

Controller registration and token exchange succeed before node routing access is granted. The node-owned ACL grant is the final gate for node-targeted commands.

```bash
# 1. Register client
otto client register --name "automation-worker"

# 2. Issue tokens
otto client login

# 3. Grant from node via relay ACL endpoint
# POST /api/controller/access  (node bearer token required)
```

Without the grant, command routing fails with `acl_missing_node_grant`.

## Use case 5: requestId log correlation

**Goal:** Trace a failing request across controller, relay, and extension node.

```bash
# Start live log follow for all sources
otto logs follow --source all

# In another terminal, reproduce the failure
otto test reddit.com getChatMessages --json 2>&1 | grep requestId

# Query bounded node evidence scoped to that requestId
otto logs list --source node --latest 300
```

See [requestId Correlation Runbook](./requestid-correlation-runbook.md) for a step-by-step procedure.

## Use case 6: Capture page screenshots

**Goal:** Get a visual artifact from a managed tab as part of an automation workflow.

```bash
# Screenshot of current viewport
otto cmd --action primitive.page.screenshot \
  --payload '{"tabSessionId":"<tabSessionId>","mode":"viewport","format":"png"}'

# Full-page screenshot from a URL (auto-opens and closes a background tab)
otto cmd --action primitive.page.screenshot \
  --payload '{"url":"https://example.com","mode":"full_page","format":"jpeg","quality":85,"maxBytes":1200000}'
```

## Next steps

- [Command Authoring](./command-authoring.md) — add a new site command.
- [Advanced Troubleshooting](./troubleshooting-advanced.md) — debug failures across components.
- [Reusable Snippets](./snippets.md) — copy-paste curl and WebSocket examples.
