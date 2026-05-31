---
title: Automatisierungsleitfaden
sidebar_position: 2
description: Vollständiges Runbook für KI-Agenten und Automatisierungssysteme, die Otto bedienen. Deckt Installation, Erweiterungsübergabe, Kopplung, Controller-Registrierung, ACL-Genehmigung und Befehlsausführung ab.
keywords:
  - Automatisierungsleitfaden
  - KI-Agent
  - End-to-End-Automatisierung
  - Controller-Automatisierung
  - Agent-Runbook
---

# Automatisierungsleitfaden

Dies ist das vollständige Runbook für KI-Agenten und Automatisierungssysteme, die Otto programmatisch bedienen. Lesen Sie vor dem Start [Für Agenten](./index.md) für Einschränkungen und Entscheidungsfluss.

## Voraussetzungen

- Node.js 18+ und npm
- Google Chrome installiert
- Netzwerkzugriff zwischen Relay, Browser-Node und Controller

## Schritt 1: Installieren und einrichten

```bash
npm install -g @telepat/otto
otto setup --relay-url http://localhost:8787 --non-interactive
```

Parsen Sie die JSON-Ausgabe auf:
- `daemonStatus`: `started` oder `already_running`
- `extensionPath`: Pfad zur entpackten Erweiterung
- `extensionVersion`: installierte Version

## Schritt 2: Erweiterungsübergabe

`otto setup` liefert den Pfad zur entpackten Erweiterung. Geben Sie dem Menschen folgende Anweisungen:

1. Öffnen Sie `chrome://extensions` in Chrome.
2. Aktivieren Sie den **Entwicklermodus** (Schalter oben rechts).
3. Klicken Sie auf **Entpackte Erweiterung laden** und wählen Sie den Erweiterungspfad aus der Setup-Ausgabe.
4. Öffnen Sie das Erweiterungs-Popup.
5. Setzen Sie die Relay-URL auf `http://localhost:8787` (oder Ihre Relay-URL).

Bei entfernten Relay-Bereitstellungen muss der Relay-Endpunkt sowohl vom Browser-Node als auch vom Controller erreichbar sein. Verwenden Sie `https://`/`wss://` für entfernten Verkehr.

## Schritt 3: Kopplung

```bash
# Authcode für den Node generieren
otto authcode

# Nachdem der Benutzer den Code im Erweiterungs-Popup eingegeben hat, genehmigen:
otto pair <code>
```

Wenn der Benutzer das Kopplungscode-Feld im Erweiterungs-Popup nicht finden kann, führen Sie ihn zu **Optionen** → **Kopplung** in der Erweiterung.

## Schritt 4: Controller registrieren und authentifizieren

```bash
otto client register --name "agent-worker" --description "Autonomer Otto-Controller" --json
otto client login --client-id <clientId>
```

Secret-Behandlung:
- Speichern Sie das zurückgegebene Client-Secret in einer Umgebungsvariable oder einem Schlüsselbund.
- Geben Sie es niemals in geteilten Protokollen aus.
- Übergeben Sie es außerhalb des Bandes für externe Controller.

## Schritt 5: ACL-Genehmigung

Wenn Befehle `acl_missing_node_grant` zurückgeben, muss der Benutzer Zugriff gewähren:

1. Öffnen Sie das Erweiterungs-Popup.
2. Navigieren Sie zu **Controller-Zugriff**.
3. Genehmigen Sie den Controller-Client.

Versuchen Sie nach der Genehmigung den fehlgeschlagenen Befehl erneut.

## Schritt 6: Gesamten Stack verifizieren

```bash
otto commands list --json
```

Eine erfolgreiche Antwort bestätigt, dass Relay, Node, Controller und ACL alle betriebsbereit sind.

## Schritt 7: Befehle ausführen

```bash
# Verwalteten Tab öffnen
otto cmd --action primitive.tab.open --payload '{"url":"https://www.reddit.com"}'

# Site-Befehl mit der zurückgegebenen tabSessionId ausführen
otto cmd --action command.run \
  --tab-session <tabSessionId> \
  --payload '{"site":"reddit.com","command":"getPosts"}'

# Mit otto test für stream-fähige Befehle ausführen
otto test reddit.com getChatMessages --stream-follow-ms 30000 --json
```

## Umgang mit `manual_login_required`

Wenn ein Befehl `manual_login_required` zurückgibt:

