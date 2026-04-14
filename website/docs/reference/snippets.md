---
title: Snippets
sidebar_position: 5
---

# Reusable Snippets

Last Updated: 2026-04-14  
Owner: Platform

Copy-paste snippets for common controller, command, and stream workflows.

## Controller Registration and Token

```bash
curl -sS -X POST "$OTTO_RELAY_HTTP_URL/api/controller/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-controller","description":"automation worker"}'
```

```bash
curl -sS -X POST "$OTTO_RELAY_HTTP_URL/api/controller/token" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"'$OTTO_CLIENT_ID'","clientSecret":"'$OTTO_CLIENT_SECRET'"}'
```

## Node Discovery

```bash
curl -sS "$OTTO_RELAY_HTTP_URL/api/nodes/connected" \
  -H "Authorization: Bearer $OTTO_ACCESS_TOKEN"
```

## Token Refresh

```bash
curl -sS -X POST "$OTTO_RELAY_HTTP_URL/api/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"'$OTTO_REFRESH_TOKEN'"}'
```

## WebSocket Hello and Auth Frames

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

## Command List and Command Run Frames

```json
{
  "protocolVersion": "1.0",
  "messageType": "command",
  "requestId": "req_cmd_list_1",
  "timestamp": "2026-04-14T13:10:30.000Z",
  "senderRole": "controller",
  "payload": {
    "targetNodeId": "node_local_1",
    "action": "command.list",
    "payload": {},
    "replayNonce": "nonce_list_1"
  }
}
```

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
    "payload": {
      "site": "reddit.com",
      "command": "getFeed",
      "input": {"minReturnedPosts": 20},
      "authMode": "auto"
    },
    "waitPolicy": "fail_fast",
    "timeoutMs": 30000,
    "idempotencyKey": "idem_cmd_run_1",
    "replayNonce": "nonce_cmd_run_1"
  }
}
```

## Stream Test and Listener Subscribe Frames

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
    "payload": {
      "site": "reddit.com",
      "command": "getChatMessages",
      "authMode": "auto"
    },
    "timeoutMs": 30000,
    "replayNonce": "nonce_cmd_test_1"
  }
}
```

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
      "options": {
        "tabSessionId": "tab_abc",
        "site": "reddit.com",
        "mode": "fetch",
        "includeBody": true,
        "urlPatterns": ["https://matrix.redditspace.com/_matrix/client/v3/sync*"]
      }
    },
    "replayNonce": "nonce_sub_1"
  }
}
```

## Listener Unsubscribe and Stream Cancel

```json
{
  "protocolVersion": "1.0",
  "messageType": "command",
  "requestId": "req_unsub_1",
  "timestamp": "2026-04-14T13:12:00.000Z",
  "senderRole": "controller",
  "payload": {
    "targetNodeId": "node_local_1",
    "action": "listener.unsubscribe",
    "payload": {"targetRequestId": "req_sub_1"},
    "replayNonce": "nonce_unsub_1"
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
  "payload": {
    "targetRequestId": "req_cmd_test_1"
  }
}
```

## Related Docs

- guides/controller-implementation
- guides/agent-automation
- guides/command-authoring
- guides/listener-development
- guides/use-cases
- reference/protocol
- reference/relay-api
