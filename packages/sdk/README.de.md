# @telepat/otto-sdk

TypeScript SDK zur Integration von Drittanbieter-JavaScript-Anwendungen als Otto-Controller. Steuern Sie Browser-Nodes, führen Sie Befehle aus, streamen Sie Listener-Updates und verwalten Sie Berechtigungen — alles über eine saubere, typsichere API.

## Installation

```bash
npm install @telepat/otto-sdk
```

Erfordert Node.js 22+ oder eine beliebige Edge-Runtime mit nativer `fetch`- und `WebSocket`-Unterstützung (Cloudflare Workers, Deno usw.).

## Schnellstart

```typescript
import { OttoClient } from '@telepat/otto-sdk';

// Client mit Relay-URL und Controller-Anmeldeinformationen erstellen
const client = new OttoClient({
  relayUrl: 'wss://relay.example.com',
  clientId: 'clt_xxxxxxxxxx',
  clientSecret: 'cs_yyyyyyyyyyyyyyyyyy',
});

// Mit dem Relay verbinden
await client.connect();

// Verbundene Nodes auflisten, auf die Sie Zugriff haben
const nodes = await client.nodes.list();
console.log(nodes);

// Befehl auf einem Node ausführen
const result = await client.commands.run({
  nodeId: nodes[0].nodeId,
  site: 'reddit.com',
  command: 'search_posts',
  input: { query: 'typescript' },
});
console.log(result);

// Listener-Updates streamen
const stream = client.listeners.subscribe({
  nodeId: nodes[0].nodeId,
  listener: 'network.http_intercept',
  options: { site: 'example.com' },
});

// Asynchrone Iteration verwenden
for await (const event of stream) {
  console.log('Empfangen:', event);
}

// Oder EventEmitter-artige Callbacks verwenden
stream.on('data', (event) => {
  console.log('Empfangen:', event);
});

stream.on('error', (error) => {
  console.error('Stream-Fehler:', error);
});

stream.on('end', () => {
  console.log('Stream beendet');
});
```

## API-Referenz

### `OttoClient`

Haupt-SDK-Klasse für die Interaktion mit dem Otto-Relay.

#### Konstruktor

```typescript
new OttoClient(options: {
  relayUrl: string;        // WebSocket-URL (z. B. 'wss://relay.example.com')
  clientId: string;        // Controller-Client-ID (aus der Relay-Registrierung)
  clientSecret: string;    // Controller-Client-Secret (aus der Relay-Registrierung)
})
```

#### Methoden

##### `connect(): Promise<void>`

Stellt die Verbindung zum Relay her und authentifiziert sich. Wird beim ersten API-Aufruf automatisch aufgerufen, falls noch nicht verbunden.

```typescript
await client.connect();
```

##### `disconnect(): Promise<void>`

Schließt die WebSocket-Verbindung ordnungsgemäß.

```typescript
await client.disconnect();
```

### `client.nodes`

Node-Auflistung und -Verwaltung.

#### `list(): Promise<Node[]>`

Gibt alle Nodes zurück, auf die Sie ACL-Zugriff haben und die derzeit mit dem Relay verbunden sind.

```typescript
const nodes = await client.nodes.list();
// [{ nodeId: 'node_xyz' }, ...]
```

**Rückgabetyp:**
```typescript
interface Node {
  nodeId: string;
}
```

### `client.commands`

Befehlsausführung auf Nodes.

#### `list(options: { nodeId: string }): Promise<CommandDescriptor[]>`

Listet alle verfügbaren Befehle auf einem Node auf.

```typescript
const commands = await client.commands.list({ nodeId: 'node_xyz' });
```

**Rückgabetyp:**
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

Führt einen Befehl auf einem Node aus und wartet auf das Ergebnis.

```typescript
const result = await client.commands.run({
  nodeId: 'node_xyz',
  site: 'reddit.com',
  command: 'search_posts',
  input: { query: 'typescript' },
  timeoutMs: 30000,
});
```

**Rückgabetyp:**
```typescript
interface CommandResult {
  ok: boolean;
  data?: unknown;
  commandOutcome: 'completed' | 'failed' | 'timed_out' | 'cancelled';
  durationMs: number;
  error?: string;
}
```

**Wirft:** `OttoCommandError`, wenn der Befehl fehlschlägt oder eine Zeitüberschreitung auftritt.

### `client.listeners`

Streaming-Listener-Abonnements für Echtzeit-Ereignisse.

#### `subscribe(options: { nodeId: string; listener: string; options?: Record<string, unknown> }): StreamSession`

Abonniert einen Listener-Stream auf einem Node.

```typescript
const stream = client.listeners.subscribe({
  nodeId: 'node_xyz',
  listener: 'network.http_intercept',
  options: { site: 'reddit.com' },
});
```

**Rückgabetyp:** `StreamSession` — implementiert sowohl `AsyncIterable`- als auch `EventEmitter`-Muster.

#### `StreamSession` API

Asynchrone Iteration:
```typescript
for await (const event of stream) {
  console.log(event);
}
```

EventEmitter-Stil:
```typescript
stream.on('data', (event) => { });
stream.on('error', (error) => { });
stream.on('end', () => { });
```

Abbestellen:
```typescript
await stream.unsubscribe();
```

### `client.pairing`

Pairing-Workflows für die Node-Einrichtung.

#### `listPending(): Promise<PairingChallenge[]>`

Listet ausstehende Pairing-Challenges auf, die auf Genehmigung warten.

```typescript
const pending = await client.pairing.listPending();
```

**Rückgabetyp:**
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

Genehmigt eine Pairing-Challenge anhand ihres 6-stelligen Codes.

```typescript
await client.pairing.approve({ code: '123456' });
```

## Fehlerbehandlung

Das SDK stellt spezifische Fehlertypen für eine bessere Fehlerbehandlung bereit:

```typescript
import { OttoError, OttoAuthError, OttoTimeoutError, OttoCommandError } from '@telepat/otto-sdk';

try {
  const result = await client.commands.run({ /* ... */ });
} catch (error) {
  if (error instanceof OttoAuthError) {
    console.error('Authentifizierung fehlgeschlagen:', error.message);
  } else if (error instanceof OttoTimeoutError) {
    console.error('Befehl hat Zeitüberschreitung');
  } else if (error instanceof OttoCommandError) {
    console.error('Befehlsausführung fehlgeschlagen:', error.message);
  }
}
```

## Edge-Runtime-Kompatibilität

Das SDK ist mit Edge-Runtimes (Cloudflare Workers, Deno usw.) kompatibel und verwendet ausschließlich native APIs:

- Natives `fetch` für HTTP-Anfragen
- Natives `WebSocket` für Streaming
- Keine Node.js-spezifischen Module

```typescript
// Funktioniert in Cloudflare Workers
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

## Relay-Registrierung

Um dieses SDK zu verwenden, müssen Sie zunächst einen Controller-Client beim Relay registrieren:

1. Über die Otto-CLI:
   ```bash
   otto setup --non-interactive --controller-name "My App"
   ```

2. Oder programmatisch per HTTP-Anfrage (erfordert `OTTO_ALLOW_REMOTE_CONTROLLER_REGISTRATION=1` auf dem Relay):
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

## Lizenz

MIT
