---
title: Getting Started
sidebar_position: 2
description: Install @telepat/otto-sdk, register a controller client with the relay, and run your first command in a JavaScript or TypeScript application.
keywords:
  - otto sdk
  - getting started
  - install
  - controller registration
  - first command
---

# Getting Started with the JavaScript SDK

This guide takes you from zero to running your first command through `@telepat/otto-sdk`.

## Prerequisites

- A running Otto relay (`otto start`). See [Installation](/installation) if you haven't set that up yet.
- Node.js 22+ (or an edge runtime — see [Edge runtimes](#edge-runtimes)).
- npm, yarn, or pnpm.

## Step 1 — Register a controller client

The SDK authenticates as a **controller client**. You need a `clientId` and `clientSecret` from the relay before you can use the SDK.

**Via the Otto CLI (recommended):**

```bash
otto client register --name "My App"
```

This prints a `clientId` and `clientSecret`. Store them securely — the relay only stores a hash of the secret and cannot recover it.

**Via HTTP (relay must have `OTTO_ALLOW_REMOTE_CONTROLLER_REGISTRATION=1`):**

```bash
curl -X POST http://localhost:8787/api/controller/register \
  -H 'Content-Type: application/json' \
  -d '{"name": "My App", "description": "Automation worker"}'
```

```json
{
  "clientId": "clt_abc123",
  "clientSecret": "cs_xxxxxxxxxxxx",
  "createdAt": 1776162000000
}
```

## Step 2 — Install the package

```bash
npm install @telepat/otto-sdk
```

```bash
yarn add @telepat/otto-sdk
```

```bash
pnpm add @telepat/otto-sdk
```

## Step 3 — Create a client and connect

```typescript
import { OttoClient } from '@telepat/otto-sdk';

const client = new OttoClient({
  relayUrl: 'wss://relay.example.com',    // or ws://localhost:8787 for local dev
  clientId: process.env.OTTO_CLIENT_ID!,
  clientSecret: process.env.OTTO_CLIENT_SECRET!,
});

await client.connect();
console.log('Connected:', client.isConnected()); // true
```

`connect()` exchanges your credentials for a JWT access token, then opens an authenticated WebSocket. It is safe to call multiple times — subsequent calls are no-ops if already connected.

:::tip
Never hardcode `clientSecret` in source code. Use environment variables or a secrets manager.
:::

## Step 4 — List connected nodes

```typescript
const nodes = await client.nodes.list();
console.log(nodes);
// [{ nodeId: 'node_local_1' }, ...]
```

Nodes that appear here are both connected to the relay and have granted your controller ACL access. If the list is empty, see the [Pairing](/guides/pairing-auth) guide.

## Step 5 — Run a command

```typescript
const result = await client.commands.run({
  nodeId: nodes[0].nodeId,
  site: 'reddit.com',
  command: 'getPosts',
  input: { subreddit: 'typescript', limit: 10 },
});

if (result.ok) {
  console.log(result.data);      // command output
  console.log(result.durationMs); // execution time in ms
}
```

## Step 6 — Disconnect

```typescript
await client.disconnect();
```

## Putting it all together

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

## Edge runtimes

The SDK uses only native `fetch` and `WebSocket` — no Node.js-specific modules. It runs in:

- **Cloudflare Workers**
- **Deno**
- **Bun**
- Any runtime that provides native `fetch` and `WebSocket`

```typescript
// Cloudflare Worker example
import { OttoClient } from '@telepat/otto-sdk';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const client = new OttoClient({
      relayUrl: env.OTTO_RELAY_URL,
      clientId: env.OTTO_CLIENT_ID,
      clientSecret: env.OTTO_CLIENT_SECRET,
    });

    await client.connect();
    const nodes = await client.nodes.list();
    await client.disconnect();

    return Response.json(nodes);
  },
};
```

## Environment variable reference

| Variable | Value |
|---|---|
| `OTTO_RELAY_URL` | WebSocket URL, e.g. `wss://relay.example.com` |
| `OTTO_CLIENT_ID` | `clientId` from controller registration |
| `OTTO_CLIENT_SECRET` | `clientSecret` from controller registration |

## Next steps

- [API Reference](./api-reference.md) — complete method signatures and type definitions
- [Examples](./examples.md) — streaming, retry patterns, CI integration, and more
- [Error Codes](/error-codes) — relay error codes you may encounter
