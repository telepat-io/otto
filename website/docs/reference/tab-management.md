---
title: Tab Management
sidebar_position: 10
---

# Tab Lifecycle and Ownership

Last Updated: 2026-04-14  
Owner: Platform

This page documents tab session lifecycle, controller ownership, and cleanup behavior.

## Managed Tab Session Lifecycle

1. Controller opens tab via `primitive.tab.open`.
2. Node returns `tabSessionId` mapped to browser tab id.
3. Tab-scoped commands reference `tabSessionId`.
4. Session stays valid until explicit close, tab destruction, or cleanup.

## Ownership Model

Relay injects internal ownership metadata for controller-created tabs.

Rules:

- Ownership metadata is relay-owned and not trusted from controller payload.
- Cleanup actions are owner-scoped by controller client identity.
- One controller disconnect should not close another controller tabs.

## Orphan Cleanup

When controller disconnects or heartbeat times out:

1. Relay purges queued commands for that controller.
2. Relay requests close of tabs owned by that controller only.
3. Node closes those tab sessions and updates state.

## Stale Session Scenarios

Common stale session causes:

- Browser tab manually closed.
- Extension reload or restart.
- Command uses old `tabSessionId` after reconnect.

Recovery patterns:

1. Open a fresh managed tab session.
2. Retry command with new `tabSessionId`.
3. Avoid reusing cached sessions across extension reload boundaries.

## URL Commit Race Consideration

In MV3, newly opened tabs can briefly report no committed URL. Runtime includes a bounded poll before strict site match to avoid false mismatch errors.

## Tab Management Checklist

- [ ] Persist current `tabSessionId` per workflow scope.
- [ ] Treat session ids as ephemeral and revocable.
- [ ] Recreate sessions after extension reload.
- [ ] Handle `unknown_tab_session` and `tab_url_not_ready` explicitly.
- [ ] Use per-tab serialization model for order-sensitive flows.

## Related Docs

- `reference/tab-lock-model`
- `reference/protocol`
- `guides/troubleshooting-advanced`
