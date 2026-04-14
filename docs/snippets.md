# Reusable Snippets

Last Updated: 2026-04-14
Owner: Platform

Copy-paste snippets for common controller, command, and stream workflows. Use the table first to pick the right snippet for your stage, then copy the matching block.

## Snippet Index

| Stage | Snippets |
| --- | --- |
| Controller bootstrap | Register client, exchange token |
| Session discovery | Connected node lookup |
| Session maintenance | Token refresh |
| Transport bootstrap | `hello` and `auth` websocket frames |
| Command execution | `command.run`, `command.test` |
| Stream lifecycle | `listener.subscribe`, `command_cancel` |

## Controller registration and token

```bash
curl -sS -X POST "$OTTO_RELAY_HTTP_URL/api/controller/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-controller","description":"automation worker"}'

curl -sS -X POST "$OTTO_RELAY_HTTP_URL/api/controller/token" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"'$OTTO_CLIENT_ID'","clientSecret":"'$OTTO_CLIENT_SECRET'"}'
```

## Node discovery

```bash
curl -sS "$OTTO_RELAY_HTTP_URL/api/nodes/connected" \
  -H "Authorization: Bearer $OTTO_ACCESS_TOKEN"
```

## Token refresh

```bash
curl -sS -X POST "$OTTO_RELAY_HTTP_URL/api/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"'$OTTO_REFRESH_TOKEN'"}'
```

## Core controller websocket frames

Use these frames in order, and wait for `auth_ack` before sending command envelopes.

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

## command.run and command.test frames

These frames demonstrate the minimum replay-safe command shape for runtime routing.

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

## Stream listener subscribe and cancel

Use subscribe request ids for listener-update correlation. Use `command_cancel` on the original streaming command request to terminate command-owned stream sessions.

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

## Related Docs

- docs/controller-implementation.md
- docs/agent-automation.md
- docs/relay-api.md
- docs/protocol.md
- docs/use-cases.md
