---
title: JavaScript SDK
sidebar_position: 1
description: Verwenden Sie das @telepat/otto-sdk-Paket, um Otto in jede JavaScript- oder TypeScript-Anwendung zu integrieren — Node.js, Cloudflare Workers, Deno oder jede Laufzeitumgebung mit nativem fetch und WebSocket.
keywords:
  - otto sdk
  - javascript sdk
  - typescript sdk
  - controller sdk
  - npm-paket
---

# JavaScript SDK

`@telepat/otto-sdk` ist das offizielle TypeScript/JavaScript SDK zur Integration von Otto in Drittanbieter-Anwendungen. Es wrappt die Relay-WebSocket- und HTTP-APIs in einen sauberen, typsicheren Client, der in Node.js 22+, Cloudflare Workers, Deno und jeder anderen Laufzeitumgebung mit nativem `fetch` und `WebSocket` funktioniert.

```bash
npm install @telepat/otto-sdk
```

## Was Sie mit dem SDK tun können

| Fähigkeit | SDK-Oberfläche |
|---|---|
| Mit dem Relay verbundene Nodes auflisten | `client.nodes.list()` |
| Verfügbare Befehle auf einem Node auflisten | `client.commands.list({ nodeId })` |
| Befehl ausführen und Ergebnis erhalten | `client.commands.run({ nodeId, site, command, input })` |
| Live-Listener-Updates streamen | `client.listeners.subscribe({ nodeId, listener })` |
| Ausstehende Kopplungsanfragen auflisten | `client.pairing.listPending()` |
| Kopplungscode genehmigen | `client.pairing.approve({ code })` |

## Wie es in die Otto-Architektur passt

Das SDK fungiert als **Controller** — dieselbe Rolle wie die `@telepat/otto`-CLI. Befehle fließen von Ihrer Anwendung über das SDK zum Relay, dann zum Browser-Node:

```
Ihre App → @telepat/otto-sdk → Relay → Browser-Node (Erweiterung)
```

Das SDK übernimmt:
- Anmeldeinformationsaustausch (clientId + clientSecret → JWT-Access-Token)
- WebSocket-Lebenszyklus (Verbinden, Auth-Handshake, Heartbeat, Wiederverbindung)
- Anfrage/Antwort-Korrelation über `requestId`
- Typisiertes Streaming über `AsyncIterable` und `EventEmitter`

## Bevor Sie beginnen

Sie benötigen ein laufendes Relay und einen registrierten Controller-Client. Der schnellste Weg:

```bash
# Relay starten
otto start

# Controller-Client registrieren und clientId + clientSecret notieren
otto client register --name "Meine App"
```

Siehe [Erste Schritte](./getting-started.md) für den vollständigen Setup-Walkthrough.

## In diesem Abschnitt

| Seite | Was Sie finden |
|---|---|
| [Erste Schritte](./getting-started.md) | Registrierung, Installation, Verbinden und Ihr erster Befehl |
| [API-Referenz](./api-reference.md) | Vollständige API für OttoClient, Sub-Clients, StreamSession und Fehlertypen |
| [Beispiele](./examples.md) | Praxisnahe Muster: Edge-Laufzeiten, Wiederholung, CI, Streaming |
