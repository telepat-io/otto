---
title: otto mcp
description: "在 stdio 上启动 Otto MCP 服务器以进行代理访问。"
keywords:
  - mcp
  - 服务器
  - 代理
  - stdio
---

# otto mcp

在 stdio 上启动 Otto MCP 服务器以进行代理访问。

## 用法

```bash
otto mcp
```

## 此命令的功能

启动一个 MCP（Model Context Protocol）服务器，通过 stdio 传输将 Otto 的完整命令面作为 MCP 工具暴露。服务器旨在由 MCP 客户端（代理框架）启动，并通过 stdout 上的 JSON-RPC 消息进行通信。

## 传输和范围

- **传输**：stdio
- **协议**：MCP 1.0
- **目标用途**：本地进程启动的 MCP 客户端
- **日志**：仅 stderr（stdout 保留用于协议消息）

## 可用工具

服务器暴露 25 个工具：

**状态**：`otto_status`（支持 `nodes: true`）、`otto_commands_list`

**执行**：`otto_cmd`、`otto_test`、`otto_screenshot`、`otto_extract_content`

**观测**：`otto_logs_list`、`otto_logs_follow`、`otto_logs_export`、`otto_listener_subscribe_network`、`otto_listener_unsubscribe`

**生命周期**：`otto_setup`、`otto_start`、`otto_stop`、`otto_extension_update`、`otto_extension_info`

**身份**：`otto_pair`、`otto_authcode`、`otto_revoke`、`otto_client_register`、`otto_client_login`、`otto_client_status`、`otto_client_forget`、`otto_client_remove`

**配置**：`otto_config`

## 输出和退出码

| 退出码 | 含义 |
|-----------|---------|
| 0 | 服务器正常退出 |
| 1 | 服务器错误（查看 stderr 获取详情） |

## 相关命令

- `otto agent install <runtime>` — 在代理框架中注册 MCP 服务器
- `otto agent status` — 检查代理框架集成状态
- `otto commands list` — 列出已连接节点上的可用命令

## 相关页面

- [MCP 服务器文档](../../for-agents/mcp-server.md)
- [代理安装](../../for-agents/agent-setup.md)
- [For Agents](/for-agents/)
