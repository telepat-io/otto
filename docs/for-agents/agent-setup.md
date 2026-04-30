---
title: Agent Setup
sidebar_position: 5
description: Register Otto with AI agent frameworks for MCP-based browser automation.
keywords:
  - agent setup
  - MCP registration
  - Claude
  - Cursor
  - VS Code
  - Codex
  - Gemini
  - OpenCode
---

# Agent Setup

Register Otto's MCP server with AI agent frameworks for programmatic browser automation.

## Quick start

```bash
# Register with Claude Code
otto agent install claude

# Register with Cursor
otto agent install cursor

# Register with VS Code
otto agent install vscode

# Check registration status
otto agent status
```

## Supported frameworks

| Framework | Runtime ID | Config target | Format |
|-----------|-----------|---------------|--------|
| Claude Code | `claude` | `~/.claude/settings.json` | JSON |
| Claude Desktop | `claude-desktop` | Platform-specific Claude Desktop config | JSON |
| ChatGPT Desktop | `chatgpt` | Manual setup via Developer Mode | N/A |
| Gemini CLI | `gemini` | `~/.gemini/settings.json` | JSON |
| Codex | `codex` | `~/.codex/config.toml` | TOML |
| Cursor | `cursor` | `~/.cursor/mcp.json` | JSON |
| VS Code | `vscode` | `.vscode/mcp.json` (workspace) | JSON |
| OpenCode | `opencode` | `opencode.json` (project root) | JSON |
| Generic | `generic-mcp` | Printed to stdout | Manual |

## Per-framework setup

### Claude Code

```bash
otto agent install claude
```

Registers `otto` MCP server in `~/.claude/settings.json` under `mcpServers`.

### Claude Desktop

```bash
otto agent install claude-desktop
```

Registers in Claude Desktop config (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`).

### ChatGPT Desktop

```bash
otto agent install chatgpt
```

Prints manual setup instructions. ChatGPT Desktop requires a remote HTTP MCP endpoint via Developer Mode.

### Gemini CLI

```bash
otto agent install gemini
```

Registers in `~/.gemini/settings.json` under `mcpServers`.

### Codex

```bash
otto agent install codex
```

Appends `[mcp_servers.otto]` section to `~/.codex/config.toml`.

### Cursor

```bash
otto agent install cursor
```

Registers in `~/.cursor/mcp.json` under `mcpServers`.

### VS Code

```bash
otto agent install vscode
```

Registers in `.vscode/mcp.json` under `servers` (workspace scope).

### OpenCode

```bash
otto agent install opencode
```

Registers in `opencode.json` under `mcp` (project root).

### Generic MCP

```bash
otto agent install generic-mcp
```

Prints a JSON config snippet for manual registration in any MCP-compatible framework.

## Uninstalling

```bash
otto agent uninstall <runtime>
```

Removes only Otto-owned entries from the framework config. Other MCP servers are preserved.

## Verification

After registration, verify the setup:

1. Restart or reload the agent framework.
2. Check that Otto tools appear in the framework's tool list.
3. Run a simple command (e.g. `otto_status`) to verify connectivity.

## Manual registration

If `otto agent install` doesn't work for your framework, register manually:

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

For VS Code:

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

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Tools not appearing | Framework not restarted | Restart framework after registration |
| Server fails to start | `otto` not on PATH | Verify with `which otto` or use absolute path |
| Auth errors in agent | Controller not logged in | Run `otto client login` |

## Related pages

- [MCP Server](./mcp-server.md) — MCP server documentation and tool list
- [Skills](./skills.md) — Otto skill packages
- [For Agents](/for-agents/) — agent constraints and decision flow
- [otto agent command reference](../reference/commands/otto-agent.md)
