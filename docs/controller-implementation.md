# Controller Implementation

Last Updated: 2026-04-14
Owner: Platform

This guide explains how to implement a custom controller client against Otto relay and protocol.

## Required Capabilities

Your controller must handle token lifecycle, websocket auth sequencing, request correlation, and deterministic stream teardown. Missing any one of these typically causes flaky automation behavior under reconnects or long-running streams.

## Core Flow

1. Bootstrap credentials and access token over relay HTTP endpoints.
2. Open websocket and send `hello`, then `auth`.
3. Wait for `auth_ack` before sending command frames.
4. Keep heartbeat (`ping`/`pong`) active for long-lived sessions.
5. Route commands with explicit `targetNodeId` and replay-safe payload fields.

## HTTP Transcript

The HTTP layer establishes controller identity and token state before websocket traffic starts.

| Purpose | Endpoint |
| --- | --- |
| Register controller client | `POST /api/controller/register` |
| Exchange client credentials for token pair | `POST /api/controller/token` |
| Discover connected nodes | `GET /api/nodes/connected` |
| Refresh token pair | `POST /api/auth/refresh` |

Register client:

```http
POST /api/controller/register
Content-Type: application/json

{"name":"my-controller","description":"automation worker"}
```

```json
{
	"clientId": "clt_abc123",
	"clientSecret": "cs_xxx",
	"createdAt": 1776162000000
}
```

Issue token:

```http
POST /api/controller/token
Content-Type: application/json

{"clientId":"clt_abc123","clientSecret":"cs_xxx"}
```

```json
{
	"clientId": "clt_abc123",
	"controllerId": "ctl_123",
	"accessToken": "<jwt>",
	"refreshToken": "<refresh>"
}
```

Connected nodes:

```http
GET /api/nodes/connected
Authorization: Bearer <accessToken>
```

```json
{
	"nodes": [{"nodeId":"node_local_1"}]
}
```

Refresh token:

```http
POST /api/auth/refresh
Content-Type: application/json

{"refreshToken":"<refresh>"}
```

```json
{
	"accessToken": "<new-jwt>",
	"refreshToken": "<new-refresh>"
}
```

## WebSocket Transcript

After HTTP bootstrap, websocket handshake/auth must be ordered and strict.

Hello frame:

```json
{
	"protocolVersion": "1.0",
	"messageType": "hello",
	"requestId": "req_hello_1",
	"timestamp": "2026-04-14T13:10:00.000Z",
	"senderRole": "controller",
	"payload": {"role": "controller", "capabilities": ["commands", "logs"]}
}
```

Auth frame:

```json
{
	"protocolVersion": "1.0",
	"messageType": "auth",
	"requestId": "req_auth_1",
	"timestamp": "2026-04-14T13:10:00.020Z",
	"senderRole": "controller",
	"payload": {"accessToken": "<jwt>"}
}
```

Ping frame:

```json
{
	"protocolVersion": "1.0",
	"messageType": "ping",
	"requestId": "req_ping_1",
	"timestamp": "2026-04-14T13:10:08.000Z",
	"senderRole": "controller",
	"payload": {"ts": 1776162608000}
}
```

## Command Envelope Requirements

| Field | Required | Notes |
|---|---|---|
| `targetNodeId` | Yes | Relay routing key |
| `action` | Yes | Command action |
| `payload` | Yes | Action payload |
| `replayNonce` | Yes | Replay protection |
| `tabSessionId` | Optional | Required for tab-scoped actions |
| `waitPolicy` | Optional | `fail_fast` or `wait_with_timeout` |
| `timeoutMs` | Optional | Command timeout |

## Listener and Streaming

Streaming should be treated as a two-phase flow: command phase and listener phase. Send `command.test`, extract `stream.listeners`, subscribe per manifest, and process async `listener_update` events keyed to subscribe request ids. Teardown should be explicit through unsubscribe and/or `command_cancel` targeting the original stream command request.

## Retry Guidance

Retry auth-expiry failures after refresh, and retry lock/timeouts with bounded backoff. Do not retry validation errors. Use idempotency keys where applicable so safe retries return cached terminal outcomes instead of duplicating side effects.

## ACL and Node Targeting

`targetNodeId` is always required at command time. Node owners control ACL grants per controller client, and missing grants fail deterministically with `acl_missing_node_grant`.

## Related Docs

- `docs/protocol.md`
- `docs/relay-api.md`
- `docs/agent-automation.md`
- `docs/snippets.md`
- `docs/use-cases.md`
- `docs/error-codes.md`
