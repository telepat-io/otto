---
title: Schnellstart
sidebar_position: 3
description: Bringen Sie Otto in fünf Minuten zum Laufen. Starten Sie das Relay, registrieren Sie einen Controller, koppeln Sie den Erweiterungs-Node und führen Sie Ihren ersten Seitenbefehl aus.
keywords:
  - schnellstart
  - otto start
  - node koppeln
  - erster befehl
  - otto test
---

# Schnellstart

Am Ende dieser Anleitung läuft das Relay, der Controller ist mit dem Erweiterungs-Node gekoppelt und Ihr erster Befehl gibt Ergebnisse zurück.

## Bevor Sie beginnen

- Otto CLI global installiert: `npm install -g @telepat/otto`
- Erweiterung in Chrome geladen (führen Sie `otto setup` aus, wenn Sie dies noch nicht getan haben — siehe [Installation](./installation.md))
- Chrome mit der Otto-Erweiterung läuft und ist in der Symbolleiste sichtbar

## Schritte

### 1. Relay starten

```bash
otto start
```

Dies startet das Relay als Hintergrund-Daemon. Überprüfen Sie, ob es läuft:

```bash
otto status
```

Erwartete Ausgabe: `relay running` mit Prozess-ID und Protokollpfad.

### 2. Controller-Identität registrieren

Wenn dies Ihr erster Start ist, erstellen Sie einen Controller-Client und melden Sie sich an:

```bash
otto client register --name "my-laptop"
otto client login
```

Dies speichert Ihre Controller-Anmeldeinformationen in `~/.otto/config.json`. Wenn Sie bereits einen registrierten Client haben, führen Sie `otto client login` aus, um Ihre Token zu aktualisieren.

### 3. Erweiterungs-Node koppeln

Wenn die Erweiterung noch nicht mit diesem Relay gekoppelt wurde:

```bash
# Ausstehende Authentifizierungscodes aus der Erweiterung anzeigen
otto authcode

# Den angezeigten Code genehmigen (Format: 123-456)
otto pair <code>
```

:::info
Der Kopplungscode erscheint im Otto-Erweiterungspopup, nachdem Sie die Relay-URL in den Erweiterungsoptionen konfiguriert haben. Öffnen Sie die Erweiterung und folgen Sie der Bildschirmanweisung.
:::

### 4. Konnektivität validieren

Bestätigen Sie, dass der Node verbunden ist und Befehle verfügbar sind:

```bash
otto commands list
```

Erwartete Ausgabe: Ein JSON-Array verfügbarer Befehle vom verbundenen Node.

### 5. Befehl ausführen

```bash
otto test reddit.com getPosts
```

Dies öffnet einen verwalteten Tab, führt den `getPosts`-Befehl auf `reddit.com` aus, streamt Ergebnisse und schließt den Tab bei Abschluss.

Sie können auch die LinkedIn-Feed-Extraktion ausführen:

```bash
otto test linkedin.com getPosts --payload '{"minReturnedPosts":15}'
```

LinkedIn `getPosts` unterstützt Timeout-Skalierungsmetadaten, die an `minReturnedPosts` gebunden sind, sodass das Standard-Timeout-Verhalten an größere Feed-Ziele angepasst werden kann.

## Erfolg überprüfen

Ein erfolgreicher Durchlauf gibt Befehlsausgabe-JSON aus und beendet sich mit Code `0`. Wenn Sie `manual_login_required` sehen, muss der Befehl sich zuerst bei der Seite anmelden:

1. Der Tab bleibt offen.
2. Schließen Sie die Anmeldung manuell im Browser ab.
3. Führen Sie erneut aus: `otto test reddit.com getPosts`

Für LinkedIn-spezifische Clipboard-URL-Extraktionshinweise, wenn Sie einen Clipboard-Berechtigungsfehler sehen, führen Sie erneut aus mit:

```bash
otto test linkedin.com getPosts --payload '{"getClipboardPermission":true}'
```

## Nächste Schritte

- [CLI-Referenz](./cli/index.md) — vollständige Befehlsliste mit Optionen, Beispielen und Beendigungscodes.
- [Kopplung und Authentifizierung](./guides/pairing-auth.md) — eingehender Blick auf den Kopplungsablauf und das Controller-Client-Modell.
- [Anwendungsfälle](./guides/use-cases.md) — praktische Befehlsworkflows und Szenariomatrix.
- [Fehlerbehebung](./guides/troubleshooting-advanced.md) — Fehler-zu-Aktions-Anleitung für häufige Fehler.