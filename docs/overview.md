# Otto Overview

Last Updated: 2026-04-03
Owner: Platform

## Purpose

Otto is a remote browser automation platform for running CLI-driven automation against a browser on another machine.

Primary architecture:

- Controller: CLI clients that issue commands.
- Relay: central broker for pairing, auth, routing, locks, and logs.
- Node: extension runtime that executes browser operations.

## Current Capabilities

- Primitive browser actions (`primitive.tab.*`, `primitive.dom.extract_text`).
- Site-scoped recipe execution (`recipe.run`) with runtime discovery (`recipe.list`).
- Legacy recipe alias support (`recipe.reddit_feed` -> `reddit.com/getFeed`).
- Deterministic terminal outcomes and replay-safe command handling.
- CLI onboarding setup flow (`otto setup`) for relay daemon readiness, extension artifact retrieval, and Chrome import handoff.

## Runtime Topology

1. Controller connects to relay over WebSocket as role `controller`.
2. Extension Node connects to relay over WebSocket as role `node`.
3. Relay enforces token auth and command routing by `targetNodeId`.
4. Node executes command and returns result/error.
5. Relay forwards terminal outcome back to original controller.

Recipe-specific path:

1. Controller invokes `recipe.run` with `site`, `recipe`, `input`, and optional `authMode`.
2. Extension recipe runtime resolves site bundle and recipe metadata.
3. Runtime validates active tab domain against target site.
4. If recipe requires auth, runtime runs `checkLogin` and optional `gotoLogin`.
5. Runtime executes recipe and returns structured data.

## Extension Runtime Model

Otto extension uses MV3 split runtime:

- `background.ts` handles command execution and browser APIs.
- `offscreen-client.ts` maintains persistent relay WebSocket and heartbeat.

This split avoids relying on persistent Service Worker uptime while keeping connectivity stable.

Recipe implementation location:

- Site bundles: `extension/src/recipes/<site>/`
- Registry: `extension/src/recipes/index.ts`
- Runtime orchestration: `extension/src/runtime/recipe-runtime.ts`

## Key Invariants

- `targetNodeId` is required for command routing.
- Terminal command outcomes are guaranteed (`completed`, `failed`, `timed_out`, `cancelled`).
- Per-tab operations are serialized; cross-tab operations are parallelizable.
- Sensitive values are redacted before logs are persisted or streamed.

Recipe invariants:

- Recipe execution must run on a site-matching tab URL.
- `requiresAuth` recipes never automate credential submission.
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
- Local build strategy writes unpacked extension artifacts to `extension/output/chrome-mv3`.
- `auto` setup strategy prefers local build when running in a full repo checkout (or when `--repo-path` is provided); otherwise it downloads release artifacts.
- It ensures relay daemon readiness for the selected setup relay URL port before completing setup.
- Interactive setup is quick-start oriented: strategy defaults to `auto` (configurable via `otto settings`). Build mode asks for repo path only when needed.
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
