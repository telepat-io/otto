---
title: Setup
sidebar_position: 3
description: CLI-Referenz für otto setup — der interaktive und nicht-interaktive Ersteinrichtungsassistent, der das Relay installiert, die Erweiterung herunterlädt und den Node koppelt.
keywords:
  - otto setup
  - Setup-Assistent
  - nicht-interaktives Setup
  - Erweiterungsinstallation
  - Relay-Setup
---

# Setup

`otto setup` ist der Ersteinrichtungsassistent, der Relay-Abhängigkeiten installiert, die Erweiterung herunterlädt und installiert, den Relay-Daemon startet und durch die Kopplung führt.

## `otto setup`

### Verwendung

```bash
otto setup [Optionen]
```

### Flags

| Flag | Kurzform | Erforderlich | Typ | Standard | Erlaubte Werte | Beschreibung |
|---|---|---|---|---|---|---|
| `--relay-url` | | Nein | string | | | Zu konfigurierende Relay-URL (überspringt die interaktive Relay-URL-Abfrage) |
| `--non-interactive` | | Nein | boolean | false | | Im nicht-interaktiven Modus ausführen; gibt deterministische JSON-Zusammenfassung aus |
| `--skip-extension` | | Nein | boolean | false | | Schritt zum Herunterladen und Installieren der Erweiterung überspringen |
| `--skip-daemon` | | Nein | boolean | false | | Schritt zum Starten des Relay-Daemons überspringen |

### Beispiele

```bash
# Interaktives Setup — geführter Walkthrough
otto setup

# Nicht-interaktives Setup für CI/Automatisierung
otto setup --non-interactive

# Relay-URL direkt festlegen
otto setup --relay-url http://127.0.0.1:8787

# Erweiterungs-Download überspringen (nur Relay-Setup)
otto setup --skip-extension
```

### Nicht-interaktive JSON-Ausgabe

Im nicht-interaktiven Modus gibt `otto setup` eine JSON-Zusammenfassung aus mit:

- Daemon-Bereitschaft: `started` oder `already_running`
- Erweiterungsmetadaten: Version, Artefaktpfad, Prüfsummenstatus
- Übergabepfad: Relay-URL und nächste Kopplungsschritte

### Setup-Daemon-Verhalten

`otto setup` stellt sicher, dass der Relay-Daemon auf dem konfigurierten Relay-URL-Port läuft, bevor es abgeschlossen wird. Wenn bereits ein Daemon auf diesem Port läuft, verwendet Setup ihn wieder (`already_running`). Wenn der Port mit einem anderen Daemon in Konflikt steht, schlägt Setup mit expliziter Behebung fehl: Führen Sie `otto stop` aus und dann erneut Setup mit der beabsichtigten Relay-URL.

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Setup erfolgreich abgeschlossen |
| `1` | Setup fehlgeschlagen (Portkonflikt, Download-Fehler usw.) |

## Verwandte Befehle

- [otto start](./start.md) — Relay-Daemon unabhängig starten.
- [otto authcode / otto pair](./pairing.md) — Kopplung nach dem Setup abschließen.
- [otto config](./config.md) — gespeicherte Konfiguration inspizieren oder bearbeiten.
