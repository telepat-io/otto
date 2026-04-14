# Practical Use Cases

Last Updated: 2026-04-14
Owner: Platform

This page maps common Otto workflows to the fastest reliable command paths. Use the decision table first, then follow the scenario runbook section that matches your task.

## Scenario Matrix

| Scenario | Primary goal | First command |
| --- | --- | --- |
| First command on fresh setup | Confirm end-to-end connectivity | `otto commands list` |
| Add and validate a new command | Verify metadata, execution, and tests | `otto test <site> <command>` |
| Stream test and teardown | Confirm listener correlation and cancellation | `otto test <site> <streamCommand> --stream-follow-ms <ms> --json` |
| ACL grant for controller client | Authorize node-targeted routing | `otto client register` + node grant flow |
| requestId correlation | Trace one execution across all components | `otto logs list --request-id <id> --source all` |

## 1) First Command on Fresh Setup

Use this flow when extension and relay are paired but you have not run a command yet. The sequence below validates pairing, command discovery, tab open, and site command execution.

```bash
otto authcode
otto pair <PAIRING_CODE>
otto commands list
otto cmd --action primitive.tab.open --payload '{"url":"https://www.reddit.com"}'
otto cmd --action command.run --payload '{"site":"reddit.com","command":"getFeed"}' --tab-session <TAB_SESSION_ID>
```

## 2) Add and Validate New Command

Implement command module plus metadata, register it in the site bundle, then add tests for validation/auth/fallback behavior before running workspace checks.

```bash
npm run check
npm run lint
npm run build
npm run -ws --if-present test
```

## 3) Stream Test and Teardown

Use this when validating listener manifests, stream follow behavior, and cancellation teardown semantics.

```bash
otto test reddit.com getChatMessages --stream-follow-ms 45000 --json
```

Expected: listener updates correlate by subscribe request id; Ctrl+C triggers stream cancel and cleanup.

## 4) ACL Grant for Controller Client

Controller registration and token exchange can succeed without node routing access. Node-owned ACL grant is the final gate for node-targeted commands.

HTTP order is:

1. POST /api/controller/register
2. POST /api/controller/token
3. POST /api/controller/access

Without grant, command routing fails with `acl_missing_node_grant`.

## 5) requestId Log Correlation

For cross-component debugging, capture one request id and stay scoped to that id before widening to global logs.

```bash
otto logs follow --source all
otto logs list --source node --latest 300
```

Use one request id to trace controller, relay, and node behavior.

## Related Docs

- docs/command-authoring.md
- docs/controller-implementation.md
- docs/agent-automation.md
- docs/listener-development.md
- docs/troubleshooting-advanced.md
- docs/snippets.md
