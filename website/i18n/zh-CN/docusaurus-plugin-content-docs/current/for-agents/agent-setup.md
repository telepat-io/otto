---
title: 代理安装
sidebar_position: 5
description: "向 AI 代理框架注册 Otto，用于基于 MCP 的浏览器自动化。"
keywords:
  - 代理安装
  - MCP 注册
  - Claude
  - Cursor
  - VS Code
  - Codex
  - Gemini
  - OpenCode
---

# 代理安装

向 AI 代理框架注册 Otto 的 MCP 服务器，用于编程式浏览器自动化。

## 快速开始

```bash
# 向 Claude Code 注册
otto agent install claude

# 向 Cursor 注册
otto agent install cursor

# 向 VS Code 注册
otto agent install vscode

# 检查注册状态
otto agent status
```

## 支持的框架

| 框架 | 运行时 ID | 配置目标 | 格式 |
|-----------|-----------|---------------|--------|
| Claude Code | `claude` | `~/.claude/settings.json` | JSON |
| Claude Desktop | `claude-desktop` | 平台特定的 Claude Desktop 配置 | JSON |
| ChatGPT Desktop | `chatgpt` | 通过开发者模式手动设置 | N/A |
| Gemini CLI | `gemini` | `~/.gemini/settings.json` | JSON |
| Codex | `codex` | `~/.codex/config.toml` | TOML |
| Cursor | `cursor` | `~/.cursor/mcp.json` | JSON |
| VS Code | `vscode` | `.vscode/mcp.json`（工作区） | JSON |
| OpenCode | `opencode` | `opencode.json`（项目根目录） | JSON |
| Generic | `generic-mcp` | 打印到 stdout | 手动 |

## 各框架安装

### Claude Code

```bash
otto agent install claude
```

在 `~/.claude/settings.json` 的 `mcpServers` 下注册 `otto` MCP 服务器。

### Claude Desktop

```bash
otto agent install claude-desktop
```

在 Claude Desktop 配置中注册（macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`）。

### ChatGPT Desktop

```bash
otto agent install chatgpt
```

打印手动安装指引。ChatGPT Desktop 需要通过开发者模式提供远程 HTTP MCP 端点。

### Gemini CLI

```bash
otto agent install gemini
```

在 `~/.gemini/settings.json` 的 `mcpServers` 下注册。

### Codex

```bash
otto agent install codex
```

向 `~/.codex/config.toml` 追加 `[mcp_servers.otto]` 段。

### Cursor

```bash
otto agent install cursor
```

在 `~/.cursor/mcp.json` 的 `mcpServers` 下注册。

### VS Code

```bash
otto agent install vscode
```

在 `.vscode/mcp.json` 的 `servers` 下注册（工作区范围）。

### OpenCode

```bash
otto agent install opencode
```

在 `opencode.json` 的 `mcp` 下注册（项目根目录）。

### Generic MCP

```bash
otto agent install generic-mcp
```

打印 JSON 配置片段，用于在任何兼容 MCP 的框架中手动注册。

## 卸载

```bash
otto agent uninstall <runtime>
```

仅从框架配置中移除 Otto 拥有的条目。其他 MCP 服务器被保留。

## 验证

注册后，验证安装：

1. 重启或重载代理框架。
2. 检查 Otto 工具是否出现在框架的工具列表中。
3. 运行一个简单命令（例如 `otto_status`）以验证连通性。

## 手动注册

如果 `otto agent install` 对你的框架不起作用，手动注册：

```json
{
  "mcpServers": {
    "otto": {
      "command": "otto",
      "args": ["mcp"]
    }
  }
}
```

VS Code：

```json
{
  "servers": {
    "otto": {
      "type": "stdio",
      "command": "otto",
      "args": ["mcp"]
    }
  }
}
```

## 故障排查

| 症状 | 可能原因 | 修复 |
|---------|-------------|-----|
| 工具未出现 | 框架未重启 | 注册后重启框架 |
| 服务器启动失败 | `otto` 不在 PATH 上 | 使用 `which otto` 验证或使用绝对路径 |
| 代理中认证错误 | 控制器未登录 | 运行 `otto client login` |

## 相关页面

- [MCP 服务器](./mcp-server.md) — MCP 服务器文档和工具列表
- [Skills](./skills.md) — Otto Skill 包
- [For Agents](/for-agents/) — 代理约束和决策流程
- [otto agent 命令参考](../reference/commands/otto-agent.md)
