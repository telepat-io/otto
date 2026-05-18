---
title: 配置参考
sidebar_position: 2
description: "Otto 中继环境变量、CLI 配置文件、扩展运行时设置以及构建路径约定的完整配置参考。"
keywords:
  - 配置
  - 环境变量
  - 中继配置
  - cli 配置
  - 扩展设置
---

# 配置参考

本页涵盖 Otto 的所有可配置设置：中继环境变量、CLI 配置文件、扩展运行时设置和构建路径约定。

## 中继环境变量

在使用 `otto start` 或 `otto relay:start` 启动中继进程之前，在进程环境中设置这些变量。

| 变量 | 默认值 | 描述 |
|---|---|---|
| `OTTO_RELAY_PORT` | `8787` | 中继 HTTP 和 WebSocket 监听端口 |
| `OTTO_TOKEN_SECRET` | 自动生成 | 所有令牌的 JWT 签名密钥 |
| `OTTO_TOKEN_PREVIOUS_SECRET` | (空) | 用于轮换兼容性的旧密钥 |
| `OTTO_TOKEN_ISSUER` | `otto-relay` | JWT `iss` 声明 |
| `OTTO_TOKEN_AUDIENCE` | `otto-clients` | JWT `aud` 声明 |
| `OTTO_TOKEN_TTL_MINUTES` | `15` | 访问令牌有效期（分钟） |
| `OTTO_REFRESH_TTL_DAYS` | `30` | 刷新令牌有效期（天） |
| `OTTO_EXTENSION_ORIGIN` | (扩展来源) | 允许节点 WebSocket 连接的来源 |
| `OTTO_LOG_DIR` | `~/.otto/relay` | JSONL 操作日志文件的目录 |
| `OTTO_LOG_MAX_FILE_BYTES` | `104857600` (100 MB) | 每次溢出前的每个日志文件最大大小 |
| `OTTO_RATE_LIMIT_PER_MIN` | (运行时默认值) | 每个会话每分钟的最大认证帧数 |
| `OTTO_REPLAY_WINDOW_MS` | `60000` | 重放保护的时间戳偏差窗口 |
| `OTTO_TAB_QUEUE_LIMIT` | (运行时默认值) | 每个标签页会话的最大排队命令数 |
| `OTTO_CONTROLLER_QUEUE_LIMIT` | (运行时默认值) | 每个控制器会话的最大排队命令数 |
| `OTTO_DEFAULT_CONTROLLER_SCOPES` | (运行时默认值) | 分配给新注册控制器客户端的作用域 |
| `OTTO_ALLOW_REMOTE_CONTROLLER_REGISTRATION` | `false` | 设为 `true` 允许未经认证的远程客户端注册 |
| `OTTO_CONTROLLER_REGISTRATION_SECRET` | (空) | 远程控制器注册所需的共享密钥 |
| `OTTO_CONTROLLER_HEARTBEAT_INTERVAL_MS` | `8000` | 控制器会话的心跳检查间隔 |
| `OTTO_CONTROLLER_HEARTBEAT_MISS_LIMIT` | `3` | 控制器被标记为过期前允许的错失心跳数 |

:::warning
在生产环境中显式设置 `OTTO_TOKEN_SECRET`。自动生成的值在每次中继重启时都会轮换，导致所有现有令牌失效。
:::

## CLI 配置文件

路径：`~/.otto/config.json`

由 `otto config` 和 `otto client` 命令管理。常用字段：

| 字段 | 描述 |
|---|---|
| `relayUrl` | 中继的 WebSocket URL（例如 `ws://localhost:8787`） |
| `relayHttpUrl` | 中继的 HTTP URL（例如 `http://localhost:8787`） |
| `nodeId` | CLI 命令的目标节点 ID |
| `clientId` | 已注册的控制器客户端 ID |
| `accessToken` | 当前的控制器访问令牌 |
| `refreshToken` | 当前的控制器刷新令牌 |

:::note
不要直接编辑 `~/.otto/config.json`。使用 `otto config` 设置中继 URL，使用 `otto client login` 管理令牌。
:::

## 扩展运行时设置

存储在 `chrome.storage.*` 中，通过扩展弹窗和选项页面管理。

| 设置 | 描述 |
|---|---|
| 中继 URL | 扩展节点连接的 WebSocket URL |
| 节点 ID | 此浏览器实例的节点身份 |
| 节点令牌状态 | 配对和认证令牌生命周期 |
| 重连状态 | 离屏 WebSocket 重连退避元数据 |
| 本地开发日志流 | 切换开关，启用后将结构化扩展日志流式传输到中继 (`source=node`) |

扩展设置与 `~/.otto/config.json` 有意独立，即使两者指向同一中继主机。

## 构建路径约定

本地扩展构建输出路径（`otto extension update` 和 `otto setup` 使用）：

```
extension/output/chrome-mv3
```

此路径是 Chrome 本地扩展加载指引的源路径。

## 下一步

- [中继运维](./relay-operations.md) — 启动、守护进程生命周期和运维说明。
- [安全控制](./security.md) — 令牌签名和轮换指南。
- [安装](./installation.md) — `otto setup` 自动化配置流程。
