---
title: MCP 服务器
sidebar_position: 3
description: "如何使用 Otto 的 MCP 服务器实现代理对浏览器自动化的编程式访问。"
keywords:
  - MCP
  - Model Context Protocol
  - 代理
  - 自动化
  - 工具
---

# MCP 服务器

Otto 提供第一方 MCP（Model Context Protocol）服务器用于编程式代理访问。服务器通过 stdio 传输将 Otto 的完整命令面作为 MCP 工具暴露。

## 启动服务器

```bash
otto mcp
```

服务器在 stdio 传输上运行，旨在由 MCP 客户端（代理框架）启动。它不接受交互式输入。

## 传输和范围

- **传输**：stdio（stdout 上为 JSON-RPC 消息，stderr 上为日志）
- **目标用途**：本地进程启动的 MCP 客户端
- **协议**：MCP 1.0，支持 initialize、tools/list 和 tools/call

## 可用工具

服务器暴露 25 个按类别分组的工具：

### 状态工具

| 工具 | 描述 |
|------|-------------|
| `otto_status` | 显示中继守护进程状态（运行中、端口、pid） |
| `otto_commands_list` | 列出已连接节点上的可用命令 |

### 执行工具

| 工具 | 描述 |
|------|-------------|
| `otto_cmd` | 向已连接节点发送命令 |
| `otto_test` | 运行站点命令进行测试（需要时自动注册控制器） |
| `otto_screenshot` | 捕获 URL 截图 |
| `otto_extract_content` | 使用一个工具提取内容（`markdown`、`distilled_html`、`clean_html`、`raw_html`、`text`） |

### 观测工具

| 工具 | 描述 |
|------|-------------|
| `otto_logs_list` | 列出历史中继日志，支持可选过滤器 |
| `otto_logs_follow` | 在有界持续时间内跟踪实时中继日志 |
| `otto_logs_export` | 将中继日志导出为结构化数据 |
| `otto_listener_subscribe_network` | 在标签页上订阅网络拦截更新 |
| `otto_listener_unsubscribe` | 取消订阅活跃的监听器 |

### 生命周期工具

| 工具 | 描述 |
|------|-------------|
| `otto_setup` | 运行 Otto setup |
| `otto_start` | 启动中继守护进程 |
| `otto_stop` | 停止中继守护进程 |
| `otto_extension_update` | 下载并安装最新的扩展构件 |
| `otto_extension_info` | 显示已安装扩展的元数据 |

### 身份工具

| 工具 | 描述 |
|------|-------------|
| `otto_pair` | 批准配对码以注册节点 |
| `otto_authcode` | 列出待处理的配对授权码 |
| `otto_revoke` | 撤销存储的刷新令牌并清除本地认证 |
| `otto_client_register` | 注册新的控制器客户端 |
| `otto_client_login` | 将客户端凭据交换为访问/刷新令牌 |
| `otto_client_status` | 显示本地控制器客户端状态 |
| `otto_client_forget` | 删除存储的客户端密钥并清除本地认证 |
| `otto_client_remove` | 在中继上移除已注册的控制器客户端 |

### 配置工具

| 工具 | 描述 |
|------|-------------|
| `otto_config` | 读取或更新 Otto 配置 |

## MCP 调用示例

### 列出工具

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

### 检查状态

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "otto_status",
    "arguments": {}
  }
}
```

你也可以使用 `nodes: true` 请求已连接的节点 ID：

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "otto_status",
    "arguments": { "nodes": true }
  }
}
```

### 运行命令

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "otto_cmd",
    "arguments": {
      "action": "command.run",
      "payload": "{\"site\":\"reddit.com\",\"command\":\"getFeed\"}"
    }
  }
}
```

### 提取内容（默认 markdown）

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "otto_extract_content",
    "arguments": {
      "url": "https://example.com"
    }
  }
}
```

`otto_extract_content` 输入要点：
- `format`：`markdown`（默认）、`distilled_html`、`clean_html`、`raw_html`、`text`
- 目标选择：提供 `url` 或 `tabSession`
- `selector`：支持 `clean_html`、`raw_html` 和 `text`
- `distillMode` / `fallbackToReadability`：用于 `markdown` 和 `distilled_html`

对于选择器发现和命令编写流程，使用 `format: "clean_html"`。

## 错误处理

所有工具以 MCP 标准格式返回错误：

```json
{
  "content": [{ "type": "text", "text": "Error message" }],
  "isError": true
}
```

常见错误码：

| 错误 | 含义 |
|-------|---------|
| `Missing controllerAccessToken` | 运行 `otto client login` 或 `otto pair <code>` |
| `Missing targetNodeId` | 有多个节点已连接；传入 `nodeId` 参数 |
| `manual_login_required` | 请求用户手动登录站点 |
| `acl_missing_node_grant` | 请求用户在扩展弹窗中批准控制器 |

## 故障排查

| 症状 | 可能原因 | 修复 |
|---------|-------------|-----|
| 服务器立即退出 | Stdio 传输错误 | 确保在正确的 MCP 客户端上下文中运行 |
| 代理中看不到工具 | 服务器未注册 | 运行 `otto agent install <runtime>` |
| 命令因认证错误失败 | 控制器未认证 | 运行 `otto client login` |
| `targetNodeId` 错误 | 没有节点连接 | 验证扩展已加载并已连接 |

## 相关页面

- [代理安装](./agent-setup.md) — 向代理框架注册 Otto
- [Skills](./skills.md) — 用于代理工作流的 Otto Skill 包
- [For Agents](/for-agents/) — 代理约束和决策流程
- [otto mcp 命令参考](../reference/commands/otto-mcp.md)
