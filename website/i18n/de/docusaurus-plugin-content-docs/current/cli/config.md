---
title: Konfiguration
sidebar_position: 4
description: CLI-Referenz für otto config und otto settings — Lesen und interaktives Bearbeiten der Otto-Controller-Konfiguration, gespeichert unter ~/.otto/config.json.
keywords:
  - otto config
  - otto settings
  - Controller-Konfiguration
  - config.json
---

# Konfiguration

Lesen und Bearbeiten der Otto-Controller-Konfiguration. Die Konfiguration wird unter `~/.otto/config.json` gespeichert.

## `otto config`

Gibt die aktuelle Controller-Konfiguration als JSON aus.

### Verwendung

```bash
otto config
```

### Beispiele

```bash
# Aktuelle Konfiguration ausgeben
otto config
```

Die Ausgabe erfolgt als JSON nach stdout. Felder umfassen Relay-URL, Client-Identität und gespeicherte Einstellungen.

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Konfiguration erfolgreich ausgegeben |
| `1` | Konfigurationsdatei fehlt oder ist nicht lesbar |

---

## `otto settings`

Öffnet einen interaktiven Einstellungseditor zum Aktualisieren globaler Controller-Konfigurationswerte.

### Verwendung

```bash
otto settings
```

### Tastaturkürzel

| Taste | Aktion |
|---|---|
| `↑` / `↓` | Einstellungen navigieren |
| `Enter` | Ausgewählte Einstellung bearbeiten |
| `s` | Änderungen speichern |
| `q` / `Esc` | Beenden ohne Speichern |

### Beispiele

```bash
otto settings
```

Bearbeitbare Felder umfassen die Relay-URL und andere globale Controller-Werte. Änderungen werden nach dem Speichern in `~/.otto/config.json` persistiert.

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Einstellungen gespeichert oder sauber beendet |
| `1` | Schreiben der Konfiguration fehlgeschlagen |

---

## Verwandte Befehle

- [otto setup](./setup.md) — Ersteinrichtung, die die initiale Konfiguration befüllt.
- [otto client status](./client.md) — registrierte Client-Identität inspizieren.
