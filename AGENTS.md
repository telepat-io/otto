# AGENTS

## Mission
Build Otto as a secure, debuggable remote browser automation platform (controller -> relay -> extension node).

## Invariants
- Always require `targetNodeId` on commands. If there's only one connected node, CLI can auto-select it.
- Preserve terminal command outcomes: `completed`, `failed`, `timed_out`, or `cancelled`.
- Keep per-tab session execution serial and cross-tab execution parallel.
- Apply pre-ingress redaction for logs.
- Keep `chrome.debugger` features behind explicit opt-in flags.
- Keep command execution site-scoped and validate tab URL before running command logic.
- Keep `command.test` streaming command-native via returned stream listener manifests; avoid site-specific runtime listener managers.
- Keep runtime listener infrastructure generic (for example `network.http_intercept`) and keep site-specific stream parsing/fallback policy in command modules.
- Validate declared command input metadata before command execution; command handlers should receive sanitized input.
- For `otto test`, support optional command-level test hooks with execute fallback for simple commands.
- Never automate user credential submission; use explicit manual login handoff (`manual_login_required`).
- Keep listener lifecycle deterministic: `listener.subscribe` and `listener.unsubscribe` are terminal commands, while async `listener_update` events are correlated by the original subscribe `requestId`.
- Keep controller-to-node authorization node-owned: registered controller clients require explicit per-node ACL grants from the authenticated node before command routing.
- Keep `otto test` teardown signal-safe: Ctrl+C/SIGTERM should trigger `command_cancel` for active stream tests and attempt auto-opened `primitive.tab.close` before exit.
- Keep orphan cleanup owner-scoped: when controller sessions disconnect/time out, close only tabs owned by that controller identity.

## Canonical Commands
- Install deps: `npm install`
- Build all: `npm run build`
- Check types: `npm run check`
- Lint all: `npm run lint`
- Test all (where present): `npm run -ws --if-present test`
- Start relay daemon: `otto start`
- Start relay attached with logs (dev): `otto start --attached`
- Stop relay daemon: `otto stop`
- Manual E2E harness: `npm run e2e:manual`
- Run relay dev: `npm run dev:relay`
- Run CLI dev: `npm run dev:cli`
- Run extension dev: `npm run dev:ext`

## Required Validation After Any Update
- Always run, in order, at the end of any code update:
- `npm run check`
- `npm run lint`
- `npm run build`
- `npm run -ws --if-present test`
- If a command fails, fix the issues and re-run until all pass.
- Write new tests for any new features or edge cases, and ensure they pass reliably.
- Update the documentation extensively to reflect any changes in behavior, architecture, or developer experience.
- For big changes, where it makes sense, also make concise updates to AGENTS.md.

## Where To Change Things
- Protocol contracts: `packages/shared-protocol/src/index.ts`
- Relay routing and locks: `packages/relay/src/index.ts`
- CLI UX and command entrypoint: `packages/cli/src/index.ts`
- Extension SW/offscreen runtime: `extension/entrypoints/background.ts`, `extension/src/runtime/offscreen-client.ts`
- Extension network interception listeners: `extension/src/runtime/network-intercept-listener.ts`, `extension/src/runtime/listener-managers.ts`
- Extension popup onboarding UI: `extension/entrypoints/popup.html`, `extension/src/runtime/popup-ui.ts`, `extension/src/runtime/onboarding-ui.ts`
- Extension command runtime orchestration: `extension/src/runtime/command-runtime.ts`
- Extension command bundles and registry: `extension/src/commands/**`
- Extension settings UI: `extension/entrypoints/options.html`, `extension/src/runtime/options-ui.ts`

## Safety
- Do not add remote code execution paths.
- Do not log tokens/cookies/raw sensitive payloads by default.
- Enforce auth and role checks before routing commands.
- Keep command input handling bounded and deterministic; avoid unbounded page scraping loops.
- Preserve legacy command compatibility aliases only when explicitly documented and tested.

