# Advanced Troubleshooting

Last Updated: 2026-04-14
Owner: Platform

Use this guide for deep debugging across controller, relay, and extension node workflows.

## Core Workflow

Start by reproducing with a fresh request, then collect logs with broad source coverage. Use one `requestId` as the primary correlation key, and only then narrow diagnosis to auth, routing, execution, listener lifecycle, or cleanup behavior.

## Useful Commands

| Goal | Command |
| --- | --- |
| Follow all sources live | `otto logs follow --source all` |
| Focus extension-side runtime | `otto logs follow --source node` |
| Pull bounded node evidence | `otto logs list --source node --latest 300` |
| Verify command visibility | `otto commands list` |
| Reproduce with machine-readable output | `otto test <site> <command> --json` |

## Error-to-Action Table

| Error | Cause | Action |
|---|---|---|
| `manual_login_required` | Page session missing | Login manually and rerun |
| `site_mismatch` | Wrong host for site command | Navigate to valid host |
| `tab_url_not_ready` | URL not committed yet | Retry after short delay |
| `acl_missing_node_grant` | Node grant missing | Approve controller on node |
| `tab_busy` | Tab lock held | Retry with backoff or queue wait |

## Stream Diagnostics

For stream failures, first confirm `command.test` returned `stream.listeners`, then verify subscribe command terminal success before chasing async updates. Listener updates should correlate to the subscribe request id (not the original command request id), and teardown should be explicit through unsubscribe or command cancel.

## Related Docs

- `docs/error-codes.md`
- `docs/agent-automation.md`
- `docs/relay-api.md`
- `docs/tab-lock-model.md`
- `docs/tab-management.md`
