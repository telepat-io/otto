---
title: Agent-Setup
sidebar_position: 5
description: Otto bei KI-Agent-Frameworks für MCP-basierte Browser-Automatisierung registrieren.
keywords:
  - Agent-Setup
  - MCP-Registrierung
  - Claude
  - Cursor
  - VS Code
  - Codex
  - Gemini
  - OpenCode
---

# Agent-Setup

Registrieren Sie Ottos MCP-Server bei KI-Agent-Frameworks für programmatische Browser-Automatisierung.

## Schnellstart

```bash
# Bei Claude Code registrieren
otto agent install claude

# Bei Cursor registrieren
otto agent install cursor

# Bei VS Code registrieren
otto agent install vscode

# Registrierungsstatus prüfen
otto agent status
```

## Unterstützte Frameworks

| Framework | Runtime-ID | Konfigurationsziel | Format |
|-----------|-----------|---------------|--------|
| Claude Code | `claude` | `~/.claude/settings.json` | JSON |
| Claude Desktop | `claude-desktop` | Plattformspezifische Claude-Desktop-Konfiguration | JSON |
| ChatGPT Desktop | `chatgpt` | Manuelles Setup über Developer Mode | N/A |
| Gemini CLI | `gemini` | `~/.gemini/settings.json` | JSON |
| Codex | `codex` | `~/.codex/config.toml` | TOML |
| Cursor | `cursor` | `~/.cursor/mcp.json` | JSON |
| VS Code | `vscode` | `.vscode/mcp.json` (Workspace) | JSON |
| OpenCode | `opencode` | `opencode.json` (Projekt-Root) | JSON |
| Generisch | `generic-mcp` | Auf stdout ausgegeben | Manuell |

## Framework-spezifisches Setup

### Claude Code

```bash
otto agent install claude
```

Registriert den `otto`-MCP-Server in `~/.claude/settings.json` unter `mcpServers`.

### Claude Desktop

```bash
otto agent install claude-desktop
```

Registriert in der Claude-Desktop-Konfiguration (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`).

### ChatGPT Desktop

```bash
otto agent install chatgpt
```

Gibt manuelle Setup-Anweisungen aus. ChatGPT Desktop erfordert einen entfernten HTTP-MCP-Endpunkt über den Developer Mode.

### Gemini CLI

```bash
otto agent install gemini
```

Registriert in `~/.gemini/settings.json` unter `mcpServers`.

### Codex

```bash
otto agent install codex
```

Hängt den `[mcp_servers.otto]`-Abschnitt an `~/.codex/config.toml` an.

### Cursor

```bash
otto agent install cursor
```

Registriert in `~/.cursor/mcp.json` unter `mcpServers`.

### VS Code

```bash
otto agent install vscode
```

Registriert in `.vscode/mcp.json` unter `servers` (Workspace-Umfang).

### OpenCode

```bash
otto agent install opencode
```

Registriert in `opencode.json` unter `mcp` (Projekt-Root).

### Generischer MCP

```bash
otto agent install generic-mcp
```

Gibt ein JSON-Konfigurationssnippet für die manuelle Registrierung in jedem MCP-kompatiblen Framework aus.

## Deinstallation

```bash
otto agent uninstall <runtime>
```

Entfernt nur Otto-eigene Einträge aus der Framework-Konfiguration. Andere MCP-Server bleiben erhalten.

## Verifizierung

Nach der Registrierung überprüfen Sie das Setup:

1. Starten oder laden Sie das Agent-Framework neu.
2. Prüfen Sie, ob Otto-Werkzeuge in der Werkzeugliste des Frameworks erscheinen.
3. Führen Sie einen einfachen Befehl aus (z. B. `otto_status`), um die Konnektivität zu prüfen.

## Manuelle Registrierung

Wenn `otto agent install` für Ihr Framework nicht funktioniert, registrieren Sie manuell:

```json
{
  "mcpServers": {
    "otto": {
      "command": "otto",
      "args": ["mcp"]
    }
  }
}
```

Für VS Code:

```json
{
  "servers": {
    "otto": {
      "type": "stdio",
      "command": "otto",
      "args": ["mcp"]
    }
  }
}
```

## Fehlerbehebung

| Symptom | Wahrscheinliche Ursache | Lösung |
|---------|-------------|-----|
| Werkzeuge erscheinen nicht | Framework nicht neu gestartet | Framework nach Registrierung neu starten |
| Server startet nicht | `otto` nicht im PATH | Mit `which otto` prüfen oder absoluten Pfad verwenden |
| Auth-Fehler im Agent | Controller nicht angemeldet | Führen Sie `otto client login` aus |

## Verwandte Seiten

- [MCP-Server](./mcp-server.md) — MCP-Server-Dokumentation und Werkzeugliste
- [Skills](./skills.md) — Otto-Skill-Pakete
- [Für Agenten](/for-agents/) — Agent-Einschränkungen und Entscheidungsfluss
- [otto agent-Befehlsreferenz](../reference/commands/otto-agent.md)
