# Relay API

Last Updated: 2026-04-14
Owner: Platform

Reference for relay HTTP endpoints in `packages/relay/src/index.ts`.

## Endpoint Index

Pairing:

- `POST /api/pairing/request`
- `GET /api/pairing/pending`
- `POST /api/pairing/approve`
- `GET /api/pairing/status`

Auth:

- `POST /api/auth/refresh`
- `POST /api/auth/revoke`

Controller client registration:

- `POST /api/controller/register`
- `POST /api/controller/token`
- `POST /api/controller/remove`
- `POST /api/controller/remove-all`

Node-owned ACL:

- `GET /api/controller/access`
- `POST /api/controller/access`

Logs:

- `GET /api/logs`
- `GET /api/logs/status`
- `GET /api/logs/export`

Node discovery:

- `GET /api/nodes/connected`

## Auth and Roles

Protected endpoints require:

- `Authorization: Bearer <accessToken>`

Role expectations:

- controller token for controller-facing endpoints
- node token for node ACL endpoints

## Request and Response Highlights

Pairing request body:

```json
{ "nodeId": "node_local_1" }
```

Pairing approve body:

```json
{ "code": "ABCD-1234" }
```

Controller token body:

```json
{ "clientId": "clt_abc123", "clientSecret": "cs_xxx" }
```

ACL grant body:

```json
{ "clientId": "clt_abc123", "grant": true, "expiresAt": 1776165600000 }
```

Nodes connected response:

```json
{ "nodes": [{ "nodeId": "node_local_1" }] }
```

Logs query response:

```json
{ "logs": [{ "timestamp": "2026-04-14T13:00:00.000Z", "source": "relay", "type": "command_routed" }] }
```

## Common Error Codes by Endpoint Family

- pairing: `nodeId_required`, `code_required`, `pairing_not_found`, `pairing_not_pending`, `challengeId_required`, `challenge_not_found`
- auth: `refreshToken_required`, `invalid_refresh_token`
- controller registration/token: `registration_forbidden`, `controller_metadata_required`, `controller_name_conflict`, `client_credentials_required`, `invalid_client_credentials`, `client_not_found`
- ACL: `missing_access_token`, `forbidden_role`, `clientId_and_grant_required`, `invalid_expiresAt`
- logs query: `invalid_since`, `invalid_level`, `invalid_source`, `invalid_latest`
- node discovery: `missing_access_token`, `forbidden_role`, `invalid_access_token`

## Related Docs

- `docs/controller-implementation.md`
- `docs/protocol.md`
- `docs/error-codes.md`
