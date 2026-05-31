---
title: Praktische Anwendungsfälle
sidebar_position: 7
description: Häufige Otto-Automatisierungsworkflows zugeordnet zu zuverlässigen Befehlspfaden. Behandelt frisches Setup, neue Befehlsvalidierung, Stream-Testing, ACL-Genehmigungen, Protokollkorrelation und Screenshots.
keywords:
  - anwendungsfälle
  - automatisierungsworkflows
  - befehlsbeispiele
  - otto test
  - stream-testing
---

# Praktische Anwendungsfälle

Diese Seite ordnet häufige Otto-Automatisierungsworkflows den schnellsten zuverlässigen Befehlspfaden zu. Verwenden Sie die Szenariomatrix, um Ihren Ablauf auszuwählen, und folgen Sie dann dem passenden Runbook.

## Szenariomatrix

| Szenario | Hauptziel | Startbefehl |
|---|---|---|
| Erster Befehl bei frischem Setup | End-to-End-Konnektivität bestätigen | `otto commands list` |
| Neuen Befehl hinzufügen und validieren | Metadaten, Ausführung und Tests überprüfen | `otto test <site> <command>` |
| Stream-Test und -Abbau | Listener-Korrelation und Abbruch bestätigen | `otto test <site> <streamCommand> --stream-follow-ms <ms> --json` |
| ACL-Genehmigung für Controller-Client | Node-gerichtetes Routing autorisieren | `otto client register` + Node-Genehmigungsablauf |
| requestId-Korrelation | Eine Ausführung über alle Komponenten verfolgen | `otto logs list --request-id <id> --source all` |
| Seiten-Screenshots erfassen | Visuelles Artefakt aus verwaltetem Tab erhalten | `otto cmd --action primitive.page.screenshot` |

## Anwendungsfall 1: Erster Befehl bei frischem Setup

**Ziel:** End-to-End-Konnektivität nach der ersten Installation von Otto validieren.

```bash
# Ausstehende Kopplungscodes aus Erweiterung bestätigen
otto authcode

# Kopplungscode genehmigen
otto pair 123-456

# Bestätigen, dass Node verbunden ist und Befehle sichtbar sind
otto commands list

# Verwalteten Tab öffnen
otto cmd --action primitive.tab.open --payload '{"url":"https://www.reddit.com"}'

# Seitenbefehl ausführen (verwenden Sie tabSessionId aus tab.open-Ergebnis)
otto cmd --action command.run \
  --payload '{"site":"reddit.com","command":"getPosts"}' \
  --tab-session <tabSessionId>
```

**Überprüfen:** `commands list` gibt ein JSON-Array zurück. `command.run` gibt `messageType: result` zurück und beendet sich mit Code `0`.

## Anwendungsfall 2: Neuen Befehl hinzufügen und validieren

**Ziel:** Einen neuen Seitenbefehl implementieren und bestätigen, dass er alle Validierungstoren besteht.

1. Erstellen Sie das Befehlsmodul (siehe [Befehlsautorenschaft](./command-authoring.md)).
2. Registrieren Sie es im Seitenbundle-Index.
3. Führen Sie die Arbeitsbereichsvalidierung aus:

```bash
npm run check
npm run lint
npm run build
npm run -ws --if-present test
```

4. Überprüfen Sie Discovery und Ausführung:

```bash
otto commands list --site example.com
otto test example.com getItems
otto test example.com getItems --payload '{"limit": 5}'
```

## Anwendungsfall 3: Stream-Test und -Abbau

**Ziel:** Listener-Manifeste, Stream-Follow-Verhalten und Abbruch-Abbau-Semantik validieren.

```bash
otto test reddit.com getChatMessages --stream-follow-ms 45000 --json
```

**Erwartet:** Listener-Updates werden durch Subscribe-`requestId` korreliert. Ctrl+C löst `command_cancel` aus und schließt den automatisch geöffneten Tab.

Für rohe Listener-Validierung vor dem Debuggen der Befehlsverrohrung:

```bash
otto listener subscribe-network \
  --tab-session <tabSessionId> \
  --site reddit.com \
  --pattern 'https://matrix.redditspace.com/_matrix/client/v3/*' \
  --mode network \
  --max-body-bytes 200000
```

## Anwendungsfall 4: ACL-Genehmigung für einen Controller-Client

**Ziel:** Einen registrierten Controller-Client autorisieren, Befehle an einen Node weiterzuleiten.

Controller-Registrierung und Token-Austausch sind erfolgreich, bevor Node-Routingzugriff gewährt wird. Die node-eigene ACL-Genehmigung ist das finale Gate für node-gerichtete Befehle.

```bash
# 1. Client registrieren
otto client register --name "automation-worker"

# 2. Token ausstellen
otto client login

# 3. Genehmigung vom Node über Relay-ACL-Endpunkt
# POST /api/controller/access  (Node-Bearer-Token erforderlich)
```

Ohne die Genehmigung schlägt das Befehlsrouting mit `acl_missing_node_grant` fehl.

## Anwendungsfall 5: requestId-Protokollkorrelation

**Ziel:** Eine fehlgeschlagene Anfrage über Controller, Relay und Erweiterungs-Node verfolgen.

```bash
# Live-Protokoll-Verfolgung für alle Quellen starten
otto logs follow --source all

# In einem anderen Terminal den Fehler reproduzieren
otto test reddit.com getChatMessages --json 2>&1 | grep requestId

# Begrenzte Node-Beweise abfragen, die auf diese requestId beschränkt sind
otto logs list --source node --latest 300
```

Schritt-für-Schritt-Verfahren finden Sie unter [requestId-Korrelations-Runbook](./requestid-correlation-runbook.md).

## Anwendungsfall 6: Seiten-Screenshots erfassen

**Ziel:** Ein visuelles Artefakt aus einem verwalteten Tab als Teil eines Automatisierungsworkflows erhalten.

```bash
# Screenshot des aktuellen Viewports
otto cmd --action primitive.page.screenshot \
  --payload '{"tabSessionId":"<tabSessionId>","mode":"viewport","format":"png"}'

# Vollständiger Seiten-Screenshot von einer URL (öffnet und schließt automatisch einen Hintergrundtab)
otto cmd --action primitive.page.screenshot \
  --payload '{"url":"https://example.com","mode":"full_page","format":"jpeg","quality":85,"maxBytes":1200000}'
```

## Nächste Schritte

- [Befehlsautorenschaft](./command-authoring.md) — neuen Seitenbefehl hinzufügen.
- [Erweiterte Fehlerbehebung](./troubleshooting-advanced.md) — Fehler über Komponenten hinweg debuggen.
- [Wiederverwendbare Snippets](../snippets.md) — kopierbare curl- und WebSocket-Beispiele.