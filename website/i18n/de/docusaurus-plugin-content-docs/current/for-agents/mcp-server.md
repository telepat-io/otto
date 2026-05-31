---
title: MCP-Server
sidebar_position: 3
description: Verwendung von Ottos MCP-Server für programmatischen Agent-Zugriff auf Browser-Automatisierung.
keywords:
  - MCP
  - Model Context Protocol
  - Agent
  - Automatisierung
  - Werkzeuge
---

# MCP-Server

Otto bietet einen nativen MCP-Server (Model Context Protocol) für programmatischen Agent-Zugriff. Der Server stellt Ottos vollständige Befehlsoberfläche als MCP-Werkzeuge über Stdio-Transport bereit.

## Server starten

```bash
otto mcp
```

Der Server läuft über Stdio-Transport und ist dafür vorgesehen, von einem MCP-Client (Agent-Framework) gestartet zu werden. Er akzeptiert keine interaktive Eingabe.

## Transport und Umfang

- **Transport**: Stdio (JSON-RPC-Nachrichten auf stdout, Protokolle auf stderr)
- **Vorgesehene Nutzung**: lokal prozessgestartete MCP-Clients
- **Protokoll**: MCP 1.0 mit initialize, tools/list und tools/call

## Verfügbare Werkzeuge

Der Server stellt 25 Werkzeuge bereit, organisiert nach Kategorie:

### Status-Werkzeuge

| Werkzeug | Beschreibung |
|------|-------------|
| `otto_status` | Relay-Daemon-Status anzeigen (läuft, Port, PID) |
| `otto_commands_list` | Verfügbare Befehle von einem verbundenen Node auflisten |

### Ausführungswerkzeuge

| Werkzeug | Beschreibung |
|------|-------------|
| `otto_cmd` | Befehl an einen verbundenen Node senden |
| `otto_test` | Site-Befehl zum Testen ausführen (registriert Controller bei Bedarf automatisch) |
| `otto_screenshot` | Screenshot einer URL aufnehmen |
| `otto_extract_content` | Inhalt mit einem Werkzeug extrahieren (`markdown`, `distilled_html`, `clean_html`, `raw_html`, `text`) |

### Beobachtungswerkzeuge

| Werkzeug | Beschreibung |
|------|-------------|
| `otto_logs_list` | Historische Relay-Protokolle mit optionalen Filtern auflisten |
| `otto_logs_follow` | Live-Relay-Protokolle für eine begrenzte Dauer verfolgen |
| `otto_logs_export` | Relay-Protokolle als strukturierte Daten exportieren |
| `otto_listener_subscribe_network` | Netzwerkinterceptions-Updates auf einem Tab abonnieren |
| `otto_listener_unsubscribe` | Aktiven Listener deabonnieren |

### Lebenszyklus-Werkzeuge

| Werkzeug | Beschreibung |
|------|-------------|
| `otto_setup` | Otto-Setup ausführen (Relay konfigurieren, Daemon starten, Erweiterung herunterladen) |
| `otto_start` | Relay-Daemon starten |
| `otto_stop` | Relay-Daemon stoppen |
| `otto_extension_update` | Neuestes Erweiterungs-Artefakt herunterladen und installieren |
| `otto_extension_info` | Installierte Erweiterungsmetadaten anzeigen |

### Identitäts-Werkzeuge

| Werkzeug | Beschreibung |
|------|-------------|
| `otto_pair` | Kopplungscode genehmigen, um einen Node zu registrieren |
| `otto_authcode` | Ausstehende Kopplungs-Authcodes auflisten |
| `otto_revoke` | Gespeichertes Refresh-Token widerrufen und lokale Auth löschen |
| `otto_client_register` | Neuen Controller-Client registrieren |
| `otto_client_login` | Client-Anmeldeinformationen gegen Access/Refresh-Token eintauschen |
| `otto_client_status` | Lokalen Controller-Client-Status anzeigen |
| `otto_client_forget` | Gespeichertes Client-Secret löschen und lokale Auth löschen |
| `otto_client_remove` | Registrierten Controller-Client beim Relay entfernen |

### Konfigurations-Werkzeuge

| Werkzeug | Beschreibung |
|------|-------------|
| `otto_config` | Otto-Konfiguration lesen oder aktualisieren |

## Beispiel-MCP-Aufrufe

### Werkzeuge auflisten

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

### Status prüfen

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "otto_status",
    "arguments": {}
  }
}
```

Sie können auch verbundene Node-IDs mit `nodes: true` anfordern:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "otto_status",
    "arguments": { "nodes": true }
  }
}
```

### Befehl ausführen

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "otto_cmd",
    "arguments": {
      "action": "command.run",
      "payload": "{\"site\":\"reddit.com\",\"command\":\"getPosts\"}"
    }
  }
}
```

### Inhalt extrahieren (Standard Markdown)

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "otto_extract_content",
    "arguments": {
      "url": "https://example.com"
    }
  }
}
```

`otto_extract_content` Eingabe-Highlights:

- `format`: `markdown` (Standard), `distilled_html`, `clean_html`, `raw_html`, `text`
- Zielauswahl: `url` oder `tabSession` angeben
- `selector`: unterstützt für `clean_html`, `raw_html` und `text`
- `distillMode` / `fallbackToReadability`: für `markdown` und `distilled_html`

Für Selektor-Erkennung und Befehlserstellungs-Workflows verwenden Sie `format: "clean_html"`.

## Fehlerbehandlung

Alle Werkzeuge geben Fehler im MCP-Standardformat zurück:

```json
{
  "content": [{ "type": "text", "text": "Fehlermeldung" }],
  "isError": true
}
```

Häufige Fehlercodes:

| Fehler | Bedeutung |
|-------|---------|
| `Missing controllerAccessToken` | Führen Sie `otto client login` oder `otto pair <code>` aus |
| `Missing targetNodeId` | Mehrere Nodes verbunden; übergeben Sie das `nodeId`-Argument |
| `manual_login_required` | Bitten Sie den Benutzer, sich manuell auf der Site anzumelden |
| `acl_missing_node_grant` | Bitten Sie den Benutzer, den Controller im Erweiterungs-Popup zu genehmigen |

## Fehlerbehebung

| Symptom | Wahrscheinliche Ursache | Lösung |
|---------|-------------|-----|
| Server beendet sofort | Stdio-Transportfehler | Sicherstellen, dass im richtigen MCP-Client-Kontext ausgeführt wird |
| Werkzeuge erscheinen nicht im Agent | Server nicht registriert | Führen Sie `otto agent install <runtime>` aus |
| Befehle schlagen mit Auth-Fehler fehl | Controller nicht authentifiziert | Führen Sie `otto client login` aus |
| `targetNodeId`-Fehler | Kein Node verbunden | Überprüfen, ob die Erweiterung geladen und verbunden ist |

## Verwandte Seiten

- [Agent-Setup](./agent-setup.md) — Otto bei Agent-Frameworks registrieren
- [Skills](./skills.md) — Otto-Skill-Pakete für Agent-Workflows
- [Für Agenten](/for-agents/) — Agent-Einschränkungen und Entscheidungsfluss
- [otto mcp-Befehlsreferenz](../reference/commands/otto-mcp.md)
