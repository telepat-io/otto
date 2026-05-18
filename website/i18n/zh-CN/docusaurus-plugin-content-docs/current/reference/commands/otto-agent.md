---
title: otto agent
description: "管理 Otto 代理框架集成（安装、卸载、状态）。"
keywords:
  - 代理
  - 安装
  - MCP
  - 框架
---

# otto agent

管理 Otto 代理框架集成。

## 子命令

### otto agent install

在代理框架中注册 Otto MCP 服务器。

```bash
otto agent install <runtime>
```

**参数：**

| 参数 | 描述 |
|----------|-------------|
| `<runtime>` | 要注册的代理运行时 |

**支持的运行时：**

- `claude` — Claude Code（`~/.claude/settings.json`）
- `claude-desktop` — Claude Desktop（平台特定配置）
- `chatgpt` — ChatGPT Desktop（打印手动指引）
- `gemini` — Gemini CLI（`~/.gemini/settings.json`）
- `codex` — Codex（`~/.codex/config.toml`）
- `cursor` — Cursor（`~/.cursor/mcp.json`）
- `vscode` — VS Code（`.vscode/mcp.json`）
- `opencode` — OpenCode（`opencode.json`）
- `generic-mcp` — 打印 JSON 配置以手动注册

### otto agent uninstall

从代理框架中移除 Otto MCP 服务器。

```bash
otto agent uninstall <runtime>
```

仅移除 Otto 拥有的条目。保留其他 MCP 服务器。

### otto agent status

显示代理框架集成状态。

```bash
otto agent status [--json]
```

**选项：**

| 选项 | 描述 |
|--------|-------------|
| `--json` | 以 JSON 格式输出 |

## 输出和退出码

| 退出码 | 含义 |
|-----------|---------|
| 0 | 成功 |
| 1 | 无效的运行时或操作失败 |

## 示例

```bash
# 向 Claude Code 注册
otto agent install claude

# 向多个框架注册
otto agent install cursor
otto agent install vscode

# 检查状态
otto agent status
otto agent status --json

# 从 Claude Code 卸载
otto agent uninstall claude
```

## 相关命令

- `otto mcp` — 直接启动 MCP 服务器
- `otto setup` — 初始 Otto 安装

## 相关页面

- [代理安装](../../for-agents/agent-setup.md)
- [MCP 服务器](../../for-agents/mcp-server.md)
- [For Agents](/for-agents/)
