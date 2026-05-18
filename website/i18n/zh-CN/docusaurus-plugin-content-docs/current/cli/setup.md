---
title: 安装
sidebar_position: 3
description: "otto setup 的 CLI 参考  - 交互式和非交互式首次运行向导，用于安装中继、下载扩展并配对节点。"
keywords:
  - otto setup
  - 安装向导
  - 非交互式安装
  - 扩展安装
  - 中继安装
---

# 安装

`otto setup` 是首次运行向导，安装中继依赖、下载并安装扩展、启动中继守护进程并引导配对。

## `otto setup`

### 用法

```bash
otto setup [options]
```

### 标志

| 标志 | 简写 | 必填 | 类型 | 默认值 | 允许值 | 描述 |
|---|---|---|---|---|---|---|
| `--relay-url` | | 否 | string | | | 要配置的中继 URL（跳过交互式中继 URL 提示） |
| `--non-interactive` | | 否 | boolean | false | | 以非交互模式运行；输出确定性 JSON 摘要 |
| `--skip-extension` | | 否 | boolean | false | | 跳过扩展下载和安装步骤 |
| `--skip-daemon` | | 否 | boolean | false | | 跳过中继守护进程启动步骤 |

### 示例

```bash
# 交互式安装 — 引导式教程
otto setup

# 非交互式安装，用于 CI/自动化
otto setup --non-interactive

# 直接设置中继 URL
otto setup --relay-url http://127.0.0.1:8787

# 跳过扩展下载（仅中继安装）
otto setup --skip-extension
```

### 非交互式 JSON 输出

在非交互模式下，`otto setup` 输出 JSON 摘要，包含：

- 守护进程就绪：`started` 或 `already_running`
- 扩展元数据：版本、构件路径、校验和状态
- 交接路径：中继 URL 和后续配对步骤

### Setup 守护进程行为

`otto setup` 确保中继守护进程在配置的中继 URL 端口上处于运行状态后再完成。如果已有守护进程在该端口上运行，setup 复用它（`already_running`）。如果端口与另一个守护进程冲突，setup 失败并附带明确的修复指引：运行 `otto stop`，然后使用目标中继 URL 重新运行 setup。

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 安装完成成功 |
| `1` | 安装失败（端口冲突、下载错误等） |

## 相关命令

- [otto start](./start.md) — 独立启动中继守护进程。
- [otto authcode / otto pair](./pairing.md) — 安装后完成配对。
- [otto config](./config.md) — 检视或编辑已保存的配置。
