---
title: Controller Implementation
sidebar_position: 4
---

# Controller Implementation Guide

Last Updated: 2026-04-14  
Owner: Platform

This guide explains how to build a custom controller client against Otto relay and protocol, without reusing the CLI.

## What Your Controller Must Do

1. Acquire controller credentials and tokens over HTTP.
2. Open WebSocket and complete `hello` then `auth` lifecycle.
3. Send command envelopes with `targetNodeId` and `replayNonce`.
4. Correlate terminal frames by `requestId`.
5. Support long-running heartbeat, stream listeners, and cancellation.

## HTTP Auth Bootstrap

Typical flow:

1. Register client identity with relay.
2. Exchange client secret for access and refresh tokens.
3. Resolve connected nodes and choose `targetNodeId`.
4. Ensure target node granted ACL access for your client.

Reference implementation paths:

- `packages/cli/src/index.ts`
- `packages/cli/src/command-socket.ts`
- `packages/cli/src/node-resolution.ts`
- `packages/relay/src/index.ts`

### Endpoint-by-endpoint HTTP Transcript

Register client:

```http
POST /api/controller/register
Content-Type: application/json

{"name":"my-controller","description":"automation worker"}
```

```json
{
	"clientId": "clt_abc123",
	"name": "my-controller",
	"description": "automation worker",
	"avatarSeed": "my-controller",
	"clientSecret": "cs_xxx",
	"createdAt": 1776162000000
}
```

Issue tokens:

```http
POST /api/controller/token
Content-Type: application/json

{"clientId":"clt_abc123","clientSecret":"cs_xxx"}
```

```json
{
	"clientId": "clt_abc123",
	"controllerId": "ctl_123",
	"scopes": ["command.list", "command.run", "command.test", "listener.subscribe", "listener.unsubscribe", "primitive.tab.open", "primitive.tab.close", "primitive.tab.navigate", "primitive.tab.query", "primitive.dom.extract_text"],
	"accessToken": "<jwt>",
	"refreshToken": "<refresh>"
}
```

Resolve connected nodes:

```http
GET /api/nodes/connected
Authorization: Bearer <accessToken>
```

```json
{
	"nodes": [
		{"nodeId":"node_local_1"}
	]
}
```

Refresh access token:

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

## WebSocket Lifecycle

Required message order:

1. Send `hello` with role `controller`.
2. Wait for `hello_ack`.
3. Send `auth` with controller access token.
4. Wait for `auth_ack` before sending commands.
5. Start periodic `ping` and process `pong`.

Minimal pseudo-flow:

```ts
const ws = new WebSocket(relayUrl);

ws.send(envelope('hello', { role: 'controller', capabilities: ['commands', 'logs'] }));
await waitForMessage('hello_ack');

ws.send(envelope('auth', { accessToken }));
await waitForMessage('auth_ack');

startHeartbeat(ws);
```

### Frame-level WebSocket Transcript

Controller hello:

```json
{
	"protocolVersion": "1.0",
	"messageType": "hello",
	"requestId": "req_hello_1",
	"timestamp": "2026-04-14T13:10:00.000Z",
	"senderRole": "controller",
	"payload": {
		"role": "controller",
		"capabilities": ["commands", "logs"]
	}
}
```

Relay hello ack:

```json
{
	"protocolVersion": "1.0",
	"messageType": "hello_ack",
	"requestId": "req_hello_1",
	"timestamp": "2026-04-14T13:10:00.010Z",
	"senderRole": "relay",
	"payload": {
		"accepted": true,
		"heartbeatIntervalMs": 8000
	}
}
```

Controller auth:

```json
{
	"protocolVersion": "1.0",
	"messageType": "auth",
	"requestId": "req_auth_1",
	"timestamp": "2026-04-14T13:10:00.020Z",
	"senderRole": "controller",
	"payload": {
		"accessToken": "<jwt>"
	}
}
```

Relay auth ack:

```json
{
	"protocolVersion": "1.0",
	"messageType": "auth_ack",
	"requestId": "req_auth_1",
	"timestamp": "2026-04-14T13:10:00.030Z",
	"senderRole": "relay",
	"payload": {
		"accepted": true,
		"role": "controller"
	}
}
```

Heartbeat ping/pong:

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

```json
{
	"protocolVersion": "1.0",
	"messageType": "pong",
	"requestId": "req_ping_1",
	"timestamp": "2026-04-14T13:10:08.005Z",
	"senderRole": "relay",
	"payload": {"ok": true}
}
```

## Command Envelope Requirements

Every command should include:

| Field | Required | Notes |
|---|---|---|
| `targetNodeId` | Yes | Mandatory routing key |
| `action` | Yes | For example `command.run` |
| `payload` | Yes | Action-specific object |
| `replayNonce` | Yes | Unique nonce for replay protection |
| `tabSessionId` | Sometimes | Required for tab-scoped actions |
| `timeoutMs` | No | Defaults apply if omitted |
| `waitPolicy` | No | `fail_fast` or `wait_with_timeout` |
| `idempotencyKey` | Recommended | Improves safe retries |

### Common Action Patterns

- Discovery: `command.list`
- Execution: `command.run`
- Test and streams: `command.test`
- Listener lifecycle: `listener.subscribe`, `listener.unsubscribe`
- Cancellation: `command_cancel`

## Listener and Stream Model

For stream-capable tests:

1. Send `command.test`.
2. Inspect result for `stream.listeners`.
3. Subscribe each listener with `listener.subscribe`.
4. Process async `event` frames with `payload.type=listener_update`.
5. Correlate listener updates by the original subscribe `requestId`.
6. Stop with `listener.unsubscribe` or `command_cancel`.

## Retry and Error Handling

Classify errors before retrying:

| Category | Typical Retry Strategy |
|---|---|
| `auth` | Refresh token, reconnect socket |
| `routing` | Re-resolve node or ACL grant, short backoff |
| `lock_conflict` | Retry with delay or queue policy |
| `timeout` | Increase timeout or reduce command scope |
| `validation` | Do not retry; fix payload |

Use `retryable=true` as a signal, not a guarantee. Prefer bounded backoff and idempotency keys.

## Node Targeting and ACL

Important constraints:

- Relay requires `targetNodeId` on command routing.
- Node owner controls controller ACL grant.
- Missing grant yields deterministic auth error and actionable hint.

Practical flow:

1. Query connected nodes.
2. Select `targetNodeId`.
3. If denied, complete node-side ACL grant.
4. Retry command.

## Cancellation and Shutdown

For long-running sessions:

1. Track active command and listener request ids.
2. Send `command_cancel` for active stream command ids.
3. Send `listener.unsubscribe` for active subscriptions.
4. Close socket after terminal confirmations or bounded timeout.

## Controller Readiness Checklist

- [ ] Handles hello/auth handshake strictly in order.
- [ ] Maintains heartbeat for long sessions.
- [ ] Correlates all results/errors/events by `requestId`.
- [ ] Always sets `targetNodeId` and `replayNonce`.
- [ ] Implements token refresh on auth expiry.
- [ ] Supports listener subscribe/unsubscribe lifecycle.
- [ ] Handles `command_cancel` for stream cleanup.
- [ ] Applies bounded retries with idempotency keys.

## Related Docs

- `reference/protocol`
- `reference/relay-api`
- `guides/agent-automation`
- `reference/snippets`
- `guides/use-cases`
- `reference/error-codes`
- `reference/tab-lock-model`
