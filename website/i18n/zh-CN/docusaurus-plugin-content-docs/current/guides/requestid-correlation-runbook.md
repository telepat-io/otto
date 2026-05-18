---
title: requestId 关联手册
sidebar_position: 10
description: "使用 requestId 跨控制器、中继和扩展节点追踪失败的 Otto 工作流。日志收集、流路径检查和事件记录的分步流程。"
keywords:
  - requestId
  - 日志关联
  - 调试手册
  - otto logs
  - 事件响应
---

# requestId 关联手册

使用此手册通过 `requestId` 关联来跨控制器、中继和扩展节点追踪失败的工作流。单个请求 ID 贯穿所有三个组件，是隔离故障层的最可靠方式。

## 开始之前

- Otto 中继运行且可访问。
- 扩展选项中启用了本地开发日志流（用于扩展来源事件）。

## 流程

### 步骤 1：启动实时日志捕获

```bash
otto logs follow --source all
```

在复现故障之前，在独立终端中保持此命令运行。

### 步骤 2：复现故障

运行失败的命令。使用 `--json` 获取机器可读输出：

```bash
otto test reddit.com getChatMessages --json 2>&1 | tee /tmp/otto-test-output.txt
```

从输出中捕获 `requestId`（在结果或错误信封中查找 `"requestId": "req_..."`）。

### 步骤 3：查询限定范围的日志时间线

```bash
# 跨所有来源的此请求的完整时间线
otto logs list --request-id <requestId> --source all

# 仅扩展端事件
otto logs list --source node --latest 300
```

### 步骤 4：分类故障层

| 层 | 要查找的信号 |
|---|---|
| **控制器** | 请求从未离开控制器；WebSocket 认证前的令牌错误 |
| **中继** | 中继日志中的 `auth`、路由、ACL 或锁事件，在节点接收命令之前 |
| **节点** | 节点已接收命令；执行、站点不匹配或认证预检故障 |
| **流** | 订阅成功但无 `listener_update` 事件；或缺少拆除 |

### 流路径检查

特别针对流故障：

1. 捕获**订阅** `requestId`（与流命令 `requestId` 不同）。
2. 验证 `listener_update` 事件与订阅 `requestId` 关联。
3. 验证拆除是显式的：`listener.unsubscribe` 或 `command_cancel`。

## 快速参考命令

```bash
# 实时跟踪所有来源
otto logs follow --source all

# 仅实时跟踪扩展端
otto logs follow --source node

# 有界节点证据
otto logs list --source node --latest 300

# 带跟踪窗口的流测试
otto test reddit.com getChatMessages --stream-follow-ms 45000 --json
```

## 事件摘要模板

升级前填写此模板：

```
requestId:         req_...
action:            command.run / command.test
site + command:    reddit.com / getChatMessages
targetNodeId:      node_local_1
tabSessionId:      ts_...
failing layer:     relay / node / stream
error code:        tab_busy / acl_missing_node_grant / ...
retryable:         yes / no
immediate fix:     retry with backoff / re-pair / refresh tokens
prevention:        add bounded wait policy / fix token refresh lifecycle
```

## 下一步

- [高级故障排查](./troubleshooting-advanced.md) — 错误到操作表。
- [控制器故障排查决策树](./controller-troubleshooting-decision-tree.md) — 逐层决策路径。
- [错误码](../error-codes.md) — 完整错误码参考。
