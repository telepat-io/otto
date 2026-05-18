---
title: JavaScript SDK
sidebar_position: 1
description: "使用 @telepat/otto-sdk 包将 Otto 集成到任何 JavaScript 或 TypeScript 应用中  - Node.js、Cloudflare Workers、Deno 或任何具有原生 fetch 和 WebSocket 的运行时。"
keywords:
  - otto sdk
  - javascript sdk
  - typescript sdk
  - 控制器 sdk
  - npm 包
---

# JavaScript SDK

`@telepat/otto-sdk` 是将 Otto 集成到第三方应用中的官方 TypeScript/JavaScript SDK。它将中继 WebSocket 和 HTTP API 封装成干净、类型安全的客户端，可在 Node.js 22+、Cloudflare Workers、Deno 以及任何其他具有原生 `fetch` 和 `WebSocket` 的运行时中使用。

```bash
npm install @telepat/otto-sdk
```

## 可以用 SDK 做什么

| 能力 | SDK 接口 |
|---|---|
| 列出连接到中继的节点 | `client.nodes.list()` |
| 列出节点上的可用命令 | `client.commands.list({ nodeId })` |
| 执行命令并获取结果 | `client.commands.run({ nodeId, site, command, input })` |
| 流式传输实时监听器更新 | `client.listeners.subscribe({ nodeId, listener })` |
| 列出待处理的配对挑战 | `client.pairing.listPending()` |
| 批准配对码 | `client.pairing.approve({ code })` |

## 在 Otto 架构中的位置

SDK 作为**控制器**运行 — 与 `@telepat/otto` CLI 相同的角色。命令从你的应用通过 SDK 流向中继，然后到达浏览器节点：

```
你的应用 → @telepat/otto-sdk → 中继 → 浏览器节点（扩展）
```

SDK 处理：
- 凭据交换（clientId + clientSecret → JWT 访问令牌）
- WebSocket 生命周期（连接、认证握手、心跳、重连）
- 通过 `requestId` 进行请求/响应关联
- 通过 `AsyncIterable` 和 `EventEmitter` 进行类型化流式传输

## 开始之前

你需要一个正在运行的中继和一个已注册的控制器客户端。最快的方式：

```bash
# 启动中继
otto start

# 注册控制器客户端并记下 clientId + clientSecret
otto client register --name "My App"
```

完整安装流程见[快速开始](./getting-started.md)。

## 本节目录

| 页面 | 内容 |
|---|---|
| [快速开始](./getting-started.md) | 注册、安装、连接和你的第一个命令 |
| [API 参考](./api-reference.md) | OttoClient、子客户端、StreamSession 和错误类型的完整 API |
| [示例](./examples.md) | 真实场景模式：边缘运行时、重试、CI、流式传输 |
