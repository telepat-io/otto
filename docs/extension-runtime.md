# Extension Runtime

Last Updated: 2026-04-14  
Owner: Browser Runtime

This document explains how the extension keeps command execution deterministic under MV3 constraints. Read it when you need to reason about pairing state, transport behavior, listener routing, and command-runtime guarantees.

## Runtime Composition

Otto uses a split runtime to separate durable transport concerns from command execution concerns. Background owns orchestration and browser APIs, while offscreen owns websocket continuity and heartbeat behavior.

| Area | Main Files | Responsibility |
| --- | --- | --- |
| Background orchestration | `extension/entrypoints/background.ts`, `extension/src/runtime/background-bootstrap.ts` | Startup, maintenance, dispatch, replay safety |
| Transport | `extension/src/runtime/offscreen-client.ts` | Relay websocket auth, heartbeat, reconnect, outbound queueing |
| Command execution | `extension/src/runtime/command-executor.ts`, `extension/src/runtime/command-runtime.ts` | Primitive actions, site command resolution, auth preflight |
| Listener runtime | `extension/src/runtime/network-intercept-listener.ts`, `extension/src/runtime/listener-managers.ts` | Interception lifecycle and shared per-tab debugger state |
| Command script helpers | `extension/src/runtime/page-dom-query.ts` | Deep Shadow DOM query helper install |

## Pairing and Authentication Flow

Background ensures a persistent node identity in extension storage, acquires pairing challenges when node credentials are missing, and keeps onboarding status synchronized for popup/options surfaces. Once pairing is approved by a controller workflow, node tokens are stored and offscreen authenticates the websocket session to relay.

The onboarding status model is deterministic and intended for both UI and diagnostics.

| Status | Meaning |
| --- | --- |
| `needs_relay_url` | Relay URL is missing or invalid |
| `requesting_pairing_code` | Waiting to obtain challenge |
| `waiting_for_pair_approval` | Challenge exists, waiting for CLI approval |
| `authenticated_connecting` | Tokens exist, websocket not fully ready |
| `authenticated_connected` | Auth acknowledged, command transport active |
| `error` | Latest auth/socket failure surfaced for recovery |

Refresh actions in popup/options wait for keep-warm maintenance completion before reporting success. That maintenance includes pairing reconciliation, offscreen ensure, and badge sync. During this window, stored credentials are revalidated and stale tokens are automatically cleared when refresh is rejected.

## Command Execution Path

When relay sends a `command` frame, offscreen forwards it to background, background executes, and a terminal envelope returns through offscreen back to relay. If websocket connectivity drops mid-flight, offscreen buffers outbound terminal envelopes and flushes after reconnect authentication.

Replay safety is enforced by background-level dedupe keyed by `idempotencyKey` (or `requestId` fallback), so retried frames return cached terminal results instead of rerunning side effects.

### Site command orchestration

Site command execution follows one consistent order so failures remain deterministic:

1. Resolve site bundle and command metadata.
2. Wait briefly for committed tab URL when needed, then validate site match.
3. Validate and sanitize declared input metadata (`inputFields`, `inputAtLeastOneOf`) when present.
4. Run auth preflight when command requires auth and `authMode` allows checks.
5. If unauthenticated in auto mode, run login navigation handoff and return `manual_login_required`.
6. Enforce `preloadHost` before execute path when configured.
7. Wait for bounded page readiness (`document.readyState === complete`).
8. Execute `command.run` (`execute`) or `command.test` (`test`, with execute fallback).

`tab_url_not_ready`, `site_mismatch`, and `preload_host_mismatch` are deliberate early-failure signals that protect command handlers from running against invalid page context.

## Listener Infrastructure

Listener lifecycle is generic at runtime level: subscribe/unsubscribe behave like terminal commands, while asynchronous updates are emitted later and correlated by the original subscribe request id. Runtime currently ships `network.http_intercept` backed by `chrome.debugger` CDP domains.

