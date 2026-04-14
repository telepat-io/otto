# Practical Use Cases

Last Updated: 2026-04-14
Owner: Platform

End-to-end workflows and snippets for common Otto scenarios.

## 1) First Command on Fresh Setup

```bash
otto authcode
otto pair <PAIRING_CODE>
otto commands list
otto cmd --action primitive.tab.open --payload '{"url":"https://www.reddit.com"}'
otto cmd --action command.run --payload '{"site":"reddit.com","command":"getFeed"}' --tab-session <TAB_SESSION_ID>
```

## 2) Add and Validate New Command

1. Add module and metadata.
2. Register in site bundle.
3. Add tests for input/auth/stream fallback.
4. Run checks:

```bash
npm run check
npm run lint
npm run build
npm run -ws --if-present test
```

## 3) Stream Test and Teardown

```bash
otto test reddit.com getChatMessages --stream-follow-ms 45000 --json
```

Expected: listener updates correlate by subscribe request id; Ctrl+C triggers stream cancel and cleanup.

## 4) ACL Grant for Controller Client

HTTP order:

1. POST /api/controller/register
2. POST /api/controller/token
3. POST /api/controller/access

Without grant, command routing fails with `acl_missing_node_grant`.

## 5) requestId Log Correlation

```bash
otto logs follow --source all
otto logs list --source node --latest 300
```

Use one request id to trace controller, relay, and node behavior.

## Related Docs

- docs/command-authoring.md
- docs/controller-implementation.md
- docs/listener-development.md
- docs/troubleshooting-advanced.md
- docs/snippets.md
