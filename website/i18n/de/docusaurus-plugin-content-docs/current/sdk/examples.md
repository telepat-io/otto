---
title: Beispiele
sidebar_position: 4
description: Praxisnahe Anwendungsbeispiele für @telepat/otto-sdk — Streaming, Fehlerbehandlung, Wiederholung, Cloudflare Workers, CI-Automatisierung und Kopplungs-Workflows.
keywords:
  - otto sdk beispiele
  - streaming
  - cloudflare workers
  - ci-automatisierung
  - kopplung
---

# Beispiele

Praxisnahe Muster für `@telepat/otto-sdk`.

## Streaming von Listener-Updates

Die `for await`-Syntax ist der sauberste Weg, Streaming-Daten zu konsumieren.

```typescript
import { OttoClient } from '@telepat/otto-sdk';

const client = new OttoClient({
  relayUrl: process.env.OTTO_RELAY_URL!,
  clientId: process.env.OTTO_CLIENT_ID!,
  clientSecret: process.env.OTTO_CLIENT_SECRET!,
});

await client.connect();
const [node] = await client.nodes.list();

const stream = client.listeners.subscribe({
  nodeId: node.nodeId,
  listener: 'network.http_intercept',
  options: { site: 'reddit.com', pattern: 'https://reddit.com/api/*' },
});

// Bis zu 20 Ereignisse konsumieren, dann stoppen
let count = 0;
for await (const event of stream) {
  console.log(`[${event.emittedAt}]`, event.data);
  if (++count >= 20) break;
}

// break verlässt die Schleife und ruft automatisch unsubscribe() auf
await client.disconnect();
```

## EventEmitter-Streaming-Muster

Nützlich, wenn Sie Ereignisse in einer Callback-basierten Architektur behandeln müssen (z. B. Express-Request-Handler).

```typescript
const stream = client.listeners.subscribe({
  nodeId: node.nodeId,
  listener: 'network.http_intercept',
  options: { site: 'linkedin.com' },
});

stream.on('data', (event) => {
  myDatabase.insert({ timestamp: event.emittedAt, payload: event.data });
});

stream.on('error', (err) => {
  console.error('Stream-Fehler:', err.message);
  stream.unsubscribe();
});

stream.on('end', () => {
  console.log('Stream beendet');
});

// Abonnement starten (wird auch automatisch beim ersten .on() aufgerufen)
await stream.start();

// Nach 60 Sekunden stoppen
setTimeout(() => stream.unsubscribe(), 60_000);
```

## Fehlerbehandlung

Verwenden Sie die typisierte Fehlerhierarchie für präzise Kontrolle.

```typescript
import {
  OttoClient,
  OttoAuthError,
  OttoTimeoutError,
  OttoCommandError,
  OttoError,
} from '@telepat/otto-sdk';

const client = new OttoClient({ ... });

async function runWithErrorHandling() {
  try {
    await client.connect();
    const nodes = await client.nodes.list();

    const result = await client.commands.run({
      nodeId: nodes[0].nodeId,
      site: 'reddit.com',
      command: 'getPosts',
      input: { subreddit: 'programming' },
      timeoutMs: 15_000,
    });

    return result.data;

  } catch (err) {
    if (err instanceof OttoAuthError) {
      // Anmeldeinformationen rotieren und einmal erneut versuchen
      throw new Error('Anmeldeinformationen abgelehnt — OTTO_CLIENT_SECRET rotieren');
    }
    if (err instanceof OttoTimeoutError) {
      // Node hat zu lange gebraucht — anderen Node versuchen
      console.warn('Befehl Timeout, Node wird übersprungen');
      return null;
    }
    if (err instanceof OttoCommandError) {
      if (err.commandOutcome === 'failed') {
        console.error('Befehl auf Node fehlgeschlagen:', err.message);
      } else {
        console.warn('Unerwartetes Ergebnis:', err.commandOutcome);
      }
      return null;
    }
    if (err instanceof OttoError) {
      // Generischer Relay-Fehler
      console.error('Relay-Fehler:', err.message);
      return null;
    }
    throw err;

  } finally {
    await client.disconnect();
  }
}
```

## Wiederholung mit exponentiellem Backoff

```typescript
async function runWithRetry(
  client: OttoClient,
  options: Parameters<OttoClient['commands']['run']>[0],
  maxAttempts = 3,
): Promise<CommandResult> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await client.commands.run(options);
    } catch (err) {
      // Auth-Fehler nicht wiederholen
      if (err instanceof OttoAuthError) throw err;

      lastError = err;
      const delayMs = Math.min(500 * 2 ** (attempt - 1), 8_000);
      console.warn(`Versuch ${attempt} fehlgeschlagen, Wiederholung in ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
```

## Cloudflare Workers

Das SDK hat keine Node.js-spezifischen Abhängigkeiten und funktioniert daher in jeder WinterTC-kompatiblen Laufzeitumgebung.

```typescript
// worker.ts
import { OttoClient } from '@telepat/otto-sdk';

interface Env {
  OTTO_RELAY_URL: string;
  OTTO_CLIENT_ID: string;
  OTTO_CLIENT_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { searchParams } = new URL(request.url);
    const subreddit = searchParams.get('subreddit') ?? 'programming';

    const client = new OttoClient({
      relayUrl: env.OTTO_RELAY_URL,
      clientId: env.OTTO_CLIENT_ID,
      clientSecret: env.OTTO_CLIENT_SECRET,
    });

