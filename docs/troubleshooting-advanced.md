# Advanced Troubleshooting

Last Updated: 2026-04-14
Owner: Platform

Use this guide for deep debugging across controller, relay, and extension node workflows.

## Core Workflow

1. Reproduce with a fresh request.
2. Follow logs with all sources.
3. Correlate by `requestId`.
4. Narrow to auth, routing, execution, listener, or cleanup layer.

## Useful Commands

- `otto logs follow --source all`
- `otto logs follow --source node`
- `otto logs list --source node --latest 300`
- `otto commands list`
- `otto test <site> <command> --json`

## Error-to-Action Table

| Error | Cause | Action |
|---|---|---|
| `manual_login_required` | Page session missing | Login manually and rerun |
| `site_mismatch` | Wrong host for site command | Navigate to valid host |
| `tab_url_not_ready` | URL not committed yet | Retry after short delay |
| `acl_missing_node_grant` | Node grant missing | Approve controller on node |
| `tab_busy` | Tab lock held | Retry with backoff or queue wait |

## Stream Diagnostics

- Verify `command.test` returned `stream.listeners`.
- Verify subscribe success and async updates.
- Verify listener_update events correlate to subscribe request id.
- Verify teardown by unsubscribe or command cancel.

## Related Docs

- `docs/error-codes.md`
- `docs/tab-lock-model.md`
- `docs/tab-management.md`
