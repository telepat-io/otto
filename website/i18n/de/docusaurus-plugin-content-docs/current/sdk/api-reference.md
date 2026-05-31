---
title: API-Referenz
sidebar_position: 3
description: Vollständige API-Referenz für @telepat/otto-sdk — OttoClient, Nodes, Commands, Listeners, Pairing, StreamSession und Fehlertypen.
keywords:
  - otto sdk api
  - OttoClient
  - StreamSession
  - commands api
  - listeners api
---

# API-Referenz

Vollständige Referenz für `@telepat/otto-sdk` Version 0.1.x.

## `OttoClient`

Der Haupteinstiegspunkt für alle SDK-Operationen.

### Konstruktor

```typescript
new OttoClient(options: {
  relayUrl: string;
  clientId: string;
  clientSecret: string;
})
```

| Option | Typ | Beschreibung |
|---|---|---|
| `relayUrl` | `string` | Relay-WebSocket-URL. Akzeptiert `wss://`- oder `ws://`-Schema. |
| `clientId` | `string` | Controller-Client-ID, erhalten von der Relay-Registrierung. |
| `clientSecret` | `string` | Controller-Client-Secret, erhalten von der Relay-Registrierung. |

```typescript
const client = new OttoClient({
  relayUrl: 'wss://relay.example.com',
  clientId: 'clt_abc123',
  clientSecret: 'cs_xxxxxxxxxxxx',
});
```

### `connect(): Promise<void>`

Tauscht Anmeldeinformationen gegen ein JWT-Access-Token ein und öffnet dann einen authentifizierten WebSocket zum Relay.

- Idempotent — sicher bei Mehrfachaufruf. No-Op, wenn bereits verbunden.
- Wird automatisch beim ersten Zugriff auf `client.nodes`, `client.commands` oder `client.listeners` aufgerufen.

```typescript
await client.connect();
```

**Wirft:** `OttoAuthError`, wenn die Anmeldeinformationen ungültig sind.

### `disconnect(): Promise<void>`

Schließt die WebSocket-Verbindung ordnungsgemäß. Löscht das gespeicherte Access-Token.

```typescript
await client.disconnect();
```

### `isConnected(): boolean`

Gibt `true` zurück, wenn der WebSocket geöffnet und authentifiziert ist.

```typescript
if (!client.isConnected()) {
  await client.connect();
}
```

---

## `client.nodes`

### `list(): Promise<Node[]>`

Gibt alle Nodes zurück, die mit dem Relay verbunden sind **und** einen aktiven ACL-Grant für diesen Controller haben.

```typescript
const nodes = await client.nodes.list();
// [{ nodeId: 'node_local_1' }, ...]
```

**Rückgabetyp:**

```typescript
interface Node {
  nodeId: string;
}
```

**Wirft:** `OttoError` bei Relay- oder Netzwerkfehler.

---

## `client.commands`

### `list(options): Promise<CommandDescriptor[]>`

Listet alle verfügbaren Befehle auf einem Node auf.

```typescript
const commands = await client.commands.list({ nodeId: 'node_local_1' });
```

**Optionen:**

| Feld | Typ | Beschreibung |
|---|---|---|
| `nodeId` | `string` | Ziel-Node-ID. |

**Rückgabetyp:**

```typescript
interface CommandDescriptor {
  site: string;           // Domain, auf die der Befehl abzielt (z. B. 'reddit.com')
  id: string;             // Eindeutiger Befehlsidentifikator
  displayName: string;    // Menschenlesbarer Name
  description: string;    // Beschreibung der Funktion des Befehls
  tags: string[];         // Durchsuchbare Labels
  requiresAuth: boolean;  // Ob der Benutzer auf der Site angemeldet sein muss
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

**Wirft:** `OttoCommandError`, wenn der Node die Anfrage ablehnt.

### `run(options): Promise<CommandResult>`

Führt einen Befehl auf einem Node aus und wartet auf das Ergebnis.

```typescript
const result = await client.commands.run({
  nodeId: 'node_local_1',
  site: 'reddit.com',
  command: 'getPosts',
  input: { subreddit: 'typescript', limit: 10 },
  timeoutMs: 30000,
});
```

**Optionen:**

| Feld | Typ | Erforderlich | Beschreibung |
|---|---|---|---|
| `nodeId` | `string` | ✓ | Ziel-Node-ID. |
| `site` | `string` | ✓ | Site-Domain (z. B. `'reddit.com'`, `'linkedin.com'`). |
| `command` | `string` | ✓ | Befehlsidentifikator (z. B. `'getPosts'`, `'getChatMessages'`). |
| `input` | `Record<string, unknown>` | | Eingabe-Payload für den Befehl. |
| `timeoutMs` | `number` | | Maximale Wartezeit in Millisekunden. Standard: `30000`. |

**Rückgabetyp:**

```typescript
interface CommandResult {
  ok: boolean;
  data?: unknown;                                              // Befehlsausgabe
  commandOutcome: 'completed' | 'failed' | 'timed_out' | 'cancelled';
  durationMs: number;                                         // Ausführungszeit in ms
  error?: string;                                             // Fehlermeldung, wenn nicht ok
}
```

**Wirft:**
- `OttoCommandError` — Befehl fehlgeschlagen, Timeout oder abgebrochen. Enthält die Eigenschaft `commandOutcome`.
- `OttoTimeoutError` — SDK-Level-Timeout (keine Antwort innerhalb von `timeoutMs + 5s` erhalten).

---

## `client.listeners`

### `subscribe(options): StreamSession`

Abonniert einen Listener-Stream auf einem Node. Gibt sofort eine `StreamSession` zurück; das Abonnement beginnt, wenn Sie mit dem Konsumieren von Ereignissen beginnen (über `for await` oder `.on()`).

```typescript
const stream = client.listeners.subscribe({
  nodeId: 'node_local_1',
  listener: 'network.http_intercept',
  options: { site: 'reddit.com', pattern: 'https://reddit.com/api/*' },
});
```

**Optionen:**

| Feld | Typ | Erforderlich | Beschreibung |
|---|---|---|---|
| `nodeId` | `string` | ✓ | Ziel-Node-ID. |
| `listener` | `string` | ✓ | Listener-Identifikator (z. B. `'network.http_intercept'`). |
| `options` | `Record<string, unknown>` | | Listener-spezifische Konfiguration. |

**Gibt zurück:** [`StreamSession`](#streamsession)

---

## `StreamSession`

Wird von `client.listeners.subscribe()` zurückgegeben. Implementiert sowohl `AsyncIterable<ListenerUpdateEvent>` als auch `EventEmitter`.

### Async-Iteration

```typescript
for await (const event of stream) {
  console.log(event.type);  // 'listener_update'
  console.log(event.data);  // Ereignis-Payload
}
```

Die Schleife endet, wenn Sie `break` aufrufen, `stream.unsubscribe()` aufrufen oder der Stream endet.

### EventEmitter-API

```typescript
stream.on('data', (event: ListenerUpdateEvent) => {
  console.log(event.data);
});

