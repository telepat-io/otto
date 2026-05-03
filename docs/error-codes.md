---
title: Error Codes
sidebar_position: 1
description: Canonical catalog of Otto error codes with retryability classification and remediation actions. Covers auth, validation, routing, lock/timeout, and site-specific errors.
keywords:
  - error codes
  - error reference
  - troubleshooting
  - retry policy
  - acl errors
---

# Error Codes

This page is the canonical error code reference for Otto. Each code is emitted in `error` envelope payloads. Use the **Retryable** column to determine if automated retry is safe; use the **Action** column for immediate remediation.

## Auth errors

| Code | Retryable | Action |
|---|---|---|
| `missing_access_token` | No | Acquire or pair tokens before sending commands |
| `invalid_access_token` | Yes | Refresh tokens with `otto client login`, then reconnect |
| `role_mismatch` | No | Use a token with the correct role for this endpoint |
| `unauthenticated` | No | Complete `hello` → `auth` handshake before sending commands |
| `acl_missing_node_grant` | No | Grant controller access to node in extension popup or via `POST /api/controller/access` |

## Validation errors

| Code | Retryable | Action |
|---|---|---|
| `missing_target_node` | No | Set `targetNodeId` on every command envelope |
| `missing_tab_session` | No | Provide `tabSessionId` for tab-scoped commands |
| `invalid_command_input_type` | No | Fix field types to match declared `inputFields` schema |
| `missing_command_input` | No | Provide all required fields declared in `inputFields` |
| `missing_command_input_one_of` | No | Provide at least one field from `inputAtLeastOneOf` list |
| `unexpected_command_input` | No | Remove keys not declared in `inputFields` |

## Routing and execution errors

| Code | Retryable | Action |
|---|---|---|
| `node_offline` | Yes | Re-resolve connected nodes and retry |
| `site_mismatch` | No | Navigate tab to the correct site, or reopen with `primitive.tab.open` |
| `tab_url_not_ready` | Yes | Retry after a short delay; URL not yet committed to Chrome tab |
| `preload_host_mismatch` | No | Validate `preloadHost` path; check for site redirects or interstitials |
| `manual_login_required` | No | Log in manually in the browser tab, then rerun the command |
| `unknown_site` | No | Check supported sites with `otto commands list` |
| `unknown_command` | No | Check available commands with `otto commands list --site <site>` |
| `unknown_tab_session` | No | Reopen a managed tab with `primitive.tab.open` |

## Lock and timeout errors

| Code | Retryable | Action |
|---|---|---|
| `tab_busy` | Yes | Retry with bounded backoff, or switch to `waitPolicy: wait_with_timeout` |
| `tab_locked` | Yes | Retry after lock lease expires |
| `queue_wait_timed_out` | Yes | Increase `timeoutMs`, or reduce concurrent command contention |
| `command_timed_out` | Yes | Increase `timeoutMs`, or narrow the command operation scope |
| `tab_queue_limit_exceeded` | Yes | Reduce concurrent commands on this tab session |
| `rate_limited` | Yes | Reduce command throughput; check relay `OTTO_RATE_LIMIT_PER_MIN` setting |
| `replay_rejected` | No | Generate a fresh `replayNonce` and updated `timestamp` |
| `timestamp_out_of_window` | No | Sync system clock; `timestamp` must be within `OTTO_REPLAY_WINDOW_MS` of relay time |
| `node_disconnected` | Yes | Relay emits this when node drops mid-flight; retry after reconnect |

## Site-specific errors (Reddit)

| Code | Retryable | Action |
|---|---|---|
| `reddit_user_not_found` | No | Validate target username or user ID |
| `reddit_user_unmessageable` | No | Choose an alternate recipient |
| `reddit_rate_limited` | Yes | Back off and retry |
| `reddit_matrix_token_missing` | No | Re-authenticate Reddit page session |
| `reddit_chat_send_unconfirmed` | No | Verify send state and rerun the command |

## Next steps

- [Advanced Troubleshooting](./guides/troubleshooting-advanced.md) — error-to-action workflows.
- [Controller Troubleshooting Decision Tree](./guides/controller-troubleshooting-decision-tree.md) — isolation path for controller failures.
- [Protocol Reference](./protocol.md) — error envelope shape.
