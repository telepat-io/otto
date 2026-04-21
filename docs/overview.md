# Otto Overview

Last Updated: 2026-04-10
Owner: Platform

## Purpose

Otto is a remote browser automation platform for running CLI-driven automation against a browser on another machine.

Primary architecture:

- Controller: CLI clients that issue commands.
- Relay: central broker for pairing, auth, routing, locks, and logs.
- Node: extension runtime that executes browser operations.

## Current Capabilities

- Primitive browser actions (`primitive.tab.*`, `primitive.dom.extract_text`).
- Site-scoped command execution (`command.run`) with runtime discovery (`command.list`) and test-path execution (`command.test`).
- Legacy command alias support (`command.reddit_feed` -> `reddit.com/getFeed`).
- Deterministic terminal outcomes and replay-safe command handling.
- CLI onboarding setup flow (`otto setup`) for relay daemon readiness, extension artifact retrieval, and Chrome import handoff.
- Command-native stream outputs using shared domain objects from command-owned adapters.
- Hybrid interception duplicate suppression across `Network`/`Fetch` transport surfaces plus command-level semantic dedupe.

## Runtime Topology

1. Controller connects to relay over WebSocket as role `controller`.
2. Extension Node connects to relay over WebSocket as role `node`.
3. Relay enforces token auth and command routing by `targetNodeId`.
4. Node executes command and returns result/error.
5. Relay forwards terminal outcome back to original controller.

Command-specific path:

1. Controller invokes `command.run` or `command.test` with `site`, `command`, `input`, and optional `authMode`.
2. Extension command runtime resolves site bundle and command metadata.
3. Runtime validates active tab domain against target site.
4. Runtime validates command metadata input contracts (`inputFields`, optional `inputAtLeastOneOf`).
5. If command requires auth, runtime runs `checkLogin` and optional `gotoLogin`.
6. Runtime ensures `preloadHost` before `execute` (auto-navigation when needed).
7. Runtime executes command and returns structured data.

## Extension Runtime Model

Otto extension uses MV3 split runtime:

- `background.ts` handles command execution and browser APIs.
- `offscreen-client.ts` maintains persistent relay WebSocket and heartbeat.

Stream ownership model:

- Runtime transport listeners remain generic and site-agnostic.
- Site command modules parse raw listener payloads into shared domain objects.
- Background routes adapter-mapped stream objects to relay under the original subscribe `requestId`.
- Duplicate suppression is layered:
- listener transport layer suppresses equivalent hybrid cross-source response duplicates
- command adapter layer suppresses replayed semantic duplicates from site payloads

This split avoids relying on persistent Service Worker uptime while keeping connectivity stable.

Command implementation location:

- Site bundles: `extension/src/commands/<site>/`
- Registry: `extension/src/commands/index.ts`
- Runtime orchestration: `extension/src/runtime/command-runtime.ts`

## Key Invariants

- `targetNodeId` is required for command routing.
- Terminal command outcomes are guaranteed (`completed`, `failed`, `timed_out`, `cancelled`).
- Per-tab operations are serialized; cross-tab operations are parallelizable.
- Sensitive values are redacted before logs are persisted or streamed.

Command invariants:

- Command execution must run on a site-matching tab URL.
- Declared command metadata inputs are validated before execution and sanitized before handler invocation.
- Optional `inputAtLeastOneOf` constraints are enforced before execution.
- `requiresAuth` commands never automate credential submission.
- Manual authentication handoff is explicit via `manual_login_required`.

## Source-of-Truth Code Paths

- Protocol: `packages/shared-protocol/src/index.ts`
- Relay: `packages/relay/src/index.ts`
- CLI: `packages/cli/src/index.ts`
- Extension background: `extension/entrypoints/background.ts`
- Extension offscreen: `extension/src/runtime/offscreen-client.ts`

## Setup and Settings Ownership

- `otto setup` is controller-oriented onboarding.
- It stores controller preferences and tokens in `~/.otto/config.json`.
- It retrieves extension artifacts from release assets, validates checksum, and extracts to local cache.
- User-facing setup/update paths are release-driven (`otto setup`, `otto extension update`).
- It ensures relay daemon readiness for the selected setup relay URL port before completing setup.
- Interactive setup is quick-start oriented and confirms release-based extension acquisition.
- Interactive setup UI is rendered with Ink + `@inkjs/ui` primitives (selection, text input, confirmation), while non-interactive setup remains JSON-only.
- Setup output mode is deterministic by environment:
	- Interactive TTY mode prints human setup guidance and Chrome load-unpacked handoff steps.
	- Explicit `--non-interactive` or non-TTY mode emits JSON-only setup summary.
- If an existing relay daemon is running on a different port than setup relay URL, setup fails with explicit remediation instructions.

- Extension settings are extension-owned.
- Node relay URL, pairing challenge, and node tokens are persisted in extension storage (`chrome.storage.*`).
- Extension runtime does not depend on CLI config files.

- Runtime boundary is intentional.
- Controller settings and extension settings may point to the same relay host but are role-specific (`controller` vs `node`).
