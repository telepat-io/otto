# Controller Implementation

Last Updated: 2026-04-14
Owner: Platform

This guide explains how to implement a custom controller client against Otto relay and protocol.

## Required Capabilities

1. Acquire and refresh controller tokens.
2. Execute hello/auth websocket lifecycle.
3. Send commands with `targetNodeId` and `replayNonce`.
4. Correlate responses/events by `requestId`.
5. Handle streams, listeners, and cancellation.

## Core Flow

1. Bootstrap credentials and token over relay HTTP API.
2. Open websocket and send `hello` then `auth`.
3. Wait for `auth_ack` before command frames.
4. Keep heartbeat (`ping`/`pong`) active.
5. Route commands to explicit `targetNodeId`.

## HTTP Transcript

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

1. Send `command.test`.
2. Read `stream.listeners` from result.
3. Send `listener.subscribe` per manifest.
4. Process async `listener_update` events.
5. Correlate updates to subscribe request id.
6. Teardown with unsubscribe or cancel.

## Retry Guidance

- Retry auth expiry after refresh.
- Retry lock/timeouts with bounded backoff.
- Do not retry validation errors.
- Prefer idempotency keys for safe retries.

## ACL and Node Targeting

- `targetNodeId` is always required.
- Node owner must grant ACL access for controller client.
- Missing grant yields deterministic auth error.

## Related Docs

- `docs/protocol.md`
- `docs/relay-api.md`
- `docs/snippets.md`
- `docs/use-cases.md`
- `docs/error-codes.md`
