---
title: JavaScript SDK
sidebar_position: 1
description: Use the @telepat/otto-sdk package to integrate Otto into any JavaScript or TypeScript application — Node.js, Cloudflare Workers, Deno, or any runtime with native fetch and WebSocket.
keywords:
  - otto sdk
  - javascript sdk
  - typescript sdk
  - controller sdk
  - npm package
---

# JavaScript SDK

`@telepat/otto-sdk` is the official TypeScript/JavaScript SDK for integrating Otto into 3rd-party applications. It wraps the relay WebSocket and HTTP APIs into a clean, type-safe client that works in Node.js 22+, Cloudflare Workers, Deno, and any other runtime with native `fetch` and `WebSocket`.

```bash
npm install @telepat/otto-sdk
```

## What you can do with the SDK

| Capability | SDK surface |
|---|---|
| List nodes connected to the relay | `client.nodes.list()` |
| List available commands on a node | `client.commands.list({ nodeId })` |
| Execute a command and get the result | `client.commands.run({ nodeId, site, command, input })` |
| Stream live listener updates | `client.listeners.subscribe({ nodeId, listener })` |
| List pending pairing challenges | `client.pairing.listPending()` |
| Approve a pairing code | `client.pairing.approve({ code })` |

## How it fits into the Otto architecture

The SDK acts as a **controller** — the same role as the `@telepat/otto` CLI. Commands flow from your application through the SDK to the relay, then to the browser node:

```
Your app → @telepat/otto-sdk → Relay → Browser node (extension)
```

The SDK handles:
- Credential exchange (clientId + clientSecret → JWT access token)
- WebSocket lifecycle (connect, auth handshake, heartbeat, reconnect)
- Request/response correlation via `requestId`
- Typed streaming via `AsyncIterable` and `EventEmitter`

## Before you start

You need a relay running and a registered controller client. The quickest path:

```bash
# Start the relay
otto start

# Register a controller client and note the clientId + clientSecret
otto client register --name "My App"
```

See [Getting Started](./getting-started.md) for the full setup walkthrough.

## In this section

| Page | What you will find |
|---|---|
| [Getting Started](./getting-started.md) | Registration, installation, connecting, and your first command |
| [API Reference](./api-reference.md) | Complete API for OttoClient, sub-clients, StreamSession, and error types |
| [Examples](./examples.md) | Real-world patterns: edge runtimes, retry, CI, streaming |
