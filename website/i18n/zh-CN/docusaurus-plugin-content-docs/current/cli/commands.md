---
title: 命令执行
sidebar_position: 8
description: "otto commands list、otto cmd、otto extract-content 和 otto test 的 CLI 参考  - 浏览可用浏览器命令、运行一次性操作、提取页面内容以及流式测试会话。"
keywords:
  - otto commands list
  - otto cmd
  - otto extract-content
  - otto test
  - 命令执行
  - 流跟踪
---

# 命令执行

浏览可用浏览器命令、运行一次性操作、从页面提取内容以及运行流式测试会话。

## `otto commands list`

列出连接节点上所有可用的命令，可选按站点过滤。

### 用法

```bash
otto commands list [options]
```

### 标志

| 标志 | 简写 | 必填 | 类型 | 默认值 | 描述 |
|---|---|---|---|---|---|
| `--site` | `-s` | 否 | string | | 按站点过滤（如 `reddit.com`） |
| `--node-id` | | 否 | string | 自动选择 | 目标节点 ID |
| `--json` | | 否 | boolean | false | 以 JSON 格式输出 |

### 示例

```bash
# 列出所有命令
otto commands list

# 列出特定站点的命令
otto commands list --site reddit.com

# 机器可读输出
otto commands list --json
```

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 命令已列出 |
| `1` | 无节点连接或中继错误 |

---

## `otto cmd`

在连接节点上执行单个命令操作。适用于原语和一次性命令。

### 用法

```bash
otto cmd [options]
```

### 标志

| 标志 | 简写 | 必填 | 类型 | 默认值 | 描述 |
|---|---|---|---|---|---|
| `--action` | `-a` | 是 | string | | 要执行的操作（如 `primitive.tab.open`） |
| `--payload` | `-p` | 否 | string | `{}` | JSON 负载字符串 |
| `--node-id` | | 否 | string | 自动选择 | 目标节点 ID |
| `--tab-session` | | 否 | string | | 标签页作用域操作的标签页会话 ID |
| `--timeout` | | 否 | number | 30000 | 命令超时（毫秒） |
| `--json` | | 否 | boolean | false | 以 JSON 格式输出结果并跳过交互式 TUI |

### 示例

```bash
# 打开受管理标签页
otto cmd --action primitive.tab.open --payload '{"url":"https://www.reddit.com"}'

# 从已打开标签页提取文本
otto cmd --action primitive.dom.extract_text --tab-session <tabSessionId>

# 通过 URL 截图
otto cmd --action primitive.page.screenshot --payload '{"url":"https://example.com"}'

# 直接运行站点命令
otto cmd --action command.run --payload '{"site":"reddit.com","command":"getPosts"}'
```

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 命令成功完成 |
| `1` | 命令失败、超时或中继错误 |

---

## `otto test`

以测试模式运行站点命令，对于流式命令可选流跟踪。

### 用法

```bash
otto test <site> <command> [options]
```

### 参数

| 参数 | 必填 | 描述 |
|---|---|---|
| `<site>` | 是 | 站点标识符（如 `reddit.com`） |
| `<command>` | 是 | 命令名称（如 `getChatMessages`） |

### 标志

| 标志 | 简写 | 必填 | 类型 | 默认值 | 描述 |
|---|---|---|---|---|---|
| `--payload` | `-p` | 否 | string | `{}` | 命令的 JSON 负载 |
| `--node-id` | | 否 | string | 自动选择 | 目标节点 ID |
| `--tab-session` | | 否 | string | | 现有标签页会话 ID（跳过自动打开） |
| `--timeout` | | 否 | number | 30000 | 命令超时（毫秒） |
| `--stream-follow-ms` | | 否 | number | | 命令完成后跟踪流更新的时长（毫秒） |
| `--stream-probe` | | 否 | boolean | false | 流订阅后立即强制流量探测 |
| `--stream-poll-interval-ms` | | 否 | number | | 用于支持轮询的流监听器模式的轮询间隔覆盖 |
| `--wait-for-interrupt` | | 否 | boolean | false | 保持受管理标签页打开直到 Ctrl+C |
| `--json` | | 否 | boolean | false | 以 JSON 格式输出（机器可读流帧） |

