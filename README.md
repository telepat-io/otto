# Otto

Otto is a secure remote browser automation platform with three runtime components:

- `@telepat/otto` CLI controller
- `@telepat/otto-relay` relay daemon
- `@telepat/otto-extension` browser node (Chrome extension via WXT)

## Architecture

1. Controller sends command envelopes over WebSocket to relay.
2. Relay authenticates, authorizes by action scope, and routes by `targetNodeId`.
3. Node executes the action and returns terminal `result` or `error`.
4. Relay forwards terminal outcome back to the originating controller.

Execution guarantees:

- `targetNodeId` is required for all commands.
- Per-tab execution is serial; cross-tab execution is parallel.
- Replay protection is enforced (`replayNonce` plus timestamp window).
- Sensitive fields are redacted before log persistence and streaming.

## Quick Start

### Global Install Path (End Users)

1. Install Otto CLI globally:

```bash
npm install -g @telepat/otto
```

The CLI package includes relay runtime dependencies, so daemon commands (`otto start`, `otto stop`, `otto status`) do not require a separate relay install.

2. Run guided setup:

```bash
otto setup
```

Setup now focuses on quick-start essentials:

- Strategy selection (`auto`, `download`, `build`) is controlled by `otto settings` defaults or `otto setup --strategy ...`.
- Relay URL defaults are reused instead of prompting through full controller settings.
- `build` strategy asks for one additional value (`repo path`) when missing.
- Relay daemon readiness is now part of setup: setup starts the relay daemon when needed and reuses it when already running on the same port.
- Interactive setup prompt flow uses Ink with `@inkjs/ui` components for strategy selection, repo-path entry, and confirmation.

Setup downloads an extension zip from Otto releases (or builds locally), verifies checksum when downloading, extracts it locally, and prints the exact path for Chrome `Load unpacked`.

`auto` strategy behavior:

- If setup is run inside a full Otto repo checkout (or `--repo-path` points to one), it builds locally.
- Otherwise it downloads the release artifact.

When using local build strategy, the unpacked folder is `extension/output/chrome-mv3`.

If a relay daemon is already running on a different port than your selected setup relay URL, setup fails with explicit instructions to stop and restart on the intended port.

Setup behavior reference:

- Interactive TTY `otto setup`:
	- ensures relay daemon readiness;
	- prints setup summary plus Chrome load-unpacked instructions;
	- prints extension artifact source/path details.
- Explicit non-interactive `otto setup --non-interactive` (or non-TTY):
	- emits deterministic JSON-only output;
	- includes `relayDaemon` state (`status`, `pid`, `port`, `logPath`, `startedAt`);
	- omits human-readable Chrome handoff block.
- Daemon readiness policy:
	- starts daemon when not running;
	- reuses daemon when running on matching setup relay URL port;
	- fails setup on daemon port mismatch to avoid implicit port drift.

3. Load extension into Chrome:

```text
1) Open chrome://extensions
2) Enable Developer mode
3) Click Load unpacked
4) Select the folder printed by otto setup (contains manifest.json)
```

4. Open extension options and configure node relay URL if needed:

```text
Default extension relay URL is ws://127.0.0.1:8787?role=node
```

5. Preferred: register a persistent controller identity (client-secret auth):

```bash
otto client register --name "my-laptop" --description "Persistent controller for local testing"
otto client login
```

Notes:

- `otto client register` returns a one-time client secret and stores it in OS keychain when available.
- If keychain is unavailable, set `OTTO_CONTROLLER_CLIENT_SECRET` (or pass `--client-secret`) and rerun `otto client login`.
- Client secret is used for token exchange (`otto client login`); runtime commands use bearer token scopes plus node ACL grants.
- Newly registered controller clients must be granted node access in extension popup/options under Controller Access.

6. Pair controller and node (secondary onboarding path):

```bash
otto authcode
otto pair <code>
```

7. Smoke test:

```bash
otto commands list
```

### Monorepo Dev Path

1. Install dependencies:

```bash
npm install
```

2. Build all workspaces:

```bash
npm run build
```

3. Start relay:

```bash
otto start
```

For local development with foreground logs:

```bash
otto start --attached
```

Run the CLI from source in local dev context:

```bash
npm run dev -- setup
```

Argument pass-through supports any CLI command, for example:

```bash
npm run dev -- commands list
```

4. Configure CLI:

```bash
node packages/cli/dist/index.js config --relay-url 'ws://127.0.0.1:8787?role=controller'
```

5. Start extension dev runtime:

```bash
npm run dev:ext
```

6. Pair node and controller:

```bash
node packages/cli/dist/index.js authcode
node packages/cli/dist/index.js pair 123-456
```

7. Run a primitive command:

```bash
node packages/cli/dist/index.js cmd --action primitive.tab.query --node-id <nodeId>
```

8. Discover and run commands:

```bash
node packages/cli/dist/index.js commands list
node packages/cli/dist/index.js test reddit.com getFeed
```

9. Read relay logs:

```bash
node packages/cli/dist/index.js logs list --since 2026-04-03T00:00:00Z
node packages/cli/dist/index.js logs follow
```

## Setup and Settings Commands

- `otto start`
- Starts relay in daemon mode when not already running.
- If relay is already running, prints the existing pid and log path.

- `otto start --attached`
- Starts relay in attached foreground mode for development (logs in current terminal).

- `otto stop`
- Stops relay daemon if running.

- `otto status`
- Shows whether relay daemon is running.
- If daemon is not running, prints: `otto start` as the suggested next command.

