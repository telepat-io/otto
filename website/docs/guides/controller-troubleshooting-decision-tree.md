---
title: Controller Troubleshooting Decision Tree
sidebar_position: 8
---

# Controller Troubleshooting Decision Tree

Last Updated: 2026-04-14  
Owner: Platform

Use this decision tree when a custom or CLI controller cannot complete a workflow.

## Step 1: Can You Authenticate the WebSocket Session?

Symptom:

- no `auth_ack`
- immediate auth errors

Checks:

1. Confirm `hello` then `auth` ordering.
2. Confirm token is controller role token.
3. If error is `invalid_access_token`, refresh token and reconnect.

Branch outcome:

- if auth succeeds, continue to Step 2
- if auth fails repeatedly, rotate credentials and verify relay URL/port

## Step 2: Can You Resolve a Target Node?

Symptom:

- routing errors
- no result after command send

Checks:

1. Query `/api/nodes/connected`.
2. Ensure command payload includes `targetNodeId`.
3. Ensure selected node is currently authenticated and connected.

Branch outcome:

- if node exists, continue to Step 3
- if node missing, re-pair or restart extension node runtime

## Step 3: Is ACL Grant Present?

Symptom:

- `acl_missing_node_grant`

Checks:

1. Validate node-side grant via `/api/controller/access`.
2. Grant controller client from node-owned API or extension UI.

Branch outcome:

- if granted, continue to Step 4
- if still denied, verify clientId and token role context

## Step 4: Is Command Contract Valid?

Symptom:

- validation failures (`missing_command_input`, `invalid_command_input_type`, `unexpected_command_input`)

Checks:

1. Retrieve descriptor via `command.list`.
2. Match input keys and types to metadata.
3. Include one-of requirements where declared.

Branch outcome:

- if valid, continue to Step 5
- if invalid, fix payload contract and retry

## Step 5: Is Tab Context Valid?

Symptom:

- `unknown_tab_session`
- `site_mismatch`
- `tab_url_not_ready`

Checks:

1. Re-open managed tab and use fresh `tabSessionId`.
2. Confirm committed URL host matches `site`.
3. Retry once for MV3 URL commit race.

Branch outcome:

- if tab context valid, continue to Step 6
- if stale repeatedly, inspect extension restart behavior

## Step 6: Is Stream Lifecycle Healthy? (for command.test)

Symptom:

- no stream updates
- updates never stop

Checks:

1. Confirm `command.test` returned `stream.listeners`.
2. Confirm subscribe terminal success.
3. Correlate `listener_update` by subscribe `requestId`.
4. Verify unsubscribe/cancel teardown is issued.

Branch outcome:

- if healthy, continue to Step 7 for performance issues
- if broken, inspect listener options and adapter behavior

## Step 7: Performance and Contention

Symptom:

- `tab_busy`, `tab_locked`, `queue_wait_timed_out`, `command_timed_out`

Checks:

1. Use per-tab serialization intentionally.
2. Split independent workloads across tabs.
3. Increase timeout only after reducing contention.
4. Use idempotency keys on retries.

## Quick Error-to-Action Shortlist

| Error | Immediate Action |
|---|---|
| `invalid_access_token` | refresh token and reconnect |
| `acl_missing_node_grant` | grant controller access from node |
| `missing_target_node` | resolve and set `targetNodeId` |
| `site_mismatch` | navigate or reopen tab on correct site |
| `tab_url_not_ready` | short retry on same command |
| `tab_busy` | retry with backoff or queue policy |

## Related Docs

- guides/controller-implementation
- guides/requestid-correlation-runbook
- reference/error-codes
- reference/snippets
