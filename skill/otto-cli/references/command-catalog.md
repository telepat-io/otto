# Otto Command Catalog

Full command and argument matrix for the Otto CLI.

## Top-level commands

| Command | Description | Key Options |
|---------|-------------|-------------|
| `otto start` | Start relay (daemon or attached) | `-a, --attached`, `--port <port>` (default 8787) |
| `otto stop` | Stop relay daemon | (none) |
| `otto restart` | Restart relay daemon | `-a, --attached`, `--port <port>` |
| `otto status` | Show relay daemon status | (none) |
| `otto config` | Configure relay and defaults | `--relay-url <url>`, `--relay-http-url <url>`, `--node-id <id>` |
| `otto setup` | Guided setup wizard | `--relay-url <url>`, `--yes`, `--force`, `--non-interactive`, `--output-dir`, `--release-base-url`, `--download-timeout-ms` |
| `otto settings` | Edit settings in TUI | (none) |
| `otto pair <code>` | Approve pairing code | `<code>` argument (e.g. `123-456`) |
| `otto authcode` | List pending auth codes | (none) |
| `otto revoke` | Revoke stored refresh token | (none) |
| `otto cmd` | Send a command to a node | `--action <action>` (required), `--tab-session`, `--node-id`, `--payload <json>`, `--timeout <ms>` |
| `otto test <site> <command>` | Run a site command for testing | `--node-id`, `--payload`, `--timeout`, `--auth-mode`, `--json`, `--stream-follow-ms`, `--stream-probe`, `--stream-listener-mode`, `--stream-poll-interval-ms` |
| `otto extract-content [url]` | Extract content in one command | `--format`, `--tab-session`, `--selector`, `--distill-mode`, `--no-fallback-to-readability`, `--max-chars`, `--node-id`, `--timeout`, `--json` |
| `otto screenshot <url>` | Capture a screenshot | `--mode`, `--format`, `--quality`, `--max-bytes`, `--node-id`, `--timeout`, `--out`, `--json` |
| `otto mcp` | Start MCP server on stdio | (none) |

## `otto extension` subcommands

| Command | Description | Key Options |
|---------|-------------|-------------|
| `otto extension update` | Download latest extension artifact | `--output-dir`, `--release-base-url`, `--download-timeout-ms` |
| `otto extension info` | Show installed extension metadata | (none) |

## `otto client` subcommands

| Command | Description | Key Options |
|---------|-------------|-------------|
| `otto client register` | Register a new controller client | `--name`, `--description`, `--avatar-seed` |
| `otto client login` | Exchange credentials for tokens | `--client-id`, `--client-secret` |
| `otto client status` | Show controller client state | `--client-id` |
| `otto client forget` | Delete stored secret and clear auth | `--client-id` |
| `otto client remove` | Remove controller at relay | `--client-id`, `--all` |

## `otto commands` subcommands

| Command | Description | Key Options |
|---------|-------------|-------------|
| `otto commands list` | List available commands from node | `--node-id`, `--site`, `--json`, `--timeout` |

## `otto listener` subcommands

| Command | Description | Key Options |
|---------|-------------|-------------|
| `otto listener subscribe-network` | Subscribe to network interception | `--tab-session` (required), `--site` (required), `--pattern`, `--request-host`, `--mode`, `--include-headers`, `--no-include-body`, `--max-body-bytes`, `--mime`, `--node-id`, `--timeout` |
| `otto listener unsubscribe` | Unsubscribe listener | `--target-request-id` (required), `--node-id`, `--timeout` |

## `otto logs` subcommands

| Command | Description | Key Options |
|---------|-------------|-------------|
| `otto logs list` | List historical logs | `--since`, `--level`, `--source`, `--latest`, `--node-id`, `--request-id` |
| `otto logs follow` | Follow live logs | `--level`, `--type`, `--source`, `--json` |
| `otto logs status` | Show log storage status | (none) |
| `otto logs export` | Export logs as JSON | `--since`, `--level`, `--source`, `--latest`, `--node-id`, `--request-id` |

## `otto agent` subcommands

| Command | Description | Key Options |
|---------|-------------|-------------|
| `otto agent install <runtime>` | Register MCP in agent framework | `<runtime>` argument (claude, claude-desktop, chatgpt, gemini, codex, cursor, vscode, opencode, generic-mcp) |
| `otto agent uninstall <runtime>` | Remove MCP from agent framework | `<runtime>` argument |
| `otto agent status` | Show integration status | `--json` |

## MCP tools (25 tools)

| Tool | Category | Required Args |
|------|----------|---------------|
| `otto_status` | Status | (none) |
| `otto_commands_list` | Status | (none) |
| `otto_cmd` | Execute | `action` |
| `otto_test` | Execute | `site`, `command` |
| `otto_screenshot` | Execute | `url` |
| `otto_extract_content` | Execute | (none) |
| `otto_logs_list` | Observe | (none) |
| `otto_logs_follow` | Observe | (none) |
| `otto_logs_export` | Observe | (none) |
| `otto_listener_subscribe_network` | Observe | `tabSession`, `site` |
| `otto_listener_unsubscribe` | Observe | `targetRequestId` |
| `otto_setup` | Lifecycle | (none) |
| `otto_start` | Lifecycle | (none) |
| `otto_stop` | Lifecycle | (none) |
| `otto_config` | Config | (none) |
| `otto_pair` | Identity | `code` |
| `otto_authcode` | Identity | (none) |
| `otto_revoke` | Identity | (none) |
| `otto_client_register` | Identity | (none) |
| `otto_client_login` | Identity | (none) |
| `otto_client_status` | Identity | (none) |
| `otto_client_forget` | Identity | (none) |
| `otto_client_remove` | Identity | (none) |
| `otto_extension_update` | Lifecycle | (none) |
| `otto_extension_info` | Lifecycle | (none) |
