# Tab Lock Model

Last Updated: 2026-04-14
Owner: Platform

Otto serializes command execution per tab session while allowing cross-tab parallelism.

## Core Guarantees

- FIFO per `targetNodeId:tabSessionId`.
- Parallel routing across distinct tab session keys.
- Deterministic terminal outcomes for all commands.

## Wait Policy

- `fail_fast`: immediate conflict response.
- `wait_with_timeout`: queue then execute or time out.

Queue limits are enforced per tab and per controller.

## Conflict and Timeout Codes

- `tab_busy`
- `tab_locked`
- `queue_wait_timed_out`
- `command_timed_out`

## Related Docs

- `docs/protocol.md`
- `docs/tab-management.md`
