# Pairing and Auth

Last Updated: 2026-04-14
Owner: Security

## Source-of-Truth Code Paths

| Concern | Source |
| --- | --- |
| Pairing, token, refresh, revoke endpoints | `packages/relay/src/index.ts` |
| CLI auth, pair, revoke, and controller client commands | `packages/cli/src/index.ts` |
| Extension pairing poll and token hydration | `extension/src/runtime/background-bootstrap.ts` |

## Pairing Flow

Pairing exists to establish a trusted node-controller relationship without sharing raw credentials between roles. The node requests a challenge, relay issues a short approval code, controller approves that code, and node polls challenge state until approved token material is available.

| Step | Endpoint | Notes |
| --- | --- | --- |
| Node requests challenge | `POST /api/pairing/request` | Payload: `{ nodeId }` |
| Controller inspects pending | `GET /api/pairing/pending` | Optional visibility step |
| Controller approves code | `POST /api/pairing/approve` | Payload: `{ code }` |
| Node checks status | `GET /api/pairing/status?challengeId=...` | On approval, node stores `nodeAccessToken` and `nodeRefreshToken` |

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

Controller clients can register independently of pairing, and this is the recommended model for long-lived controller identities.

| Phase | Endpoint | Notes |
| --- | --- | --- |
| Register controller client | `POST /api/controller/register` | Returns one-time `clientSecret` and stable `clientId`; rejects normalized name collisions with `controller_name_conflict` |
| Exchange credentials | `POST /api/controller/token` | Payload: `{ clientId, clientSecret }`; returns access/refresh tokens and scopes |
| Grant node access | `POST /api/controller/access` | Node bearer token required; grants are node-owned ACL decisions |

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

After `hello`, each client sends `auth` with `{ accessToken }`. Relay verifies signature and claims (`iss`, `aud`, role, and optional node binding), then responds with `auth_ack` containing effective role and scopes.

Unauthenticated clients cannot send command, lock, or subscription frames.

Command streaming note:

- `command.test` stream sessions remain listener-lifecycle terminal commands (`listener.subscribe`/`listener.unsubscribe`) plus async `listener_update` events.
- Stream payload shaping is command-owned through adapter hints (for example `streamAdapter`) and does not change relay auth/session ownership semantics.

Scope behavior:

Controller command authorization is action-based. Default scopes include primitive actions and command actions (`command.list`, `command.run`), while narrow-scope tokens are supported and enforced deterministically with `forbidden_action` on violations.

## Refresh Flow

Refresh can be performed over HTTP (`POST /api/auth/refresh` with `{ refreshToken }`) or websocket (`refresh` frame with the same token payload). Refresh returns a new access token, and HTTP refresh also rotates refresh tokens by invalidating the prior token. Relay persists refresh sessions in runtime storage so valid sessions survive relay restarts.

Default token lifetimes:

| Token | Default lifetime | Config |
| --- | --- | --- |
| Access token | `15m` | `OTTO_TOKEN_TTL_MINUTES` |
| Refresh token | `30d` | `OTTO_REFRESH_TTL_DAYS` |

Common usage:

- Long-running CLI sessions should prefer refresh over re-pairing.
- Node keep-warm flow refreshes access via stored refresh token lifecycle.

## Revoke Flow

Revoke uses `POST /api/auth/revoke` with `{ refreshToken }` and returns `{ revoked: boolean }`. After revocation, that refresh token can no longer mint access tokens. CLI wraps this behavior via `otto revoke`, which also clears local controller credentials.

## Claims and Rotation

Access tokens include issuer, audience, role, identity bindings, and action scopes. Relay validates issuer and audience on every access-token verification. Secret rotation supports dual-key verification using `OTTO_TOKEN_SECRET` and optional `OTTO_TOKEN_PREVIOUS_SECRET`, allowing controlled key rollover without immediate session invalidation.

## Security Notes

Access tokens are intentionally short-lived and refresh tokens are longer-lived. Claims enforce role and scope boundaries, and extension-origin checks apply to browser-originated node websocket upgrades.

Command auth note:

Command-level website login state is separate from relay token authentication: relay auth controls API access, while command `requiresAuth` controls website session prerequisites.

