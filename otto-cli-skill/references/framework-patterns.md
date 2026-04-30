# Otto Framework Patterns

Reusable workflow patterns for Otto automation.

## Pattern 1: Open tab and run command

The most common pattern: open a tab to a site, then run a site-specific command.

```bash
# Step 1: Open a managed tab
otto cmd --action primitive.tab.open --payload '{"url":"https://www.reddit.com"}' --json
# Returns: { tabSessionId: "...", ... }

# Step 2: Run command on that tab
otto cmd --action command.run --tab-session <tabSessionId> --payload '{"site":"reddit.com","command":"getFeed"}' --json
```

## Pattern 2: Quick test flow

For development/testing, `otto test` combines tab open + command execution:

```bash
otto test reddit.com getFeed --json
```

## Pattern 3: Streaming command output

For commands that produce real-time updates (chat messages, live feeds):

```bash
# Follow stream for 30 seconds
otto test reddit.com getChatMessages --stream-follow-ms 30000 --json

# Force immediate traffic to validate listener wiring
otto test reddit.com getChatMessages --stream-probe --stream-follow-ms 30000 --json
```

## Pattern 4: Network interception

Monitor network traffic on a specific tab:

```bash
# Subscribe to network events
otto listener subscribe-network \
  --tab-session <tabSessionId> \
  --site reddit.com \
  --pattern 'https://*.reddit.com/api/*' \
  --mode network \
  --max-body-bytes 200000

# Unsubscribe when done
otto listener unsubscribe --target-request-id <subscribeRequestId>
```

## Pattern 5: Screenshot capture

Capture and save a screenshot:

```bash
# Save to specific path
otto screenshot https://www.reddit.com --out ./screenshot.png --json

# Open in Preview (macOS)
otto screenshot https://www.reddit.com --json
```

## Pattern 6: Failure correlation

When a command fails, correlate by requestId:

```bash
# Step 1: Note the requestId from the failed command
# Step 2: Pull correlated logs
otto logs list --request-id <requestId> --source all --json

# Step 3: If extension-side issue, check node logs
otto logs list --request-id <requestId> --source node --json
```

## Pattern 7: Agent automation (MCP)

For AI agents using Otto via MCP:

1. Call `otto_status` to verify relay is running.
2. Call `otto_commands_list` to discover available commands.
3. Call `otto_cmd` with `primitive.tab.open` to open a tab.
4. Call `otto_cmd` with `command.run` to execute site commands.
5. Handle `manual_login_required` by asking user to log in.
6. Handle `acl_missing_node_grant` by asking user to approve access.

## Pattern 8: CI/automation (non-interactive)

For CI pipelines:

```bash
# Setup without prompts
otto setup --relay-url ws://127.0.0.1:8787?role=controller --non-interactive

# All commands use --json for machine parsing
otto commands list --json
otto test reddit.com getFeed --json

# Enforce caller-side timeouts
timeout 60 otto test reddit.com getFeed --json
```

## Pattern 9: Multi-machine deployment

When relay, node, and controller are on different machines:

```bash
# Controller side: point to remote relay
otto config --relay-url wss://relay.example.com?role=controller

# Verify connectivity
otto commands list --json
```

Requirements:
- Relay must be reachable from both node and controller.
- Use `wss://` and `https://` for remote traffic.
- Firewall must allow WebSocket upgrades on relay port.

## Pattern 10: Auto-register and cleanup (test flows)

For automated test flows that need a controller:

```bash
# otto test auto-registers if no controller exists
otto test reddit.com getFeed --controller-name "test-runner" --json

# Clean up after test
# (use --cleanup-test-controller when available)
```
