# @telepat/otto-sdk

TypeScript SDK for integrating 3rd-party JavaScript applications as Otto controllers. Control browser nodes, execute commands, stream listener updates, and manage permissions—all via a clean, type-safe API.

## Installation

```bash
npm install @telepat/otto-sdk
```

Requires Node.js 22+ or any edge runtime with native `fetch` and `WebSocket` support (Cloudflare Workers, Deno, etc.).

## Quick Start

```typescript
import { OttoClient } from '@telepat/otto-sdk';

// Create a client with your relay URL and controller credentials
const client = new OttoClient({
  relayUrl: 'wss://relay.example.com',
  clientId: 'clt_xxxxxxxxxx',
  clientSecret: 'cs_yyyyyyyyyyyyyyyyyy',
});

// Connect to the relay
await client.connect();

// List connected nodes you have access to
const nodes = await client.nodes.list();
console.log(nodes);

// Execute a command on a node
const result = await client.commands.run({
  nodeId: nodes[0].nodeId,
  site: 'reddit.com',
  command: 'search_posts',,
  input: { query: 'typescript' },
});
console.log(result);

// Stream listener updates
const stream = client.listeners.subscribe({
  nodeId: nodes[0].nodeId,
  listener: 'network.http_intercept',
  options: { site: 'example.com' },
});

// Use async iteration
for await (const event of stream) {
  console.log('Received:', event);
}

// Or use EventEmitter-style callbacks
stream.on('data', (event) => {
  console.log('Received:', event);
});

stream.on('error', (error) => {
  console.error('Stream error:', error);
});

stream.on('end', () => {
  console.log('Stream ended');
});
```

## API Reference

### `OttoClient`

Main SDK class for interacting with the Otto relay.

#### Constructor

```typescript
new OttoClient(options: {
  relayUrl: string;        // WebSocket URL (e.g., 'wss://relay.example.com')
  clientId: string;        // Controller client ID (from relay registration)
  clientSecret: string;    // Controller client secret (from relay registration)
})
```

#### Methods

##### `connect(): Promise<void>`

Establishes connection to the relay and authenticates. Called automatically on first API call if not already connected.

```typescript
await client.connect();
```

##### `disconnect(): Promise<void>`

Closes the WebSocket connection gracefully.

```typescript
await client.disconnect();
```

### `client.nodes`

Node listing and management.

#### `list(): Promise<Node[]>`

Returns all nodes you have ACL-granted access to and are currently connected to the relay.

```typescript
const nodes = await client.nodes.list();
// [{ nodeId: 'node_xyz' }, ...]
```

**Returns:**
```typescript
interface Node {
  nodeId: string;
}
```

### `client.commands`

Command execution on nodes.

#### `list(options: { nodeId: string }): Promise<CommandDescriptor[]>`

Lists all available commands on a node.

```typescript
const commands = await client.commands.list({ nodeId: 'node_xyz' });
```

**Returns:**
```typescript
interface CommandDescriptor {
  site: string;
  id: string;
  displayName: string;
  description: string;
  tags: string[];
  requiresAuth: boolean;
  inputFields?: CommandInputFieldDescriptor[];
}
```

#### `run(options: { nodeId: string; site: string; command: string; input?: Record<string, unknown>; timeoutMs?: number }): Promise<CommandResult>`

Executes a command on a node and waits for the result.

```typescript
const result = await client.commands.run({
  nodeId: 'node_xyz',
  site: 'reddit.com',
  command: 'search_posts',
  input: { query: 'typescript' },
  timeoutMs: 30000,
});
```

**Returns:**
```typescript
interface CommandResult {
  ok: boolean;
  data?: unknown;
  commandOutcome: 'completed' | 'failed' | 'timed_out' | 'cancelled';
  durationMs: number;
  error?: string;
}
```

**Throws:** `OttoCommandError` if the command fails or times out.

### `client.listeners`

Streaming listener subscriptions for real-time events.

#### `subscribe(options: { nodeId: string; listener: string; options?: Record<string, unknown> }): StreamSession`

Subscribes to a listener stream on a node.

```typescript
const stream = client.listeners.subscribe({
  nodeId: 'node_xyz',
  listener: 'network.http_intercept',
  options: { site: 'reddit.com' },
});
```

**Returns:** `StreamSession` — implements both `AsyncIterable` and `EventEmitter` patterns.

#### `StreamSession` API

Async iteration:
```typescript
for await (const event of stream) {
  console.log(event);
}
```

EventEmitter-style:
```typescript
stream.on('data', (event) => { });
stream.on('error', (error) => { });
stream.on('end', () => { });
```

Unsubscribe:
```typescript
await stream.unsubscribe();
```

### `client.pairing`

Pairing workflows for node setup.

#### `listPending(): Promise<PairingChallenge[]>`

Lists pending pairing challenges awaiting approval.

```typescript
const pending = await client.pairing.listPending();
```

**Returns:**
```typescript
interface PairingChallenge {
  challengeId: string;
  code: string;
  nodeId: string;
  status: 'pending' | 'approved' | 'expired';
  expiresAt: number;
}
```

#### `approve(options: { code: string }): Promise<void>`

Approves a pairing challenge by its 6-digit code.

```typescript
await client.pairing.approve({ code: '123456' });
```

## Error Handling

The SDK exposes specific error types for better error handling:

```typescript
import { OttoError, OttoAuthError, OttoTimeoutError, OttoCommandError } from '@telepat/otto-sdk';

try {
  const result = await client.commands.run({ /* ... */ });
} catch (error) {
  if (error instanceof OttoAuthError) {
    console.error('Authentication failed:', error.message);
  } else if (error instanceof OttoTimeoutError) {
    console.error('Command timed out');
  } else if (error instanceof OttoCommandError) {
    console.error('Command execution failed:', error.message);
  }
}
```

## Edge Runtime Compatibility

The SDK is compatible with edge runtimes (Cloudflare Workers, Deno, etc.) and uses only native APIs:

- Native `fetch` for HTTP requests
- Native `WebSocket` for streaming
- No Node.js-specific modules

```typescript
// Works in Cloudflare Workers
import { OttoClient } from '@telepat/otto-sdk';

export default {
  async fetch(request: Request) {
    const client = new OttoClient({ /* ... */ });
    await client.connect();
    const nodes = await client.nodes.list();
    return new Response(JSON.stringify(nodes));
  },
};
```

## Relay Registration

To use this SDK, you must first register a controller client with the relay:

1. Via the Otto CLI:
   ```bash
   otto setup --non-interactive --controller-name "My App"
   ```

2. Or programmatically by making an HTTP request (requires `OTTO_ALLOW_REMOTE_CONTROLLER_REGISTRATION=1` on the relay):
   ```typescript
   const response = await fetch('http://relay.example.com/api/controller/register', {
     method: 'POST',
     headers: { 'content-type': 'application/json' },
     body: JSON.stringify({
       name: 'My App',
       description: 'My application description',
     }),
   });
   const { clientId, clientSecret } = await response.json();
   ```

## License

MIT
