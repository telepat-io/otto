---
title: requestId-Korrelations-Runbook
sidebar_position: 10
description: Verfolgen Sie einen fehlgeschlagenen Otto-Workflow über Controller, Relay und Erweiterungs-Node mithilfe von requestId. Schritt-für-Schritt-Verfahren zur Protokollerfassung, Stream-Pfad-Prüfung und Vorfallsdokumentation.
keywords:
  - requestId
  - Protokollkorrelation
  - Debugging-Runbook
  - otto logs
  - Vorfallsreaktion
---

# requestId-Korrelations-Runbook

Verwenden Sie dieses Runbook, um einen fehlgeschlagenen Workflow über Controller, Relay und Erweiterungs-Node zu verfolgen, indem Sie nach `requestId` korrelieren. Eine einzelne Request-ID umfasst alle drei Komponenten und ist der zuverlässigste Weg, die Fehlerschicht zu isolieren.

## Bevor Sie beginnen

- Otto-Relay läuft und ist erreichbar.
- Lokales Dev-Log-Streaming in den Erweiterungsoptionen aktiviert (für erweiterungsseitige Ereignisse).

## Verfahren

### Schritt 1: Live-Protokollerfassung starten

```bash
otto logs follow --source all
```

Lassen Sie dies in einem separaten Terminal laufen, bevor Sie den Fehler reproduzieren.

### Schritt 2: Fehler reproduzieren

Führen Sie den fehlschlagenden Befehl aus. Verwenden Sie `--json` für maschinenlesbare Ausgabe:

```bash
otto test reddit.com getChatMessages --json 2>&1 | tee /tmp/otto-test-output.txt
```

Erfassen Sie die `requestId` aus der Ausgabe (suchen Sie nach `"requestId": "req_..."` im Ergebnis- oder Fehler-Envelope).

### Schritt 3: Bereichsbezogene Protokollzeitleiste abfragen

```bash
# Vollständige Zeitleiste für diese Anfrage über alle Quellen hinweg
otto logs list --request-id <requestId> --source all

# Nur erweiterungsseitige Ereignisse
otto logs list --source node --latest 300
```

### Schritt 4: Fehlerschicht klassifizieren

| Schicht | Signale, auf die zu achten ist |
|---|---|
| **Controller** | Anfrage hat Controller nie verlassen; Token-Fehler vor WebSocket-Auth |
| **Relay** | `auth`-, Routing-, ACL- oder Sperrereignis in Relay-Protokollen, bevor Node Befehl empfängt |
| **Node** | Befehl von Node empfangen; Ausführungs-, Site-Mismatch- oder Auth-Preflight-Fehler |
| **Stream** | Subscribe erfolgreich, aber keine `listener_update`-Ereignisse; oder Beendigung fehlt |

### Stream-Pfad-Prüfungen

Speziell für Stream-Fehler:

1. Erfassen Sie die **subscribe**-`requestId` (getrennt von der Stream-Befehls-`requestId`).
2. Prüfen Sie, ob `listener_update`-Ereignisse mit der subscribe-`requestId` korrelieren.
3. Prüfen Sie, ob die Beendigung explizit war: `listener.unsubscribe` oder `command_cancel`.

## Schnellreferenz-Befehle

```bash
# Live alle Quellen verfolgen
otto logs follow --source all

# Live nur erweiterungsseitig verfolgen
otto logs follow --source node

# Begrenzte Node-Beweise
otto logs list --source node --latest 300

# Stream-Test mit Follow-Fenster
otto test reddit.com getChatMessages --stream-follow-ms 45000 --json
```

## Vorfallszusammenfassungsvorlage

Füllen Sie dies vor der Eskalation aus:

```
requestId:         req_...
action:            command.run / command.test
site + command:    reddit.com / getChatMessages
targetNodeId:      node_local_1
tabSessionId:      ts_...
fehlerschicht:     relay / node / stream
fehlercode:        tab_busy / acl_missing_node_grant / ...
wiederholbar:      ja / nein
sofortige lösung:  mit Backoff wiederholen / erneut koppeln / Token aktualisieren
prävention:        begrenzte Warte-Richtlinie hinzufügen / Token-Refresh-Lebenszyklus korrigieren
```

## Nächste Schritte

- [Erweiterte Fehlerbehebung](./troubleshooting-advanced.md) — Fehler-zu-Aktion-Tabelle.
- [Controller-Fehlerbehebung Entscheidungsbaum](./controller-troubleshooting-decision-tree.md) — schichtweiser Entscheidungspfad.
- [Fehlercodes](../error-codes.md) — vollständige Fehlercode-Referenz.