stream.on('error', (error: Error) => {
  console.error('Stream-Fehler:', error.message);
});

stream.on('end', () => {
  console.log('Stream beendet');
});
```

### `start(): Promise<void>`

Startet das Abonnement explizit. Wird automatisch aufgerufen, wenn Sie mit der Iteration beginnen oder einen Event-Listener hinzufügen.

```typescript
await stream.start();
```

### `unsubscribe(): Promise<void>`

Sendet eine Deabonnierungs-Nachricht an den Node, emittiert `'end'` und beendet jede aktive `for await`-Schleife.

```typescript
await stream.unsubscribe();
```

**Ereignistyp:**

```typescript
interface ListenerUpdateEvent {
  type: 'listener_update';
  data: unknown;           // Listener-spezifischer Payload
  updateType?: string;     // Optionaler Untertyp
  emittedAt?: string;      // ISO-Zeitstempel
}
```

---

## `client.pairing`

### `listPending(): Promise<PairingChallenge[]>`

Gibt Kopplungsanfragen zurück, die auf Controller-Genehmigung warten.

```typescript
const pending = await client.pairing.listPending();
for (const challenge of pending) {
  console.log(challenge.code, challenge.nodeId, challenge.status);
}
```

**Rückgabetyp:**

```typescript
interface PairingChallenge {
  challengeId: string;
  code: string;                             // 6-stelliger Genehmigungscode
  nodeId: string;
  status: 'pending' | 'approved' | 'expired';
  expiresAt: string;                        // ISO-Zeitstempel
}
```

### `approve(options): Promise<void>`

Genehmigt eine ausstehende Kopplungsanfrage.

```typescript
await client.pairing.approve({ code: '123456' });
```

**Optionen:**

| Feld | Typ | Beschreibung |
|---|---|---|
| `code` | `string` | 6-stelliger Kopplungscode von `listPending()` oder dem Erweiterungs-Popup. |

**Wirft:** `OttoError`, wenn der Code nicht genau 6 Ziffern hat oder die Anfrage nicht gefunden wird.

---

## Fehlertypen

Alle Fehlertypen erweitern `OttoError`, das `Error` erweitert. Importieren Sie sie für typisierte `catch`-Blöcke.

```typescript
import {
  OttoError,
  OttoAuthError,
  OttoTimeoutError,
  OttoCommandError,
} from '@telepat/otto-sdk';
```

### `OttoError`

Basisklasse für alle SDK-Fehler.

```typescript
class OttoError extends Error {
  name: 'OttoError';
}
```

### `OttoAuthError`

Wird geworfen, wenn der Anmeldeinformationsaustausch fehlschlägt (falsche `clientId` oder `clientSecret`, Token widerrufen usw.).

```typescript
class OttoAuthError extends OttoError {
  name: 'OttoAuthError';
}
```

### `OttoTimeoutError`

Wird geworfen, wenn das SDK keine Antwort innerhalb des konfigurierten Timeouts erhält.

```typescript
class OttoTimeoutError extends OttoError {
  name: 'OttoTimeoutError';
}
```

### `OttoCommandError`

Wird geworfen, wenn ein Befehl mit einem nicht-`completed`-Ergebnis abschließt.

```typescript
class OttoCommandError extends OttoError {
  name: 'OttoCommandError';
  commandOutcome: string;  // 'failed' | 'timed_out' | 'cancelled'
}
```

### Fehlerbehandlungsmuster

```typescript
import { OttoError, OttoAuthError, OttoTimeoutError, OttoCommandError } from '@telepat/otto-sdk';

try {
  await client.commands.run({ nodeId, site: 'reddit.com', command: 'getPosts' });
} catch (err) {
  if (err instanceof OttoAuthError) {
    // Anmeldeinformationen sind falsch oder Token wurde widerrufen
  } else if (err instanceof OttoTimeoutError) {
    // Keine Antwort vom Node innerhalb des Timeout-Fensters
  } else if (err instanceof OttoCommandError) {
    console.error('Ergebnis:', err.commandOutcome); // 'failed' | 'timed_out' | 'cancelled'
  } else if (err instanceof OttoError) {
    // Anderer Relay-/Protokollfehler
  } else {
    throw err; // Unerwartete Fehler erneut werfen
  }
}
```

---

## Typ-Exporte

Alle öffentlichen Typen werden vom Paket-Root exportiert:

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
