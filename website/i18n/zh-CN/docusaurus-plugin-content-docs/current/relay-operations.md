---
title: 中继运维
sidebar_position: 7
description: "Otto 中继守护进程的运维参考。涵盖启动、环境变量、端点、运行时职责、日志存储模型和控制器生命周期管理。"
keywords:
  - 中继运维
  - 中继守护进程
  - otto start
  - 日志存储
  - 控制器生命周期
---

# 中继运维

本页是 Otto 中继守护进程的运维参考。在配置中继部署、诊断路由问题或集成控制器客户端时使用。

## 权威源码路径

| 关注点 | 源码 |
|---|---|
| 中继 HTTP + WebSocket 服务器 | `packages/relay/src/index.ts` |
| 集成验证套件 | `packages/relay/test/integration.test.mjs` |
| 共享协议约定 | `packages/shared-protocol/src/index.ts` |

## 启动

中继默认在端口 `8787` 上启动。全局安装的 `@telepat/otto` 包含中继运行时依赖，因此守护进程生命周期命令无需单独安装 `@telepat/otto-relay`。

| 命令 | 行为 |
|---|---|
| `otto start` | 启动中继守护进程 |
| `otto stop` | 停止中继守护进程 |
| `otto restart` | 重启中继守护进程 |
| `otto status` | 报告运行或已停止；停止时建议使用 `otto start` |
| `otto setup` | 确保中继守护进程在 setup 完成前在所选的中继 URL 端口上运行 |

Setup 守护进程结果：`started`（setup 为所选端口启动了守护进程）、`already_running`（复用现有守护进程）。Setup 在守护进程端口不匹配时失败并附有明确的修复指引：运行 `otto stop`，然后使用目标中继 URL 重新运行 setup。

## 环境变量

| 变量 | 默认值 | 描述 |
|---|---|---|
| `OTTO_RELAY_PORT` | `8787` | HTTP 和 WebSocket 监听端口 |
| `OTTO_TOKEN_SECRET` | — | **必填。** JWT 签名密钥 |
| `OTTO_TOKEN_PREVIOUS_SECRET` | — | 密钥轮换的宽限期验证 |
| `OTTO_TOKEN_ISSUER` | — | JWT `iss` 声明 |
| `OTTO_TOKEN_AUDIENCE` | — | JWT `aud` 声明 |
| `OTTO_TOKEN_TTL_MINUTES` | — | 访问令牌有效期 |
| `OTTO_REFRESH_TTL_DAYS` | — | 刷新令牌有效期 |
| `OTTO_EXTENSION_ORIGIN` | — | 允许的浏览器扩展来源 |
| `OTTO_LOG_DIR` | — | JSONL 操作日志目录 |
| `OTTO_LOG_MAX_FILE_BYTES` | `100MB` | 日文件大小溢出阈值 |
| `OTTO_RATE_LIMIT_PER_MIN` | — | 每个客户端的 WebSocket 帧速率限制 |
| `OTTO_REPLAY_WINDOW_MS` | — | Nonce 去重窗口 |
| `OTTO_TAB_QUEUE_LIMIT` | — | 每个标签页的最大排队命令数 |
| `OTTO_CONTROLLER_QUEUE_LIMIT` | — | 每个控制器的最大排队命令数 |
| `OTTO_DEFAULT_CONTROLLER_SCOPES` | — | 应用于新注册控制器的作用域 |
| `OTTO_ALLOW_REMOTE_CONTROLLER_REGISTRATION` | — | 允许未经认证的远程控制器注册 |
| `OTTO_CONTROLLER_REGISTRATION_SECRET` | — | 启用远程注册时的必填项 |
| `OTTO_CONTROLLER_HEARTBEAT_INTERVAL_MS` | `8000` | 心跳检查间隔 |
| `OTTO_CONTROLLER_HEARTBEAT_MISS_LIMIT` | `3` | 过期断开前允许错失的心跳数 |

:::warning
`OTTO_TOKEN_SECRET` 为必填项且必须保密。不要将其提交到源码控制或在日志中暴露。
:::

## 端点

### 配对和认证

| 方法 | 路径 | 认证 |
|---|---|---|
| `POST` | `/api/pairing/request` | 无 |
| `GET` | `/api/pairing/pending` | 无 |
| `POST` | `/api/pairing/approve` | 节点持有者 |
| `GET` | `/api/pairing/status` | 无 |
| `POST` | `/api/auth/refresh` | 刷新令牌 |
| `POST` | `/api/auth/revoke` | 刷新令牌 |
| `GET` | `/api/nodes/connected` | 控制器持有者 |

### 控制器客户端注册和 ACL