    await client.connect();

    try {
      const nodes = await client.nodes.list();
      if (nodes.length === 0) {
        return Response.json({ error: 'Keine Nodes verfügbar' }, { status: 503 });
      }

      const result = await client.commands.run({
        nodeId: nodes[0].nodeId,
        site: 'reddit.com',
        command: 'getPosts',
        input: { subreddit, limit: 25 },
        timeoutMs: 20_000,
      });

      return Response.json(result.data);
    } finally {
      await client.disconnect();
    }
  },
} satisfies ExportedHandler<Env>;
```

## CI / geplante Automatisierung

Führen Sie das SDK in einem GitHub-Actions-Workflow, Temporal-Worker oder einem beliebigen geplanten Job aus.

```typescript
// scripts/collect-data.ts
import { OttoClient, OttoError } from '@telepat/otto-sdk';

const SITES: Array<{ site: string; command: string; input: Record<string, unknown> }> = [
  { site: 'reddit.com', command: 'getPosts', input: { subreddit: 'typescript' } },
  { site: 'reddit.com', command: 'getPosts', input: { subreddit: 'javascript' } },
];

async function main() {
  const client = new OttoClient({
    relayUrl: process.env.OTTO_RELAY_URL!,
    clientId: process.env.OTTO_CLIENT_ID!,
    clientSecret: process.env.OTTO_CLIENT_SECRET!,
  });

  await client.connect();
  const nodes = await client.nodes.list();

  if (nodes.length === 0) {
    console.error('Keine Nodes verfügbar');
    process.exit(1);
  }

  const nodeId = nodes[0].nodeId;
  const results = await Promise.allSettled(
    SITES.map((task) =>
      client.commands.run({ nodeId, ...task, timeoutMs: 45_000 }),
    ),
  );

  for (const [i, outcome] of results.entries()) {
    const task = SITES[i];
    if (outcome.status === 'fulfilled') {
      console.log(`✓ ${task.site}/${task.command}:`, outcome.value.durationMs, 'ms');
    } else {
      console.error(`✗ ${task.site}/${task.command}:`, outcome.reason?.message);
    }
  }

  await client.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

## Kopplungs-Workflow

Genehmigen Sie neue Erweiterungsverbindungen von Ihrer Anwendung aus statt von der CLI.

```typescript
import { OttoClient } from '@telepat/otto-sdk';
import * as readline from 'node:readline/promises';

const client = new OttoClient({ ... });
await client.connect();

// Auf ausstehende Anfragen pollen
const pending = await client.pairing.listPending();
console.log(`${pending.length} ausstehende Kopplungsanfrage(n) gefunden:`);

for (const challenge of pending) {
  console.log(`  - Code: ${challenge.code}  (Node: ${challenge.nodeId})`);
}

if (pending.length === 0) {
  console.log('Keine ausstehenden Anfragen. Öffnen Sie die Erweiterung und klicken Sie auf "Mit Controller koppeln".');
  await client.disconnect();
  process.exit(0);
}

// Interaktiv genehmigen
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const code = await rl.question('6-stelligen Code zur Genehmigung eingeben: ');
rl.close();

await client.pairing.approve({ code });
console.log('Kopplung genehmigt!');

await client.disconnect();
```

## Automatische Genehmigung in vertrauenswürdigen Umgebungen

In Umgebungen, in denen Sie sowohl das Relay als auch die Erweiterung kontrollieren, können Sie alle ausstehenden Kopplungen beim Start automatisch genehmigen.

```typescript
async function autoApprovePending(client: OttoClient): Promise<void> {
  const pending = await client.pairing.listPending();
  for (const challenge of pending) {
    await client.pairing.approve({ code: challenge.code });
    console.log(`Kopplung automatisch genehmigt: ${challenge.nodeId}`);
  }
}

await client.connect();
await autoApprovePending(client);
const nodes = await client.nodes.list();
// Alle frisch genehmigten Nodes erscheinen jetzt hier
```

## Warten auf Verfügbarkeit eines Nodes

Wenn Sie einen neuen Node bereitstellen und warten möchten, bis er verbunden ist, bevor Sie Befehle ausführen:

```typescript
async function waitForNode(client: OttoClient, maxWaitMs = 30_000): Promise<Node> {
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const nodes = await client.nodes.list();
    if (nodes.length > 0) return nodes[0];

    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(`Kein Node nach ${maxWaitMs}ms verbunden`);
}

const node = await waitForNode(client);
console.log('Node bereit:', node.nodeId);
```

## TypeScript — typisierte Befehlseingaben

Definieren Sie Schemata für häufig verwendete Befehle, um Fehler zur Kompilierzeit zu erkennen.

```typescript
interface GetFeedInput {
  subreddit: string;
  limit?: number;
  sort?: 'hot' | 'new' | 'top';
}

interface GetFeedOutput {
  posts: Array<{
    id: string;
    title: string;
    score: number;
    url: string;
  }>;
}

async function getRedditFeed(
  client: OttoClient,
  nodeId: string,
  input: GetFeedInput,
): Promise<GetFeedOutput> {
  const result = await client.commands.run({
    nodeId,
    site: 'reddit.com',
    command: 'getPosts',
    input: input as Record<string, unknown>,
    timeoutMs: 20_000,
  });

  if (!result.ok) {
    throw new Error(`getPosts fehlgeschlagen: ${result.error}`);
  }

  return result.data as GetFeedOutput;
}
```
