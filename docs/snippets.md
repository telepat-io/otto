---
title: Reusable Snippets
sidebar_position: 11
description: Copy-paste curl and WebSocket snippets for Otto controller bootstrap, session discovery, token refresh, command execution, stream lifecycle, and teardown.
keywords:
  - snippets
  - curl examples
  - websocket frames
  - controller bootstrap
  - stream lifecycle
---

# Reusable Snippets

Copy-paste snippets for common controller, command, and stream workflows. All examples use environment variables for sensitive values.

## Snippet index

| Stage | Section |
|---|---|
| Controller bootstrap | [Register and get token](#controller-registration-and-token) |
| Session discovery | [Connected nodes](#node-discovery) |
| Session maintenance | [Token refresh](#token-refresh) |
| Transport bootstrap | [WebSocket hello and auth frames](#websocket-bootstrap) |
| Command execution | [command.run and command.test](#command-frames) |
| Stream lifecycle | [listener.subscribe and command_cancel](#stream-lifecycle) |

## Controller registration and token

```bash
# Register a new controller client
curl -sS -X POST "$OTTO_RELAY_HTTP_URL/api/controller/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-controller","description":"automation worker"}'

# Exchange client credentials for an access token
curl -sS -X POST "$OTTO_RELAY_HTTP_URL/api/controller/token" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"'$OTTO_CLIENT_ID'","clientSecret":"'$OTTO_CLIENT_SECRET'"}'
```

## Node discovery

```bash
curl -sS "$OTTO_RELAY_HTTP_URL/api/nodes/connected" \
  -H "Authorization: Bearer $OTTO_ACCESS_TOKEN"
```

Response:

```json
{ "nodes": [{ "nodeId": "node_local_1" }] }
```

## Token refresh

```bash
curl -sS -X POST "$OTTO_RELAY_HTTP_URL/api/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"'$OTTO_REFRESH_TOKEN'"}'
```

## WebSocket bootstrap

Send `hello` and then `auth` in order. Wait for `auth_ack` before sending command envelopes.

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

## Command frames

Minimum replay-safe `command.run` envelope:

```json
{
  "protocolVersion": "1.0",
  "messageType": "command",
  "requestId": "req_cmd_run_1",
  "timestamp": "2026-04-14T13:10:40.000Z",
  "senderRole": "controller",
  "payload": {
    "targetNodeId": "node_local_1",
    "tabSessionId": "tab_abc",
    "action": "command.run",
    "payload": {"site": "reddit.com", "command": "getFeed"},
    "replayNonce": "nonce_cmd_run_1"
  }
}
```

`command.test` envelope (same shape, different action):

```json
{
  "protocolVersion": "1.0",
  "messageType": "command",
  "requestId": "req_cmd_test_1",
  "timestamp": "2026-04-14T13:11:00.000Z",
  "senderRole": "controller",
  "payload": {
    "targetNodeId": "node_local_1",
    "tabSessionId": "tab_abc",
    "action": "command.test",
    "payload": {"site": "reddit.com", "command": "getChatMessages"},
    "replayNonce": "nonce_cmd_test_1"
  }
}
```

## Stream lifecycle

Subscribe to a network listener. Use the subscribe `requestId` to correlate incoming `listener_update` events.

```json
{
  "protocolVersion": "1.0",
  "messageType": "command",
  "requestId": "req_sub_1",
  "timestamp": "2026-04-14T13:11:05.000Z",
  "senderRole": "controller",
  "payload": {
    "targetNodeId": "node_local_1",
    "action": "listener.subscribe",
    "payload": {
      "listener": "network.http_intercept",
      "options": {"tabSessionId": "tab_abc", "site": "reddit.com", "mode": "fetch"}
    },
    "replayNonce": "nonce_sub_1"
  }
}
```

Cancel an active stream session using the original `command.test` `requestId`:

```json
{
  "protocolVersion": "1.0",
  "messageType": "command_cancel",
  "requestId": "req_cancel_1",
  "timestamp": "2026-04-14T13:12:10.000Z",
  "senderRole": "controller",
  "payload": {"targetRequestId": "req_cmd_test_1"}
}
```

## Next steps

- [Controller Implementation Guide](./controller-implementation.md) — full HTTP + WebSocket flow.
- [Protocol Reference](./protocol.md) — envelope contract and all message families.
- [Relay API Reference](./relay-api.md) — full endpoint documentation.
