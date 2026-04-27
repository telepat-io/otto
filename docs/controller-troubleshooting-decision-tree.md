---
title: Controller Troubleshooting Decision Tree
sidebar_position: 9
description: A step-by-step decision path for diagnosing controller execution failures in Otto. Covers auth, node resolution, ACL, payload, tab context, stream lifecycle, and contention.
keywords:
  - troubleshooting
  - controller debug
  - decision tree
  - auth failure
  - acl grant
---

# Controller Troubleshooting Decision Tree

Use this decision tree when a command sent by a controller fails or produces no response. Work through each gate in order — most failures resolve at the first gate where the condition is not met.

```mermaid
flowchart TD
    A[Command failed or no response] --> B{Auth handshake healthy?}
    B -- No --> B1[Verify hello->auth order\nRefresh token, reconnect]
    B -- Yes --> C{Target node resolved?}
    C -- No --> C1[Query connected nodes\nSet targetNodeId explicitly]
    C -- Yes --> D{ACL granted?}
    D -- No --> D1[Grant via POST /api/controller/access\nor otto client flow]
    D -- Yes --> E{Payload valid?}
    E -- No --> E1[Check otto commands list descriptor\nFix input contract]
    E -- Yes --> F{Tab context valid?}
    F -- No --> F1[Reopen tab via primitive.tab.open\nRetry once for tab_url_not_ready]
    F -- Yes --> G{Stream lifecycle valid?}
    G -- No --> G1[Verify subscribe success\nCheck listener_update correlation\nSend explicit unsubscribe/cancel]
    G -- Yes --> H{Contention issues?}
    H -- Yes --> H1[Handle tab_busy/tab_locked\nUse bounded backoff + wait_with_timeout]
    H -- No --> Z[Escalate to requestId correlation runbook]
```

## Decision gates

### 1. Auth handshake healthy?

- Expected: relay responds with `auth_ack` after `hello` and `auth` frames.
- If no `auth_ack`: verify `hello` → `auth` ordering; confirm `accessToken` is valid and not expired.
- On `invalid_access_token`: refresh tokens with `otto client login`, then reconnect.

### 2. Target node resolved?

- Expected: `targetNodeId` matches a connected node.
- Run `otto commands list` (or `GET /api/nodes/connected`) to see connected nodes.
- Ensure `targetNodeId` is set explicitly on every command envelope.

### 3. ACL granted?

- Expected: the controller client has an ACL grant for the target node.
- On `acl_missing_node_grant`: post to `POST /api/controller/access` with a node bearer token, or use the relay admin ACL flow.

### 4. Payload valid?

- Expected: action and payload match the command descriptor from `command.list`.
- Run `otto commands list --site <site>` to inspect the input contract.
- Fix unknown keys, missing required fields, or type mismatches.

### 5. Tab context valid?

- Expected: `tabSessionId` references a live managed tab with a committed URL matching the command site.
- If stale: run `otto cmd --action primitive.tab.open` to mint a fresh session.
- On `tab_url_not_ready`: retry once after a short delay.

### 6. Stream lifecycle valid?

- Expected: `command.test` returns `stream.listeners`; subscribe command returns terminal result; `listener_update` events correlate to subscribe `requestId`.
- Verify unsubscribe or `command_cancel` teardown is explicit.

### 7. Contention issues?

- Expected: tab lock acquired without conflict.
- On `tab_busy` or `tab_locked`: retry with bounded backoff, or set `waitPolicy: wait_with_timeout`.

## Next steps

- [requestId Correlation Runbook](./requestid-correlation-runbook.md) — trace across components when the tree doesn't resolve the failure.
- [Error Codes](./error-codes.md) — full error code reference.
- [Reusable Snippets](./snippets.md) — curl commands for each HTTP gate.
