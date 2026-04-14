# requestId Correlation Runbook

Last Updated: 2026-04-14
Owner: Platform

Trace a failing workflow across controller, relay, and node by request id.

## Procedure

1. Start all-source log follow.

```bash
otto logs follow --source all
```

2. Reproduce once and capture request id.
3. Query recent logs and filter timeline for that id.
4. Classify failure layer:
- controller construction/retry behavior
- relay auth/routing/queue decisions
- node execution/listener behavior

## Stream path checks

1. capture subscribe request id
2. verify listener_update events correlate to subscribe id
3. verify unsubscribe or command_cancel teardown

## Incident summary template

- request id
- action + site command
- target node + tab session
- failing layer
- error code
- retryability
- immediate fix
- prevention follow-up

## Quick commands

```bash
otto logs follow --source all
otto logs follow --source node
otto logs list --source node --latest 300
otto test reddit.com getChatMessages --stream-follow-ms 45000 --json
```

## Related Docs

- docs/troubleshooting-advanced.md
- docs/controller-troubleshooting-decision-tree.md
- docs/error-codes.md
- docs/snippets.md
