---
title: API 参考
sidebar_position: 3
description: "@telepat/otto-sdk 完整 API 参考 - OttoClient、节点、命令、监听器、配对、StreamSession 和错误类型。"
keywords:
  - otto sdk api
  - OttoClient
  - StreamSession
  - 命令 api
  - 监听器 api
---

# API 参考

`@telepat/otto-sdk` 版本 0.1.x 的完整参考。

## `OttoClient`

所有 SDK 操作的主入口点。

### 构造函数

```typescript
new OttoClient(options: {
  relayUrl: string;
  clientId: string;
  clientSecret: string;
})
```

| 选项 | 类型 | 描述 |
|---|---|---|
| `relayUrl` | `string` | 中继 WebSocket URL。接受 `wss://` 或 `ws://` 方案。 |
| `clientId` | `string` | 中继注册获得的控制器客户端 ID。 |
| `clientSecret` | `string` | 中继注册获得的控制器客户端密钥。 |

### `connect(): Promise<void>`

将凭据交换为 JWT 访问令牌，然后打开到中继的已认证 WebSocket。

- 幂等 — 多次调用安全。已连接则为空操作。
- 首次访问 `client.nodes`、`client.commands` 或 `client.listeners` 时自动调用。

**抛出：** `OttoAuthError` 如果凭据无效。

### `disconnect(): Promise<void>`

优雅关闭 WebSocket 连接。清除存储的访问令牌。

### `isConnected(): boolean`

如果 WebSocket 已打开且已认证则返回 `true`。

---

## `client.nodes`

### `list(): Promise<Node[]>`

返回已连接到中继**且**对此控制器具有活跃 ACL 授权的所有节点。

```typescript
interface Node {
  nodeId: string;
}
```

**抛出：** `OttoError` 中继或网络故障。

---

## `client.commands`

### `list(options): Promise<CommandDescriptor[]>`

列出节点上的所有可用命令。

```typescript
const commands = await client.commands.list({ nodeId: 'node_local_1' });
```

```typescript
interface CommandDescriptor {
  site: string;
  id: string;
  displayName: string;
  description: "string;"
  tags: string[];
  requiresAuth: boolean;
  inputFields: CommandInputFieldDescriptor[];
}
```

### `run(options): Promise<CommandResult>`

在节点上执行命令并等待结果。

```typescript
const result = await client.commands.run({
  nodeId: 'node_local_1',
  site: 'reddit.com',
  command: 'getFeed',
  input: { subreddit: 'typescript', limit: 10 },
  timeoutMs: 30000,
});
```

**选项：**

| 字段 | 类型 | 必填 | 描述 |
|---|---|---|---|
| `nodeId` | `string` | ✓ | 目标节点 ID。 |
| `site` | `string` | ✓ | 站点域名。 |
| `command` | `string` | ✓ | 命令标识符。 |
| `input` | `Record<string, unknown>` | | 命令输入负载。 |
| `timeoutMs` | `number` | | 最大等待时间。默认：`30000`。 |

**返回类型：**

```typescript
interface CommandResult {
  ok: boolean;
  data?: unknown;
  commandOutcome: 'completed' | 'failed' | 'timed_out' | 'cancelled';
  durationMs: number;
  error?: string;
}
```

**抛出：** `OttoCommandError` — 命令失败、超时或被取消。`OttoTimeoutError` — SDK 级超时。

---

## `client.listeners`

### `subscribe(options): StreamSession`

订阅节点上的监听器流。立即返回 `StreamSession`；开始消费事件时启动订阅。

```typescript
const stream = client.listeners.subscribe({
  nodeId: 'node_local_1',
  listener: 'network.http_intercept',
  options: { site: 'reddit.com', pattern: 'https://reddit.com/api/*' },
});
```

---

## `StreamSession`

由 `client.listeners.subscribe()` 返回。同时实现 `AsyncIterable<ListenerUpdateEvent>` 和 `EventEmitter`。

### Async 迭代

```typescript
for await (const event of stream) {
  console.log(event.type);  // 'listener_update'
  console.log(event.data);
}
```

### EventEmitter API

```typescript
stream.on('data', (event: ListenerUpdateEvent) => { ... });
stream.on('error', (error: Error) => { ... });
stream.on('end', () => { ... });
```

### `start(): Promise<void>`

显式启动订阅。开始迭代或添加事件监听器时自动调用。

### `unsubscribe(): Promise<void>`

向节点发送取消订阅消息，发出 `'end'`，终止活跃的 `for await` 循环。

```typescript
interface ListenerUpdateEvent {
  type: 'listener_update';
  data: unknown;
  updateType?: string;
  emittedAt?: string;
}
```

---

## `client.pairing`

### `listPending(): Promise<PairingChallenge[]>`

返回等待控制器批准的配对挑战。

```typescript
interface PairingChallenge {
  challengeId: string;
  code: string;
  nodeId: string;
  status: 'pending' | 'approved' | 'expired';
  expiresAt: string;
}
```

### `approve(options): Promise<void>`

批准待处理的配对挑战。

```typescript
await client.pairing.approve({ code: '123456' });
```

**抛出：** `OttoError` 如果码不是 6 位数字或挑战未找到。

---

## 错误类型

所有错误类型继承自 `OttoError`。

```typescript
import {
  OttoError,
  OttoAuthError,
  OttoTimeoutError,
  OttoCommandError,
} from '@telepat/otto-sdk';
```

- `OttoError` — 所有 SDK 错误的基类。
- `OttoAuthError` — 凭据交换失败时抛出。
- `OttoTimeoutError` — SDK 在配置的超时内未收到响应时抛出。
- `OttoCommandError` — 命令以非 `completed` 结果完成时抛出。包含 `commandOutcome` 属性。

### 错误处理模式

```typescript
try {
  await client.commands.run({ nodeId, site: 'reddit.com', command: 'getFeed' });
} catch (err) {
  if (err instanceof OttoAuthError) { /* ... */ }
  else if (err instanceof OttoTimeoutError) { /* ... */ }
  else if (err instanceof OttoCommandError) { console.error(err.commandOutcome); }
  else if (err instanceof OttoError) { /* ... */ }
  else { throw err; }
}
```

## 类型导出

所有公共类型从包根目录导出：

```typescript
import type {
  Node,
  CommandDescriptor,
  CommandInputFieldDescriptor,
  CommandResult,
  PairingChallenge,
  ListenerUpdateEvent,
} from '@telepat/otto-sdk';
```
