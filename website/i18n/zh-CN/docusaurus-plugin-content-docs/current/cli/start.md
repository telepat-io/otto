---
title: 中继生命周期
sidebar_position: 2
description: "用于启动、停止和检视 Otto 中继守护进程的 CLI 命令。涵盖 otto start、otto stop 和 otto status 及其所有标志。"
keywords:
  - otto start
  - otto stop
  - otto status
  - 中继守护进程
  - 中继生命周期
---

# 中继生命周期

启动、停止和检视 Otto 中继守护进程。

## `otto start`

将中继守护进程作为后台进程启动。

### 用法

```bash
otto start [options]
```

### 标志

| 标志 | 简写 | 必填 | 类型 | 默认值 | 描述 |
|---|---|---|---|---|---|
| `--attached` | | 否 | boolean | false | 以附加模式运行，日志流式输出到 stdout 而非后台化 |
| `--port` | | 否 | number | 8787 | 启动中继的端口 |

### 示例

```bash
# 在后台启动中继守护进程
otto start

# 以终端附加日志方式启动中继（开发模式）
otto start --attached

# 在自定义端口上启动中继
otto start --port 9000
```

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 中继启动成功 |
| `1` | 启动失败（端口冲突、配置缺失等） |

---

## `otto stop`

停止正在运行的中继守护进程。

### 用法

```bash
otto stop
```

### 示例

```bash
otto stop
```

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 中继停止成功 |
| `1` | 没有中继在运行或停止失败 |

---

## `otto restart`

重启中继守护进程。如果中继尚未运行，此命令将启动它。

### 用法

```bash
otto restart [options]
```

### 标志

| 标志 | 简写 | 必填 | 类型 | 默认值 | 描述 |
|---|---|---|---|---|---|
| `--port` | | 否 | number | 当前守护进程端口或 `8787` | 重启中继的端口 |
| `--attached` | `-a` | 否 | boolean | false | 在前台附加运行，将日志流式输出到当前终端 |

### 示例

```bash
otto restart
otto restart --port 9000
otto restart --attached
```

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 中继重启成功 |
| `1` | 中继重启失败 |

---

## `otto status`

报告中继守护进程是否正在运行。使用 `--nodes` 包含已连接的节点 ID。

### 用法

```bash
otto status [--nodes] [--json]
```

### 示例

```bash
otto status
otto status --nodes
otto status --nodes --json
```

停止时，`otto status` 建议运行 `otto start`。

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 状态报告成功 |

---

## 相关命令

- [otto setup](./setup.md) — 首次运行安装向导，同样确保守护进程就绪。
- [otto logs follow](./logs.md) — 启动后尾随实时中继日志。
