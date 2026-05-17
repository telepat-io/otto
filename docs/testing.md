---
title: Testing
sidebar_position: 2
description: How Otto validates behavior across relay, extension, and CLI surfaces. Covers coverage matrix, acceptance gates, command developer runbook, and CI guidance.
keywords:
  - testing
  - coverage matrix
  - integration tests
  - otto test
  - e2e
---

# Testing

This page describes how Otto validates behavior across relay, extension, and CLI surfaces. It is organized by test intent rather than package internals, so you can quickly choose the right level of verification before or after a change.

## Source-of-truth code paths

| Area | Source |
|---|---|
| Relay integration suite | `packages/relay/test/integration.test.mjs` |
| Extension runtime tests | `extension/test/*.test.ts` |
| CLI setup/settings and command UX tests | `packages/cli/test/*.test.ts` |
| Manual E2E harness | `packages/relay/scripts/manual-e2e.mjs` |

## Required Validation Order

Run these commands in order after any code change:

1. `npm run check`
2. `npm run lint`
3. `npm run build`
4. `npm run -ws --if-present test`

This ordering keeps failures high-signal. Type and lint failures are usually cheaper to fix than downstream integration failures.

## Coverage matrix

| Layer | What must hold true |
|---|---|
| Protocol and contracts | Shared types compile and action payloads remain contract-compatible |
| Relay auth and routing | Pairing, token auth, scope enforcement, nonce replay defense, and deterministic command routing all pass |
| Relay execution semantics | Terminal outcomes, queueing (`FIFO` per tab), cross-tab parallelism, and lock lifecycle invariants remain deterministic |
| Relay observability | Log filtering/export/follow behavior, listener subscribe/unsubscribe lifecycle, and node listener update routing are preserved |
| Extension runtime resilience | Offscreen reconnect, keep-warm/bootstrap reconciliation, replay dedupe, and tab-session recovery remain stable |
| Extension command runtime | Site validation, auth preflight, metadata validation, preload host gating, execute/test fallback, and command error determinism are preserved |
| Listener/interception runtime | Option validation, body capture behavior, fetch/hybrid semantics, duplicate suppression, and detach safety remain correct |
| CLI UX and automation mode | `otto test`, setup/settings behavior, TTY/non-TTY output contracts, and transport interruption surfaces remain predictable |

## Acceptance gates

A change is not complete unless command outcomes still terminalize as `completed`, `failed`, `timed_out`, or `cancelled`; lock and queue behavior remain deterministic under contention; and runtime restart reconciliation still repairs stale tab/group state safely.

## Command developer runbook

Use this sequence when adding or modifying a site command:

1. Discover command metadata with `otto commands list [--site <site>]`.
2. Run `otto test <site> <command>` with the smallest meaningful payload.
3. If you get `manual_login_required`, authenticate in the opened tab and rerun.
4. If validation errors occur (`missing_command_input`, `missing_command_input_one_of`, `invalid_command_input_type`, `unexpected_command_input`), align payload with metadata and rerun.
5. For stream-capable commands, validate follow behavior and teardown (`Ctrl+C` -> deterministic cancel/cleanup).

### Execution behavior reminders

`otto test` sends `command.test` and falls back to `execute` if no command test hook exists. If `targetNodeId` is missing or stale and exactly one node is connected, CLI auto-selects that node; with multiple nodes, pass `--node-id`. If `--tab-session` is omitted, CLI auto-opens `preloadHost` when available, otherwise `https://<site>`, and auto-closes that tab after completion unless `--wait-for-interrupt` is used.

For timeout handling, `otto test` and `otto cmd --action command.run` may resolve timeout from command descriptor metadata when using the default CLI timeout. If a command descriptor includes `timeoutPolicy`, CLI can derive an input-scaled timeout (for example by `minReturnedPosts`) with min/max clamps. Explicit non-default `--timeout` values always override descriptor-derived timeout behavior.

## TTY vs non-TTY contracts

| Surface | TTY behavior | Non-TTY behavior |
|---|---|---|
| `otto test` success/failure | Human-readable status lines and footer alerts | JSON envelopes and non-zero exit on terminal failure |
| Streaming commands | Live follow until interrupt | Machine-readable stream frames until caller timeout/stop |
| Setup output | Human onboarding guidance and Chrome handoff text | Deterministic JSON only |

If the controller websocket closes before a command response arrives, CLI should emit transport interruption guidance and exit non-zero without raw stack-noise output.

## Manual E2E harness

Run `npm run e2e:manual` after relay and extension node are connected.

| Environment variable | Default | Purpose |
|---|---|---|
| `OTTO_RELAY_HTTP_URL` | `http://127.0.0.1:8787` | Relay HTTP endpoint |
| `OTTO_RELAY_WS_URL` | `ws://127.0.0.1:8787/?role=controller` | Relay controller websocket endpoint |
| `OTTO_NODE_ID` | `node_manual_e2e` | Target node identity |
| `OTTO_E2E_OPEN_URL` | `https://www.reddit.com/` | Initial open URL |
| `OTTO_E2E_EXTRACT_SELECTOR` | `title` | DOM extract selector |
| `OTTO_E2E_COMMAND_TIMEOUT_MS` | `10000` | Command timeout budget |
| `OTTO_E2E_RUN_COMMAND` | unset (`0`) | Set to `1` to include `command.run` |
| `OTTO_E2E_COMMAND_SITE` | `reddit.com` | Site for manual command run |
| `OTTO_E2E_COMMAND_ID` | `getFeed` | Command id for manual command run |
| `OTTO_CONTROLLER_ACCESS_TOKEN` | unset | Skip automatic pairing approval when provided |

## Setup and settings validation focus

`otto setup` must stay deterministic in both interactive and non-interactive environments, including daemon readiness reporting and extension artifact checksum handling. Re-running setup on an already matching daemon should report reuse rather than spawning duplicates, and daemon port conflicts must fail with explicit remediation instructions.

`otto settings` must preserve keyboard consistency (`up/down`, `Enter`, `s`, `q`, `Esc`) and persist validated controller-global values to `~/.otto/config.json`.

## CI and agent automation notes

For autonomous workflows, prefer non-TTY JSON output, keep payloads bounded, and correlate failures by `requestId` before widening scope. When debugging requires logs, use bounded pulls first and switch to live follow only when you need temporal sequencing.
