---
title: Tab Lock Model
sidebar_position: 9
---

# Tab Lock and Queue Model

Last Updated: 2026-04-14  
Owner: Platform

Otto guarantees serial execution per tab session and allows parallel execution across different tab sessions.

## Guarantees

- Same `targetNodeId:tabSessionId` key executes FIFO.
- Cross-tab execution can run in parallel.
- Terminal outcomes are preserved for all commands.

## Lock Lifecycle

1. Acquire lock for tab key.
2. Execute command while lease is active.
3. Renew lease as needed.
4. Release lock on terminal completion or cleanup.

On conflict:

- Deterministic conflict code is returned (`tab_busy` or `tab_locked`).
- Caller retries with backoff or chooses `wait_with_timeout`.

## Queue Semantics

When `waitPolicy=fail_fast`:

- conflict returns immediately.

When `waitPolicy=wait_with_timeout`:

- command enters tab queue.
- terminal error if wait budget expires (`queue_wait_timed_out`).

Queue limits are enforced:

- per-tab queue limit
- per-controller queue limit

## Practical Guidance

1. Use one long-lived tab session per task stream when order matters.
2. Use multiple tab sessions for parallel throughput.
3. Keep timeout budgets realistic for site workload.
4. Treat queue timeout as a signal to reduce contention.

## Related Docs

- `reference/protocol`
- `reference/tab-management`
- `guides/controller-implementation`
