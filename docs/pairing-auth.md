# Pairing and Auth

Last Updated: 2026-04-03
Owner: Security

## Source-of-Truth Code Paths

- Pairing and token endpoints: `packages/relay/src/index.ts`
- CLI auth and pair commands: `packages/cli/src/index.ts`
- Extension pairing polling and token hydration: `extension/src/runtime/background-bootstrap.ts`

## Pairing Flow

1. Node requests pairing challenge:

- `POST /api/pairing/request`
- Payload: `{ nodeId }`

2. Relay issues challenge:

- `challengeId`
- short `code` (for CLI approval)
- `expiresAt`

3. Controller inspects pending challenges:

- `GET /api/pairing/pending`

4. Controller approves challenge:

- `POST /api/pairing/approve`
- Payload: `{ code }`

5. Relay returns controller token pair immediately and stores node token pair inside challenge status.

6. Node polls challenge state:

- `GET /api/pairing/status?challengeId=...`

When approved, node stores `nodeAccessToken` and `nodeRefreshToken`.

CLI workflow:

- `otto authcode` lists pending challenges.
- `otto pair <code>` approves and stores controller access/refresh tokens locally.
- `otto revoke` revokes refresh token and clears local controller auth.
- CLI command paths auto-attempt access token refresh when relay returns `invalid_access_token`; manual re-pair is only required when refresh also fails.

Setup workflow integration:

- `otto setup` prepares controller config, ensures relay daemon readiness on the selected setup relay URL port, and provides extension artifact handoff.
- `otto setup` does not write extension runtime settings directly.
- Extension node relay URL and node tokens remain extension-owned in `chrome.storage.*`.

Extension onboarding UI (v1):

- Users open the Otto toolbar popup after loading the extension.
- Popup owns node relay URL entry and live pairing/connection status display.
- Pairing approval remains CLI-driven: use `otto authcode` and `otto pair <code>`.
- After approval, popup updates automatically to authenticated/connected state.

Challenge recovery semantics (restart-safe):

- If local pairing metadata is orphaned (for example, `pairingChallengeId` exists without `pairingCode`), extension bootstrap clears stale keys and requests a fresh challenge in the same maintenance pass.
- If local pairing metadata is expired by local clock (`pairingExpiresAt <= now`), extension clears stale keys and requests a fresh challenge immediately.
- If relay status check returns `404` for the stored challenge id, extension treats it as a stale challenge and reissues a new challenge.
- If relay status check returns transient non-OK responses (for example `5xx`), extension retries with bounded backoff before resetting challenge state and reissuing.
- `expired` status from relay now immediately triggers challenge reissue (no extra keep-warm cycle required).

This keeps onboarding from becoming stuck at "waiting for challenge" after browser or relay restarts.

## WebSocket Auth Flow

After `hello`, each client sends:

- `auth` with `{ accessToken }`

Relay verifies token signature and claims (`iss`, `aud`, role, and optional node binding), then replies with `auth_ack`.
`auth_ack` includes effective role and scopes for the authenticated session.

Unauthenticated clients cannot send command, lock, or subscription frames.

Scope behavior:

- Controller command authorization is action-based.
- Default scopes include primitive actions and recipe actions (`recipe.list`, `recipe.run`).
- Narrow scope tokens are supported and enforced deterministically (`forbidden_action`).

## Refresh Flow

- HTTP: `POST /api/auth/refresh` with `{ refreshToken }`
- WebSocket: `refresh` frame (same token payload)

Refresh returns new access token without changing current refresh token.
Refresh sessions are persisted by relay runtime storage so valid refresh tokens survive relay process restarts.

Default token lifetimes:

- Access token: `15m` (configurable via `OTTO_TOKEN_TTL_MINUTES`)
- Refresh token: `30d` (configurable via `OTTO_REFRESH_TTL_DAYS`)

Common usage:

- Long-running CLI sessions should prefer refresh over re-pairing.
- Node keep-warm flow refreshes access via stored refresh token lifecycle.

## Revoke Flow

- HTTP: `POST /api/auth/revoke` with `{ refreshToken }`
- Response: `{ revoked: boolean }`

When revoked, the refresh token cannot mint new access tokens.
CLI support: run `otto revoke` to revoke the stored refresh token and clear local controller credentials.

## Claims and Rotation

- Access tokens include `iss`, `aud`, role, identity bindings, and action scopes.
- Relay validates issuer and audience on every access-token verification.
- Secret rotation supports a dual-key verification window using `OTTO_TOKEN_SECRET` and optional `OTTO_TOKEN_PREVIOUS_SECRET`.
- Pairing approval returns controller scopes, and those scopes are enforced on command actions.

## Security Notes

- Access tokens are short-lived (15m).
- Refresh tokens are longer-lived (30d default).
- Token claims enforce role and node/controller scope.
- Extension-origin checks apply to browser-originated node WebSocket upgrades.

Recipe auth note:

- Recipe-level website login state is separate from relay token authentication.
- Relay auth controls API access; recipe `requiresAuth` controls website session prerequisites.

