---
title: 示例
sidebar_position: 4
description: "@telepat/otto-sdk 的真实场景使用示例  - 流式传输、错误处理、重试、Cloudflare Workers、CI 自动化和配对工作流。"
keywords:
  - otto sdk 示例
  - 流式传输
  - cloudflare workers
  - ci 自动化
  - 配对
---

# 示例

`@telepat/otto-sdk` 的真实场景模式。

## 流式传输监听器更新

使用 `for await` 语法是消费流数据的最简洁方式：

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

let count = 0;
for await (const event of stream) {
  console.log(`[${event.emittedAt}]`, event.data);
  if (++count >= 20) break;
}

await client.disconnect();
```

## EventEmitter 流模式

适用于需要在基于回调的架构中处理事件的情况：

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

await stream.start();
setTimeout(() => stream.unsubscribe(), 60_000);
```

## 错误处理

使用类型化错误层次结构实现精确控制：

```typescript
import {
  OttoClient,
  OttoAuthError,
  OttoTimeoutError,
  OttoCommandError,
  OttoError,
} from '@telepat/otto-sdk';

async function runWithErrorHandling() {
  const client = new OttoClient({ ... });
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
      throw new Error('Credentials rejected — rotate OTTO_CLIENT_SECRET');
    }
    if (err instanceof OttoTimeoutError) {
      console.warn('Command timed out, skipping node');
      return null;
    }
    if (err instanceof OttoCommandError) {
      if (err.commandOutcome === 'failed') {
        console.error('Command failed on node:', err.message);
      }
      return null;
    }
    if (err instanceof OttoError) {
      console.error('Relay error:', err.message);
      return null;
    }
    throw err;
  } finally {
    await client.disconnect();
  }
}
```

## 带指数退避的重试

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

SDK 没有 Node.js 特定依赖，因此可在任何 WinterTC 兼容运行时中工作：

```typescript
import { OttoClient } from '@telepat/otto-sdk';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
        input: { subreddit: 'programming', limit: 25 },
        timeoutMs: 20_000,
      });
      return Response.json(result.data);
    } finally {
      await client.disconnect();
    }
  },
};
```

## CI / 定时自动化

```typescript
const SITES = [
  { site: 'reddit.com', command: 'getPosts', input: { subreddit: 'typescript' } },
  { site: 'reddit.com', command: 'getPosts', input: { subreddit: 'javascript' } },
];

async function main() {
  const client = new OttoClient({ ... });
  await client.connect();
  const nodes = await client.nodes.list();
  if (nodes.length === 0) { process.exit(1); }
  const nodeId = nodes[0].nodeId;
  const results = await Promise.allSettled(
    SITES.map((task) => client.commands.run({ nodeId, ...task, timeoutMs: 45_000 })),
  );
  // 处理结果...
  await client.disconnect();
}
```

## 配对工作流

从应用中批准新的扩展连接：

```typescript
const client = new OttoClient({ ... });
await client.connect();
const pending = await client.pairing.listPending();
for (const challenge of pending) {
  console.log(`  - Code: ${challenge.code}  (node: ${challenge.nodeId})`);
}
// 交互式批准或自动批准...
await client.disconnect();
```

## 受信任环境中的自动批准

```typescript
async function autoApprovePending(client: OttoClient): Promise<void> {
  const pending = await client.pairing.listPending();
  for (const challenge of pending) {
    await client.pairing.approve({ code: challenge.code });
    console.log(`Auto-approved pairing: ${challenge.nodeId}`);
  }
}
```

## 等待节点可用

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
```

## TypeScript — 类型化命令输入

定义常用命令的模式以在编译时捕获错误：

```typescript
interface GetFeedInput {
  subreddit: string;
  limit?: number;
  sort?: 'hot' | 'new' | 'top';
}

interface GetFeedOutput {
  posts: Array<{ id: string; title: string; score: number; url: string }>;
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
  if (!result.ok) throw new Error(`getPosts failed: ${result.error}`);
  return result.data as GetFeedOutput;
}
```
