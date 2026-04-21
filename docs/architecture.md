---
title: Architecture
sidebar_position: 1
---

# Otto Architecture

Last Updated: 2026-04-14  
Owner: Platform

Otto is a remote browser automation system with a clear role boundary: controllers issue commands, relay brokers trust and routing, and extension nodes execute browser work. This page is the conceptual entry point for how those pieces cooperate, what guarantees the platform gives, and where implementation authority lives.

## System Roles

The architecture is intentionally split so control-plane and execution-plane concerns stay separated. Controllers are user-facing CLI clients. Relay is the shared network boundary that owns authentication, authorization, queueing, and audit logging. Nodes are browser extension runtimes that execute commands against managed tabs.

| Component | Primary Responsibility | Why It Exists |
| --- | --- | --- |
| Controller | Command creation and user workflows | Keeps automation intent outside browser runtime |
| Relay | Auth, routing, locking, redaction, terminalization | Central policy enforcement point |
| Node (Extension) | Site-aware execution and listener capture | Executes browser actions close to the target tab |

## Command Lifecycle

At a high level, a controller opens a websocket session to relay, sends a command envelope with a target node, and waits for a terminal outcome. Relay validates envelope constraints, routes to exactly one node session, and preserves command completion semantics. Node executes the command in a site-scoped runtime and returns either a result envelope or a structured error envelope.

Command execution itself is deterministic and bounded. For site commands, node runtime resolves site bundle metadata, validates tab URL/site match, validates and sanitizes declared input metadata, performs optional auth preflight, applies optional preload host gating, and then invokes command logic. This sequence exists to fail early with explicit error codes and prevent command handlers from running in ambiguous page state.

## Runtime Model (MV3)

The extension uses an MV3 split runtime so websocket continuity does not depend on service worker uptime. The background runtime owns command orchestration and browser APIs, while the offscreen client owns persistent relay transport and heartbeat behavior.

Stream handling is also split by responsibility. Listener transport stays generic and site-agnostic, while site command adapters perform payload parsing and normalization into shared domain objects. Duplicate suppression is layered: transport-level suppression prevents equivalent hybrid capture duplicates, then adapter-level suppression prevents semantic replay duplicates from site payloads.

## Platform Guarantees

The platform is designed around a small set of non-negotiable guarantees that make automation predictable during both normal execution and failure handling.

| Guarantee | Effect |
| --- | --- |
| `targetNodeId` required | Commands route intentionally, never by implicit default at protocol layer |
| Terminal outcomes preserved | Every command ends as `completed`, `failed`, `timed_out`, or `cancelled` |
| Per-tab serial / cross-tab parallel | Prevents conflicting tab mutations without sacrificing throughput |
| Pre-ingress redaction | Sensitive values are masked before persistence and stream fan-out |
| Site-scoped command execution | Command logic cannot run against the wrong domain |

Auth-required commands also preserve manual login boundaries. Runtime may navigate to a login page when policy allows, but it never automates credential submission. The deterministic handoff signal is `manual_login_required`.

## Setup and Ownership Boundaries

`otto setup` configures controller-side experience, not node runtime persistence. Controller preferences and tokens are stored in `~/.otto/config.json`, while extension relay URL, pairing code state, and node credentials are stored in `chrome.storage.*`. These stores can point at the same relay host, but they intentionally remain role-scoped.

Setup is deterministic and release-driven for end users: extension artifacts come from release assets with checksum verification. Non-interactive mode emits machine-readable JSON summaries, while interactive TTY mode provides human-oriented onboarding output.

## Source of Truth

Use these files when behavior questions and doc text disagree.

| Concern | Source |
| --- | --- |
| Protocol contracts | `packages/shared-protocol/src/index.ts` |
| Relay routing and locks | `packages/relay/src/index.ts` |
| CLI UX and envelopes | `packages/cli/src/index.ts` |
| Extension background orchestration | `extension/entrypoints/background.ts` |
| Offscreen transport lifecycle | `extension/src/runtime/offscreen-client.ts` |
