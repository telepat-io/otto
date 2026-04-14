---
title: Relay API
sidebar_position: 4
---

# Relay API Reference

Last Updated: 2026-04-14  
Owner: Platform

This page documents primary relay HTTP endpoints used by controllers and nodes.

## Auth and Pairing Endpoints

### Pairing Request

`POST /api/pairing/request`

Purpose:

- Start node pairing workflow.

Typical response shape:

```json
{
  "code": "ABCD-1234",
  "expiresAt": "2026-04-14T13:00:00.000Z"
}
```

### Pending Pairing Codes

`GET /api/pairing/pending`

Purpose:

- List currently pending pairing approvals.

### Approve Pairing

`POST /api/pairing/approve`

Purpose:

- Approve code and issue controller tokens.

### Pairing Status

`GET /api/pairing/status`

Purpose:

- Poll pairing state for completion.

## Controller Registration and Tokens

### Register Controller Client

`POST /api/controller/register`

Purpose:

- Create controller client identity and secret.

### Issue Controller Tokens

`POST /api/controller/token`

Purpose:

- Exchange client credentials for access and refresh tokens.

### Refresh Access Token

`POST /api/auth/refresh`

Purpose:

- Rotate refresh token and issue new access token.

### Revoke Token

`POST /api/auth/revoke`

Purpose:

- Revoke refresh token and end refresh chain.

## Node Discovery and Access Control

### List Connected Nodes

`GET /api/nodes/connected`

Purpose:

- Discover currently available node ids for routing.

### Manage Controller Access Grants

`POST /api/controller/access`

Purpose:

- Grant or revoke controller access to node-owned ACL.

### Read Access Grants

`GET /api/controller/access`

Purpose:

- Retrieve ACL grant state for authenticated node.

## Logs API

### Query Logs

`GET /api/logs`

Purpose:

- Retrieve stored logs with source and time filters.

### Log Status

`GET /api/logs/status`

Purpose:

- Retrieve storage health and retention metadata.

### Export Logs

`GET /api/logs/export`

Purpose:

- Export structured logs for external analysis.

## Authentication and Headers

Use bearer access tokens for authenticated endpoints:

```http
Authorization: Bearer <accessToken>
```

Role requirements:

- Controller token for controller-facing APIs.
- Node token for node-owned ACL endpoints.

## Error Response Pattern

Typical error envelope:

```json
{
  "error": {
    "category": "auth",
    "code": "invalid_access_token",
    "message": "Access token is expired or invalid",
    "retryable": true
  }
}
```

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

## Related Docs

- `guides/controller-implementation`
- `reference/protocol`
- `reference/error-codes`
