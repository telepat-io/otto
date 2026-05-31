---
title: Befehlsausführung
sidebar_position: 8
description: CLI-Referenz für otto commands list, otto cmd, otto extract-content und otto test — verfügbare Browser-Befehle durchsuchen, einmalige Aktionen ausführen, Seiteninhalte extrahieren und Stream-Test-Sessions ausführen.
keywords:
  - otto commands list
  - otto cmd
  - otto extract-content
  - otto test
  - Befehlsausführung
  - Stream-Follow
---

# Befehlsausführung

Verfügbare Browser-Befehle durchsuchen, einmalige Aktionen ausführen, Inhalte von Seiten extrahieren und Streaming-Test-Sessions ausführen.

## `otto commands list`

Listet alle verfügbaren Befehle auf einem verbundenen Node auf, optional nach Site gefiltert.

### Verwendung

```bash
otto commands list [Optionen]
```

### Flags

| Flag | Kurzform | Erforderlich | Typ | Standard | Beschreibung |
|---|---|---|---|---|---|
| `--site` | `-s` | Nein | string | | Nach Site filtern (z. B. `reddit.com`) |
| `--node-id` | | Nein | string | Automatisch ausgewählt | Ziel-Node-ID |
| `--json` | | Nein | boolean | false | Als JSON ausgeben |

### Beispiele

```bash
# Alle Befehle auflisten
otto commands list

# Befehle für eine bestimmte Site auflisten
otto commands list --site reddit.com

# Maschinenlesbare Ausgabe
otto commands list --json
```

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Befehle aufgelistet |
| `1` | Kein Node verbunden oder Relay-Fehler |

---

## `otto cmd`

Führt eine einzelne Befehlsaktion auf einem verbundenen Node aus. Nützlich für Primitive und einmalige Befehle.

### Verwendung

```bash
otto cmd [Optionen]
```

### Flags

| Flag | Kurzform | Erforderlich | Typ | Standard | Beschreibung |
|---|---|---|---|---|---|
| `--action` | `-a` | Ja | string | | Auszuführende Aktion (z. B. `primitive.tab.open`) |
| `--payload` | `-p` | Nein | string | `{}` | JSON-Payload-String |
| `--node-id` | | Nein | string | Automatisch ausgewählt | Ziel-Node-ID |
| `--tab-session` | | Nein | string | | Tab-Session-ID für tab-bezogene Aktionen |
| `--timeout` | | Nein | number | 30000 | Befehls-Timeout in Millisekunden |
| `--json` | | Nein | boolean | false | Ergebnis als JSON ausgeben und interaktive TUI überspringen |

### Beispiele

```bash
# Verwalteten Tab öffnen
otto cmd --action primitive.tab.open --payload '{"url":"https://www.reddit.com"}'

# Text aus einem offenen Tab extrahieren
otto cmd --action primitive.dom.extract_text --tab-session <tabSessionId>

# Screenshot per URL aufnehmen
otto cmd --action primitive.page.screenshot --payload '{"url":"https://example.com"}'

# Site-Befehl direkt ausführen
otto cmd --action command.run --payload '{"site":"reddit.com","command":"getPosts"}'
```

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Befehl erfolgreich abgeschlossen |
| `1` | Befehl fehlgeschlagen, Timeout oder Relay-Fehler |

---

## `otto test`

Führt einen Site-Befehl im Testmodus aus, mit optionalem Stream-Follow für Streaming-Befehle.

### Verwendung

```bash
otto test <site> <command> [Optionen]
```

### Argumente

| Argument | Erforderlich | Beschreibung |
|---|---|---|
| `<site>` | Ja | Site-Identifikator (z. B. `reddit.com`) |
| `<command>` | Ja | Befehlsname (z. B. `getChatMessages`) |

### Flags

| Flag | Kurzform | Erforderlich | Typ | Standard | Beschreibung |
|---|---|---|---|---|---|
| `--payload` | `-p` | Nein | string | `{}` | JSON-Payload für den Befehl |
| `--node-id` | | Nein | string | Automatisch ausgewählt | Ziel-Node-ID |
| `--tab-session` | | Nein | string | | Bestehende Tab-Session-ID (überspringt automatisches Öffnen) |
| `--timeout` | | Nein | number | 30000 | Befehls-Timeout in Millisekunden |
| `--stream-follow-ms` | | Nein | number | | Wie lange Stream-Updates nach Befehlsabschluss verfolgt werden (ms) |
| `--stream-probe` | | Nein | boolean | false | Traffic-Probe sofort nach Stream-Abonnement erzwingen |
| `--stream-poll-interval-ms` | | Nein | number | | Poll-Intervall-Override für Stream-Listener-Modi, die Polling unterstützen |
| `--wait-for-interrupt` | | Nein | boolean | false | Verwalteten Tab bis Ctrl+C offen halten |
| `--json` | | Nein | boolean | false | Als JSON ausgeben (maschinenlesbare Stream-Frames) |