- `otto setup`
- Interactive wizard by default on TTY.
- Add `--non-interactive` for deterministic JSON output.
- Add `--yes` to accept defaults without prompts.
- Add `--force` to reinstall extension artifact even when cached.
- Setup uses `auto` strategy by default for first-run onboarding.
- Default setup strategy can be changed in `otto settings`.
- Add `--strategy auto|download|build` to override strategy for one run.
- Normalizes relay URL to controller role (`?role=controller`).
- Reuses cached extension artifact for current CLI version unless `--force` is set.

- `otto extension get`
- Retrieves extension artifact directly (download or dev-only build strategy).
- Build strategy requires `--repo-path` and a full repo checkout.

- `otto extension info`
- Shows installed extension artifact metadata from `~/.otto/config.json`.

- `otto settings`
- Opens controller-global settings TUI.
- CLI interactive TUI surfaces are being standardized on Ink + `@inkjs/ui` for a more consistent operator experience.
- Navigation: up/down to select setting, Enter to open selector options, up/down to choose option, Enter to apply.
- Save with `s`; exit with `q` or `Esc`.
- Settings changes are selector-based (no free-text entry inside the TUI).

Settings ownership boundary:

- CLI controller settings live in `~/.otto/config.json`.
- Extension node settings live in `chrome.storage.*` and are configured via extension options.
- Extension runtime does not depend on CLI config files.

Release artifact contract used by setup:

- Release base URL default: `https://github.com/telepat/otto/releases/download`
- Expected tag segment: `v<cli-version>`
- Expected zip asset: `otto-extension-<version>-chrome-mv3.zip`
- Expected checksum asset: `otto-extension-<version>-chrome-mv3.zip.sha256`
- Checksum file can be `sha256sum` style (`<hash> <filename>`) or OpenSSL style (`SHA256(...) = <hash>`)

CI/CD and release channels:

- Pull requests and `main` commits run package-scoped quality gates in parallel for CLI, relay, shared protocol, and extension (`check`, `lint`, `build`, `test` where present).
- Release Please manages only the CLI package release stream from `packages/cli` and creates semver tags (`v<version>`).
- CLI npm publishing is automatic when Release Please creates a CLI release and can be run manually through workflow dispatch fallback.
- Extension artifacts are published in two channels:
	- every commit on `main` gets an immutable prerelease tag (`ext-main-<shortsha>`) with extension zip + checksum assets;
	- every semver CLI release (`v<version>`) also receives `otto-extension-<version>-chrome-mv3.zip` and checksum assets so `otto setup` download mode remains compatible.

Required repository secrets:

- `NPM_TOKEN` for npm publish workflows.

## Command Framework

Command model:

- Site-scoped bundles live in `extension/src/commands/<site>/`.
- Each site bundle provides built-ins `checkLogin` and `gotoLogin`.
- Main runtime actions are `command.list`, `command.run`, and `command.test`.
- Legacy alias `command.reddit_feed` is still supported for migration.

Command metadata and validation:

- Commands can declare `inputFields` for strict type/required validation.
- Commands can declare `inputAtLeastOneOf` for conditional contracts (for example `username` or `roomId`).
- Commands can declare `preloadHost`; runtime auto-navigates to that host before `execute` when needed.
- `otto test` auto-opens `preloadHost` when available from `command.list`, then runs `command.test` (with fallback to `execute` when no test hook exists).

Streaming architecture (current):

- Runtime listener transport remains generic (`network.http_intercept`).
- Site modules own stream parsing and fallback strategy (for example Reddit Matrix sync parsing in `extension/src/commands/reddit.com/chat-stream.ts`).
- Command test hooks can return `stream.listeners` with command-owned adapter hints (`options.streamAdapter`, optional `options.selfUserId`).
- Background runtime applies adapter mapping before relay emission, so controller/CLI receive shared domain objects (`chat.message`, `chat.typing`, `chat.participant`, `chat.message_deleted`) instead of raw site-specific payloads.

Duplicate suppression model:

- Transport-level suppression: hybrid interception now suppresses equivalent duplicate response updates observed across both CDP sources (`Network` plus `Fetch`) in a short bounded window.
- Domain-level suppression: command adapters dedupe repeated semantic events from replayed sync payloads before forwarding mapped objects.
- `otto test` prints human-readable stream output by default to make command events easier to follow; add `--json` to see full raw envelope objects.

Auth-aware behavior:

- Commands can declare `requiresAuth` in metadata.
- In `authMode=auto`, runtime checks login and navigates to login page if needed.
- Automation never submits credentials; users authenticate manually and rerun.

## Validation Commands

Run after any code update:

```bash
npm run check
npm run lint
npm run build
npm run -ws --if-present test
```

## Docs Site

Otto docs site uses Docusaurus in `website/` with sectioned content under `website/docs/`.

Run locally:

```bash
npm run docs:start
```

Build and serve production output:

```bash
npm run docs:build
npm run docs:serve
```

Deployment defaults:

- `DOCS_URL=https://docs.telepat.io`
- `DOCS_BASE_URL=/otto/`
- `GITHUB_OWNER=telepat-io`
- `GITHUB_REPO=otto`

## Reference Docs

- Architecture: `docs/overview.md`
- Protocol: `docs/protocol.md`
- Pairing and auth: `docs/pairing-auth.md`
- Extension runtime: `docs/extension-runtime.md`
- Commands: `docs/commands.md`
- Relay ops: `docs/relay-operations.md`
- Security: `docs/security.md`
- Testing: `docs/testing.md`
