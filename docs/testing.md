# Testing

Last Updated: 2026-04-07
Owner: Platform

## Source-of-Truth Code Paths

- Relay integration suite: `packages/relay/test/integration.test.mjs`
- Extension runtime tests: `extension/test/*.test.ts`
- CLI setup/settings unit suite: `packages/cli/test/setup-settings.test.ts`
- Manual E2E harness: `packages/relay/scripts/manual-e2e.mjs`

## Baseline Checks

- `npm run check` for workspace type checks
- Contract validation in shared protocol package
- Relay integration tests for pairing, logs endpoints, and WebSocket auth paths
- Relay logs filter tests for `source` and `latest` query handling, including invalid query rejection
- Relay log stream tests for source-filtered `logs_subscribe` behavior
- Relay listener lifecycle tests for subscribe activation, async `listener_update` routing, unsubscribe teardown, and post-unsubscribe rejection
- Relay extension-log ingestion tests for authenticated node `extension_log` event handling
- Relay security tests for scope enforcement, token revocation, JWT key-rotation fallback, and replay defense
- Relay auth edge tests for malformed/expired access token rejection and first-wins pairing approval conflict handling
- Relay abuse-path tests for malformed command rejection and per-session rate-limit enforcement
- Relay WebSocket upgrade tests for node-origin allow-list accept/reject behavior
- Relay lock lifecycle tests for acquire/conflict/renew/release events and lease-expiry observability
- Relay terminality tests for accepted command outcomes: completed, failed, timed_out, cancelled, and node_disconnected
- Relay queue contention tests for `wait_with_timeout` terminal queue timeout behavior
- Relay concurrency fairness tests for per-tab FIFO ordering with cross-tab parallel routing under multi-controller load
- Relay sustained mixed-load fairness tests for FIFO preservation across controllers targeting the same tab while other tabs continue routing
- Relay queue limit tests for per-tab queue depth rejection and per-controller queued-depth rejection across tabs
- Relay burst fairness tests to verify same-tab queued command drain order remains FIFO across controllers under sustained load
- Relay recipe-action scope tests (`recipe.run` allow and `recipe.list` deny under scoped tokens)
- Relay recipe-action scope tests (`recipe.run` allow and `recipe.test`/`recipe.list` deny under scoped tokens)
- Relay recipe queue invariants tests for same-tab FIFO under `recipe.run`
- Extension runtime tests for reconnect backoff, outbound replay queue bounds, and bootstrap keep-warm recovery flow
- Extension local-dev log queue tests for bounded pre-connect buffering and timestamp normalization
- Extension pairing-state tests for challenge issuance and approved-token hydration paths
- Extension command replay tests for idempotency-key dedupe and stale replay pruning
- Extension restart reconciliation tests for stale tab-session pruning and automation tab-group rebuild after worker restart
- Extension keep-warm pairing recovery tests for expired challenge cleanup and next-cycle challenge reissuance
- Extension primitive execution tests for deterministic unknown/closed tabSessionId error mapping and stale tabSessionId mapping cleanup
- Extension recipe tests for site mismatch, auth preflight redirect, authenticated execution, legacy alias routing, metadata input validation, preload-host checks, and `recipe.test` fallback/hook execution
- Extension listener validation tests for `network.http_intercept` option normalization and deterministic validation errors
- Extension network interception manager tests for `Network.loadingFinished` body capture and `Fetch.continueRequest` safety guarantees
- Extension network interception manager tests for recipe-local callback buffering without relay emission
- Extension Reddit recipe tests for `getUserInfo`, `sendChatMessage`, and `getChatMessages` payload normalization
- Extension Reddit auth regression tests for API-backed `checkLogin` behavior
- Extension Reddit chat listener tests for interception `data:` payload parsing, error-threshold fallback to polling, and interception-unavailable polling fallback
- CLI setup command checks for release download/extract/checksum verification path
- CLI settings TUI checks for validated config edits and save/exit controls
- CLI logs options tests for `--source`, `--latest`, and debug-level parsing/validation
- CLI listener command checks for network listener subscribe stream output and unsubscribe by `targetRequestId`
- CLI client secret store tests for relay-host account namespacing, env-var precedence, and keychain-unavailable fallback errors

## Required Validation Order

Run in this order after any code change:

1. `npm run lint`
2. `npm run build`
3. `npm run -ws --if-present test`

## Acceptance Gates

- Terminal command outcomes are always emitted
- Lock conflicts are deterministic
- Restart reconciliation for automation group and tabSessionId mappings works

## Manual E2E Harness

- Run `npm run e2e:manual` after Relay and Extension Node are connected.
- Optional env:
- `OTTO_RELAY_HTTP_URL` default `http://127.0.0.1:8787`
- `OTTO_RELAY_WS_URL` default `ws://127.0.0.1:8787/?role=controller`
- `OTTO_NODE_ID` default `node_manual_e2e`
- `OTTO_E2E_OPEN_URL` default `https://www.reddit.com/`
- `OTTO_E2E_EXTRACT_SELECTOR` default `title`
- `OTTO_E2E_COMMAND_TIMEOUT_MS` default `10000`
- `OTTO_E2E_RUN_RECIPE=1` includes `recipe.run`
- `OTTO_E2E_RECIPE_SITE` default `reddit.com`
- `OTTO_E2E_RECIPE_ID` default `getFeed`
- `OTTO_CONTROLLER_ACCESS_TOKEN` skips automatic pairing approval

## Recipe Developer Testing