| 方法 | 路径 | 认证 | 备注 |
|---|---|---|---|
| `POST` | `/api/controller/register` | 无或注册密钥 | 正文：`{ name, description, avatarSeed? }` |
| `POST` | `/api/controller/token` | 客户端密钥 | 返回访问 + 刷新令牌对 |
| `POST` | `/api/controller/remove` | 控制器持有者 | 正文：`{ clientId }` — 撤销记录、拆除 ACL、刷新和会话 |
| `POST` | `/api/controller/remove-all` | 控制器持有者 | 撤销并清除所有控制器客户端记录 |
| `GET` | `/api/controller/access` | 节点持有者 | 列出活跃 ACL 授权 |
| `POST` | `/api/controller/access` | 节点持有者 | 授予控制器访问权限 |

ACL 强制执行：没有活跃授权时，针对节点的控制器命令返回 `acl_missing_node_grant`。客户端密钥仅用于 `/api/controller/token`；运行时授权使用访问令牌作用域和节点 ACL 授权。

### 日志

| 方法 | 路径 | 查询参数 |
|---|---|---|
| `GET` | `/api/logs` | `since`、`level`、`source`、`latest`、`nodeId`、`requestId` |
| `GET` | `/api/logs/status` | — |
| `GET` | `/api/logs/export` | 同 `/api/logs` |

`source` 支持 `relay`、`controller`、`node`、`all`。`latest` 限制返回最新的 N 条条目。无效的过滤器值返回 `400`。

### WebSocket

| 角色 | URL |
|---|---|
| 控制器 | `ws://host:port?role=controller` |
| 节点 | `ws://host:port?role=node` |

## 运行时职责

- 在路由任何命令之前强制执行 `hello`/`auth` 帧顺序
- 验证并按 `targetNodeId` 将命令帧路由到正确的节点会话
- 维护命令关联和终端超时跟踪
- 当节点离线时为进行中的请求生成合成断连故障
- 管理标签页锁租约、检测冲突并发出锁生命周期事件
- 持久化和流式传输结构化操作日志
- 按心跳策略断开过期控制器，并触发基于所有者的孤儿标签页清理

## 日志存储模型

中继将日志写入 `OTTO_LOG_DIR` 中的按日窗口划分的 JSONL 文件：

- 活跃日文件：`operations-YYYY-MM-DD.jsonl`
- 文件大小溢出：`operations-YYYY-MM-DD-1.jsonl`、`-2.jsonl` 等。
- 文件保留期：14 天
- `/api/logs/status` 报告所有操作日志文件的聚合字节大小

当认证节点客户端发送 `type=extension_log` 的 `event` 帧时，扩展来源的节点日志被摄入。中继将每条条目绑定到认证的节点身份，应用脱敏，并存储为 `source=node`。

## 监听器管理

- 中继仅在 `listener.subscribe` 返回成功 `result` 后激活监听器订阅
- 活跃监听器所有权以订阅 `requestId` 为键，并绑定到控制器 + 节点身份
- `listener.unsubscribe` 在路由前验证 `payload.targetRequestId`、所有权和节点匹配
- 成功取消订阅后移除监听器状态；该 `requestId` 上的后续更新被拒绝，返回 `listener_not_found`
- 监听器状态在控制器断连和节点断连时被清理

## 控制器断连行为

中继在 `OTTO_CONTROLLER_HEARTBEAT_INTERVAL_MS x OTTO_CONTROLLER_HEARTBEAT_MISS_LIMIT` 内未收到认证帧时将控制器标记为过期。断连或超时时：

1. 中继移除该控制器的监听器和命令流状态。
2. 中继立即丢弃由断连控制器拥有的排队命令。
3. 中继向已连接节点分发 `primitive.tab.close_owned`，携带断连控制器的 `clientId`。
4. 节点运行时仅关闭由该控制器身份拥有的标签页。

## 运维说明

- 被接受的命令有保证的终端结果：`result` 或 `error` 帧。
- 每标签页命令执行是 FIFO；跨标签页执行是并行的。
- 刷新会话在中继重启期间持久化在 `OTTO_LOG_DIR/refresh-sessions.jsonl` 中。
- 刷新令牌在成功的 `/api/auth/refresh` 时轮换；先前的令牌立即失效。
- 中继启动日志包含有效 TTL 配置以及刷新会话、控制器客户端和 ACL 存储的加载统计。

**运维故障排查清单：**

1. 确认控制器已认证（在日志中观察到 `auth_ack`）。
2. 确认操作包含在控制器作用域中。
3. 确认目标节点在线（`node_offline` 表示节点尚未连接或已断连）。
4. 如果命令堆积，检查队列限制（`tab_queue_overflow`、`controller_queue_overflow`）。
5. 如果命令在高频下被丢弃，检查速率限制。

## 下一步

- [中继 API 参考](./relay-api.md) — 完整的 HTTP 端点的请求和响应模式。
- [配置参考](./configuration.md) — 所有环境变量的默认值和描述。
- [日志与调试](./logging-debugging.md) — 在事件响应期间关联日志事件。
