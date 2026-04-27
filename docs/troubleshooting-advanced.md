---
title: Advanced Troubleshooting
sidebar_position: 8
description: Deep debugging guide for Otto controller, relay, and extension node workflows. Error-to-action table, stream diagnostics, and step-by-step isolation procedure.
keywords:
  - troubleshooting
  - debugging
  - error codes
  - stream diagnostics
  - otto logs
---

# Advanced Troubleshooting

This guide covers deep debugging across controller, relay, and extension node workflows. Start with the core workflow to isolate the failure layer, then use the error-to-action table to resolve it.

## Core debugging workflow

1. **Reproduce with a fresh request** — avoid debugging stale state.
2. **Collect broad logs** — use `--source all` first to see all components.
3. **Isolate by `requestId`** — use one request ID as the primary correlation key.
4. **Narrow the failure layer** — auth, routing, execution, listener lifecycle, or cleanup.

## Useful commands

| Goal | Command |
|---|---|
| Follow all sources live | `otto logs follow --source all` |
| Focus extension-side runtime | `otto logs follow --source node` |
| Pull bounded node evidence | `otto logs list --source node --latest 300` |
| Verify command visibility | `otto commands list` |
| Reproduce with machine-readable output | `otto test <site> <command> --json` |
| Open a fresh managed tab | `otto cmd --action primitive.tab.open --payload '{"url":"https://example.com"}'` |

## Error-to-action table

| Error | Symptom | Likely cause | Resolution |
|---|---|---|---|
| `manual_login_required` | Command pauses, tab stays open | Browser session missing for site | Log in manually in the browser tab, then rerun the command |
| `site_mismatch` | Command rejected before execution | Tab URL does not match command site | Navigate to the correct host or reopen tab via `primitive.tab.open` |
| `tab_url_not_ready` | Command rejected at startup | URL not committed to Chrome tab yet | Retry after a short delay; use `primitive.tab.open` to mint a fresh session |
| `acl_missing_node_grant` | Node-targeted command blocked | Controller client lacks node ACL grant | Grant access from the node ACL API or via `otto client` flow |
| `tab_busy` / `tab_locked` | Command times out waiting for lock | Another command holds the tab lock | Retry with bounded backoff, or configure `wait_with_timeout` wait policy |
| `invalid_access_token` | Auth fails on every command | Access token expired | Run `otto client login` to refresh tokens |
| `forbidden_action` | Command rejected at relay | Controller token lacks required scope | Re-register or refresh with wider-scope token |

:::tip
For any failure, capture the `requestId` from the error envelope first. Then use `otto logs list --request-id <id> --source all` to see the full timeline across components.
:::

## Stream diagnostics

For stream failures, follow this isolation sequence:

1. Confirm `command.test` returned `stream.listeners` in the result envelope.
2. Verify subscribe command returned a terminal result (not an error).
3. Confirm `listener_update` events correlate to the **subscribe** `requestId` (not the original command `requestId`).
4. Verify teardown was explicit: `listener.unsubscribe` or `command_cancel` on the stream command.

For raw network capture validation:

```bash
otto listener subscribe-network \
  --tab-session <tabSessionId> \
  --site example.com \
  --pattern 'https://api.example.com/*' \
  --mode network
```

Expected: streamed `listener_update` events. If nothing arrives, the pattern, host, or mode may be misconfigured.

## Prevention

- Keep `targetNodeId` explicit on every command.
- Use `otto commands list` before debugging execution failures — confirms auth and routing are healthy.
- Refresh tokens proactively for long-running controller sessions.
- Use `--stream-follow-ms` with a timeout for unattended stream tests instead of leaving sessions open indefinitely.

## Next steps

- [Controller Troubleshooting Decision Tree](./controller-troubleshooting-decision-tree.md) — step-by-step decision path.
- [requestId Correlation Runbook](./requestid-correlation-runbook.md) — trace one request across components.
- [Error Codes](./error-codes.md) — full error code reference with retryability.
