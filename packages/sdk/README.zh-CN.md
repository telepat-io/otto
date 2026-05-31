# @telepat/otto-sdk

用于将第三方 JavaScript 应用程序集成为 Otto 控制器的 TypeScript SDK。通过简洁、类型安全的 API 控制浏览器节点、执行命令、流式传输监听器更新并管理权限。

[🇺🇸 English](./README.md) | 中文 | [🇩🇪 Deutsch](./README.de.md)

## 安装

```bash
npm install @telepat/otto-sdk
```

需要 Node.js 22+ 或任何支持原生 `fetch` 和 `WebSocket` 的边缘运行时（Cloudflare Workers、Deno 等）。

## 快速开始

```typescript
import { OttoClient } from '@telepat/otto-sdk';

// 使用中继 URL 和控制器凭据创建客户端
const client = new OttoClient({
  relayUrl: 'wss://relay.example.com',
  clientId: 'clt_xxxxxxxxxx',
  clientSecret: 'cs_yyyyyyyyyyyyyyyyyy',
});

// 连接到中继
await client.connect();

// 列出您有权访问的已连接节点
const nodes = await client.nodes.list();
console.log(nodes);

// 在节点上执行命令
const result = await client.commands.run({
  nodeId: nodes[0].nodeId,
  site: 'reddit.com',
  command: 'getPosts',
  input: { subreddit: 'typescript', limit: 10 },
});
console.log(result);

// 流式传输监听器更新
const stream = client.listeners.subscribe({
  nodeId: nodes[0].nodeId,
  listener: 'network.http_intercept',
  options: { site: 'example.com' },
});

// 使用异步迭代
for await (const event of stream) {
  console.log('已接收:', event);
}

// 完成后断开连接
await client.disconnect();
```

## API 参考

### `OttoClient`

与 Otto 中继交互的主要 SDK 类。

#### 构造函数

```typescript
new OttoClient(options: {
  relayUrl: string;        // WebSocket URL（例如 'wss://relay.example.com'）
  clientId: string;        // 控制器客户端 ID（来自中继注册）
  clientSecret: string;    // 控制器客户端密钥（来自中继注册）
})
```

#### 方法

##### `connect(): Promise<void>`

与中继建立连接并进行身份验证。如果未连接，将在第一次 API 调用时自动调用。

```typescript
await client.connect();
```

##### `disconnect(): Promise<void>`

优雅地关闭 WebSocket 连接。

```typescript
await client.disconnect();
```

##### `isConnected(): boolean`

如果 WebSocket 已打开并通过身份验证，则返回 `true`。

```typescript
if (!client.isConnected()) {
  await client.connect();
}
```

---

### `client.nodes`

节点列表与管理。

#### `list(): Promise<Node[]>`

返回您已获得 ACL 授权且当前已连接到中继的所有节点。

```typescript
const nodes = await client.nodes.list();
// [{ nodeId: 'node_xyz' }, ...]
```

**返回类型：**

```typescript
interface Node {
  nodeId: string;
}
```

---

### `client.commands`

在节点上执行命令。

#### `list(options: { nodeId: string }): Promise<CommandDescriptor[]>`

列出节点上所有可用的命令。

```typescript
const commands = await client.commands.list({ nodeId: 'node_xyz' });
```

**返回类型：**

```typescript
interface CommandDescriptor {
  site: string;           // 目标域名（例如 'reddit.com'）
  id: string;             // 命令唯一标识符
  displayName: string;    // 人类可读名称
  description: string;    // 命令功能描述
  tags: string[];         // 可搜索标签
  requiresAuth: boolean;  // 是否需要用户登录该网站
  inputFields?: CommandInputFieldDescriptor[];
}
```

#### `run(options): Promise<CommandResult>`

在节点上执行命令并等待结果。

```typescript
const result = await client.commands.run({
  nodeId: 'node_xyz',
  site: 'reddit.com',
   command: 'getPosts',
   input: { subreddit: 'typescript', limit: 10 },
  timeoutMs: 30000,
});
```

**选项：**

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `nodeId` | `string` | ✓ | 目标节点 ID |
| `site` | `string` | ✓ | 目标站点域名（例如 `'reddit.com'`） |
| `command` | `string` | ✓ | 命令标识符（例如 `'getPosts'`） |
| `input` | `Record<string, unknown>` | | 命令输入参数 |
| `timeoutMs` | `number` | | 最大等待时间（毫秒），默认 `30000` |

**返回类型：**

```typescript
interface CommandResult {
  ok: boolean;
  data?: unknown;         // 命令输出
  commandOutcome: 'completed' | 'failed' | 'timed_out' | 'cancelled';
  durationMs: number;     // 执行时间（毫秒）
  error?: string;         // 失败时的错误信息
}
```

