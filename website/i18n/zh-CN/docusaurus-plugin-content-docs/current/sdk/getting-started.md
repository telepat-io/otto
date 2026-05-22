---
title: 快速开始
sidebar_position: 2
description: "安装 @telepat/otto-sdk，向中继注册控制器客户端，在 JavaScript 或 TypeScript 应用中运行第一个命令。"
keywords:
  - otto sdk
  - 快速开始
  - 安装
  - 控制器注册
  - 第一个命令
---

# JavaScript SDK 快速开始

本指南带你从零开始，通过 `@telepat/otto-sdk` 运行第一个命令。

## 前置条件

- 一个正在运行的 Otto 中继（`otto start`）。如果尚未设置，参见[安装](/installation)。
- Node.js 22+（或边缘运行时 — 参见[边缘运行时](#边缘运行时)）。
- npm、yarn 或 pnpm。

## 步骤 1 — 注册控制器客户端

SDK 作为**控制器客户端**进行认证。在使用 SDK 之前，你需要从中继获得一个 `clientId` 和 `clientSecret`。

**通过 Otto CLI（推荐）：**

```bash
otto client register --name "My App"
```

这会打印 `clientId` 和 `clientSecret`。安全存储它们 — 中继仅存储密钥的哈希，无法恢复。

**通过 HTTP（中继必须设置 `OTTO_ALLOW_REMOTE_CONTROLLER_REGISTRATION=1`）：**

```bash
curl -X POST http://localhost:8787/api/controller/register \
  -H 'Content-Type: application/json' \
  -d '{"name": "My App", "description": "Automation worker"}'
```

响应的 JSON 包含 `clientId`、`clientSecret` 和 `createdAt`。

## 步骤 2 — 安装包

```bash
npm install @telepat/otto-sdk
```

或使用 yarn 或 pnpm。

## 步骤 3 — 创建客户端并连接

```typescript
import { OttoClient } from '@telepat/otto-sdk';

const client = new OttoClient({
  relayUrl: 'wss://relay.example.com',    // 或 ws://localhost:8787 用于本地开发
  clientId: process.env.OTTO_CLIENT_ID!,
  clientSecret: process.env.OTTO_CLIENT_SECRET!,
});

await client.connect();
console.log('Connected:', client.isConnected()); // true
```

`connect()` 将你的凭据交换为 JWT 访问令牌，然后打开已认证的 WebSocket。多次调用是安全的 — 如果已连接则为空操作。

:::tip
绝不在源代码中硬编码 `clientSecret`。使用环境变量或密钥管理器。
:::

## 步骤 4 — 列出已连接节点

```typescript
const nodes = await client.nodes.list();
console.log(nodes);
// [{ nodeId: 'node_local_1' }, ...]
```

出现在这里的节点同时连接到了中继并且已授予你的控制器 ACL 访问权限。

## 步骤 5 — 运行命令

```typescript
const result = await client.commands.run({
  nodeId: nodes[0].nodeId,
  site: 'reddit.com',
  command: 'getPosts',
  input: { subreddit: 'typescript', limit: 10 },
});

if (result.ok) {
  console.log(result.data);
  console.log(result.durationMs);
}
```

## 步骤 6 — 断开连接

```typescript
await client.disconnect();
```

## 完整示例

```typescript
import { OttoClient, OttoCommandError, OttoAuthError } from '@telepat/otto-sdk';

async function main() {
  const client = new OttoClient({
    relayUrl: process.env.OTTO_RELAY_URL!,
    clientId: process.env.OTTO_CLIENT_ID!,
    clientSecret: process.env.OTTO_CLIENT_SECRET!,
  });

  try {
    await client.connect();
    const nodes = await client.nodes.list();
    if (nodes.length === 0) {
      throw new Error('No nodes connected');
    }
    const result = await client.commands.run({
      nodeId: nodes[0].nodeId,
      site: 'reddit.com',
      command: 'getPosts',
      input: { subreddit: 'typescript', limit: 5 },
    });
    console.log(JSON.stringify(result.data, null, 2));
  } catch (err) {
    if (err instanceof OttoAuthError) {
      console.error('Authentication failed — check clientId and clientSecret');
    } else if (err instanceof OttoCommandError) {
      console.error('Command failed:', err.message, '(outcome:', err.commandOutcome, ')');
    } else {
      throw err;
    }
  } finally {
    await client.disconnect();
  }
}

main();
```

## 边缘运行时

SDK 仅使用原生 `fetch` 和 `WebSocket` — 没有 Node.js 特定模块。它可以在 Cloudflare Workers、Deno、Bun 以及任何提供原生 `fetch` 和 `WebSocket` 的运行时中运行。

## 环境变量参考

| 变量 | 值 |
|---|---|
| `OTTO_RELAY_URL` | WebSocket URL，例如 `wss://relay.example.com` |
| `OTTO_CLIENT_ID` | 控制器注册时的 `clientId` |
| `OTTO_CLIENT_SECRET` | 控制器注册时的 `clientSecret` |

## 下一步

- [API 参考](./api-reference.md) — 完整方法签名和类型定义
- [示例](./examples.md) — 流式传输、重试模式、CI 集成等
- [错误码](/error-codes) — 可能遇到的中继错误码
