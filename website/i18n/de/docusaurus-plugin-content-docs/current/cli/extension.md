---
title: Erweiterungsverwaltung
sidebar_position: 5
description: CLI-Referenz für otto extension update und otto extension info — das gepackte Otto-Chrome-Erweiterungs-Asset herunterladen und inspizieren.
keywords:
  - otto extension
  - extension update
  - extension info
  - Chrome-Erweiterung
  - Erweiterungs-Download
---

# Erweiterungsverwaltung

Das gepackte Otto-Chrome-Erweiterungs-Asset herunterladen und inspizieren.

## `otto extension update`

Lädt die neueste (oder angegebene) Version der Otto-Erweiterung herunter und speichert sie lokal.

### Verwendung

```bash
otto extension update [Optionen]
```

### Flags

| Flag | Kurzform | Erforderlich | Typ | Standard | Beschreibung |
|---|---|---|---|---|---|
| `--version` | | Nein | string | latest | Bestimmte Erweiterungsversion zum Herunterladen |
| `--output` | `-o` | Nein | string | | Ausgabepfad für die heruntergeladene Erweiterungs-ZIP |

### Beispiele

```bash
# Neueste Erweiterung herunterladen
otto extension update

# Bestimmte Version herunterladen
otto extension update --version 1.2.0

# In einen bestimmten Pfad herunterladen
otto extension update --output ./my-extension.zip
```

Die heruntergeladene ZIP wird vor dem Extrahieren per Prüfsumme verifiziert. Eine Nichtübereinstimmung führt zu einem expliziten Prüfsummenfehler.

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Erweiterung erfolgreich heruntergeladen und verifiziert |
| `1` | Download fehlgeschlagen, Prüfsummenfehler oder Netzwerkfehler |

---

## `otto extension info`

Gibt Metadaten über das aktuell installierte Erweiterungs-Asset aus.

### Verwendung

```bash
otto extension info
```

### Beispiele

```bash
otto extension info
```

Die Ausgabe umfasst Version, Dateipfad und Prüfsummenstatus.

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Info erfolgreich ausgegeben |
| `1` | Keine Erweiterung gefunden oder Metadaten nicht lesbar |

---

## Verwandte Befehle

- [otto setup](./setup.md) — lädt die Erweiterung als Teil der Ersteinrichtung herunter.
