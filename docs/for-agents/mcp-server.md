---
title: MCP Server
sidebar_position: 3
description: How to use Otto's MCP server for programmatic agent access to browser automation.
keywords:
  - MCP
  - Model Context Protocol
  - agent
  - automation
  - tools
---

# MCP Server

Otto provides a first-party MCP (Model Context Protocol) server for programmatic agent access. The server exposes Otto's full command surface as MCP tools over stdio transport.

## Starting the server

```bash
otto mcp
```

The server runs on stdio transport and is intended to be spawned by an MCP client (agent framework). It does not accept interactive input.

## Transport and scope

- **Transport**: stdio (JSON-RPC messages on stdout, logs on stderr)
- **Intended usage**: local process-spawned MCP clients
- **Protocol**: MCP 1.0 with initialize, tools/list, and tools/call

## Available tools

The server exposes 24 tools organized by category:

### Status tools

| Tool | Description |
|------|-------------|
| `otto_status` | Show relay daemon status (running, port, pid) |
| `otto_commands_list` | List available commands from a connected node |

### Execution tools

| Tool | Description |
|------|-------------|
| `otto_cmd` | Send a command to a connected node |
| `otto_test` | Run a site command for testing (auto-registers controller if needed) |
| `otto_screenshot` | Capture a screenshot of a URL |

### Observation tools

| Tool | Description |
|------|-------------|
| `otto_logs_list` | List historical relay logs with optional filters |
| `otto_logs_follow` | Follow live relay logs for a bounded duration |
| `otto_logs_export` | Export relay logs as structured data |
| `otto_listener_subscribe_network` | Subscribe to network interception updates on a tab |
| `otto_listener_unsubscribe` | Unsubscribe an active listener |

### Lifecycle tools

| Tool | Description |
|------|-------------|
| `otto_setup` | Run Otto setup (configure relay, start daemon, download extension) |
| `otto_start` | Start the relay daemon |
| `otto_stop` | Stop the relay daemon |
| `otto_extension_update` | Download and install the latest extension artifact |
| `otto_extension_info` | Show installed extension metadata |

### Identity tools

| Tool | Description |
|------|-------------|
| `otto_pair` | Approve a pairing code to register a node |
| `otto_authcode` | List pending pairing auth codes |
| `otto_revoke` | Revoke stored refresh token and clear local auth |
| `otto_client_register` | Register a new controller client |
| `otto_client_login` | Exchange client credentials for access/refresh tokens |
| `otto_client_status` | Show local controller client state |
| `otto_client_forget` | Delete stored client secret and clear local auth |
| `otto_client_remove` | Remove registered controller client at relay |

### Config tools

| Tool | Description |
|------|-------------|
| `otto_config` | Read or update Otto configuration |

## Example MCP calls

### List tools

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

### Check status

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

### Run a command

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

## Error handling

All tools return errors in MCP standard format:

```json
{
  "content": [{ "type": "text", "text": "Error message" }],
  "isError": true
}
```

Common error codes:

| Error | Meaning |
|-------|---------|
| `Missing controllerAccessToken` | Run `otto client login` or `otto pair <code>` |
| `Missing targetNodeId` | Multiple nodes connected; pass `nodeId` argument |
| `manual_login_required` | Ask user to log in to the site manually |
| `acl_missing_node_grant` | Ask user to approve controller in extension popup |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Server exits immediately | Stdio transport error | Ensure running in proper MCP client context |
| Tools not appearing in agent | Server not registered | Run `otto agent install <runtime>` |
| Commands fail with auth error | Controller not authenticated | Run `otto client login` |
| `targetNodeId` errors | No node connected | Verify extension is loaded and connected |

## Related pages

- [Agent Setup](./agent-setup.md) — register Otto with agent frameworks
- [Skills](./skills.md) — Otto skill packages for agent workflows
- [For Agents](/for-agents/) — agent constraints and decision flow
- [otto mcp command reference](../reference/commands/otto-mcp.md)
