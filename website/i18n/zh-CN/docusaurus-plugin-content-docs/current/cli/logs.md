---
title: 日志
sidebar_position: 9
description: "otto logs 命令的 CLI 参考  - 列出、跟踪、检查状态和导出中继操作日志，支持来源和过滤选项。"
keywords:
  - otto logs
  - 日志列表
  - 日志跟踪
  - 日志导出
  - 日志来源
---

# 日志

查询、跟踪和导出中继操作日志。日志包括中继原生事件、控制器事件和从浏览器流式传输的扩展节点事件。

## `otto logs list`

拉取有界的历史日志条目列表。

### 用法

```bash
otto logs list [options]
```

### 标志

| 标志 | 简写 | 必填 | 类型 | 默认值 | 允许值 | 描述 |
|---|---|---|---|---|---|---|
| `--source` | | 否 | string | `all` | `relay`、`controller`、`node`、`all` | 按日志来源过滤 |
| `--latest` | | 否 | number | 100 | | 返回最新的 N 条条目 |
| `--level` | | 否 | string | | `debug`、`info`、`warn`、`error` | 按日志级别过滤 |
| `--since` | | 否 | string | | ISO-8601 日期时间 | 返回此时间戳之后的条目 |
| `--node-id` | | 否 | string | | | 按节点 ID 过滤 |
| `--request-id` | | 否 | string | | | 按 requestId 过滤 |
| `--json` | | 否 | boolean | false | | 以 NDJSON 格式输出 |

### 示例

```bash
# 拉取所有来源的最新 100 条条目
otto logs list

# 拉取最新 200 条条目
otto logs list --latest 200

# 仅拉取扩展来源日志
otto logs list --source node --latest 50

# 拉取与特定请求关联的日志
otto logs list --request-id <requestId> --source all

# 机器可读输出
otto logs list --json
```

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 日志已返回 |
| `1` | 中继错误或过滤器无效 |

---

## `otto logs follow`

从中继流式传输实时日志事件。持续运行直到 `Ctrl+C`。

### 用法

```bash
otto logs follow [options]
```

### 标志

| 标志 | 简写 | 必填 | 类型 | 默认值 | 允许值 | 描述 |
|---|---|---|---|---|---|---|
| `--source` | | 否 | string | `all` | `relay`、`controller`、`node`、`all` | 按日志来源过滤 |
| `--level` | | 否 | string | | `debug`、`info`、`warn`、`error` | 按级别过滤 |
| `--json` | | 否 | boolean | false | | 以 NDJSON 格式输出（每行一个信封） |

### 示例

```bash
# 实时跟踪所有来源
otto logs follow

# 仅跟踪扩展运行时日志
otto logs follow --source node

# 带完整 JSON 信封跟踪
otto logs follow --source all --json

# 仅跟踪中继事件
otto logs follow --source relay
```

:::note
`otto logs follow` 是无界的。对于自动化，强制执行调用方超时窗口并管道输出到日志聚合器。
:::

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 干净退出（Ctrl+C） |
| `1` | 连接错误 |

---

## `otto logs status`

报告中继操作日志文件的存储状态。

### 用法

```bash
otto logs status [options]
```

### 标志

| 标志 | 简写 | 必填 | 类型 | 默认值 | 描述 |
|---|---|---|---|---|---|
| `--json` | | 否 | boolean | false | 以 JSON 格式输出 |

### 示例

```bash
otto logs status

otto logs status --json
```

输出包括所有操作日志文件的总字节数和活跃窗口设置。

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 状态已上报 |
| `1` | 中继错误 |

---

## `otto logs export`

将操作日志切片以 NDJSON 格式导出到 stdout 或文件。

### 用法

```bash
otto logs export [options]
```

### 标志

| 标志 | 简写 | 必填 | 类型 | 默认值 | 允许值 | 描述 |
|---|---|---|---|---|---|---|
| `--source` | | 否 | string | `all` | `relay`、`controller`、`node`、`all` | 按来源过滤 |
| `--latest` | | 否 | number | | | 导出最新的 N 条条目 |
| `--since` | | 否 | string | | ISO-8601 日期时间 | 导出此时间戳之后的条目 |
| `--level` | | 否 | string | | `debug`、`info`、`warn`、`error` | 按级别过滤 |
| `--node-id` | | 否 | string | | | 按节点 ID 过滤 |
| `--request-id` | | 否 | string | | | 按 requestId 过滤 |
| `--output` | `-o` | 否 | string | stdout | | 输出文件路径 |

### 示例

```bash
# 导出最新 500 条中继条目
otto logs export --source relay --latest 500

# 导出到文件
otto logs export --source all --latest 1000 --output ./logs.ndjson

# 导出事件关联日志
otto logs export --request-id <requestId> --source all
```

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 导出完成 |
| `1` | 中继错误或写入失败 |

---

## 相关命令

- [otto listener subscribe-network](./listener.md) — 订阅网络拦截流。
- [日志与调试](../logging-debugging.md) — 调试工作流和事件模型。
- [RequestId 关联手册](../guides/requestid-correlation-runbook.md) — 事件关联指南。
