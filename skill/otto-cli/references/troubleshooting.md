# Otto Troubleshooting

Known failures, diagnosis paths, and remediation.

## Connection issues

| Symptom | Likely cause | Verify | Fix |
|---------|-------------|--------|-----|
| `otto status` shows not running | Relay daemon stopped | Check `otto status` | Run `otto start` |
| `otto commands list` fails | Relay not running or node offline | `otto status` + check extension popup | Start relay, verify extension connected |
| `ECONNREFUSED` on relay URL | Wrong relay URL or port | Check `~/.otto/config.json` relayUrl | Run `otto config --relay-url <correct-url>` |
| Auth fails with `invalid_access_token` | Token expired, refresh failed | Check `otto client status` | Run `otto client login` |
| `Timed out waiting for auth_ack` | Relay unreachable or version mismatch | Verify relay is running on expected port | Restart relay, check version |
| `otto commands list --json` returns `[]` | No extension node connected | `otto status` + check `chrome://extensions` | Follow empty nodes recovery: load extension, set relay URL, run pairing flow |
| `otto authcode` returns empty array | No node has requested a pairing challenge | Open extension popup | Extension auto-requests a challenge when popup opens; re-run `otto authcode` |
| Extension popup shows "Waiting..." indefinitely | Pairing code not yet approved | Run `otto authcode` to see pending codes | Run `otto pair <code>` with the displayed code |

## Node issues

| Symptom | Likely cause | Verify | Fix |
|---------|-------------|--------|-----|
| `Missing targetNodeId` | No node connected or multiple nodes | Check extension popup | Connect node or pass `--node-id` |
| `node_offline` | Extension disconnected | Check Chrome extension | Reload extension, check relay URL in popup |
| `acl_missing_node_grant` | Controller not approved | Check extension popup > Controller Access | Approve controller in extension |
| `site_mismatch` | Tab URL doesn't match command site | Check active tab URL | Open correct URL with `primitive.tab.open` |

## Command issues

| Symptom | Likely cause | Verify | Fix |
|---------|-------------|--------|-----|
| `manual_login_required` | Site needs authentication | Check command result | Ask user to log in manually, retry |
| `timed_out` | Command took too long | Check `--timeout` value | Increase timeout or simplify command |
| `forbidden_action` | Controller lacks required scopes | Check token scopes | Re-login with broader scopes |
| `replay_rejected` | Duplicate command detected | Check idempotency key | Generate fresh command |

## Extension issues

| Symptom | Likely cause | Verify | Fix |
|---------|-------------|--------|-----|
| Extension not loading | Wrong path or corrupted build | Check `chrome://extensions` | Run `otto extension update`, reload |
| Extension shows disconnected | Wrong relay URL in popup | Check extension popup settings | Set correct relay URL |
| Commands hang | Extension crashed or tab closed | Check extension status | Reload extension, open new tab |

## MCP issues

| Symptom | Likely cause | Verify | Fix |
|---------|-------------|--------|-----|
| `otto mcp` exits immediately | Stdio transport error | Check stderr output | Ensure running in proper MCP client context |
| Tools not appearing in agent | MCP server not registered | Run `otto agent status` | Run `otto agent install <runtime>` |
| Agent can't connect to MCP | Wrong command path in config | Check agent MCP config | Verify `otto` is on PATH, re-run install |

## Diagnostic commands

```bash
# Full stack health check
otto commands list --json

# Check relay status
otto status

# View recent logs
otto logs list --source all --latest 50 --json

# Correlate failure by requestId
otto logs list --request-id <requestId> --source all --json

# Follow live logs
otto logs follow --source all --json

# Check controller auth
otto client status --json

# Check extension metadata
otto extension info
```
