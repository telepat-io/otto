# Tab Management

Last Updated: 2026-04-14
Owner: Platform

This page documents managed tab session lifecycle and owner-scoped cleanup behavior.

## Lifecycle

1. Open tab with `primitive.tab.open`.
2. Receive `tabSessionId`.
3. Use session id for tab-scoped commands.
4. Close explicitly or allow cleanup when ownership lifecycle ends.

## Ownership Rules

- Relay injects internal owner metadata on open requests.
- Owner metadata is relay-owned, not controller-owned.
- Disconnect cleanup closes only tabs owned by that controller identity.

## Common Stale Session Causes

- manual tab close
- extension reload/restart
- reconnect with old tabSessionId cache

Recovery:

- open a new managed tab
- use new session id

## MV3 URL Commit Race

New tabs may not expose committed URL immediately. Runtime uses bounded polling before strict site matching to avoid false mismatch outcomes.

## Related Docs

- `docs/tab-lock-model.md`
- `docs/protocol.md`
- `docs/troubleshooting-advanced.md`
