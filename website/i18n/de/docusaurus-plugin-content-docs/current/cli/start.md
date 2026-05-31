---
title: Relay-Lebenszyklus
sidebar_position: 2
description: CLI-Befehle zum Starten, Stoppen und Inspizieren des Otto-Relay-Daemons. Deckt otto start, otto stop und otto status mit allen Flags ab.
keywords:
  - otto start
  - otto stop
  - otto status
  - Relay-Daemon
  - Relay-Lebenszyklus
---

# Relay-Lebenszyklus

Starten, stoppen und inspizieren Sie den Otto-Relay-Daemon.

## `otto start`

Startet den Relay-Daemon als Hintergrundprozess.

### Verwendung

```bash
otto start [Optionen]
```

### Flags

| Flag | Kurzform | Erforderlich | Typ | Standard | Beschreibung |
|---|---|---|---|---|---|
| `--attached` | | Nein | boolean | false | Im verbundenen Modus ausführen, Protokolle werden nach stdout gestreamt statt als Daemon |
| `--port` | | Nein | number | 8787 | Port, auf dem das Relay gestartet werden soll |

### Beispiele

```bash
# Relay-Daemon im Hintergrund starten
otto start

# Relay mit Protokollen im Terminal starten (Entwicklungsmodus)
otto start --attached

# Relay auf einem benutzerdefinierten Port starten
otto start --port 9000
```

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Relay erfolgreich gestartet |
| `1` | Start fehlgeschlagen (Portkonflikt, fehlende Konfiguration usw.) |

---

## `otto stop`

Stoppt den laufenden Relay-Daemon.

### Verwendung

```bash
otto stop
```

### Beispiele

```bash
otto stop
```

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Relay erfolgreich gestoppt |
| `1` | Kein Relay läuft oder Stopp fehlgeschlagen |

---

## `otto restart`

Startet den Relay-Daemon neu. Wenn das Relay nicht läuft, startet dieser Befehl es.

### Verwendung

```bash
otto restart [Optionen]
```

### Flags

| Flag | Kurzform | Erforderlich | Typ | Standard | Beschreibung |
|---|---|---|---|---|---|
| `--port` | | Nein | number | aktueller Daemon-Port oder `8787` | Port für den Neustart des Relays |
| `--attached` | `-a` | Nein | boolean | false | Im Vordergrund verbunden ausführen und Protokolle ins aktuelle Terminal streamen |

### Beispiele

```bash
otto restart
otto restart --port 9000
otto restart --attached
```

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Relay erfolgreich neu gestartet |
| `1` | Neustart des Relays fehlgeschlagen |

---

## `otto status`

Meldet, ob der Relay-Daemon läuft. Verwenden Sie `--nodes`, um verbundene Node-IDs einzuschließen.

### Verwendung

```bash
otto status [--nodes] [--json]
```

### Beispiele

```bash
otto status
otto status --nodes
otto status --nodes --json
```

Wenn gestoppt, schlägt `otto status` vor, `otto start` auszuführen.

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Status erfolgreich gemeldet |

---

## Verwandte Befehle

- [otto setup](./setup.md) — Ersteinrichtung, stellt auch die Daemon-Bereitschaft sicher.
- [otto logs follow](./logs.md) — Live-Relay-Protokolle nach dem Start verfolgen.
