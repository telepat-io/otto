# Controller Troubleshooting Decision Tree

Last Updated: 2026-04-14
Owner: Platform

Use this decision tree for controller execution failures.

## Decision Path

1. Auth handshake healthy?
- if no auth ack, verify hello->auth order and token validity
- refresh and reconnect on `invalid_access_token`

2. Target node resolved?
- query connected nodes
- ensure `targetNodeId` set on command

3. ACL granted?
- if `acl_missing_node_grant`, grant from node ACL API/UI

4. Payload valid?
- check `command.list` descriptor and input contract

5. Tab context valid?
- reopen managed tab if stale
- retry once for `tab_url_not_ready`

6. Stream lifecycle valid?
- verify subscribe success and listener_update correlation
- verify unsubscribe/cancel teardown

7. Contention issues?
- handle `tab_busy`/`tab_locked` with backoff and queue policy

## Related Docs

- docs/controller-implementation.md
- docs/requestid-correlation-runbook.md
- docs/error-codes.md
- docs/snippets.md
