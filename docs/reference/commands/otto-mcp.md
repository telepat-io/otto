---
title: otto mcp
description: Start the Otto MCP server on stdio for agent access.
keywords:
  - mcp
  - server
  - agent
  - stdio
---

# otto mcp

Start the Otto MCP server on stdio for agent access.

## Usage

```bash
otto mcp
```

## What this command does

Launches an MCP (Model Context Protocol) server that exposes Otto's full command surface as MCP tools over stdio transport. The server is designed to be spawned by an MCP client (agent framework) and communicates via JSON-RPC messages on stdout.

## Transport and scope

- **Transport**: stdio
- **Protocol**: MCP 1.0
- **Intended usage**: local process-spawned MCP clients
- **Logs**: stderr only (stdout is reserved for protocol messages)

## Available tools

The server exposes 25 tools:

**Status**: `otto_status` (supports `nodes: true`), `otto_commands_list`

**Execute**: `otto_cmd`, `otto_test`, `otto_screenshot`, `otto_extract_content`

**Observe**: `otto_logs_list`, `otto_logs_follow`, `otto_logs_export`, `otto_listener_subscribe_network`, `otto_listener_unsubscribe`

**Lifecycle**: `otto_setup`, `otto_start`, `otto_stop`, `otto_extension_update`, `otto_extension_info`

**Identity**: `otto_pair`, `otto_authcode`, `otto_revoke`, `otto_client_register`, `otto_client_login`, `otto_client_status`, `otto_client_forget`, `otto_client_remove`

**Config**: `otto_config`

## Output and exit codes

| Exit code | Meaning |
|-----------|---------|
| 0 | Server exited normally |
| 1 | Server error (check stderr for details) |

## Related commands

- `otto agent install <runtime>` — register MCP server in an agent framework
- `otto agent status` — check agent framework integration status
- `otto commands list` — list available commands from a connected node

## Related pages

- [MCP Server documentation](../../for-agents/mcp-server.md)
- [Agent Setup](../../for-agents/agent-setup.md)
- [For Agents](/for-agents/)
