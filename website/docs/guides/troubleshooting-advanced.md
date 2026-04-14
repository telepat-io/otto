---
title: Advanced Troubleshooting
sidebar_position: 7
---

# Advanced Troubleshooting

Last Updated: 2026-04-14  
Owner: Platform

Use this guide for deep debugging across controller, relay, and extension node components.

## Fast Triage Workflow

1. Reproduce once with a fresh `requestId`.
2. Capture live logs from all sources.
3. Correlate command path by `requestId` first.
4. Split diagnosis by layer: auth, routing, execution, listener, cleanup.

## Core Live Commands

```bash
otto logs follow --source all
otto logs follow --source node
otto logs list --source node --latest 300
otto commands list
otto test reddit.com getChatMessages --stream-follow-ms 45000 --json
```

## Correlation Playbook

### 1) Confirm Auth Session

Look for:

- hello/hello_ack and auth/auth_ack success
- no late unrelated auth error frames on active socket

If missing, investigate token refresh flow and auth expiry handling.

### 2) Confirm Node Routing

Look for:

- command frame includes `targetNodeId`
- relay forwards to expected connected node
- no `acl_missing_node_grant` or `node_offline`

### 3) Confirm Tab Session Health

Look for:

- valid `tabSessionId`
- committed URL before strict site validation
- no stale session after extension reload

### 4) Confirm Listener Stream Health

Look for:

- `command.test` result includes `stream.listeners`
- subscribe terminal success
- async `listener_update` events on subscribe request id
- deterministic stop on unsubscribe or cancel

## Error-to-Action Matrix

| Error Code | Likely Cause | Operator Action |
|---|---|---|
| `manual_login_required` | Website auth missing | Complete login in browser and retry |
| `site_mismatch` | Tab host not in site bundle | Open correct site tab or use preload host |
| `tab_url_not_ready` | MV3 URL commit race | Retry after short delay |
| `acl_missing_node_grant` | Node ACL not granted | Approve controller in node access UI |
| `tab_busy` | Per-tab lock held | Retry with backoff or queue policy |
| `queue_wait_timed_out` | Queue starvation | Reduce concurrency or increase timeout |

## Stream-specific Diagnostics

When stream frames are missing:

1. Confirm listener options target correct host/pattern.
2. Run stream probe with bounded follow window.
3. Verify listener mode (`fetch` often better for body capture).
4. Inspect node logs for interceptor attach/detach events.
5. Validate adapter parsing logic on captured raw payloads.

When duplicate stream lines appear:

1. Confirm hybrid mode cross-surface duplicate suppression.
2. Confirm command adapter semantic dedupe keys.
3. Verify event id stability from source payload.

## Shutdown and Cleanup Diagnostics

On interrupted tests:

- Ensure controller sends `command_cancel` for active streams.
- Ensure listener unsubscribe is attempted.
- Ensure auto-opened test tabs are closed where applicable.
- Verify owner-scoped orphan tab cleanup only affects that controller identity.

## Related Docs

- `reference/error-codes`
- `guides/agent-automation`
- `reference/tab-lock-model`
- `reference/tab-management`
- `reference/logging-debugging`
