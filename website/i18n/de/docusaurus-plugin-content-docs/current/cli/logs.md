---
title: Protokolle
sidebar_position: 9
description: CLI-Referenz für otto logs-Befehle — Relay-Betriebsprotokolle auflisten, verfolgen, Status prüfen und exportieren mit Quell- und Filteroptionen.
keywords:
  - otto logs
  - logs list
  - logs follow
  - logs export
  - Protokollquellen
---

# Protokolle

Relay-Betriebsprotokolle abfragen, verfolgen und exportieren. Protokolle umfassen relay-native Ereignisse, Controller-Ereignisse und Erweiterungs-Node-Ereignisse, die vom Browser gestreamt werden.

## `otto logs list`

Ruft eine begrenzte Liste historischer Protokolleinträge ab.

### Verwendung

```bash
otto logs list [Optionen]
```

### Flags

| Flag | Kurzform | Erforderlich | Typ | Standard | Erlaubte Werte | Beschreibung |
|---|---|---|---|---|---|---|
| `--source` | | Nein | string | `all` | `relay`, `controller`, `node`, `all` | Nach Protokollquelle filtern |
| `--latest` | | Nein | number | 100 | | Die neuesten N Einträge zurückgeben |
| `--level` | | Nein | string | | `debug`, `info`, `warn`, `error` | Nach Protokollebene filtern |
| `--since` | | Nein | string | | ISO-8601-Datetime | Einträge nach diesem Zeitstempel zurückgeben |
| `--node-id` | | Nein | string | | | Nach Node-ID filtern |
| `--request-id` | | Nein | string | | | Nach requestId filtern |
| `--json` | | Nein | boolean | false | | Als NDJSON ausgeben |

### Beispiele

```bash
# Die neuesten 100 Einträge aus allen Quellen abrufen
otto logs list

# Die neuesten 200 Einträge abrufen
otto logs list --latest 200

# Nur erweiterungsseitige Protokolle abrufen
otto logs list --source node --latest 50

# Mit einer bestimmten Anfrage korrelierte Protokolle abrufen
otto logs list --request-id <requestId> --source all

# Maschinenlesbare Ausgabe
otto logs list --json
```

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Protokolle zurückgegeben |
| `1` | Relay-Fehler oder ungültiger Filter |

---

## `otto logs follow`

Streamt Live-Protokollereignisse vom Relay. Läuft bis `Ctrl+C`.

### Verwendung

```bash
otto logs follow [Optionen]
```

### Flags

| Flag | Kurzform | Erforderlich | Typ | Standard | Erlaubte Werte | Beschreibung |
|---|---|---|---|---|---|---|
| `--source` | | Nein | string | `all` | `relay`, `controller`, `node`, `all` | Nach Protokollquelle filtern |
| `--level` | | Nein | string | | `debug`, `info`, `warn`, `error` | Nach Ebene filtern |
| `--json` | | Nein | boolean | false | | Als NDJSON ausgeben (ein Envelope pro Zeile) |

### Beispiele

```bash
# Alle Quellen live verfolgen
otto logs follow

# Nur Erweiterungs-Laufzeitprotokolle verfolgen
otto logs follow --source node

# Mit vollständigen JSON-Envelopes verfolgen
otto logs follow --source all --json

# Nur Relay-Ereignisse verfolgen
otto logs follow --source relay
```

:::note
`otto logs follow` ist unbegrenzt. Für die Automatisierung erzwingen Sie ein aufruferseitiges Timeout-Fenster und leiten Sie an Ihren Log-Aggregator weiter.
:::

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Sauber beendet (Ctrl+C) |
| `1` | Verbindungsfehler |

---

## `otto logs status`

Meldet den Speicherstatus der Relay-Betriebsprotokolldateien.

### Verwendung

```bash
otto logs status [Optionen]
```

### Flags

| Flag | Kurzform | Erforderlich | Typ | Standard | Beschreibung |
|---|---|---|---|---|---|
| `--json` | | Nein | boolean | false | Als JSON ausgeben |

### Beispiele

```bash
otto logs status

otto logs status --json
```

Die Ausgabe umfasst die Gesamtbytes aller Betriebsprotokolldateien und aktive Fensterungseinstellungen.

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Status gemeldet |
| `1` | Relay-Fehler |

---

## `otto logs export`

Exportiert einen Ausschnitt der Betriebsprotokolle als NDJSON nach stdout oder in eine Datei.

### Verwendung

```bash
otto logs export [Optionen]
```

### Flags

| Flag | Kurzform | Erforderlich | Typ | Standard | Erlaubte Werte | Beschreibung |
|---|---|---|---|---|---|---|
| `--source` | | Nein | string | `all` | `relay`, `controller`, `node`, `all` | Nach Quelle filtern |
| `--latest` | | Nein | number | | | Neueste N Einträge exportieren |
| `--since` | | Nein | string | | ISO-8601-Datetime | Einträge nach diesem Zeitstempel exportieren |
| `--level` | | Nein | string | | `debug`, `info`, `warn`, `error` | Nach Ebene filtern |
| `--node-id` | | Nein | string | | | Nach Node-ID filtern |
| `--request-id` | | Nein | string | | | Nach requestId filtern |
| `--output` | `-o` | Nein | string | stdout | | Ausgabedateipfad |

### Beispiele

```bash
# Neueste 500 Relay-Einträge exportieren
otto logs export --source relay --latest 500

# In Datei exportieren
otto logs export --source all --latest 1000 --output ./logs.ndjson

# Korrelierte Protokolle für einen Vorfall exportieren
otto logs export --request-id <requestId> --source all
```

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Export abgeschlossen |
| `1` | Relay-Fehler oder Schreibfehler |

---

## Verwandte Befehle

- [otto listener subscribe-network](./listener.md) — Netzwerkinterceptions-Streams abonnieren.
- [Protokollierung und Debugging](../logging-debugging.md) — Debugging-Workflows und Ereignismodell.
- [RequestId-Korrelations-Runbook](../guides/requestid-correlation-runbook.md) — Leitfaden zur Vorfallskorrelation.
