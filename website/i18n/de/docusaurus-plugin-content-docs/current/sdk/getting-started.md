---
title: Erste Schritte
sidebar_position: 2
description: Installieren Sie @telepat/otto-sdk, registrieren Sie einen Controller-Client beim Relay und führen Sie Ihren ersten Befehl in einer JavaScript- oder TypeScript-Anwendung aus.
keywords:
  - otto sdk
  - erste schritte
  - installieren
  - controller-registrierung
  - erster befehl
---

# Erste Schritte mit dem JavaScript SDK

Dieser Leitfaden führt Sie von null bis zur Ausführung Ihres ersten Befehls über `@telepat/otto-sdk`.

## Voraussetzungen

- Ein laufendes Otto-Relay (`otto start`). Siehe [Installation](/installation), falls Sie dies noch nicht eingerichtet haben.
- Node.js 22+ (oder eine Edge-Laufzeitumgebung — siehe [Edge-Laufzeiten](#edge-laufzeiten)).
- npm, yarn oder pnpm.

## Schritt 1 — Controller-Client registrieren

Das SDK authentifiziert sich als **Controller-Client**. Sie benötigen eine `clientId` und ein `clientSecret` vom Relay, bevor Sie das SDK verwenden können.

**Über die Otto-CLI (empfohlen):**

```bash
otto client register --name "Meine App"
```

Dies gibt eine `clientId` und ein `clientSecret` aus. Bewahren Sie sie sicher auf — das Relay speichert nur einen Hash des Secrets und kann es nicht wiederherstellen.

**Über HTTP (Relay muss `OTTO_ALLOW_REMOTE_CONTROLLER_REGISTRATION=1` haben):**

```bash
curl -X POST http://localhost:8787/api/controller/register \
  -H 'Content-Type: application/json' \
  -d '{"name": "Meine App", "description": "Automatisierungs-Worker"}'
```

```json
{
  "clientId": "clt_abc123",
  "clientSecret": "cs_xxxxxxxxxxxx",
  "createdAt": 1776162000000
}
```

## Schritt 2 — Paket installieren

```bash
npm install @telepat/otto-sdk
```

```bash
yarn add @telepat/otto-sdk
```

```bash
pnpm add @telepat/otto-sdk
```

## Schritt 3 — Client erstellen und verbinden

```typescript
import { OttoClient } from '@telepat/otto-sdk';

const client = new OttoClient({
  relayUrl: 'wss://relay.example.com',    // oder ws://localhost:8787 für lokale Entwicklung
  clientId: process.env.OTTO_CLIENT_ID!,
  clientSecret: process.env.OTTO_CLIENT_SECRET!,
});

await client.connect();
console.log('Verbunden:', client.isConnected()); // true
```

`connect()` tauscht Ihre Anmeldeinformationen gegen ein JWT-Access-Token ein und öffnet dann einen authentifizierten WebSocket. Mehrfachaufrufe sind sicher — nachfolgende Aufrufe sind No-Ops, wenn bereits verbunden.

:::tip
Hardcodieren Sie `clientSecret` niemals im Quellcode. Verwenden Sie Umgebungsvariablen oder einen Secrets-Manager.
:::

## Schritt 4 — Verbundene Nodes auflisten

```typescript
const nodes = await client.nodes.list();
console.log(nodes);
// [{ nodeId: 'node_local_1' }, ...]
```

Nodes, die hier erscheinen, sind sowohl mit dem Relay verbunden als auch haben Ihrem Controller ACL-Zugriff gewährt. Wenn die Liste leer ist, lesen Sie den [Kopplungsleitfaden](/guides/pairing-auth).

## Schritt 5 — Befehl ausführen

```typescript
const result = await client.commands.run({
  nodeId: nodes[0].nodeId,
  site: 'reddit.com',
  command: 'getPosts',
  input: { subreddit: 'typescript', limit: 10 },
});

if (result.ok) {
  console.log(result.data);      // Befehlsausgabe
  console.log(result.durationMs); // Ausführungszeit in ms
}
```

## Schritt 6 — Trennen

```typescript
await client.disconnect();
```

## Alles zusammen

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
      throw new Error('Keine Nodes verbunden');
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
      console.error('Authentifizierung fehlgeschlagen — clientId und clientSecret prüfen');
    } else if (err instanceof OttoCommandError) {
      console.error('Befehl fehlgeschlagen:', err.message, '(outcome:', err.commandOutcome, ')');
    } else {
      throw err;
    }
  } finally {
    await client.disconnect();
  }
}

main();
```

## Edge-Laufzeiten

Das SDK verwendet nur natives `fetch` und `WebSocket` — keine Node.js-spezifischen Module. Es läuft in:

- **Cloudflare Workers**
- **Deno**
- **Bun**
- Jeder Laufzeitumgebung, die natives `fetch` und `WebSocket` bereitstellt

```typescript
// Cloudflare Worker Beispiel
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

## Umgebungsvariablen-Referenz

| Variable | Wert |
|---|---|
| `OTTO_RELAY_URL` | WebSocket-URL, z. B. `wss://relay.example.com` |
| `OTTO_CLIENT_ID` | `clientId` aus der Controller-Registrierung |
| `OTTO_CLIENT_SECRET` | `clientSecret` aus der Controller-Registrierung |

## Nächste Schritte

- [API-Referenz](./api-reference.md) — vollständige Methodensignaturen und Typdefinitionen
- [Beispiele](./examples.md) — Streaming, Wiederholungsmuster, CI-Integration und mehr
- [Fehlercodes](/error-codes) — Relay-Fehlercodes, auf die Sie stoßen können
