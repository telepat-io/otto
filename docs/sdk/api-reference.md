---
title: API Reference
sidebar_position: 3
description: Complete API reference for @telepat/otto-sdk — OttoClient, nodes, commands, listeners, pairing, StreamSession, and error types.
keywords:
  - otto sdk api
  - OttoClient
  - StreamSession
  - commands api
  - listeners api
---

# API Reference

Complete reference for `@telepat/otto-sdk` version 0.1.x.

## `OttoClient`

The main entry point for all SDK operations.

### Constructor

```typescript
new OttoClient(options: {
  relayUrl: string;
  clientId: string;
  clientSecret: string;
})
```

| Option | Type | Description |
|---|---|---|
| `relayUrl` | `string` | Relay WebSocket URL. Accepts `wss://` or `ws://` schemes. |
| `clientId` | `string` | Controller client ID obtained from relay registration. |
| `clientSecret` | `string` | Controller client secret obtained from relay registration. |

```typescript
const client = new OttoClient({
  relayUrl: 'wss://relay.example.com',
  clientId: 'clt_abc123',
  clientSecret: 'cs_xxxxxxxxxxxx',
});
```

### `connect(): Promise<void>`

Exchanges credentials for a JWT access token, then opens an authenticated WebSocket to the relay.

- Idempotent — safe to call multiple times. No-op if already connected.
- Called automatically the first time you access `client.nodes`, `client.commands`, or `client.listeners`.

```typescript
await client.connect();
```

**Throws:** `OttoAuthError` if credentials are invalid.

### `disconnect(): Promise<void>`

Closes the WebSocket connection gracefully. Clears the stored access token.

```typescript
await client.disconnect();
```

### `isConnected(): boolean`

Returns `true` if the WebSocket is open and authenticated.

```typescript
if (!client.isConnected()) {
  await client.connect();
}
```

---

## `client.nodes`

### `list(): Promise<Node[]>`

Returns all nodes that are connected to the relay **and** have an active ACL grant for this controller.

```typescript
const nodes = await client.nodes.list();
// [{ nodeId: 'node_local_1' }, ...]
```

**Return type:**

```typescript
interface Node {
  nodeId: string;
}
```

**Throws:** `OttoError` on relay or network failure.

---

## `client.commands`

### `list(options): Promise<CommandDescriptor[]>`

Lists all commands available on a node.

```typescript
const commands = await client.commands.list({ nodeId: 'node_local_1' });
```

**Options:**

| Field | Type | Description |
|---|---|---|
| `nodeId` | `string` | Target node ID. |

**Return type:**

```typescript
interface CommandDescriptor {
  site: string;           // Domain the command targets (e.g., 'reddit.com')
  id: string;             // Unique command identifier
  displayName: string;    // Human-readable name
  description: string;    // What the command does
  tags: string[];         // Searchable labels
  requiresAuth: boolean;  // Whether the user must be logged into the site
  inputFields: CommandInputFieldDescriptor[];
}

interface CommandInputFieldDescriptor {
  name: string;
  type: string;           // 'string' | 'number' | 'boolean' | 'object'
  required: boolean;
  description: string;
  defaultValue?: unknown;
}
```

**Throws:** `OttoCommandError` if the node rejects the request.

### `run(options): Promise<CommandResult>`

Executes a command on a node and waits for the result.

```typescript
const result = await client.commands.run({
  nodeId: 'node_local_1',
  site: 'reddit.com',
  command: 'getPosts',
  input: { subreddit: 'typescript', limit: 10 },
  timeoutMs: 30000,
});
```

**Options:**

| Field | Type | Required | Description |
|---|---|---|---|
| `nodeId` | `string` | ✓ | Target node ID. |
| `site` | `string` | ✓ | Site domain (e.g., `'reddit.com'`, `'linkedin.com'`). |
| `command` | `string` | ✓ | Command identifier (e.g., `'getFeed'`, `'getChatMessages'`). |
| `input` | `Record<string, unknown>` | | Input payload for the command. |
| `timeoutMs` | `number` | | Maximum wait time in milliseconds. Default: `30000`. |

**Return type:**

```typescript
interface CommandResult {
  ok: boolean;
  data?: unknown;                                              // Command output
  commandOutcome: 'completed' | 'failed' | 'timed_out' | 'cancelled';
  durationMs: number;                                         // Execution time in ms
  error?: string;                                             // Error message if not ok
}
```

**Throws:**
- `OttoCommandError` — command failed, timed out, or was cancelled. Includes `commandOutcome` property.
- `OttoTimeoutError` — SDK-level timeout (no response received within `timeoutMs + 5s`).

---

## `client.listeners`

### `subscribe(options): StreamSession`

Subscribes to a listener stream on a node. Returns a `StreamSession` immediately; the subscription starts when you begin consuming events (via `for await` or `.on()`).

