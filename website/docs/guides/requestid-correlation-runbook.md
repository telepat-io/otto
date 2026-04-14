---
title: requestId Correlation Runbook
sidebar_position: 10
---

# requestId Correlation Runbook

Last Updated: 2026-04-14  
Owner: Platform

This runbook shows how to trace one failing request across controller, relay, and node logs.

## Goal

Given a failing command, identify where the failure originates:

- controller client behavior
- relay routing/auth/queueing
- node runtime execution/listener logic

## Inputs You Need

1. failing command time window
2. at least one `requestId`
3. access to logs from all sources

## Step-by-step Procedure

### Step 1: Capture all-source stream

```bash
otto logs follow --source all
```

Reproduce once and record request ids shown by controller output.

### Step 2: Narrow by requestId

```bash
otto logs list --source all --latest 500 --json
```

Filter to the request id timeline:

1. controller send
2. relay route decision
3. node execution/listener events
4. terminal result or error

### Step 3: Determine failure layer

Controller-layer indicators:

- missing or malformed fields before relay acceptance
- repeated retry loop without token refresh

Relay-layer indicators:

- auth or ACL denial
- queue timeout or lock conflict
- node offline routing failure

Node-layer indicators:

- site mismatch or stale tab session
- command-specific execution errors
- stream adapter parse/fallback failures

### Step 4: Validate listener correlation (stream commands)

For `command.test` streaming:

1. capture subscribe request id(s)
2. confirm listener updates are emitted on subscribe request id
3. confirm unsubscribe or command_cancel emits terminal teardown outcome

### Step 5: Produce actionable incident note

Minimum incident summary fields:

- request id
- action and site command
- target node id and tab session id
- failing layer
- error code and retryability
- immediate fix and long-term prevention

## Expected Log Signatures

| Layer | Signature Example | Interpretation |
|---|---|---|
| controller | command emitted with `targetNodeId` and `replayNonce` | request construction is valid |
| relay | command routed or rejected with deterministic code | routing/auth/queue decision point |
| node | execution started and terminalized | command runtime outcome |
| stream | listener subscribe result then `listener_update` events | stream lifecycle healthy |

## Quick Commands

```bash
otto logs follow --source all
otto logs follow --source node
otto logs list --source node --latest 300
otto test reddit.com getChatMessages --stream-follow-ms 45000 --json
```

## Related Docs

- guides/troubleshooting-advanced
- guides/controller-troubleshooting-decision-tree
- reference/error-codes
- reference/snippets
