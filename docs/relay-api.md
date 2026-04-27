---
title: Relay API Reference
sidebar_position: 3
description: Complete HTTP and WebSocket API reference for the Otto relay. Covers all endpoints for pairing, auth, controller clients, ACL, logs, nodes, and WebSocket connection.
keywords:
  - relay api
  - http endpoints
  - websocket
  - controller api
  - pairing api
---

# Relay API Reference

This page is the complete HTTP and WebSocket API reference for the Otto relay. Implementation source: `packages/relay/src/index.ts`.

## Authentication

Most endpoints require a bearer token in the `Authorization` header:

```
Authorization: Bearer <accessToken>
```

Role expectations:

- Controller access token — for controller-facing endpoints (commands, logs, node discovery).
- Node access token — for node ACL endpoints (`/api/controller/access`).

## Pairing endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/pairing/request` | Node requests a pairing challenge |
| `GET` | `/api/pairing/pending` | List pending pairing codes (node auth required) |
| `POST` | `/api/pairing/approve` | Controller approves a pairing code |
| `GET` | `/api/pairing/status` | Check pairing status for a challenge |

**Request: POST /api/pairing/request**

```json
{ "nodeId": "node_local_1" }
```

**Request: POST /api/pairing/approve**

```json
{ "code": "ABCD-1234" }
```

**Error codes:** `nodeId_required`, `code_required`, `pairing_not_found`, `pairing_not_pending`, `challengeId_required`, `challenge_not_found`

## Auth endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/refresh` | Refresh an access token using a refresh token |
| `POST` | `/api/auth/revoke` | Revoke a refresh token |

**Request: POST /api/auth/refresh**

```json
{ "refreshToken": "<refresh_token>" }
```

**Error codes:** `refreshToken_required`, `invalid_refresh_token`

## Controller client endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/controller/register` | None (or secret) | Register a new controller client |
| `POST` | `/api/controller/token` | None | Exchange client credentials for tokens |
| `POST` | `/api/controller/remove` | Controller bearer | Revoke a controller client by ID |
| `POST` | `/api/controller/remove-all` | Controller bearer | Revoke and purge all controller clients |

**Request: POST /api/controller/register**

```json
{ "name": "my-controller", "description": "automation worker", "avatarSeed": "optional-seed" }
```

**Request: POST /api/controller/token**

```json
{ "clientId": "clt_abc123", "clientSecret": "cs_xxx" }
```

**Request: POST /api/controller/remove**

```json
{ "clientId": "clt_abc123" }
```

Removal semantics:
- Single remove revokes client record and tears down ACL grants, refresh sessions, and active controller sockets.
- Bulk remove additionally purges records. Subsequent `remove-all` calls return `removedCount: 0` until new clients are registered.

**Error codes:** `registration_forbidden`, `controller_metadata_required`, `controller_name_conflict`, `client_credentials_required`, `invalid_client_credentials`, `client_not_found`

## Node ACL endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/controller/access` | Node bearer | List ACL grants for connected node |
| `POST` | `/api/controller/access` | Node bearer | Grant or revoke controller access to node |

**Request: POST /api/controller/access**

```json
{ "clientId": "clt_abc123", "grant": true, "expiresAt": 1776165600000 }
```

Without an active grant, node-targeted commands return `acl_missing_node_grant`. Client secret is only used for `/api/controller/token`; runtime command authorization uses access-token scopes and node ACL grants.

**Error codes:** `missing_access_token`, `forbidden_role`, `clientId_and_grant_required`, `invalid_expiresAt`

## Node discovery endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/nodes/connected` | Controller bearer | List connected node IDs |

**Response: GET /api/nodes/connected**

```json
{ "nodes": [{ "nodeId": "node_local_1" }] }
```

**Error codes:** `missing_access_token`, `forbidden_role`, `invalid_access_token`

## Log endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/logs` | Controller bearer | Query operation logs |
| `GET` | `/api/logs/status` | Controller bearer | Log storage status and aggregate byte size |
| `GET` | `/api/logs/export` | Controller bearer | Export logs as NDJSON |

**Query parameters (logs and export):**

| Parameter | Description |
|---|---|
| `since` | ISO-8601 timestamp lower bound |
| `level` | `debug` \| `info` \| `warn` \| `error` |
| `source` | `relay` \| `controller` \| `node` \| `all` |
| `latest` | Limit to newest N matching entries |
| `nodeId` | Filter by node identity |
| `requestId` | Filter by request correlation ID |

**Response: GET /api/logs**

```json
{
  "logs": [
    {
      "timestamp": "2026-04-14T13:00:00.000Z",
      "source": "relay",
      "type": "command_routed",
      "requestId": "req_cmd_1"
    }
  ]
}
```

**Error codes:** `invalid_since`, `invalid_level`, `invalid_source`, `invalid_latest`

## WebSocket connections

| Role | URL pattern |
|---|---|
| Controller | `ws://host:port?role=controller` |
| Node | `ws://host:port?role=node` |

After connecting, send `hello` then `auth` frames. Relay responds with `auth_ack` when authentication succeeds. See [Reusable Snippets](./snippets.md) for frame examples.

## CLI mapping

| CLI command | API operation |
|---|---|
| `otto authcode` | `GET /api/pairing/pending` |
| `otto pair <code>` | `POST /api/pairing/approve` |
| `otto revoke` | `POST /api/auth/revoke` |
| `otto client register` | `POST /api/controller/register` |
| `otto client login` | `POST /api/controller/token` + `POST /api/auth/refresh` |
| `otto client remove` | `POST /api/controller/remove` |
| `otto client status` | Validates stored tokens |
| `otto logs list` | `GET /api/logs` |
| `otto logs export` | `GET /api/logs/export` |
| `otto logs status` | `GET /api/logs/status` |
| `otto commands list` | WebSocket `command.list` |
| `otto cmd` | WebSocket `command.run` |

## Next steps

- [Reusable Snippets](./snippets.md) — curl and WebSocket frame examples.
- [Controller Implementation Guide](./controller-implementation.md) — full bootstrap sequence.
- [Protocol Reference](./protocol.md) — WebSocket envelope and message family contracts.
