---
title: Examples
sidebar_position: 4
description: Real-world usage examples for @telepat/otto-sdk — streaming, error handling, retry, Cloudflare Workers, CI automation, and pairing workflows.
keywords:
  - otto sdk examples
  - streaming
  - cloudflare workers
  - ci automation
  - pairing
---

# Examples

Real-world patterns for `@telepat/otto-sdk`.

## Streaming listener updates

The `for await` syntax is the cleanest way to consume streaming data.

```typescript
import { OttoClient } from '@telepat/otto-sdk';

const client = new OttoClient({
  relayUrl: process.env.OTTO_RELAY_URL!,
  clientId: process.env.OTTO_CLIENT_ID!,
  clientSecret: process.env.OTTO_CLIENT_SECRET!,
});

await client.connect();
const [node] = await client.nodes.list();

const stream = client.listeners.subscribe({
  nodeId: node.nodeId,
  listener: 'network.http_intercept',
  options: { site: 'reddit.com', pattern: 'https://reddit.com/api/*' },
});

// Consume up to 20 events, then stop
let count = 0;
for await (const event of stream) {
  console.log(`[${event.emittedAt}]`, event.data);
  if (++count >= 20) break;
}

// break exits the loop and automatically calls unsubscribe()
await client.disconnect();
```

## EventEmitter streaming pattern

Useful when you need to handle events in a callbacks-based architecture (e.g., Express request handlers).

```typescript
const stream = client.listeners.subscribe({
  nodeId: node.nodeId,
  listener: 'network.http_intercept',
  options: { site: 'linkedin.com' },
});

stream.on('data', (event) => {
  myDatabase.insert({ timestamp: event.emittedAt, payload: event.data });
});

stream.on('error', (err) => {
  console.error('Stream error:', err.message);
  stream.unsubscribe();
});

stream.on('end', () => {
  console.log('Stream ended');
});

// Start the subscription (called automatically on first .on() too)
await stream.start();

// Stop after 60 seconds
setTimeout(() => stream.unsubscribe(), 60_000);
```

## Error handling

Use the typed error hierarchy for precise control.

```typescript
import {
  OttoClient,
  OttoAuthError,
  OttoTimeoutError,
  OttoCommandError,
  OttoError,
} from '@telepat/otto-sdk';

const client = new OttoClient({ ... });

async function runWithErrorHandling() {
  try {
    await client.connect();
    const nodes = await client.nodes.list();

    const result = await client.commands.run({
      nodeId: nodes[0].nodeId,
      site: 'reddit.com',
      command: 'getPosts',
      input: { subreddit: 'programming' },
      timeoutMs: 15_000,
    });

    return result.data;

  } catch (err) {
    if (err instanceof OttoAuthError) {
      // Rotate credentials and try once more
      throw new Error('Credentials rejected — rotate OTTO_CLIENT_SECRET');
    }
    if (err instanceof OttoTimeoutError) {
      // Node took too long — try a different node
      console.warn('Command timed out, skipping node');
      return null;
    }
    if (err instanceof OttoCommandError) {
      if (err.commandOutcome === 'failed') {
        console.error('Command failed on node:', err.message);
      } else {
        console.warn('Unexpected outcome:', err.commandOutcome);
      }
      return null;
    }
    if (err instanceof OttoError) {
      // Generic relay error
      console.error('Relay error:', err.message);
      return null;
    }
    throw err;

  } finally {
    await client.disconnect();
  }
}
```

## Retry with exponential back-off

```typescript
async function runWithRetry(
  client: OttoClient,
  options: Parameters<OttoClient['commands']['run']>[0],
  maxAttempts = 3,
): Promise<CommandResult> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await client.commands.run(options);
    } catch (err) {
      // Don't retry auth errors
      if (err instanceof OttoAuthError) throw err;

      lastError = err;
      const delayMs = Math.min(500 * 2 ** (attempt - 1), 8_000);
      console.warn(`Attempt ${attempt} failed, retrying in ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
```

## Cloudflare Workers

The SDK has no Node.js-specific dependencies, so it works in any WinterTC-compliant runtime.

```typescript
// worker.ts
import { OttoClient } from '@telepat/otto-sdk';

interface Env {
  OTTO_RELAY_URL: string;
  OTTO_CLIENT_ID: string;
  OTTO_CLIENT_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { searchParams } = new URL(request.url);
    const subreddit = searchParams.get('subreddit') ?? 'programming';

    const client = new OttoClient({
      relayUrl: env.OTTO_RELAY_URL,
      clientId: env.OTTO_CLIENT_ID,
      clientSecret: env.OTTO_CLIENT_SECRET,
    });

    await client.connect();

