---
title: 可复用代码片段
sidebar_position: 11
description: "可直接复制的 curl 和 WebSocket 片段，用于 Otto 控制器引导、会话发现、令牌刷新、命令执行、流生命周期和清理。"
keywords:
  - 代码片段
  - curl 示例
  - websocket 帧
  - 控制器引导
  - 流生命周期
---

# 可复用代码片段

常用控制器、命令和流工作流的可直接复制片段。所有示例使用环境变量处理敏感值。

## 片段索引

| 阶段 | 章节 |
|---|---|
| 控制器引导 | [注册并获取令牌](#控制器注册和令牌) |
| 会话发现 | [已连接节点](#节点发现) |
| 会话维护 | [令牌刷新](#令牌刷新) |
| 传输引导 | [WebSocket hello 和 auth 帧](#websocket-引导) |
| 命令执行 | [command.run 和 command.test](#命令帧) |
| 流生命周期 | [listener.subscribe 和 command_cancel](#流生命周期) |

## 控制器注册和令牌

```bash
# 注册新控制器客户端
curl -sS -X POST "$OTTO_RELAY_HTTP_URL/api/controller/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-controller","description":"automation worker"}'

# 用客户端凭据交换访问令牌
curl -sS -X POST "$OTTO_RELAY_HTTP_URL/api/controller/token" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"'$OTTO_CLIENT_ID'","clientSecret":"'$OTTO_CLIENT_SECRET'"}'
```

## 节点发现

```bash
curl -sS "$OTTO_RELAY_HTTP_URL/api/nodes/connected" \
  -H "Authorization: Bearer $OTTO_ACCESS_TOKEN"
```

响应：

```json
{ "nodes": [{ "nodeId": "node_local_1" }] }
```

## 令牌刷新

```bash
curl -sS -X POST "$OTTO_RELAY_HTTP_URL/api/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"'$OTTO_REFRESH_TOKEN'"}'
```

## WebSocket 引导

按顺序发送 `hello` 然后是 `auth`。等待 `auth_ack` 后再发送命令信封。

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

## 命令帧

最小重放安全的 `command.run` 信封：

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

`command.test` 信封（相同形状，不同操作）：

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

## 流生命周期

订阅网络监听器。使用订阅 `requestId` 关联传入的 `listener_update` 事件。

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

使用原始 `command.test` `requestId` 取消活跃的流会话：

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

## 下一步

- [控制器实现指南](./guides/controller-implementation.md) — 完整 HTTP + WebSocket 流程。
- [协议参考](./protocol.md) — 信封约定和所有消息族。
- [中继 API 参考](./relay-api.md) — 完整端点文档。
