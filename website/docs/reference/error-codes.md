---
title: Error Codes
sidebar_position: 2
---

# Error Codes Reference

Last Updated: 2026-04-14  
Owner: Platform

This page consolidates common Otto error codes with category, retryability, and expected remediation.

## How to Use This Page

1. Identify error `code` and `category` from terminal envelope.
2. Check retryability guidance.
3. Apply remediation.
4. Correlate by `requestId` across logs when needed.

## Auth Errors

| Code | Retryable | Meaning | Action |
|---|---|---|---|
| `missing_access_token` | No | Controller auth token missing | Re-run pairing/token flow |
| `invalid_access_token` | Yes | Access token expired/invalid | Refresh token and reconnect |
| `role_mismatch` | No | Wrong token role for channel | Use correct role credentials |
| `unauthenticated` | No | Request sent before auth ack | Complete hello/auth lifecycle |
| `acl_missing_node_grant` | No | Node ACL does not allow controller | Approve controller in node access UI |

## Validation Errors

| Code | Retryable | Meaning | Action |
|---|---|---|---|
| `invalid_json` | No | Payload parse failed | Fix JSON format |
| `missing_target_node` | No | `targetNodeId` absent | Provide target node id |
| `missing_tab_session` | No | Tab-scoped command missing session id | Supply `tabSessionId` |
| `invalid_command_input_type` | No | Input field type mismatch | Send declared metadata type |
| `missing_command_input` | No | Required field absent | Add required key |
| `missing_command_input_one_of` | No | Conditional field group missing | Provide at least one listed field |
| `unexpected_command_input` | No | Unknown extra keys present | Remove undeclared fields |

## Routing and Availability Errors

| Code | Retryable | Meaning | Action |
|---|---|---|---|
| `node_offline` | Yes | Target node not connected | Re-resolve node and retry |
| `unknown_tab_session` | Sometimes | Session id stale or invalid | Re-open managed tab session |
| `command_not_found` | No | Command id not registered on node | Check site/command names |
| `listener_not_found` | No | Listener source unknown | Use supported listener id |
| `tab_queue_limit_exceeded` | Yes | Per-tab queue is full | Reduce concurrency, retry later |
| `controller_queue_limit_exceeded` | Yes | Controller queue is full | Drain backlog, retry |

## Execution and State Errors

| Code | Retryable | Meaning | Action |
|---|---|---|---|
| `site_mismatch` | No | Active tab URL does not match site | Navigate to correct host |
| `tab_url_not_ready` | Yes | URL not committed yet after tab open | Retry after short delay |
| `manual_login_required` | No | Website session auth required | Complete login manually and rerun |
| `preload_host_mismatch` | No | Preload navigation resolved to wrong host | Validate preload host and redirects |
| `debugger_focus_unavailable` | Yes | Debugger focus emulation not available | Retry or disable requirement |
| `debugger_focus_conflict` | Yes | Another debugger owner conflicts | Retry after other flow completes |
| `debugger_focus_permission_denied` | No | Permissions disallow debugger path | Fix extension/runtime permissions |

## Lock and Timeout Errors

| Code | Retryable | Meaning | Action |
|---|---|---|---|
| `tab_busy` | Yes | Per-tab execution lock held | Retry with backoff or queue wait policy |
| `tab_locked` | Yes | Lock holder is another controller | Retry after lease expiry |
| `queue_wait_timed_out` | Yes | Wait policy queue timed out | Increase timeout or reduce contention |
| `command_timed_out` | Yes | Command exceeded timeout window | Increase timeout or narrow operation |

## Site-specific Errors

| Code | Retryable | Meaning | Action |
|---|---|---|---|
| `reddit_user_not_found` | No | User lookup failed | Validate username/id |
| `reddit_user_unmessageable` | No | Target account cannot receive DMs | Choose another target |
| `reddit_rate_limited` | Yes | Platform rate limit enforced | Backoff and retry later |
| `reddit_matrix_token_missing` | No | Chat token not present in page runtime | Re-authenticate and retry |
| `reddit_chat_send_unconfirmed` | No | Send action did not confirm | Inspect DOM/send state and rerun |

## Notes

- Retry only when safe and bounded.
- Prefer idempotency keys for retries.
- Treat validation errors as non-retryable contract mismatches.

## Related Docs

- `reference/protocol`
- `reference/configuration`
- `guides/troubleshooting-advanced`
