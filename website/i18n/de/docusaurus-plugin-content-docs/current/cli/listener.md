---
title: Listener
sidebar_position: 10
description: CLI-Referenz für otto listener-Befehle — Netzwerkinterceptions-Streams abonnieren, deabonnieren und aktive Listener auflisten.
keywords:
  - otto listener
  - subscribe-network
  - Netzwerkinterception
  - listener unsubscribe
  - otto listener list
---

# Listener

Netzwerkinterceptions-Streams abonnieren, aktive Listener verwalten und deabonnieren.

## `otto listener subscribe-network`

Abonniert einen Netzwerkinterceptions-Listener auf einem verwalteten Tab und streamt abgefangene HTTP-Antworten.

### Verwendung

```bash
otto listener subscribe-network [Optionen]
```

### Flags

| Flag | Kurzform | Erforderlich | Typ | Standard | Erlaubte Werte | Beschreibung |
|---|---|---|---|---|---|---|
| `--tab-session` | | Ja | string | | | Tab-Session-ID, an die der Listener angehängt werden soll |
| `--site` | `-s` | Ja | string | | | Site-Bereich (z. B. `reddit.com`) — wird gegen Tab-URL validiert |
| `--pattern` | | Nein | string[] | | | URL-Glob-Muster zum Abfangen (wiederholbar) |
| `--request-host` | | Nein | string[] | | | Explizite Cross-Host-Allowlist (wiederholbar) |
| `--mode` | | Nein | string | `network` | `network`, `fetch`, `hybrid` | Interceptions-Aufnahmemodus |
| `--include-body` | | Nein | boolean | true | | Antwort-Body in Updates einschließen |
| `--include-headers` | | Nein | boolean | false | | Antwort-Header einschließen (sensible Header werden redigiert) |
| `--max-body-bytes` | | Nein | number | 256000 | | Maximale Bytes des Antwort-Bodys zum Erfassen |
| `--mime-types` | | Nein | string[] | | | MIME-Präfix-Allowlist (wiederholbar) |
| `--node-id` | | Nein | string | Automatisch ausgewählt | | Ziel-Node-ID |
| `--json` | | Nein | boolean | false | | Stream-Updates als NDJSON ausgeben |

### Beispiele

```bash
# Grundlegendes Netzwerk-Abonnement für Reddit-API-Verkehr
otto listener subscribe-network \
  --tab-session <tabSessionId> \
  --site reddit.com \
  --pattern 'https://www.reddit.com/api/*'

# Hochvolumen-Aufnahme mit Body-Limit
otto listener subscribe-network \
  --tab-session <tabSessionId> \
  --site reddit.com \
  --request-host matrix.redditspace.com \
  --pattern 'https://matrix.redditspace.com/_matrix/client/v3/*' \
  --mode network \
  --max-body-bytes 200000

# Hybride Aufnahme mit Headern und JSON-Ausgabe
otto listener subscribe-network \
  --tab-session <tabSessionId> \
  --site reddit.com \
  --mode hybrid \
  --include-headers \
  --json
```

### Stream-Ausgabe

Jede abgefangene Antwort wird als `listener_update`-Frame ausgegeben. Der Stream läuft bis:

- `otto listener unsubscribe` mit der subscribe-`requestId` aufgerufen wird
- Die Tab-Session geschlossen wird
- `Ctrl+C` gedrückt wird (sendet automatisch unsubscribe)

Die subscribe-`requestId` wird beim Start ausgegeben — speichern Sie sie, um später von einem anderen Terminal aus zu deabonnieren.

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Abonniert und streamend |
| `1` | Abonnement fehlgeschlagen (ungültige Tab-Session, Site-Mismatch usw.) |

---

## `otto listener unsubscribe`

Deabonniert einen aktiven Netzwerk-Listener anhand seiner subscribe-`requestId`.

### Verwendung

```bash
otto listener unsubscribe [Optionen]
```

### Flags

| Flag | Kurzform | Erforderlich | Typ | Standard | Beschreibung |
|---|---|---|---|---|---|
| `--target-request-id` | | Ja | string | | Die von `subscribe-network` zurückgegebene `requestId` |
| `--node-id` | | Nein | string | Automatisch ausgewählt | Ziel-Node-ID |

### Beispiele

```bash
otto listener unsubscribe --target-request-id <subscribeRequestId>
```

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Erfolgreich deabonniert |
| `1` | Listener nicht gefunden oder Relay-Fehler |

---

## `otto listener list`

Listet aktive Netzwerk-Listener auf dem verbundenen Node auf.

### Verwendung

```bash
otto listener list [Optionen]
```

### Flags

| Flag | Kurzform | Erforderlich | Typ | Standard | Beschreibung |
|---|---|---|---|---|---|
| `--node-id` | | Nein | string | Automatisch ausgewählt | Ziel-Node-ID |
| `--json` | | Nein | boolean | false | Als JSON ausgeben |

### Beispiele

```bash
otto listener list

otto listener list --json
```

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Listener aufgelistet |
| `1` | Relay- oder Node-Fehler |

---

## Verwandte Befehle

- [otto test](./commands.md) — stream-fähige Befehle mit integrierter Listener-Verwaltung ausführen.
- [Listener-Entwicklung](../guides/listener-development.md) — stream-fähige Befehle erstellen.
- [Protokollierung und Debugging](../logging-debugging.md) — Listener- und Stream-Probleme diagnostizieren.
