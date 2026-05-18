---
title: 日志与调试
sidebar_position: 8
description: "诊断 Otto 命令路由、运行时执行和流问题的运维手册。涵盖 CLI 工作流、事件模型、日志存储和命令故障排查手册。"
keywords:
  - 日志
  - 调试
  - otto logs
  - 日志跟踪
  - requestId 关联
---

# 日志与调试

本页是诊断命令路由、运行时执行和流问题的运维手册。先将其作为工作流指南使用，再作为命令参考。

## 权威源码路径

| 领域 | 源码 |
|---|---|
| 中继日志摄入和持久化 | `packages/relay/src/index.ts` |
| CLI 日志和监听器 UX | `packages/cli/src/index.ts` |
| 日志集成覆盖 | `packages/relay/test/integration.test.mjs` |

## 核心 CLI 工作流

| 目标 | 命令 |
|---|---|
| 拉取有界历史证据 | `otto logs list --source all --latest 200` |
| 实时跟踪扩展运行时日志 | `otto logs follow --source node` |
| 跟踪完整信封 | `otto logs follow --source node --json` |
| 导出 NDJSON 切片 | `otto logs export --source relay --latest 500` |
| 启动网络监听器流 | `otto listener subscribe-network --tab-session <id> --site reddit.com --pattern 'https://www.reddit.com/api/*'` |
| 停止监听器流 | `otto listener unsubscribe --target-request-id <subscribeRequestId>` |

日志来源为 `relay`、`controller`、`node` 和 `all`。`logs follow` 默认输出人类可读的行格式；当机器解析至关重要时使用 `--json`。

## 推荐调试顺序

从有界证据开始，仅在需要时序时才升级到实时跟踪：

1. 以 JSON 模式运行失败的命令并捕获 `requestId`。
2. 使用 `otto logs list --request-id <requestId> --source all --latest 100` 拉取关联日志。
3. 如果行为似乎是扩展特定的，缩小范围到节点日志。
4. 如果怀疑时序/竞态，在有界捕获窗口内运行 `logs follow --json`。

关于完整的引导和端到端控制器流程指南，参见[控制器实现指南](./guides/controller-implementation.md)。

## 事件模型

每个存储的事件包含稳定的信封字段（`id`、`timestamp`、`level`、`source`、`type`），以及可选的关联字段（`requestId`、`nodeId`）和已脱敏的 `data` 负载。

| 事件族 | 典型用途 |
|---|---|
| `command_routed`、`result`、`error` | 命令生命周期和终态性 |
| `lock_conflict`、`lock_expired` | 队列/锁竞争诊断 |
| `pairing_requested`、`pairing_approved` | 节点引导流程 |
| `offscreen.*`、`background.*` | 扩展传输/引导健康状态 |
| `listener_update` | 流负载更新（原始传输或共享域对象） |
| `debugger_focus.*`、`network_listener.*` | 调试器附加/复用/拆除行为 |

中继在操作日志中持久化监听器更新元数据和形状摘要，同时将完整监听器负载转发给已订阅的控制器。

## 监听器和流诊断

监听器更新应始终通过订阅 `requestId` 进行关联。在 `otto test` 流会话中，这一 ID 有意与原始 `command.test` 请求 ID 不同。

在诊断重复时，检查两个层面：拦截级混合抑制和适配器级语义去重。对于适配器支持的流（例如 Reddit 聊天），预期出现共享域类型，如 `chat.message`、`chat.typing`、`chat.participant` 和 `chat.message_deleted`。

## 本地开发日志流

扩展本地开发日志流从弹窗/选项中主动加入。启用后，扩展日志作为结构化节点事件排队，在 WebSocket 认证后刷新。中继将其存储为 `source=node` 条目，并合并到常规的 list/export/follow API 中。

调试日志传输与监听器更新传输有意分开。在负载下，调试日志帧可限流或丢弃，而监听器更新通过数据平面路径继续。

## 背压和 `rate_limited` 信号

如果离屏报告 `rate_limited` 警告，中继在当前分钟窗口内拒绝了一个或多个入站节点帧。在正常高容量场景下，被丢弃的帧更可能是扩展遥测（`extension_log`）而非监听器更新，因为中继优先处理节点会话上的监听器更新。

将重复的速率限制警告视为减少调试日志量或在增加全局中继限制之前减少刷新频率的信号。

## 存储与保留

| 策略 | 行为 |
|---|---|
| 快速近期查询 | 内存环形缓冲区 |
| 持久化历史 | 按日窗口划分的 JSONL 文件（`operations-YYYY-MM-DD*.jsonl`） |
| 文件大小控制 | 活跃文件超出 `OTTO_LOG_MAX_FILE_BYTES` 时产生溢出文件 |
| 保留期 | 14 天清理窗口 |
| 兼容性 | 旧版 `operations.jsonl` 仍可读取 |

环境控制：

- `OTTO_LOG_DIR`
- `OTTO_LOG_MAX_FILE_BYTES`（最小 `1024`，默认 `104857600`）

## 命令故障排查手册

对命令级故障使用此检查清单：

1. 如果是 `manual_login_required`，在浏览器中手动认证后重新运行。
2. 如果是 `site_mismatch`，验证活跃的 `tabSessionId` URL 是否与命令站点匹配。
3. 如果是 `tab_url_not_ready`，短暂延迟后重新运行。
4. 如果是 `forbidden_action`，验证控制器令牌作用域。
5. 如果是 `acl_missing_node_grant`，在扩展弹窗的控制器访问中批准控制器。
6. 如果套接字在响应前关闭，先视为传输中断，然后在中继/节点健康检查后重试。

每次失败后，按 `requestId` 关联后再扩大到全局日志扫描。

## Setup 和配对故障排查

对于安装问题，优先使用 `otto setup --non-interactive` 并检查确定性 JSON 字段中的守护进程就绪、构件获取和交接路径值。端口冲突应在重新运行前解决，针对同一中继 URL 的重复运行应报告守护进程复用（`already_running`）而非启动重复进程。

对于配对恢复问题，在刷新尝试前后捕获弹窗状态、Service Worker 日志以及离屏重连/认证轨迹。预期的强化行为是自动清理过期的挑战状态、当中继不再识别挑战时立即重新发起挑战，以及确定性的状态刷新完成。

## 下一步

- [RequestId 关联手册](./guides/requestid-correlation-runbook.md) — 事件级关联工作流。
- [高级故障排查](./guides/troubleshooting-advanced.md) — 流诊断、错误到操作表。
- [中继运维](./relay-operations.md) — 日志存储模型和保留设置。
