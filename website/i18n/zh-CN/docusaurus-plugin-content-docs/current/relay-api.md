---
title: 中继 API 参考
sidebar_position: 3
description: "Otto 中继的完整 HTTP 和 WebSocket API 参考。涵盖配对、认证、控制器客户端、ACL、日志、节点和 WebSocket 连接的全部端点。"
keywords:
  - 中继 api
  - http 端点
  - websocket
  - 控制器 api
  - 配对 api
---

# 中继 API 参考

本页是 Otto 中继的完整 HTTP 和 WebSocket API 参考。实现源码：`packages/relay/src/index.ts`。

## 认证

大多数端点需要在 `Authorization` 头部中提供持有者令牌：

```
Authorization: Bearer <accessToken>
```

角色期望：

- 控制器访问令牌 — 用于面向控制器的端点（命令、日志、节点发现）。
- 节点访问令牌 — 用于节点 ACL 端点（`/api/controller/access`）。

## 配对端点

| 方法 | 路径 | 描述 |
|---|---|---|
| `POST` | `/api/pairing/request` | 节点请求配对挑战 |
| `GET` | `/api/pairing/pending` | 列出待处理的配对码（需要节点认证） |
| `POST` | `/api/pairing/approve` | 控制器批准配对码 |
| `GET` | `/api/pairing/status` | 检查挑战的配对状态 |

**请求：POST /api/pairing/request**

```json
{ "nodeId": "node_local_1" }
```

**请求：POST /api/pairing/approve**

```json
{ "code": "ABCD-1234" }
```

**错误码：** `nodeId_required`、`code_required`、`pairing_not_found`、`pairing_not_pending`、`challengeId_required`、`challenge_not_found`

## 认证端点

| 方法 | 路径 | 描述 |
|---|---|---|
| `POST` | `/api/auth/refresh` | 使用刷新令牌刷新访问令牌 |
| `POST` | `/api/auth/revoke` | 撤销刷新令牌 |

**请求：POST /api/auth/refresh**

```json
{ "refreshToken": "<refresh_token>" }
```

**错误码：** `refreshToken_required`、`invalid_refresh_token`

## 控制器客户端端点

| 方法 | 路径 | 认证 | 描述 |
|---|---|---|---|
| `POST` | `/api/controller/register` | 无（或密钥） | 注册新控制器客户端 |
| `POST` | `/api/controller/token` | 无 | 用客户端凭据交换令牌 |
| `POST` | `/api/controller/remove` | 控制器持有者 | 按 ID 撤销控制器客户端 |
| `POST` | `/api/controller/remove-all` | 控制器持有者 | 撤销并清除所有控制器客户端 |

**请求：POST /api/controller/register**

```json
{ "name": "my-controller", "description": "automation worker", "avatarSeed": "optional-seed" }
```

**请求：POST /api/controller/token**

```json
{ "clientId": "clt_abc123", "clientSecret": "cs_xxx" }
```

**请求：POST /api/controller/remove**

```json
{ "clientId": "clt_abc123" }
```

删除语义：
- 单个删除撤销客户端记录并拆除 ACL 授权、刷新会话和活跃的控制器套接字。
- 批量删除还会清除记录。后续 `remove-all` 调用返回 `removedCount: 0`，直到有新客户端注册。

**错误码：** `registration_forbidden`、`controller_metadata_required`、`controller_name_conflict`、`client_credentials_required`、`invalid_client_credentials`、`client_not_found`

## 节点 ACL 端点

| 方法 | 路径 | 认证 | 描述 |
|---|---|---|---|
| `GET` | `/api/controller/access` | 节点持有者 | 列出已连接节点的 ACL 授权 |
| `POST` | `/api/controller/access` | 节点持有者 | 授予或撤销控制器对节点的访问权限 |

**请求：POST /api/controller/access**

```json
{ "clientId": "clt_abc123", "grant": true, "expiresAt": 1776165600000 }
```

没有活跃授权时，针对节点的命令返回 `acl_missing_node_grant`。客户端密钥仅用于 `/api/controller/token`；运行时命令授权使用访问令牌作用域和节点 ACL 授权。

**错误码：** `missing_access_token`、`forbidden_role`、`clientId_and_grant_required`、`invalid_expiresAt`

## 节点发现端点

| 方法 | 路径 | 认证 | 描述 |
|---|---|---|---|
| `GET` | `/api/nodes/connected` | 控制器持有者 | 列出已连接的节点 ID |

**响应：GET /api/nodes/connected**

```json
{ "nodes": [{ "nodeId": "node_local_1" }] }
```

**错误码：** `missing_access_token`、`forbidden_role`、`invalid_access_token`

## 日志端点

| 方法 | 路径 | 认证 | 描述 |
|---|---|---|---|
| `GET` | `/api/logs` | 控制器持有者 | 查询操作日志 |
| `GET` | `/api/logs/status` | 控制器持有者 | 日志存储状态和聚合字节大小 |
| `GET` | `/api/logs/export` | 控制器持有者 | 以 NDJSON 导出日志 |

**查询参数（logs 和 export）：**

| 参数 | 描述 |
|---|---|
| `since` | ISO-8601 时间戳下限 |
| `level` | `debug` \| `info` \| `warn` \| `error` |
| `source` | `relay` \| `controller` \| `node` \| `all` |
| `latest` | 限制返回最新的 N 条条目 |
| `nodeId` | 按节点身份过滤 |
| `requestId` | 按请求关联 ID 过滤 |

**响应：GET /api/logs**

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

**错误码：** `invalid_since`、`invalid_level`、`invalid_source`、`invalid_latest`

## WebSocket 连接

| 角色 | URL 模式 |
|---|---|
| 控制器 | `ws://host:port?role=controller` |
| 节点 | `ws://host:port?role=node` |

连接后，先发送 `hello` 然后发送 `auth` 帧。认证成功时中继响应 `auth_ack`。帧示例见[可复用代码片段](./snippets.md)。

## CLI 映射

| CLI 命令 | API 操作 |
|---|---|
| `otto authcode` | `GET /api/pairing/pending` |
| `otto pair <code>` | `POST /api/pairing/approve` |
| `otto revoke` | `POST /api/auth/revoke` |
| `otto client register` | `POST /api/controller/register` |
| `otto client login` | `POST /api/controller/token` + `POST /api/auth/refresh` |
| `otto client remove` | `POST /api/controller/remove` |
| `otto client status` | 验证存储的令牌 |
| `otto logs list` | `GET /api/logs` |
| `otto logs export` | `GET /api/logs/export` |
| `otto logs status` | `GET /api/logs/status` |
| `otto commands list` | WebSocket `command.list` |
| `otto cmd` | WebSocket `command.run` |

## 下一步

- [可复用代码片段](./snippets.md) — curl 和 WebSocket 帧示例。
- [控制器实现指南](./guides/controller-implementation.md) — 完整引导序列。
- [协议参考](./protocol.md) — WebSocket 信封和消息族约定。