Network interception supports `network`, `fetch`, and `hybrid` capture modes. Hybrid mode includes bounded cross-source duplicate suppression, sensitive headers are redacted before update emission, and paused Fetch requests are always continued by runtime to avoid deadlocking tab traffic.

Command modules own stream parsing policy. Runtime can route raw listener updates through command-owned adapters (for example `streamAdapter=reddit.chat.v1`) before forwarding updates to relay, which keeps site-specific logic out of transport infrastructure.

### Command-started interception

Command runtime also exposes `startNetworkInterception(options?)` for local command execution probes. These handles are command-scoped, not relay-streamed, and are always torn down in `finally` to keep lifecycle deterministic even when command execution throws.

## MV3 Resilience and Transport Behavior

MV3 service-worker lifetime is inherently intermittent, so Otto relies on offscreen websocket ownership plus keep-warm maintenance. Offscreen creation is single-flight guarded and tolerates benign duplicate-create races; reconnect uses bounded exponential backoff with jitter.

Background maintenance work is serialized to prevent overlapping startup and keep-warm jobs, and outbound queues are bounded so temporary relay outages do not cause unbounded memory growth.

## Local Development Log Streaming

Local dev log streaming is opt-in through extension settings. When enabled, extension events are queued as structured node logs, flushed after websocket auth, and then streamed live through relay log APIs as `source=node`. Sensitive values remain subject to ingress redaction and extension emitters must not include credentials.

Debug-log transport is intentionally separated from listener-update transport. Under backpressure, debug flushing can throttle or drop while listener updates continue on the data-plane path.

## Storage and Ownership Boundaries

Extension relay URL, pairing state, and node tokens live in `chrome.storage.*`. Controller setup state lives in `~/.otto/config.json`. These stores are intentionally independent and role-scoped, even when both point to the same relay host.

Managed tab mappings are persisted by `tabSessionId`, and controller ownership metadata for relay-created tabs is tracked in session storage for deterministic owner-scoped cleanup behavior.
- Tab group state is tracked with `automationGroupId`.
- Automation group initialization is single-flight guarded to avoid duplicate group creation under concurrent `primitive.tab.open` calls.

Compatibility behavior keeps older command payload shapes usable without weakening runtime safety. Runtime accepts `tabSessionId` from command top-level field or nested payload field, prunes stale mappings when tab lookup fails, and ensures `primitive.tab.close_owned` only closes sessions owned by the provided `controllerClientId` while cleaning stale ownership entries.

Debugger focus emulation behavior:

Commands opt in via `requiresDebuggerFocus=true`. Runtime enables focus emulation only after site validation succeeds, and activation failures stay deterministic and command-scoped (`debugger_focus_unavailable`, `debugger_focus_conflict`, `debugger_focus_permission_denied`, `debugger_focus_attach_failed`, `debugger_focus_command_failed`). When interception is active on the same tab, runtime reuses existing debugger attachment state rather than requiring a second attach.

Why this runtime path was added:

Certain command flows can stall in background tabs when callback cadence is throttled. Focus emulation is a targeted mitigation that improves progress reliability without forcing all commands into debugger mode, and metadata opt-in keeps that behavior explicit and reviewable.

Shared debugger-session ownership model:

Runtime tracks debugger-session ownership per feature path. If another Otto feature path already owns attachment, runtime attempts reuse; detach is owner-scoped so shared paths do not break sibling features. This is most important when focus emulation and interception run together on the same tab.

Operational notes:

If external DevTools owns attachment and runtime cannot issue required commands, activation fails with deterministic conflict-style errors. Reuse and ownership decisions are logged as structured node debug events to support live troubleshooting (`otto logs follow --source node`).

Persistence notes:

| Storage scope | Runtime data |
| --- | --- |
| `chrome.storage.local` | Durable node state across browser restarts (`nodeId`, relay URL, node tokens, pairing metadata) |
| `chrome.storage.session` | Reconstructable runtime state (`tabSessions`, `tabSessionOwners`, automation group id, replay ledger), reconciled during bootstrap |