## Local Dev Log Streaming (Extension -> Relay)
- In local development flows, extension runtime can stream structured extension logs to relay when `localDevLogStreamingEnabled` is set in extension storage.
- Start condition: after relay URL is saved in popup/options, extension starts queueing log objects immediately and flushes them after socket auth succeeds.
- Relay stores these as `source: node` events and concatenates them with relay-native logs for `otto logs` APIs and follow streams.
- CLI log source filters now support `relay|controller|node|all`; use `node` to inspect extension-originated runtime logs.
- Relay operation logs are persisted in day-windowed JSONL files with size-based spillover (`OTTO_LOG_MAX_FILE_BYTES`) and 14-day file retention.
- Keep this feature for local debugging only; do not enable broad sensitive payload logging.

## Agent Debugging Guidance
- When debugging extension-relay behavior locally, prefer `otto logs follow --source all` in one terminal while reproducing in extension UI.
- For extension-only traces, use `otto logs follow --source node` or `otto logs list --source node --latest 50`.
- Validate that early extension logs appear before `authenticated_connected` transitions during relay URL + pairing workflows.
- For autonomous/CI agents, prefer non-TTY invocation and `--json` output for machine parsing.
- Treat `otto logs follow` as unbounded: enforce a caller-side timeout window for live capture sessions.
- For long-running controller stream sessions (for example `otto test` streaming commands), keep websocket heartbeat `ping`/`pong` active; stale controllers should be treated as disconnected and cleaned up by relay.
- Correlate failures by `requestId` first, then narrow by source (`all` -> `node` or `relay`) to isolate root cause.

## Debugging Tools That Worked Best
- `otto listener subscribe-network`
	- Use case: prove raw network capture before debugging command stream plumbing.
	- Example: `otto listener subscribe-network --tab-session <id> --site reddit.com --request-host matrix.redditspace.com --pattern 'https://matrix.redditspace.com/_matrix/client/v3/*' --mode network --max-body-bytes 200000`
- `otto test <site> <command> --json`
	- Use case: validate command-level stream manifests and controller-visible frames.
	- Example: `otto test reddit.com getChatMessages --stream-follow-ms 45000 --json`
- `otto test ... --stream-probe`
	- Use case: force immediate traffic after subscribe to validate listener wiring.
	- Example: `otto test reddit.com getChatMessages --stream-probe --stream-follow-ms 45000 --json`
- `otto logs list --source node --latest <n>`
	- Use case: inspect extension-side runtime events during stream failures.
	- Example: `otto logs list --source node --latest 300`
- `otto logs follow --source all`
	- Use case: correlate relay/controller/node events live by `requestId`.
	- Example: `otto logs follow --source all`
- `otto cmd --action primitive.tab.open`
	- Use case: mint a fresh managed `tabSessionId` after reloads and avoid stale-session false negatives.
	- Example: `otto cmd --action primitive.tab.open --payload '{"url":"https://chat.reddit.com"}'`
- `otto commands list`
	- Use case: quick health check for auth, routing, and node reachability before deeper debugging.
	- Example: `otto commands list`

## CLI TUI Guidance
- For any CLI TUI updates, prefer `@inkjs/ui` components and patterns over bespoke terminal rendering.
- Keep non-interactive output deterministic and machine-readable; TUI polish must not change JSON contracts.
- Retain existing keyboard escape affordances (`q`, `Esc`, `Ctrl+C`) in interactive screens.
- Keep custom Ink rendering only where needed for streaming behavior (for example, `Static` log follow output).

## Reference Docs
- Architecture: `docs/overview.md`
- Protocol semantics: `docs/protocol.md`
- Pairing/auth lifecycle: `docs/pairing-auth.md`
- Extension runtime behavior: `docs/extension-runtime.md`
- Relay operations: `docs/relay-operations.md`
- Testing matrix: `docs/testing.md`
- Security controls: `docs/security.md`
