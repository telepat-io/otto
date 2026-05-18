---
title: 监听器
sidebar_position: 10
description: "otto listener 命令的 CLI 参考  - 订阅网络拦截流、取消订阅和列出活跃监听器。"
keywords:
  - otto listener
  - subscribe-network
  - 网络拦截
  - 监听器取消订阅
  - otto listener list
---

# 监听器

订阅网络拦截流、管理活跃监听器和取消订阅。

## `otto listener subscribe-network`

在受管理标签页上订阅网络拦截监听器，流式传输捕获的 HTTP 响应。

### 用法

```bash
otto listener subscribe-network [options]
```

### 标志

| 标志 | 简写 | 必填 | 类型 | 默认值 | 允许值 | 描述 |
|---|---|---|---|---|---|---|
| `--tab-session` | | 是 | string | | | 要附加监听器的标签页会话 ID |
| `--site` | `-s` | 是 | string | | | 站点范围（如 `reddit.com`） — 根据标签页 URL 验证 |
| `--pattern` | | 否 | string[] | | | 要捕获的 URL glob 模式（可重复） |
| `--request-host` | | 否 | string[] | | | 显式跨主机允许列表（可重复） |
| `--mode` | | 否 | string | `network` | `network`、`fetch`、`hybrid` | 拦截捕获模式 |
| `--include-body` | | 否 | boolean | true | | 在更新中包含响应正文 |
| `--include-headers` | | 否 | boolean | false | | 包含响应头部（敏感头部脱敏） |
| `--max-body-bytes` | | 否 | number | 256000 | | 要捕获的最大响应正文字节数 |
| `--mime-types` | | 否 | string[] | | | MIME 前缀允许列表（可重复） |
| `--node-id` | | 否 | string | 自动选择 | | 目标节点 ID |
| `--json` | | 否 | boolean | false | | 以 NDJSON 格式输出流更新 |

### 示例

```bash
# Reddit API 流量的基础网络订阅
otto listener subscribe-network \
  --tab-session <tabSessionId> \
  --site reddit.com \
  --pattern 'https://www.reddit.com/api/*'

# 带正文限制的高容量捕获
otto listener subscribe-network \
  --tab-session <tabSessionId> \
  --site reddit.com \
  --request-host matrix.redditspace.com \
  --pattern 'https://matrix.redditspace.com/_matrix/client/v3/*' \
  --mode network \
  --max-body-bytes 200000

# 带头部和 JSON 输出的混合捕获
otto listener subscribe-network \
  --tab-session <tabSessionId> \
  --site reddit.com \
  --mode hybrid \
  --include-headers \
  --json
```

### 流输出

每个捕获的响应作为 `listener_update` 帧发出。流持续运行直到：

- 使用订阅 `requestId` 调用 `otto listener unsubscribe`
- 标签页会话关闭
- 按下 `Ctrl+C`（自动发送取消订阅）

订阅 `requestId` 在启动时打印 — 保存它以便稍后从另一个终端取消订阅。

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 已订阅并正在流式传输 |
| `1` | 订阅失败（无效标签页会话、站点不匹配等） |

---

## `otto listener unsubscribe`

按其订阅 `requestId` 取消订阅活跃的网络监听器。

### 用法

```bash
otto listener unsubscribe [options]
```

### 标志

| 标志 | 简写 | 必填 | 类型 | 默认值 | 描述 |
|---|---|---|---|---|---|
| `--target-request-id` | | 是 | string | | `subscribe-network` 返回的 `requestId` |
| `--node-id` | | 否 | string | 自动选择 | 目标节点 ID |

### 示例

```bash
otto listener unsubscribe --target-request-id <subscribeRequestId>
```

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 已成功取消订阅 |
| `1` | 监听器未找到或中继错误 |

---

## `otto listener list`

列出连接节点上的活跃网络监听器。

### 用法

```bash
otto listener list [options]
```

### 标志

| 标志 | 简写 | 必填 | 类型 | 默认值 | 描述 |
|---|---|---|---|---|---|
| `--node-id` | | 否 | string | 自动选择 | 目标节点 ID |
| `--json` | | 否 | boolean | false | 以 JSON 格式输出 |

### 示例

```bash
otto listener list

otto listener list --json
```

### 退出码

| 码 | 含义 |
|---|---|
| `0` | 监听器已列出 |
| `1` | 中继或节点错误 |

---

## 相关命令

- [otto test](./commands.md) — 运行支持流的命令，内置监听器管理。
- [监听器开发](../guides/listener-development.md) — 构建支持流的命令。
- [日志与调试](../logging-debugging.md) — 诊断监听器和流问题。