    try {
      const nodes = await client.nodes.list();
      if (nodes.length === 0) {
        return Response.json({ error: 'No nodes available' }, { status: 503 });
      }

      const result = await client.commands.run({
        nodeId: nodes[0].nodeId,
        site: 'reddit.com',
        command: 'getPosts',
        input: { subreddit, limit: 25 },
        timeoutMs: 20_000,
      });

      return Response.json(result.data);
    } finally {
      await client.disconnect();
    }
  },
} satisfies ExportedHandler<Env>;
```

## CI / scheduled automation

Run the SDK in a GitHub Actions workflow, Temporal worker, or any scheduled job.

```typescript
// scripts/collect-data.ts
import { OttoClient, OttoError } from '@telepat/otto-sdk';

const SITES: Array<{ site: string; command: string; input: Record<string, unknown> }> = [
  { site: 'reddit.com', command: 'getPosts', input: { subreddit: 'typescript' } },
  { site: 'reddit.com', command: 'getPosts', input: { subreddit: 'javascript' } },
];

async function main() {
  const client = new OttoClient({
    relayUrl: process.env.OTTO_RELAY_URL!,
    clientId: process.env.OTTO_CLIENT_ID!,
    clientSecret: process.env.OTTO_CLIENT_SECRET!,
  });

  await client.connect();
  const nodes = await client.nodes.list();

  if (nodes.length === 0) {
    console.error('No nodes available');
    process.exit(1);
  }

  const nodeId = nodes[0].nodeId;
  const results = await Promise.allSettled(
    SITES.map((task) =>
      client.commands.run({ nodeId, ...task, timeoutMs: 45_000 }),
    ),
  );

  for (const [i, outcome] of results.entries()) {
    const task = SITES[i];
    if (outcome.status === 'fulfilled') {
      console.log(`✓ ${task.site}/${task.command}:`, outcome.value.durationMs, 'ms');
    } else {
      console.error(`✗ ${task.site}/${task.command}:`, outcome.reason?.message);
    }
  }

  await client.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

## Pairing workflow

Approve new extension connections from your application rather than from the CLI.

```typescript
import { OttoClient } from '@telepat/otto-sdk';
import * as readline from 'node:readline/promises';

const client = new OttoClient({ ... });
await client.connect();

// Poll for pending challenges
const pending = await client.pairing.listPending();
console.log(`Found ${pending.length} pending pairing request(s):`);

for (const challenge of pending) {
  console.log(`  - Code: ${challenge.code}  (node: ${challenge.nodeId})`);
}

if (pending.length === 0) {
  console.log('No pending requests. Open the extension and click "Pair with controller".');
  await client.disconnect();
  process.exit(0);
}

// Interactively approve
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const code = await rl.question('Enter 6-digit code to approve: ');
rl.close();

await client.pairing.approve({ code });
console.log('Pairing approved!');

await client.disconnect();
```

## Auto-approve in trusted environments

In environments where you control both the relay and the extension, you can auto-approve all pending pairings at startup.

```typescript
async function autoApprovePending(client: OttoClient): Promise<void> {
  const pending = await client.pairing.listPending();
  for (const challenge of pending) {
    await client.pairing.approve({ code: challenge.code });
    console.log(`Auto-approved pairing: ${challenge.nodeId}`);
  }
}

await client.connect();
await autoApprovePending(client);
const nodes = await client.nodes.list();
// All freshly approved nodes now appear here
```

## Waiting for a node to become available

If you deploy a new node and want to wait for it to connect before running commands:

```typescript
async function waitForNode(client: OttoClient, maxWaitMs = 30_000): Promise<Node> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const nodes = await client.nodes.list();
    if (nodes.length > 0) return nodes[0];

    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(`No node connected after ${maxWaitMs}ms`);
}

const node = await waitForNode(client);
console.log('Node ready:', node.nodeId);
```

## TypeScript — typed command inputs

Define schemas for commands you use frequently to catch mistakes at compile time.

```typescript
interface GetFeedInput {
  subreddit: string;
  limit?: number;
  sort?: 'hot' | 'new' | 'top';
}

interface GetFeedOutput {
  posts: Array<{
    id: string;
    title: string;
    score: number;
    url: string;
  }>;
}

async function getRedditFeed(
  client: OttoClient,
  nodeId: string,
  input: GetFeedInput,
): Promise<GetFeedOutput> {
  const result = await client.commands.run({
    nodeId,
    site: 'reddit.com',
    command: 'getPosts',
    input: input as Record<string, unknown>,
    timeoutMs: 20_000,
  });

  if (!result.ok) {
    throw new Error(`getPosts failed: ${result.error}`);
  }

  return result.data as GetFeedOutput;
}
```
