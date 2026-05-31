---
title: Skills
sidebar_position: 4
description: Otto-Skill-Pakete für KI-Agent-Workflows.
keywords:
  - Skills
  - SKILL.md
  - Agent-Skills
  - Automatisierung
---

# Skills

Otto liefert ein Skill-Paket aus, das KI-Agenten eine kontextfreie Workflow-Anleitung für die Browser-Automatisierung bietet.

## Primäres Skill-Paket

Das Paket `skill/otto-cli/` ist das installierbare Skill-Bundle für Otto.

- **Ort**: `skill/otto-cli/SKILL.md` (Repository-Root)
- **Zweck**: Führt Agenten durch Installation, Setup, Befehlsausführung, Debugging und MCP-Integration
- **Format**: Agent Skills-Spezifikation konform

### Anwendungsfälle

- Otto von Grund auf installieren und konfigurieren
- Browser-Automatisierungsbefehle zuverlässig ausführen
- Fehlgeschlagene Befehle mit Protokollen und requestId-Korrelation debuggen
- Otto bei Agent-Frameworks registrieren (Claude, Cursor, VS Code usw.)
- MCP-Server für programmatischen Zugriff verwenden

### Kerndatei

`skill/otto-cli/SKILL.md` enthält:

- Installations- und Setup-Anweisungen
- Deterministischen Workflow für alle Operationen
- MCP-Werkzeugsatz-Dokumentation
- Argument-Semantik und Einschränkungen
- Fallstricke und scharfe Kanten
- Fehlerbehandlungsmatrix
- Quellnachweis-Karte

### Begleitreferenzen

- `references/command-catalog.md` — vollständige Befehls-/Argument-Matrix
- `references/troubleshooting.md` — Fehlerdiagnostik
- `references/framework-patterns.md` — wiederverwendbare Workflow-Muster

## Installationsorte

### Projektumfang

- `.agents/skills/otto-cli/`
- `.github/skills/otto-cli/`
- `.cursor/skills/otto-cli/`

### Benutzerumfang

- `~/.agents/skills/otto-cli/`
- `~/.copilot/skills/otto-cli/`
- `~/.claude/skills/otto-cli/`

## Erforderlicher Skill-Vertrag

Jeder ausgelieferte Skill muss dokumentieren:

1. **Name**: `otto-cli` (kebab-case, entspricht Verzeichnis)
2. **Eingaben**: Relay-URL, Site, Befehl, Node-ID, Tab-Session, Auth-Modus
3. **Leitplanken**: niemals Anmeldeinformationen automatisieren, immer ACL-Genehmigung erfordern
4. **Ausgaben**: Befehlsergebnisse, Protokolleinträge, Screenshots
5. **Fehlermodi**: `manual_login_required`, `acl_missing_node_grant`, `node_offline`, `timed_out`
6. **Verifikationsaufforderungen**: Should-trigger- und Should-not-trigger-Beispiele

## Veröffentlichungsregeln

- Kanonische Seite: `docs/for-agents/skills.md`
- Verlinkt auf menschliche Dokumentation: `docs/installation.md`, `docs/quickstart.md`
- Konkrete Beispiele: alle Befehlsbeispiele sind copy-paste-sicher
- Sync-Anforderungen: Skill-Updates müssen im selben Änderungssatz wie CLI-Verhaltensänderungen erfolgen

## Sync- und Drift-Richtlinie

Wenn sich die MCP-Werkzeugoberfläche ändert, im selben Änderungssatz aktualisieren:

1. `packages/cli/src/mcp/tools.ts` (Schemata und Verträge)
2. `packages/cli/src/mcp/server.ts` (Handler)
3. `docs/for-agents/mcp-server.md` (MCP-Dokumentation)
4. `skill/otto-cli/SKILL.md` (Skill-Dokumentation)

Wenn sich Agent-Installationsziele ändern, aktualisieren:

1. `packages/cli/src/agent/install.ts` (Installationslogik)
2. `docs/for-agents/agent-setup.md` (Setup-Dokumentation)
3. `skill/otto-cli/SKILL.md` (Skill-Dokumentation)

## Verwandte Seiten

- [MCP-Server](./mcp-server.md) — MCP-Server-Dokumentation
- [Agent-Setup](./agent-setup.md) — Anweisungen zur Framework-Registrierung
- [Für Agenten](/for-agents/) — Agent-Einschränkungen und Entscheidungsfluss
