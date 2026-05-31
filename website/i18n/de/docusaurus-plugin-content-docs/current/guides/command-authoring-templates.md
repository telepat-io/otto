---
title: Befehlsautorenschaft-Vorlagen
sidebar_position: 4
description: Kopierfertige TypeScript-Vorlagen für minimale Lesebefehle, Auth-erforderliche Befehle und Stream-Befehl-Test-Hooks.
keywords:
  - befehlsvorlage
  - seitenbefehl
  - stream-befehl
  - auth-erforderlicher befehl
  - typescript-vorlage
---

# Befehlsautorenschaft-Vorlagen

Diese Seite stellt kopierfertige Vorlagen für die drei häufigsten Befehlstypen bereit. Kopieren Sie die Vorlage, die zu Ihrem Anwendungsfall passt, und füllen Sie seitenpezifische Logik ein.

Für Implementierungsdetails siehe [Befehlsautorenschaft](./command-authoring.md).

## Vorlagenindex

| Vorlage | Wann verwenden |
|---|---|
| [Minimaler Lesebefehl](#minimaler-lesebefehl) | Lesen von öffentlichen Daten von einer Seite ohne Auth oder Netzwerkinterception |
| [Auth-erforderlicher Befehl](#auth-erforderlicher-befehl) | Lesen privater Daten, die erfordern, dass der Benutzer angemeldet ist |
| [Stream-Befehl-Test-Hook](#stream-befehl-test-hook) | Befehle, die einen Netzwerkinterceptions-Stream über `command.test` deklarieren |

## Minimaler Lesebefehl

Verwenden Sie dies für öffentliche Seiten-Datenextraktion. Keine Auth-Vorabprüfung, kein Stream-Setup.

```typescript
import type { SiteCommand } from '../types.js';

export const getItemsCommand: SiteCommand = {
  metadata: {
    site: 'example.com',
    id: 'getItems',
    displayName: 'Get Items',
    requiresAuth: false,
    inputFields: [
      { name: 'limit', type: 'number', optional: true, description: 'Max items to return' }
    ]
  },
  async execute(ctx, input) {
    const limit = Number((input as { limit?: number }).limit ?? 20);
    const items = await ctx.executeScript((max: number) => {
      return Array.from(document.querySelectorAll('[data-item]'))
        .slice(0, max)
        .map((el) => ({ text: (el.textContent ?? '').trim() }));
    }, [limit]);
    return { count: items.length, items };
  }
};
```

## Auth-erforderlicher Befehl

Verwenden Sie dies, wenn der Befehl erfordert, dass der Benutzer bei der Seite angemeldet ist. Laufzeit führt `checkLogin` vor `execute` aus und kann `manual_login_required` aussenden, wenn der Benutzer nicht authentifiziert ist.

```typescript
import type { SiteCommand } from '../types.js';

export const getPrivateDataCommand: SiteCommand = {
  metadata: {
    site: 'example.com',
    id: 'getPrivateData',
    displayName: 'Get Private Data',
    requiresAuth: true,
    preloadHost: 'example.com',
    inputFields: []
  },
  async execute(ctx) {
    const profile = await ctx.executeScript(async () => {
      const res = await fetch('/api/me');
      if (!res.ok) throw new Error('profile_fetch_failed');
      return await res.json();
    });
    return { profile };
  }
};
```

:::warning
Automatisieren Sie niemals Anmeldeübermittlung. Wenn der Benutzer nicht angemeldet ist, löst `requiresAuth: true` `manual_login_required` aus und pausiert die Ausführung, damit der Benutzer sich manuell anmeldet.
:::

## Stream-Befehl-Test-Hook

Verwenden Sie dies für Befehle, die einen Netzwerkinterceptions-Stream über `command.test` deklarieren. Der Hook führt einen begrenzten Probe durch, um zu bestätigen, dass Verkehr verfügbar ist, bevor er sich auf den Stream-Pfad festlegt. Wenn die Probe fehlschlägt, greift er auf `execute` zurück.

```typescript
import type { SiteCommand } from '../types.js';

export const getChatMessagesCommand: SiteCommand = {
  metadata: {
    site: 'example.com',
    id: 'getChatMessages',
    displayName: 'Get Chat Messages',
    requiresAuth: true,
    preloadHost: 'chat.example.com',
    inputFields: []
  },
  async execute(ctx) {
    // Fallback: gepufferte Nachrichten über DOM oder fetch zurückgeben
    return { messages: [] };
  },
  async test(ctx, input, helpers) {
    const options = {
      tabSessionId: ctx.tabSessionId,
      site: 'example.com',
      streamAdapter: 'example.chat.v1',
      mode: 'fetch' as const,
      includeBody: true,
      urlPatterns: ['https://api.example.com/chat/events*']
    };

    const intercept = await ctx.startNetworkInterception(options);
    try {
      await ctx.navigateTab('https://chat.example.com');
      const updates = intercept.takeUpdates();
      if (updates.length > 0) {
        return {
          ready: true,
          stream: { listeners: [{ listener: 'network.http_intercept', options }] }
        };
      }
    } finally {
      await intercept.stop();
    }

    // Probe hat keinen Verkehr gefunden — Fallback auf execute
    const bufferedResult = await helpers.execute(input);
    return {
      ready: false,
      fallback: { strategy: 'command_poll', reason: 'intercept_probe_unavailable' },
      bufferedResult
    };
  }
};
```

## Nächste Schritte

- [Befehlsautorenschaft](./command-authoring.md) — vollständige Implementierungsanleitung.
- [Listener-Entwicklung](./listener-development.md) — Stream-Integrationsmuster.
- [Wiederverwendbare Snippets](../snippets.md) — kopierbare curl- und WebSocket-Beispiele.