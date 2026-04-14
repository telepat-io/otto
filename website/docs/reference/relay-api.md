---
title: Relay API
sidebar_position: 4
---

# Relay API Reference

Last Updated: 2026-04-14  
Owner: Platform

This page documents relay HTTP endpoints implemented in `packages/relay/src/index.ts`.

## Common Conventions

Base URL:

- `http://<relay-host>:<OTTO_RELAY_PORT>`

Auth header for protected routes:

```http
Authorization: Bearer <accessToken>
```

Role requirements:

- controller token for controller-facing APIs
- node token for node-owned ACL APIs

Error body pattern:

```json
{ "error": "error_code" }
```

Some endpoints also include structured fields such as `code`, `message`, and route-specific metadata.

## Pairing

### POST /api/pairing/request

Starts or reuses a pending node pairing challenge.

Request:

```json
{ "nodeId": "node_local_1" }
```

Success `200` response:

```json
{
  "challengeId": "ch_abc123",
  "code": "ABCD-1234",
  "nodeId": "node_local_1",
  "status": "pending",
  "expiresAt": 1776162000000
}
```

Error statuses:

- `400` with `nodeId_required`
- `400` with `invalid_json`

### GET /api/pairing/pending

Lists pending pairing challenges.

Success `200` response:

```json
{ "pending": [{ "challengeId": "ch_abc123", "code": "ABCD-1234", "nodeId": "node_local_1", "status": "pending", "expiresAt": 1776162000000 }] }
```

### POST /api/pairing/approve

Approves a pending code and issues controller tokens.

Request:

```json
{ "code": "ABCD-1234" }
```

Success `200` response:

```json
{
  "challengeId": "ch_abc123",
  "nodeId": "node_local_1",
  "controllerId": "ctl_123",
  "scopes": ["command.list", "command.run", "command.test", "listener.subscribe", "listener.unsubscribe", "primitive.tab.open", "primitive.tab.close", "primitive.tab.navigate", "primitive.tab.query", "primitive.dom.extract_text"],
  "controllerAccessToken": "<jwt>",
  "controllerRefreshToken": "<refresh>"
}
```

Error statuses:

- `400` with `code_required`
- `404` with `pairing_not_found`
- `409` with `pairing_not_pending`
- `400` with `invalid_json`

### GET /api/pairing/status

Checks one challenge lifecycle.

Query params:

- `challengeId` required

Success `200` response:

```json
{
  "challengeId": "ch_abc123",
  "code": "ABCD-1234",
  "nodeId": "node_local_1",
  "status": "pending",
  "expiresAt": 1776162000000
}
```

Error statuses:

- `400` with `challengeId_required`
- `404` with `challenge_not_found`

## Auth

### POST /api/auth/refresh

Rotates refresh token and issues fresh access token.

Request:

```json
{ "refreshToken": "<refresh>" }
```

Success `200` response:

```json
{ "accessToken": "<jwt>", "refreshToken": "<new-refresh>" }
```

Error statuses:

- `400` with `refreshToken_required`
- `401` with `invalid_refresh_token`
- `400` with `invalid_json`

### POST /api/auth/revoke

Revokes one refresh token.

Request:

```json
{ "refreshToken": "<refresh>" }
```

Success `200` response:

```json
{ "revoked": true }
```

Error statuses:

- `400` with `refreshToken_required`
- `400` with `invalid_json`

## Controller Client Registration and Token Issuance

### POST /api/controller/register

Registers a new controller client identity.

Request:

```json
{
  "name": "my-controller",
  "description": "automation worker",
  "avatarSeed": "worker-a"
}
```

Success `200` response:

```json
{
  "clientId": "clt_abc123",
  "name": "my-controller",
  "description": "automation worker",
  "avatarSeed": "worker-a",
  "clientSecret": "cs_xxx",
  "createdAt": 1776162000000
}
```

Error statuses:

- `403` with `registration_forbidden`
- `400` with `controller_metadata_required`
- `409` with `controller_name_conflict` (includes message and clientId)
- `400` with `invalid_json`

### POST /api/controller/token

Exchanges controller client credentials for tokens.

Request:

```json
{ "clientId": "clt_abc123", "clientSecret": "cs_xxx" }
```

Success `200` response:

```json
{
  "clientId": "clt_abc123",
  "controllerId": "ctl_123",
  "scopes": ["command.list", "command.run", "command.test", "listener.subscribe", "listener.unsubscribe", "primitive.tab.open", "primitive.tab.close", "primitive.tab.navigate", "primitive.tab.query", "primitive.dom.extract_text"],
  "accessToken": "<jwt>",
  "refreshToken": "<refresh>"
}
```

Error statuses:

- `400` with `client_credentials_required`
- `401` with `invalid_client_credentials`
- `400` with `invalid_json`

### POST /api/controller/remove

Removes one registered controller client and revokes related auth state.

Request:

```json
{ "clientId": "clt_abc123" }
```