### Beispiele

```bash
# Einfachen Site-Befehlstest ausführen
otto test reddit.com getPosts

# Mit Payload ausführen
otto test reddit.com getPosts --payload '{"limit":5}'

# Chat-Befehl 45 Sekunden lang stream-verfolgen
otto test reddit.com getChatMessages --stream-follow-ms 45000

# Stream mit Probe und JSON-Ausgabe für Automatisierung
otto test reddit.com getChatMessages --stream-probe --stream-follow-ms 45000 --json

# Tab nach dem Test offen halten
otto test reddit.com getPosts --wait-for-interrupt
```

### Stream-Follow-Verhalten

Wenn `--stream-follow-ms` gesetzt ist, abonniert `otto test` alle vom Befehl zurückgegebenen Stream-Manifeste und verfolgt Listener-Updates, bis das Timeout abläuft. Drücken Sie `Ctrl+C` zum vorzeitigen Abbrechen — dies sendet `command_cancel` für aktive Stream-Tests und schließt den automatisch geöffneten Tab.

### Automatisches Tab-Öffnen

Wenn `--tab-session` weggelassen wird, öffnet `otto test` automatisch einen Tab zum `preloadHost` des Befehls, falls verfügbar, andernfalls `https://<site>`. Der Tab wird nach dem Test automatisch geschlossen, es sei denn, `--wait-for-interrupt` ist gesetzt.

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Test erfolgreich abgeschlossen |
| `1` | Test fehlgeschlagen, Timeout, `manual_login_required` oder Relay-Fehler |

---

## `otto extract-content`

Extrahiert Seiteninhalte mit einem Befehl und wählbarem Ausgabeformat. Standardformat ist `markdown`.
Für Selektor-Entwicklung und Befehlserstellung bevorzugen Sie `clean_html`.

### Verwendung

```bash
otto extract-content [url] [Optionen]
```

### Argumente

| Argument | Erforderlich | Beschreibung |
|---|---|---|
| `[url]` | Nein | Seiten-URL, von der extrahiert werden soll. Optional, wenn `--tab-session` angegeben ist. |

### Flags

| Flag | Kurzform | Erforderlich | Typ | Standard | Beschreibung |
|---|---|---|---|---|---|
| `--format` | | Nein | enum | `markdown` | `markdown`, `distilled_html`, `clean_html`, `raw_html` oder `text` |
| `--tab-session` | | Nein | string | | Bestehende Tab-Session-ID, von der extrahiert werden soll |
| `--selector` | | Nein | string | `body` | CSS-Selektor (unterstützt für `clean_html`, `raw_html` und `text`) |
| `--distill-mode` | | Nein | enum | `readability` | `readability` oder `dom-distiller` (für `markdown` und `distilled_html`) |
| `--no-fallback-to-readability` | | Nein | boolean | false | Readability-Fallback deaktivieren, wenn `dom-distiller` ausgewählt ist |
| `--max-chars` | | Nein | number | | Maximale extrahierte Zeichen für unterstützte Formate |
| `--node-id` | | Nein | string | Automatisch ausgewählt | Ziel-Node-ID |
| `--timeout` | | Nein | number | 60000 | Befehls-Timeout in Millisekunden |
| `--json` | | Nein | boolean | false | Vollständiges JSON-Ergebnis ausgeben |

### Beispiele

```bash
# Markdown extrahieren (Standard)
otto extract-content https://example.com

# Destilliertes HTML extrahieren
otto extract-content https://example.com --format distilled_html

# Sauberes HTML extrahieren (empfohlen für Selektor-Erstellung)
otto extract-content https://example.com --format clean_html --selector article

# Rohes HTML aus einem Selektor extrahieren
otto extract-content https://example.com --format raw_html --selector article

# Text aus einem bestehenden verwalteten Tab extrahieren
otto extract-content --format text --tab-session <tabSessionId>
```

### Verhaltenshinweise

- Geben Sie entweder `[url]` oder `--tab-session` an.
- Bei `--format text` und reinen URL-Aufrufen öffnet Otto automatisch einen temporären verwalteten Tab, extrahiert Text und schließt den Tab.
- `--selector` wird für `markdown` und `distilled_html` abgelehnt.
- `clean_html` bewahrt semantische Attribute, während Skripte/Styles/Inline-Handler entfernt werden, was normalerweise das beste Format für DOM-Debugging ist.

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Extraktion erfolgreich abgeschlossen |
| `1` | Extraktion fehlgeschlagen, Eingabevalidierung fehlgeschlagen oder Relay-Fehler |

---

## Verwandte Befehle

- [otto listener subscribe-network](./listener.md) — Netzwerkereignisse manuell abonnieren.
- [Befehlsreferenz](../commands.md) — vollständige Aktionsoberfläche und Site-Befehlsmodell.
