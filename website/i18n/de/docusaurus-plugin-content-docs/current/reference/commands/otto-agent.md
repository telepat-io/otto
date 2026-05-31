---
title: otto agent
description: Otto-Agent-Framework-Integrationen verwalten (installieren, deinstallieren, Status).
keywords:
  - agent
  - installieren
  - MCP
  - framework
---

# otto agent

Otto-Agent-Framework-Integrationen verwalten.

## Unterbefehle

### otto agent install

Otto-MCP-Server in einem Agent-Framework registrieren.

```bash
otto agent install <runtime>
```

**Argumente:**

| Argument | Beschreibung |
|----------|-------------|
| `<runtime>` | Agent-Laufzeitumgebung, bei der registriert werden soll |

**Unterstützte Laufzeitumgebungen:**

- `claude` — Claude Code (`~/.claude/settings.json`)
- `claude-desktop` — Claude Desktop (plattformspezifische Konfiguration)
- `chatgpt` — ChatGPT Desktop (gibt manuelle Anweisungen aus)
- `gemini` — Gemini CLI (`~/.gemini/settings.json`)
- `codex` — Codex (`~/.codex/config.toml`)
- `cursor` — Cursor (`~/.cursor/mcp.json`)
- `vscode` — VS Code (`.vscode/mcp.json`)
- `opencode` — OpenCode (`opencode.json`)
- `generic-mcp` — Gibt JSON-Konfiguration für manuelle Registrierung aus

### otto agent uninstall

Otto-MCP-Server aus einem Agent-Framework entfernen.

```bash
otto agent uninstall <runtime>
```

Entfernt nur Otto-eigene Einträge. Andere MCP-Server bleiben erhalten.

### otto agent status

Status der Agent-Framework-Integration anzeigen.

```bash
otto agent status [--json]
```

**Optionen:**

| Option | Beschreibung |
|--------|-------------|
| `--json` | Als JSON ausgeben |

## Ausgabe und Beendigungscodes

| Beendigungscode | Bedeutung |
|-----------|---------|
| 0 | Erfolg |
| 1 | Ungültige Laufzeitumgebung oder Operation fehlgeschlagen |

## Beispiele

```bash
# Bei Claude Code registrieren
otto agent install claude

# Bei mehreren Frameworks registrieren
otto agent install cursor
otto agent install vscode

# Status prüfen
otto agent status
otto agent status --json

# Von Claude Code deinstallieren
otto agent uninstall claude
```

## Verwandte Befehle

- `otto mcp` — MCP-Server direkt starten
- `otto setup` — initiales Otto-Setup

## Verwandte Seiten

- [Agent-Setup](../../for-agents/agent-setup.md)
- [MCP-Server](../../for-agents/mcp-server.md)
- [Für Agenten](/for-agents/)
