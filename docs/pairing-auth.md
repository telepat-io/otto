# Pairing and Auth

Last Updated: 2026-04-10
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

## Independent Controller Client Flow

Controller clients can register independently of node pairing and this is the recommended path for persistent controller identities.

1. Register controller client identity:

- `POST /api/controller/register`
- Payload: `{ name: string, description: string, avatarSeed?: string }`
- Response includes one-time `clientSecret`, stable `clientId`, and normalized metadata fields.
- Registration rejects normalized name collisions with `controller_name_conflict`.

2. Exchange client credentials for controller token pair:

- `POST /api/controller/token`
- Payload: `{ clientId, clientSecret }`
- Response: `{ accessToken, refreshToken, scopes, controllerId, clientId }`
- Client secret is only used for this credential exchange and is not sent with runtime command frames.
- Runtime command authorization uses bearer access tokens, token scopes, and node-owned ACL grants.

CLI onboarding commands for this flow:

- `otto client register [--name <name>] [--description <description>] [--avatar-seed <seed>]`
- `otto client login [--client-id <id>] [--client-secret <secret>]`
- `otto client remove [--client-id <id> | --all]`
- `otto client status`
- `otto client forget`

Controller removal behavior:

- `POST /api/controller/remove` with `{ clientId }` revokes the controller record and immediately removes ACL grants, refresh sessions, and active controller sockets for that client.
- `POST /api/controller/remove-all` revokes and purges all controller records.
- Relay immediately removes all ACL grants for that client, revokes its refresh sessions, and disconnects active controller websocket sessions for that client.
- Bulk removal applies the same ACL/session revocation semantics to every registered controller client.
- Repeating bulk removal after a full purge is idempotent and reports `removedCount: 0`.

Secret handling behavior:

- CLI stores controller client secrets in OS keychain when available (via cross-platform keytar integration).
- Environment variable fallback: `OTTO_CONTROLLER_CLIENT_SECRET`.
- `OTTO_CONTROLLER_CLIENT_SECRET` takes precedence over keychain lookup.
- Relay stores only salted client-secret hashes at rest (never plaintext secrets).

3. Node-owned ACL grant controls target-node access:

- `GET /api/controller/access` (node bearer token required)
- `POST /api/controller/access` with `{ clientId, grant, expiresAt? }` (node bearer token required)

Default behavior is least privilege: newly registered controller clients start with no node grants.
Relay enforces ACL on every node-targeted command and returns `acl_missing_node_grant` when denied.

Pairing flow for extension onboarding remains supported and backward-compatible.

Test-flow cleanup behavior:

- `otto test` auto self-registers a controller only when no local controller identity/tokens are present.
- Auto-registration now defaults to `name=otto-tester` and description `Auto-registered controller for otto test flows.` and does not prompt interactively when defaults are used.
- That auto-registered controller is retained automatically at the end of the test run by default.
- Use `--cleanup-test-controller` to remove the auto-registered controller after the run.

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

Command streaming note:

- `command.test` stream sessions remain listener-lifecycle terminal commands (`listener.subscribe`/`listener.unsubscribe`) plus async `listener_update` events.
- Stream payload shaping is command-owned through adapter hints (for example `streamAdapter`) and does not change relay auth/session ownership semantics.

Scope behavior:

- Controller command authorization is action-based.
- Default scopes include primitive actions and command actions (`command.list`, `command.run`).
- Narrow scope tokens are supported and enforced deterministically (`forbidden_action`).

## Refresh Flow

- HTTP: `POST /api/auth/refresh` with `{ refreshToken }`
- WebSocket: `refresh` frame (same token payload)

Refresh returns new access token without changing current refresh token.
HTTP refresh now also rotates refresh token and invalidates the previous token.
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

Command auth note:

- Command-level website login state is separate from relay token authentication.
- Relay auth controls API access; command `requiresAuth` controls website session prerequisites.

