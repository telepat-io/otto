# Security

Last Updated: 2026-04-05
Owner: Security

## Source-of-Truth Code Paths

- Relay authn/authz and rate limiting: `packages/relay/src/index.ts`
- Protocol-level auth/error schemas: `packages/shared-protocol/src/index.ts`
- Relay security integration tests: `packages/relay/test/integration.test.mjs`

Baseline controls:

- Token-first WebSocket authentication
- Role-based command authorization
- Action-scope authorization for controller commands
- Strict schema validation
- JWT issuer and audience validation
- Optional previous-signing-key verification window for secret rotation
- Refresh token revocation endpoint (`/api/auth/revoke`)
- Durable relay-side refresh session persistence with startup pruning of malformed/expired entries
- Controller client secret hashing at rest (relay stores salt+hash, never plaintext)
- Controller-side client secret storage prefers OS keychain; env var fallback supported (`OTTO_CONTROLLER_CLIENT_SECRET`)
- Node-owned ACL gating for controller-to-node command routing
- Refresh token rotation on successful HTTP refresh
- Per-session command rate limiting
- Replay protection via command `replayNonce` and timestamp acceptance window
- Origin allow-list checks for browser-originated node WebSocket upgrades
- Node WebSocket upgrade rejects disallowed Origin with HTTP 403 when allow-list is configured
- Redacted logs by default
- Auth-required command preflight that can redirect users to first-party login pages without credential capture
- Debugger-backed network interception is scoped to managed `tabSessionId` and validated against declared site
- Interception header emission redacts sensitive fields (`Authorization`, `Cookie`, `Set-Cookie`, `Proxy-Authorization`)
- Setup-time extension artifact checksum verification before extraction

## Command Security Model

Threat boundaries:

- Relay auth and scopes protect command ingress.
- Command auth preflight protects website-session prerequisites.
- Browser credentials remain user-managed and never transmitted through Otto command payloads by design.

Current controls:

- Site matching before command execution (`site_mismatch` on mismatch).
- Explicit manual handoff for website login (`manual_login_required`).
- No automatic credential entry or scraping of secret fields.

## Abuse and Failure Guardrails

- Pairing approval is first-wins; repeat approval attempts return deterministic `pairing_not_pending`.
- Controller clients registered via `/api/controller/token` are denied node command routing until node-owned ACL grants access (`acl_missing_node_grant`).
- Malformed or expired access tokens are rejected during WebSocket auth with `invalid_access_token`.
- Malformed command envelopes (for example missing `targetNodeId`) are rejected before routing.
- Queue depth and per-session rate limits are enforced to reduce starvation and abuse pressure.
- Command auth flow never automates end-user credential submission; failed login preflight returns `manual_login_required` after optional navigation to site login page.
- `chrome.debugger` interception remains explicit opt-in via listener subscribe actions and cannot suppress Chrome debugger infobar.
- Fetch-domain interception always continues paused requests to avoid traffic deadlock if body retrieval fails.

## Operational Security Checklist

1. Keep `OTTO_TOKEN_SECRET` out of source control and rotate regularly.
2. Set `OTTO_EXTENSION_ORIGIN` in production to restrict browser node upgrades.
3. Use least-privilege controller scopes for automation principals.
4. Audit logs for repeated `forbidden_action`, `replay_rejected`, and lock conflict patterns.
5. Treat command input payloads as untrusted and validate fields in command logic.
6. Keep controller and extension settings separated; do not copy controller tokens into extension storage.
7. Prefer a protected filesystem location for `OTTO_LOG_DIR`; it now contains durable refresh-session data (`refresh-sessions.jsonl`).
8. Keep refresh token lifetime bounded via `OTTO_REFRESH_TTL_DAYS` and avoid unnecessarily large values.
9. Keep `OTTO_ALLOW_REMOTE_CONTROLLER_REGISTRATION` disabled unless required; when enabling remote registration, set `OTTO_CONTROLLER_REGISTRATION_SECRET` and restrict network ingress.
10. Treat node ACL grant actions as end-user authority operations and audit `controller_acl_granted` / `controller_acl_revoked` events.
