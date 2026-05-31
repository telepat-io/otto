---
title: otto mcp
description: Den Otto-MCP-Server auf Stdio für Agent-Zugriff starten.
keywords:
  - mcp
  - server
  - agent
  - stdio
---

# otto mcp

Den Otto-MCP-Server auf Stdio für Agent-Zugriff starten.

## Verwendung

```bash
otto mcp
```

## Was dieser Befehl tut

Startet einen MCP-Server (Model Context Protocol), der Ottos vollständige Befehlsoberfläche als MCP-Werkzeuge über Stdio-Transport bereitstellt. Der Server ist dafür vorgesehen, von einem MCP-Client (Agent-Framework) gestartet zu werden, und kommuniziert über JSON-RPC-Nachrichten auf stdout.

## Transport und Umfang

- **Transport**: Stdio
- **Protokoll**: MCP 1.0
- **Vorgesehene Nutzung**: lokal prozessgestartete MCP-Clients
- **Protokolle**: nur stderr (stdout ist für Protokollnachrichten reserviert)

## Verfügbare Werkzeuge

Der Server stellt 25 Werkzeuge bereit:

**Status**: `otto_status` (unterstützt `nodes: true`), `otto_commands_list`

**Ausführen**: `otto_cmd`, `otto_test`, `otto_screenshot`, `otto_extract_content`

**Beobachten**: `otto_logs_list`, `otto_logs_follow`, `otto_logs_export`, `otto_listener_subscribe_network`, `otto_listener_unsubscribe`

**Lebenszyklus**: `otto_setup`, `otto_start`, `otto_stop`, `otto_extension_update`, `otto_extension_info`

**Identität**: `otto_pair`, `otto_authcode`, `otto_revoke`, `otto_client_register`, `otto_client_login`, `otto_client_status`, `otto_client_forget`, `otto_client_remove`

**Konfiguration**: `otto_config`

## Ausgabe und Beendigungscodes

| Beendigungscode | Bedeutung |
|-----------|---------|
| 0 | Server normal beendet |
| 1 | Serverfehler (stderr für Details prüfen) |

## Verwandte Befehle

- `otto agent install <runtime>` — MCP-Server in einem Agent-Framework registrieren
- `otto agent status` — Status der Agent-Framework-Integration prüfen
- `otto commands list` — verfügbare Befehle von einem verbundenen Node auflisten

## Verwandte Seiten

- [MCP-Server-Dokumentation](../../for-agents/mcp-server.md)
- [Agent-Setup](../../for-agents/agent-setup.md)
- [Für Agenten](/for-agents/)
