---
title: otto agent
description: Manage Otto agent framework integrations (install, uninstall, status).
keywords:
  - agent
  - install
  - MCP
  - framework
---

# otto agent

Manage Otto agent framework integrations.

## Subcommands

### otto agent install

Register Otto MCP server in an agent framework.

```bash
otto agent install <runtime>
```

**Arguments:**

| Argument | Description |
|----------|-------------|
| `<runtime>` | Agent runtime to register with |

**Supported runtimes:**

- `claude` — Claude Code (`~/.claude/settings.json`)
- `claude-desktop` — Claude Desktop (platform-specific config)
- `chatgpt` — ChatGPT Desktop (prints manual instructions)
- `gemini` — Gemini CLI (`~/.gemini/settings.json`)
- `codex` — Codex (`~/.codex/config.toml`)
- `cursor` — Cursor (`~/.cursor/mcp.json`)
- `vscode` — VS Code (`.vscode/mcp.json`)
- `opencode` — OpenCode (`opencode.json`)
- `generic-mcp` — Prints JSON config for manual registration

### otto agent uninstall

Remove Otto MCP server from an agent framework.

```bash
otto agent uninstall <runtime>
```

Only removes Otto-owned entries. Other MCP servers are preserved.

### otto agent status

Show agent framework integration status.

```bash
otto agent status [--json]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

## Output and exit codes

| Exit code | Meaning |
|-----------|---------|
| 0 | Success |
| 1 | Invalid runtime or operation failed |

## Examples

```bash
# Register with Claude Code
otto agent install claude

# Register with multiple frameworks
otto agent install cursor
otto agent install vscode

# Check status
otto agent status
otto agent status --json

# Uninstall from Claude Code
otto agent uninstall claude
```

## Related commands

- `otto mcp` — start the MCP server directly
- `otto setup` — initial Otto setup

## Related pages

- [Agent Setup](../../for-agents/agent-setup.md)
- [MCP Server](../../for-agents/mcp-server.md)
- [For Agents](/for-agents/)
