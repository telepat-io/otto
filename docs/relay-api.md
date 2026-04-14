# Relay API

Last Updated: 2026-04-14
Owner: Platform

Reference for relay HTTP endpoints used by controllers and nodes.

## Pairing and Auth

- `POST /api/pairing/request`
- `GET /api/pairing/pending`
- `POST /api/pairing/approve`
- `GET /api/pairing/status`
- `POST /api/controller/register`
- `POST /api/controller/token`
- `POST /api/auth/refresh`
- `POST /api/auth/revoke`

## Node Discovery and ACL

- `GET /api/nodes/connected`
- `POST /api/controller/access`
- `GET /api/controller/access`

## Logs API

- `GET /api/logs`
- `GET /api/logs/status`
- `GET /api/logs/export`

## Auth Header

- `Authorization: Bearer <accessToken>`

Token role expectations:

- controller token for controller APIs
- node token for node ACL endpoints

## Error Envelope Example

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

## Related Docs

- `docs/controller-implementation.md`
- `docs/protocol.md`
- `docs/error-codes.md`