**抛出异常：**
- `OttoCommandError` — 命令失败、超时或被取消
- `OttoTimeoutError` — SDK 层级超时（在 `timeoutMs` 内未收到响应）

---

### `client.listeners`

实时事件的流式监听器订阅。

#### `subscribe(options): StreamSession`

订阅节点上的监听器流。返回 `StreamSession`，该对象同时实现 `AsyncIterable` 和 `EventEmitter` 接口。

```typescript
const stream = client.listeners.subscribe({
  nodeId: 'node_xyz',
  listener: 'network.http_intercept',
  options: { site: 'reddit.com' },
});
```

**`StreamSession` API：**

异步迭代：

```typescript
for await (const event of stream) {
  console.log(event.type);   // 'listener_update'
  console.log(event.data);   // 事件载荷
}
```

EventEmitter 风格：

```typescript
stream.on('data', (event) => { console.log(event.data); });
stream.on('error', (error) => { console.error(error); });
stream.on('end', () => { console.log('流已结束'); });
```

取消订阅：

```typescript
await stream.unsubscribe();
```

---

### `client.pairing`

节点配对工作流。

#### `listPending(): Promise<PairingChallenge[]>`

列出等待批准的待处理配对挑战。

```typescript
const pending = await client.pairing.listPending();
for (const challenge of pending) {
  console.log(challenge.code, challenge.nodeId);
}
```

**返回类型：**

```typescript
interface PairingChallenge {
  challengeId: string;
  code: string;                              // 6 位批准码
  nodeId: string;
  status: 'pending' | 'approved' | 'expired';
  expiresAt: string;                         // ISO 时间戳
}
```

#### `approve(options: { code: string }): Promise<void>`

通过 6 位配对码批准配对挑战。

```typescript
await client.pairing.approve({ code: '123456' });
```

---

## 错误处理

SDK 提供特定的错误类型以便更好地处理错误：

```typescript
import { OttoError, OttoAuthError, OttoTimeoutError, OttoCommandError } from '@telepat/otto-sdk';

try {
  const result = await client.commands.run({
    nodeId: 'node_xyz',
    site: 'reddit.com',
    command: 'getPosts',
  });
} catch (error) {
  if (error instanceof OttoAuthError) {
    console.error('身份验证失败 — 请检查 clientId 和 clientSecret');
  } else if (error instanceof OttoTimeoutError) {
    console.error('命令超时 — 节点未在规定时间内响应');
  } else if (error instanceof OttoCommandError) {
    console.error('命令执行失败:', error.message);
    console.error('结果状态:', error.commandOutcome); // 'failed' | 'timed_out' | 'cancelled'
  } else if (error instanceof OttoError) {
    console.error('中继错误:', error.message);
  } else {
    throw error;
  }
}
```

### 错误类层次结构

```
OttoError          ← 所有 SDK 错误的基类
├── OttoAuthError  ← 凭据无效或令牌已撤销
├── OttoTimeoutError ← 未在超时时间内收到响应
└── OttoCommandError ← 命令以非成功状态结束（包含 commandOutcome 属性）
```

---

## 边缘运行时兼容性

SDK 仅使用原生 API，无 Node.js 特定模块，可在以下环境中运行：

- **Cloudflare Workers**
- **Deno**
- **Bun**
- 任何支持原生 `fetch` 和 `WebSocket` 的运行时

```typescript
// Cloudflare Workers 示例
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
        return Response.json({ error: '没有可用节点' }, { status: 503 });
      }

      const result = await client.commands.run({
        nodeId: nodes[0].nodeId,
        site: 'reddit.com',
        command: 'getPosts',
        input: { subreddit: 'typescript', limit: 25 },
      });

      return Response.json(result.data);
    } finally {
      await client.disconnect();
    }
  },
};
```

---

## 中继注册

使用此 SDK 前，必须先在中继中注册控制器客户端：

**通过 Otto CLI（推荐）：**

```bash
otto client register --name "我的应用"
```

此命令会输出 `clientId` 和 `clientSecret`，请妥善保存，中继不存储密钥明文，无法恢复。

**通过 HTTP（需要中继设置 `OTTO_ALLOW_REMOTE_CONTROLLER_REGISTRATION=1`）：**

```bash
curl -X POST http://localhost:8787/api/controller/register \
  -H 'Content-Type: application/json' \
  -d '{"name": "我的应用", "description": "自动化工作进程"}'
```

```json
{
  "clientId": "clt_abc123",
  "clientSecret": "cs_xxxxxxxxxxxx",
  "createdAt": 1776162000000
}
```

---

## 类型导出

所有公共类型均从包根部导出：

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

---

## 许可证

MIT
