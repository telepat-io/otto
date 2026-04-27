---
title: requestId Correlation Runbook
sidebar_position: 10
description: Trace a failing Otto workflow across controller, relay, and extension node using requestId. Step-by-step procedure for log collection, stream path checks, and incident documentation.
keywords:
  - requestId
  - log correlation
  - debugging runbook
  - otto logs
  - incident response
---

# requestId Correlation Runbook

Use this runbook to trace a failing workflow across controller, relay, and extension node by correlating on `requestId`. A single request ID spans all three components and is the most reliable way to isolate failure layer.

## Before you start

- Otto relay running and accessible.
- Local dev log streaming enabled in extension options (for extension-originated events).

## Procedure

### Step 1: Start live log capture

```bash
otto logs follow --source all
```

Leave this running in a separate terminal before reproducing the failure.

### Step 2: Reproduce the failure

Run the failing command. Use `--json` for machine-readable output:

```bash
otto test reddit.com getChatMessages --json 2>&1 | tee /tmp/otto-test-output.txt
```

Capture the `requestId` from the output (look for `"requestId": "req_..."` in the result or error envelope).

### Step 3: Query scoped log timeline

```bash
# Full timeline for this request across all sources
otto logs list --request-id <requestId> --source all

# Extension-side events only
otto logs list --source node --latest 300
```

### Step 4: Classify the failure layer

| Layer | Signals to look for |
|---|---|
| **Controller** | Request never left controller; token error before WebSocket auth |
| **Relay** | `auth`, routing, ACL, or lock event in relay logs before node receives command |
| **Node** | Command received by node; execution, site mismatch, or auth preflight failure |
| **Stream** | Subscribe succeeded but no `listener_update` events; or teardown missing |

### Stream path checks

For stream failures specifically:

1. Capture the **subscribe** `requestId` (separate from the stream command `requestId`).
2. Verify `listener_update` events correlate to the subscribe `requestId`.
3. Verify teardown was explicit: `listener.unsubscribe` or `command_cancel`.

## Quick reference commands

```bash
# Live follow all sources
otto logs follow --source all

# Live follow extension-side only
otto logs follow --source node

# Bounded node evidence
otto logs list --source node --latest 300

# Stream test with follow window
otto test reddit.com getChatMessages --stream-follow-ms 45000 --json
```

## Incident summary template

Fill this in before escalating:

```
requestId:         req_...
action:            command.run / command.test
site + command:    reddit.com / getChatMessages
targetNodeId:      node_local_1
tabSessionId:      ts_...
failing layer:     relay / node / stream
error code:        tab_busy / acl_missing_node_grant / ...
retryable:         yes / no
immediate fix:     retry with backoff / re-pair / refresh tokens
prevention:        add bounded wait policy / fix token refresh lifecycle
```

## Next steps

- [Advanced Troubleshooting](./troubleshooting-advanced.md) — error-to-action table.
- [Controller Troubleshooting Decision Tree](./controller-troubleshooting-decision-tree.md) — layer-by-layer decision path.
- [Error Codes](./error-codes.md) — full error code reference.
