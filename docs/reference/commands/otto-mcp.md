---
title: otto mcp
description: Start the Otto MCP server over stdio or Streamable HTTP for agent access.
keywords:
  - mcp
  - server
  - agent
  - stdio
  - http
---

# otto mcp

Start the Otto MCP server. Two transports are available as subcommands:

- `otto mcp serve` — stdio transport (for local, process-spawned agent clients)
- `otto mcp serve-http` — Streamable HTTP transport (for remote / container / ChatGPT-style hosts)

## Usage

```bash
# stdio (default for local agents)
otto mcp serve

# Streamable HTTP
otto mcp serve-http --api-key <key> [--port 3001] [--host 127.0.0.1] [--endpoint /mcp]
```

## What this command does

Launches an MCP (Model Context Protocol) server that exposes Otto's full command surface as MCP tools. Both subcommands register the identical tool set; they differ only in transport:

- **`serve`** communicates via JSON-RPC messages over stdio. It is designed to be spawned by an MCP client (agent framework). Logs go to stderr; stdout is reserved for protocol messages.
- **`serve-http`** serves the MCP protocol over Streamable HTTP on a network endpoint. Each client session is tracked by an `Mcp-Session-Id` header. Requests are authenticated with a bearer token and validated against an allowed-origin list.

## Transport and scope

| | `otto mcp serve` | `otto mcp serve-http` |
|---|---|---|
| Transport | stdio | Streamable HTTP |
| Intended usage | local process-spawned clients | remote / container / ChatGPT hosts |
| Auth | inherited from the spawning process | `Authorization: Bearer <api-key>` |
| Logs | stderr only | stdout |

## `serve-http` options

| Option | Default | Description |
|--------|---------|-------------|
| `--api-key <key>` | `OTTO_MCP_API_KEY` env var | Bearer token required on every request. Required (flag or env var). |
| `--port <port>` | `3001` | Port to listen on. |
| `--host <host>` | `127.0.0.1` | Host to bind to. Use `0.0.0.0` for network access. |
| `--endpoint <path>` | `/mcp` | HTTP path the MCP protocol is served on. |

The endpoint accepts `POST` (initialize a session / send requests), `GET` (SSE stream for an existing session), and `DELETE` (terminate a session). Requests without a valid `Bearer` token receive `401`/`403`; requests from a disallowed `Origin` receive `403`.

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
| 1 | Server error (check logs for details) |

## Related commands

- `otto agent install <runtime>` — register MCP server in an agent framework
- `otto agent status` — check agent framework integration status
- `otto commands list` — list available commands from a connected node

## Related pages

- [MCP Server documentation](../../for-agents/mcp-server.md)
- [Agent Setup](../../for-agents/agent-setup.md)
- [For Agents](/for-agents/)
