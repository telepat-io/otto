# Error Codes

Last Updated: 2026-04-14
Owner: Platform

Centralized catalog of common Otto error codes and remediation.

## Auth

| Code | Retryable | Action |
|---|---|---|
| `missing_access_token` | No | Acquire/pair tokens |
| `invalid_access_token` | Yes | Refresh and reconnect |
| `role_mismatch` | No | Use correct role token |
| `unauthenticated` | No | Complete hello/auth first |
| `acl_missing_node_grant` | No | Grant node ACL access |

## Validation

| Code | Retryable | Action |
|---|---|---|
| `missing_target_node` | No | Provide target node |
| `missing_tab_session` | No | Provide tab session |
| `invalid_command_input_type` | No | Fix input types |
| `missing_command_input` | No | Provide required input |
| `missing_command_input_one_of` | No | Provide at least one conditional field |
| `unexpected_command_input` | No | Remove unknown fields |

## Routing and Execution

| Code | Retryable | Action |
|---|---|---|
| `node_offline` | Yes | Re-resolve node and retry |
| `site_mismatch` | No | Use site-matching tab |
| `tab_url_not_ready` | Yes | Retry shortly |
| `preload_host_mismatch` | No | Validate preload host |
| `manual_login_required` | No | Complete manual login |

## Lock and Timeout

| Code | Retryable | Action |
|---|---|---|
| `tab_busy` | Yes | Backoff or queue wait |
| `tab_locked` | Yes | Retry after lease |
| `queue_wait_timed_out` | Yes | Increase timeout or reduce contention |
| `command_timed_out` | Yes | Increase timeout or narrow operation |

## Site-specific (Reddit)

| Code | Retryable | Action |
|---|---|---|
| `reddit_user_not_found` | No | Validate target user |
| `reddit_user_unmessageable` | No | Choose alternate recipient |
| `reddit_rate_limited` | Yes | Backoff and retry |
| `reddit_matrix_token_missing` | No | Re-authenticate page session |
| `reddit_chat_send_unconfirmed` | No | Verify send state and rerun |

## Related Docs

- `docs/protocol.md`
- `docs/troubleshooting-advanced.md`