```typescript
const stream = client.listeners.subscribe({
  nodeId: 'node_local_1',
  listener: 'network.http_intercept',
  options: { site: 'reddit.com', pattern: 'https://reddit.com/api/*' },
});
```

**Options:**

| Field | Type | Required | Description |
|---|---|---|---|
| `nodeId` | `string` | ✓ | Target node ID. |
| `listener` | `string` | ✓ | Listener identifier (e.g., `'network.http_intercept'`). |
| `options` | `Record<string, unknown>` | | Listener-specific configuration. |

**Returns:** [`StreamSession`](#streamsession)

---

## `StreamSession`

Returned by `client.listeners.subscribe()`. Implements both `AsyncIterable<ListenerUpdateEvent>` and `EventEmitter`.

### Async iteration

```typescript
for await (const event of stream) {
  console.log(event.type);  // 'listener_update'
  console.log(event.data);  // event payload
}
```

The loop exits when you `break`, call `stream.unsubscribe()`, or the stream ends.

### EventEmitter API

```typescript
stream.on('data', (event: ListenerUpdateEvent) => {
  console.log(event.data);
});

stream.on('error', (error: Error) => {
  console.error('Stream error:', error.message);
});

stream.on('end', () => {
  console.log('Stream ended');
});
```

### `start(): Promise<void>`

Explicitly starts the subscription. Called automatically when you begin iteration or add an event listener.

```typescript
await stream.start();
```

### `unsubscribe(): Promise<void>`

Sends an unsubscribe message to the node, emits `'end'`, and terminates any active `for await` loop.

```typescript
await stream.unsubscribe();
```

**Event type:**

```typescript
interface ListenerUpdateEvent {
  type: 'listener_update';
  data: unknown;           // Listener-specific payload
  updateType?: string;     // Optional sub-type
  emittedAt?: string;      // ISO timestamp
}
```

---

## `client.pairing`

### `listPending(): Promise<PairingChallenge[]>`

Returns pairing challenges that are waiting for controller approval.

```typescript
const pending = await client.pairing.listPending();
for (const challenge of pending) {
  console.log(challenge.code, challenge.nodeId, challenge.status);
}
```

**Return type:**

```typescript
interface PairingChallenge {
  challengeId: string;
  code: string;                             // 6-digit approval code
  nodeId: string;
  status: 'pending' | 'approved' | 'expired';
  expiresAt: string;                        // ISO timestamp
}
```

### `approve(options): Promise<void>`

Approves a pending pairing challenge.

```typescript
await client.pairing.approve({ code: '123456' });
```

**Options:**

| Field | Type | Description |
|---|---|---|
| `code` | `string` | 6-digit pairing code from `listPending()` or the extension popup. |

**Throws:** `OttoError` if the code is not exactly 6 digits or if the challenge is not found.

---

## Error types

All error types extend `OttoError`, which extends `Error`. Import them for typed `catch` blocks.

```typescript
import {
  OttoError,
  OttoAuthError,
  OttoTimeoutError,
  OttoCommandError,
} from '@telepat/otto-sdk';
```

### `OttoError`

Base class for all SDK errors.

```typescript
class OttoError extends Error {
  name: 'OttoError';
}
```

### `OttoAuthError`

Thrown when credential exchange fails (wrong `clientId` or `clientSecret`, token revoked, etc.).

```typescript
class OttoAuthError extends OttoError {
  name: 'OttoAuthError';
}
```

### `OttoTimeoutError`

Thrown when the SDK does not receive a response within the configured timeout.

```typescript
class OttoTimeoutError extends OttoError {
  name: 'OttoTimeoutError';
}
```

### `OttoCommandError`

Thrown when a command completes with a non-`completed` outcome.

```typescript
class OttoCommandError extends OttoError {
  name: 'OttoCommandError';
  commandOutcome: string;  // 'failed' | 'timed_out' | 'cancelled'
}
```

### Error handling pattern

```typescript
import { OttoError, OttoAuthError, OttoTimeoutError, OttoCommandError } from '@telepat/otto-sdk';

try {
  await client.commands.run({ nodeId, site: 'reddit.com', command: 'getPosts' });
} catch (err) {
  if (err instanceof OttoAuthError) {
    // Credentials are wrong or token was revoked
  } else if (err instanceof OttoTimeoutError) {
    // No response from node within timeout window
  } else if (err instanceof OttoCommandError) {
    console.error('Outcome:', err.commandOutcome); // 'failed' | 'timed_out' | 'cancelled'
  } else if (err instanceof OttoError) {
    // Other relay/protocol error
  } else {
    throw err; // Re-throw unexpected errors
  }
}
```

---

## Type exports

All public types are exported from the package root:

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