1. Sagen Sie dem Menschen: Die Site erfordert eine Anmeldung, bevor dieser Befehl ausgeführt werden kann.
2. Bitten Sie ihn, sich auf der Site im geöffneten Browser-Tab anzumelden.
3. Führen Sie den Befehl nach Bestätigung mit derselben `--tab-session` erneut aus.

Versuchen Sie nicht, die Eingabe von Anmeldeinformationen zu automatisieren. Dieses Verhalten ist beabsichtigt und nicht verhandelbar.

## Fehler korrelieren

Jede Befehlsantwort enthält eine `requestId`. Verwenden Sie sie, um korrelierte Protokolle abzurufen:

```bash
otto logs list --request-id <requestId> --source all --latest 100 --json
```

Für erweiterungsspezifische Probleme:

```bash
otto logs list --source node --latest 50 --json
```

Für Live-Debugging:

```bash
otto logs follow --source all --json
```

## Multi-Machine-Bereitstellungen

Wenn Relay, Browser-Node und Controller auf verschiedenen Maschinen sind:

- Der Relay-Endpunkt muss sowohl vom Node- als auch vom Controller-Netzwerkpfad erreichbar sein.
- Konfigurieren Sie `OTTO_EXTENSION_ORIGIN` entsprechend dem Erweiterungsursprung in der Produktion.
- Verwenden Sie `wss://` und `https://` für entfernte Bereitstellungen.
- Firewall-Regeln müssen WebSocket-Upgrades auf dem Relay-Port erlauben.

## Sicherheitsgrenzen

- Niemals Anmeldeinformationen automatisieren — immer explizite `manual_login_required`-Übergabe verwenden.
- Niemals `OTTO_TOKEN_SECRET`, Client-Secrets oder Node-Token in Protokollen oder Ausgaben offenlegen.
- Überprüfen, dass ACL-Grants node-eigen sind; nicht versuchen, ACL-Status direkt zu injizieren.
- Payloads begrenzt halten — nicht unbegrenzt schleifen oder unbegrenzte Stream-Daten erfassen.

## Verwandte Seiten

- [Für Agenten](./index.md) — Einschränkungen, Entscheidungsfluss und Referenz zur Fehlerbehandlung.
- [MCP-Server](./mcp-server.md) — MCP-Server-Dokumentation und Werkzeugliste.
- [Agent-Setup](./agent-setup.md) — Otto bei Agent-Frameworks registrieren.
- [Controller-Implementierungsleitfaden](../guides/controller-implementation.md) — WebSocket-Controller-Integration.
- [Anwendungsfälle](../guides/use-cases.md) — ausführbare Beispiele für gängige Automatisierungsmuster.
- [Erweiterte Fehlerbehebung](../guides/troubleshooting-advanced.md) — Stream- und Routing-Diagnostik.

## MCP-Server-Nutzung

Für Agenten, die Otto über MCP statt CLI-Befehle verwenden:

### MCP-Server starten

```bash
otto mcp
```

### Bei Agent-Framework registrieren

```bash
otto agent install claude  # oder cursor, vscode usw.
```

### MCP-Workflow

1. `otto_status` aufrufen, um zu prüfen, ob das Relay läuft.
2. `otto_commands_list` aufrufen, um verfügbare Befehle zu entdecken.
3. `otto_cmd` mit `action: "primitive.tab.open"` aufrufen, um einen Tab zu öffnen.
4. `otto_cmd` mit `action: "command.run"` aufrufen, um Site-Befehle auszuführen.
5. `manual_login_required` behandeln, indem der Benutzer zur Anmeldung aufgefordert wird.
6. `acl_missing_node_grant` behandeln, indem der Benutzer zur Zugriffsgenehmigung aufgefordert wird.

### Beispiel-MCP-Werkzeugaufrufe

**Status prüfen:**
```json
{ "name": "otto_status", "arguments": {} }
```

**Befehle auflisten:**
```json
{ "name": "otto_commands_list", "arguments": { "nodeId": "node_123" } }
```

**Tab öffnen:**
```json
{ "name": "otto_cmd", "arguments": { "action": "primitive.tab.open", "payload": "{\"url\":\"https://www.reddit.com\"}" } }
```

**Site-Befehl ausführen:**
```json
{ "name": "otto_cmd", "arguments": { "action": "command.run", "tabSession": "tab_abc", "payload": "{\"site\":\"reddit.com\",\"command\":\"getPosts\"}" } }
```