- Local recipe execution command: `otto test <site> <recipe>`
- Example: `otto test reddit.com getFeed`
- Example: `otto test reddit.com getUserInfo --payload '{"username":"spez"}'`
- Example: `otto test reddit.com sendChatMessage --payload '{"username":"example_user","message":"hello"}'`
- Example: `otto test reddit.com getChatMessages --payload '{"roomId":"!abc123:reddit.com","limit":50}'`
- Example: `otto test reddit.com getChatMessages --payload '{"limit":50}'`
- Discovery command: `otto recipes list` (optionally `--site reddit.com`)
- Target node resolution defaults to the single connected node when `targetNodeId` is missing or stale.
- If multiple nodes are connected, pass `--node-id <id>` explicitly.
- Defaults:
- Auto-opens recipe `preloadHost` when available from `recipe.list` metadata, otherwise falls back to `https://<site>` if `--tab-session` is omitted
- Auto-opened tabs are closed automatically after command completion (pass `--keep-tab-open` to retain)
- Uses `recipe.test` action with `authMode=auto`
- Automatically falls back to recipe `execute` when a recipe does not define a `test` hook
- `otto test` keeps a single controller websocket open for the entire recipe-test lifecycle (open tab, `recipe.test`, listener subscribe, stream follow, cleanup close)
- Recipes returning `stream.listeners` from `recipe.test` keep `otto test` active and stream listener updates until `Ctrl+C` on that same controller connection
- Streaming test mode sends `command_cancel` targeting the original `recipe.test` request on `Ctrl+C`; relay owns stream teardown and terminal outcome emission
- Non-TTY output is JSON and exits non-zero on terminal command error
- In TTY mode, `otto test` terminal errors also print a final high-visibility alert footer after the JSON/error hints (including operation errors such as `primitive.tab.open`/`primitive.tab.close`).

`otto test` controller identity and cleanup behavior:

- If no local controller identity/token is available, `otto test` performs self-registration automatically.
- Default self-registration metadata is non-interactive: `name=otto-tester`, `description=Auto-registered controller for otto test flows.`
- Self-registered test controller is removed by default when test run exits; pass `--no-cleanup-test-controller` to retain it.
- When retained, node ACL grants still require explicit popup approval before node-targeted actions can route.

TTY failure-surface behavior:

- `otto test` emits consistent footer alerts for terminal failures across all major stages:
- auto-open stage (`primitive.tab.open`)
- recipe execution stage (`recipe.test`)
- auto-close cleanup stage (`primitive.tab.close`)
- ACL denials (`acl_missing_node_grant`) include both structured JSON payload data and a footer alert in TTY mode.

Recipe test hook guidance:

- For complex recipes, define optional `test(ctx, input, helpers)` to perform deterministic setup/assertion steps and then call `helpers.execute()`.
- For simple recipes, skip test hook and rely on automatic execute fallback.
- Keep setup bounded and deterministic; avoid unbounded polling loops.
- Prefer asserting preconditions in test hook and keep business extraction logic in execute.
- Prefer test hooks for side-effecting commands (for example chat send) so `otto test` can validate readiness without mutating user data.
- For streaming recipes, return `stream.listeners` from `test` with listener name and options.

Input metadata guidance:

- Use `inputFields` for per-field type/required contracts.
- Use `inputAtLeastOneOf` for conditional contracts like "username or roomId".

Suggested local sequence:

1. `otto recipes list`
2. `otto test <site> <recipe>`
3. If `manual_login_required`, authenticate in the opened browser tab.
4. If validation fails (`unexpected_recipe_input`, `missing_recipe_input`, `missing_recipe_input_one_of`, or `invalid_recipe_input_type`), correct payload using `recipe.list` metadata and rerun.
5. Rerun `otto test <site> <recipe>` and verify result payload.

## CI and Agent Automation Notes

- Prefer non-TTY mode for deterministic JSON output and exit codes.
- Parse command `requestId` and correlate with relay logs when diagnosing failures.
- Keep recipe test payloads small and stable to reduce flaky selector behavior.
- For logs automation patterns (bounded historical pulls, TTY-sensitive follow behavior, and JSON streaming guidance), use `docs/logging-debugging.md` -> Agent Automation Patterns.

## Setup Command Validation

- `otto setup --non-interactive` should emit deterministic JSON and exit non-zero on download/checksum failures.
- `otto setup --non-interactive` JSON output should include relay daemon readiness state (`started` or `already_running`).
- `otto setup --non-interactive` JSON output should include relay daemon state fields (`pid`, `port`, `logPath`, `startedAt`).
- `otto setup` (TTY) should print human guidance and Chrome handoff steps unless `--non-interactive` is explicitly set.
- `otto setup` (TTY) should print Chrome install handoff steps unless explicitly run with `--non-interactive`.
- `otto setup` (TTY) should still provide human guidance even if controller config defaults include `setupNonInteractiveDefault=true` or `outputFormat=json`.
- Successful setup must print a `chrome://extensions` load-unpacked handoff path containing `manifest.json`.
- Successful setup must ensure relay daemon readiness on the setup relay URL port.
- If a daemon is already running on a different port than setup relay URL, setup should fail with explicit remediation instructions.
- Re-running setup against the same relay URL should report `already_running` daemon readiness instead of starting a second daemon.
- Re-running setup should reuse cached extension artifact unless `--force` is set.
- `otto setup --strategy auto` should prefer local build in a full repo checkout and otherwise use release download.
- `otto config --relay-url` and `otto setup` should normalize relay role to `controller`.
- `otto extension get --strategy build` should fail clearly when `--repo-path` is missing or invalid.
- Checksum parser should accept both common `.sha256` formats used by release tooling.

## Settings Command Validation

- `otto settings` supports up/down navigation and exits with `q` or `Esc`.
- Enter edits/toggles selected value and validates before save.
- `s` writes updated controller-global settings to `~/.otto/config.json`.
- While editing, `Esc` cancels the active edit and returns to list navigation.