Success `200` response shape:

```json
{
  "ok": true,
  "clientId": "clt_abc123",
  "aclRevokedCount": 2,
  "refreshRevokedCount": 1,
  "disconnectedSessions": 1
}
```

Error statuses:

- `403` with `registration_forbidden`
- `400` with `clientId_required`
- `404` with `client_not_found`
- `400` with `invalid_json`

### POST /api/controller/remove-all

Bulk-removes all registered controller clients.

Success `200` response:

```json
{
  "ok": true,
  "removedClientIds": ["clt_a", "clt_b"],
  "removedCount": 2,
  "aclRevokedCount": 5,
  "refreshRevokedCount": 2,
  "disconnectedSessions": 2
}
```

Error statuses:

- `403` with `registration_forbidden`

## Controller Access Control (Node-owned)

### GET /api/controller/access

Returns ACL entries for authenticated node identity.

Auth:

- node access token required

Success `200` response:

```json
{
  "nodeId": "node_local_1",
  "clients": [
    {
      "clientId": "clt_abc123",
      "nodeId": "node_local_1",
      "grantedByNodeId": "node_local_1",
      "grantedAt": 1776162000000,
      "expiresAt": 1776165600000
    }
  ]
}
```

Error statuses:

- `401` with `missing_access_token`
- `403` with `forbidden_role`
- `401` with `invalid_access_token`

### POST /api/controller/access

Grants or revokes one controller client's access to the authenticated node.

Request:

```json
{ "clientId": "clt_abc123", "grant": true, "expiresAt": 1776165600000 }
```

Grant success `200` response:

```json
{ "ok": true, "clientId": "clt_abc123", "nodeId": "node_local_1", "granted": true }
```

Revoke success `200` response:

```json
{ "ok": true, "clientId": "clt_abc123", "nodeId": "node_local_1", "granted": false }
```

Error statuses:

- `401` with `missing_access_token`
- `403` with `forbidden_role`
- `400` with `clientId_and_grant_required`
- `404` with `client_not_found`
- `400` with `invalid_expiresAt`
- `400` with `invalid_json`

## Logs API

### GET /api/logs

Returns filtered logs as JSON array.

Query params:

- `since` optional (ISO date or epoch-compatible parse input)
- `level` optional (`debug|info|warn|error`)
- `nodeId` optional
- `requestId` optional
- `source` optional (`relay|controller|node|all`)
- `latest` optional positive integer

Success `200` response:

```json
{ "logs": [{ "timestamp": "2026-04-14T13:00:00.000Z", "level": "info", "source": "relay", "type": "command_routed" }] }
```

Error statuses:

- `400` with `invalid_since`
- `400` with `invalid_level`
- `400` with `invalid_source`
- `400` with `invalid_latest`

### GET /api/logs/status

Returns retention and storage metadata.

Success `200` response:

```json
{
  "retentionDays": 14,
  "totalEvents": 412,
  "sizeBytes": 224411,
  "windowing": { "mode": "daily", "maxFileBytes": 5000000 },
  "oldest": "2026-04-13T00:00:01.000Z",
  "newest": "2026-04-14T13:09:01.000Z"
}
```

### GET /api/logs/export

Exports filtered logs as NDJSON (`application/x-ndjson`).

Query params are the same as GET /api/logs.

Success `200` response body:

- newline-delimited JSON events

Error statuses:

- `400` with `invalid_since`
- `400` with `invalid_level`
- `400` with `invalid_source`
- `400` with `invalid_latest`

## Node Discovery

### GET /api/nodes/connected

Returns authenticated and connected nodes for controller clients.

Auth:

- controller access token required

Success `200` response:

```json
{ "nodes": [{ "nodeId": "node_local_1" }, { "nodeId": "node_ci_2" }] }
```

Error statuses:

- `401` with `missing_access_token`
- `403` with `forbidden_role`
- `401` with `invalid_access_token`

## cURL Examples

### Connected Nodes

```bash
curl -sS "$OTTO_RELAY_HTTP_URL/api/nodes/connected" \
  -H "Authorization: Bearer $OTTO_ACCESS_TOKEN"
```

### Token Refresh

```bash
curl -sS -X POST "$OTTO_RELAY_HTTP_URL/api/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"'$OTTO_REFRESH_TOKEN'"}'
```

### Grant Controller Access From Node

```bash
curl -sS -X POST "$OTTO_RELAY_HTTP_URL/api/controller/access" \
  -H "Authorization: Bearer $OTTO_NODE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"'$OTTO_CLIENT_ID'","grant":true}'
```

### Query Recent Node Logs

```bash
curl -sS "$OTTO_RELAY_HTTP_URL/api/logs?source=node&latest=100" \
  -H "Authorization: Bearer $OTTO_ACCESS_TOKEN"
```

## Related Docs

- `guides/controller-implementation`
- `reference/protocol`
- `reference/error-codes`