### 示例

```bash
# 运行简单站点命令测试
otto test reddit.com getPosts

# 带负载运行
otto test reddit.com getPosts --payload '{"limit":5}'

# 流跟踪聊天命令 45 秒
otto test reddit.com getChatMessages --stream-follow-ms 45000

# 带探测和 JSON 输出的流，用于自动化
otto test reddit.com getChatMessages --stream-probe --stream-follow-ms 45000 --json

# 测试后保持标签页打开
otto test reddit.com getPosts --wait-for-interrupt
```

### 流跟踪行为

设置 `--stream-follow-ms` 时，`otto test` 订阅命令返回的任何流清单，并跟踪监听器更新直到超时结束。按 `Ctrl+C` 提前取消 — 对活跃流测试发送 `command_cancel`，并关闭自动打开的标签页。

### 标签页自动打开

如果省略 `--tab-session`，`otto test` 自动打开一个标签页到命令的 `preloadHost`（如果可用），否则打开 `https://<site>`。测试后标签页自动关闭，除非设置了 `--wait-for-interrupt`。

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 测试成功完成 |
| `1` | 测试失败、超时、`manual_login_required` 或中继错误 |

---

## `otto extract-content`

通过一条命令提取页面内容，可选择输出格式。默认格式为 `markdown`。对于选择器开发和命令编写，推荐使用 `clean_html`。

### 用法

```bash
otto extract-content [url] [options]
```

### 参数

| 参数 | 必填 | 描述 |
|---|---|---|
| `[url]` | 否 | 要从中提取的页面 URL。提供 `--tab-session` 时可选。 |

### 标志

| 标志 | 简写 | 必填 | 类型 | 默认值 | 描述 |
|---|---|---|---|---|---|
| `--format` | | 否 | enum | `markdown` | `markdown`、`distilled_html`、`clean_html`、`raw_html` 或 `text` |
| `--tab-session` | | 否 | string | | 要从中提取的现有标签页会话 ID |
| `--selector` | | 否 | string | `body` | CSS 选择器（支持 `clean_html`、`raw_html` 和 `text`） |
| `--distill-mode` | | 否 | enum | `readability` | `readability` 或 `dom-distiller`（用于 `markdown` 和 `distilled_html`） |
| `--no-fallback-to-readability` | | 否 | boolean | false | 选择 `dom-distiller` 时禁用 readability 回退 |
| `--max-chars` | | 否 | number | | 支持格式的最大提取字符数 |
| `--node-id` | | 否 | string | 自动选择 | 目标节点 ID |
| `--timeout` | | 否 | number | 60000 | 命令超时（毫秒） |
| `--json` | | 否 | boolean | false | 输出完整 JSON 结果 |

### 示例

```bash
# 提取 markdown（默认）
otto extract-content https://example.com

# 提取蒸馏 HTML
otto extract-content https://example.com --format distilled_html

# 提取干净 HTML（推荐用于选择器构建）
otto extract-content https://example.com --format clean_html --selector article

# 从选择器提取原始 HTML
otto extract-content https://example.com --format raw_html --selector article

# 从现有受管理标签页提取文本
otto extract-content --format text --tab-session <tabSessionId>
```

### 行为说明

- 提供 `[url]` 或 `--tab-session` 之一。
- 对于 `--format text` 和仅 URL 调用，Otto 自动打开临时受管理标签页，提取文本，然后关闭标签页。
- `--selector` 对于 `markdown` 和 `distilled_html` 被拒绝。
- `clean_html` 保留语义属性，同时移除脚本/样式/内联处理程序，通常是 DOM 调试的最佳格式。

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 提取成功完成 |
| `1` | 提取失败、输入验证失败或中继错误 |

---

## 相关命令

- [otto listener subscribe-network](./listener.md) — 手动订阅网络事件。
- [命令参考](../commands.md) — 完整操作面和站点命令模型。
