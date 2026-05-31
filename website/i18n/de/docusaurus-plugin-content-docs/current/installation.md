---
title: Installation
sidebar_position: 2
description: Installieren Sie die Otto CLI und Erweiterung. Behandelt den globalen Endbenutzer-Installationspfad und die Monorepo-Beitragsentwicklungsumgebung.
keywords:
  - otto installieren
  - npm install
  - otto setup
  - chrome-erweiterung installieren
  - monorepo-entwicklung
---

# Installation

Otto hat zwei Installationspfade: eine globale CLI-Installation für Endbenutzer und eine Monorepo-Entwicklungsinstallation für Mitwirkende.

## Bevor Sie beginnen

- **Node.js 18 oder später** — erforderlich für CLI und Relay.
- **npm 9 oder später** — zum Installieren der CLI global.
- **Google Chrome** — der Erweiterungs-Node läuft als Chrome-Erweiterung.
- **Internetzugang** — `otto setup` lädt das Erweiterungsartefakt von Otto-Release-Assets herunter.

## Endbenutzer-Installation

Installieren Sie die Otto CLI global:

```bash
npm install -g @telepat/otto
```

Das CLI-Paket enthält Relay-Laufzeitabhängigkeiten, sodass Relay-Befehle (`otto start`, `otto stop`, `otto status`) ohne separate Relay-Installation funktionieren.

Führen Sie den geführten Setup-Assistenten aus:

```bash
otto setup
```

Setup führt Folgendes aus:

1. Bestätigt Ihre Relay-URL (Standard: `ws://127.0.0.1:8787?role=controller`).
2. Startet den Relay-Daemon, wenn er nicht läuft.
3. Lädt das Erweiterungsartefakt von Release-Assets herunter und überprüft seine Prüfsumme.
4. Gibt den genauen Erweiterungsordnerpfad für Chrome aus.

Laden Sie die Erweiterung in Chrome:

```
1. Öffnen Sie chrome://extensions
2. Aktivieren Sie den Entwicklermodus (rechts oben umschalten)
3. Klicken Sie auf Entpackte laden
4. Wählen Sie den von otto setup ausgegebenen Ordnerpfad aus
```

:::tip Erweiterung aktualisieren
Wenn eine neue Otto-Version veröffentlicht wird, aktualisieren Sie das Erweiterungsartefakt mit:
```bash
otto extension update
```
Nach Abschluss der Aktualisierung laden Sie die Erweiterung unter `chrome://extensions` neu oder starten Sie Chrome neu.
:::

## Mitwirkende Monorepo-Installation

Dieser Pfad ist für Mitwirkende, die an Otto selbst arbeiten. Sie bauen und betreiben alles lokal aus dem Quellcode.

Klonen Sie das Repository und installieren Sie alle Arbeitsbereichsabhängigkeiten:

```bash
git clone https://github.com/telepat-io/otto.git
cd otto
npm install
```

Erstellen Sie alle Pakete:

```bash
npm run build
```

Starten Sie den Relay-Daemon:

```bash
otto start
```

Führen Sie die Erweiterung im Entwicklungsmodus mit Hot Reload aus:

```bash
npm run dev:ext
```

Laden Sie die Erweiterung manuell aus der Build-Ausgabe:

```bash
# Erweiterung erstellen
npm run --workspace @telepat/otto-extension build
# Dann chrome-mv3/ aus chrome://extensions > Entpackte laden laden
```

Erweiterungsausgabepfad: `extension/output/chrome-mv3`.

Führen Sie die CLI im Entwicklungsmodus aus:

```bash
npm run dev -- commands list
```

:::note
Monorepo-Builds erfordern, dass alle Pakete ohne TypeScript-Fehler erstellt werden. Führen Sie `npm run check` aus, um die Erweiterungsausgabe zu überprüfen, bevor Sie sie laden.
:::

## Nächste Schritte

- [Schnellstart](./quickstart.md) — Relay starten, Node koppeln, ersten Befehl ausführen.
- [otto setup Befehlsreferenz](./cli/setup.md) — vollständige Setup-Optionen und nicht-interaktiver Modus.
- [Entwicklungsanleitung](./development.md) — lokaler Entwicklungsworkflow und Validierungssequenz.

## Agenten-Integration

Nach der Installation von Otto können Sie es bei KI-Agenten-Frameworks für programmgesteuerte Browser-Automatisierung über MCP registrieren:

```bash
# Bei Claude Code, Cursor, VS Code usw. registrieren
otto agent install claude
otto agent install cursor
otto agent install vscode

# Registrierungsstatus überprüfen
otto agent status

# MCP-Server direkt starten (für benutzerdefinierte Integrationen)
otto mcp
```

Unterstützte Frameworks: Claude Code, Claude Desktop, ChatGPT Desktop, Gemini CLI, Codex, Cursor, VS Code, OpenCode.

Vollständige Einrichtungsanleitungen finden Sie unter [Agent-Setup](./for-agents/agent-setup.md).