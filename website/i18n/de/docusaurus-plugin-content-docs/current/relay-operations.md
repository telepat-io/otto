---
title: Relay-Betrieb
sidebar_position: 7
description: Betriebliche Referenz für den Otto-Relay-Daemon. Behandelt Start, Umgebungsvariablen, Endpunkte, Laufzeitverantwortlichkeiten, Protokollspeichermodell und Controller-Lebenszyklusverwaltung.
keywords:
  - relay-betrieb
  - relay-daemon
  - otto start
  - protokollspeicher
  - controller-lebenszyklus
---

# Relay-Betrieb

Diese Seite ist die betriebliche Referenz für den Otto-Relay-Daemon. Verwenden Sie sie beim Konfigurieren eines Relay-Deployments, bei der Diagnose von Routingproblemen oder bei der Integration von Controller-Clients.

## Wahrheitsquelle Codepfade

| Anliegen | Quelle |
|---|---|
| Relay HTTP + WebSocket-Server | `packages/relay/src/index.ts` |
- Integration-Validierungssuite: `packages/relay/test/integration.test.mjs`
- Geteilte Protokollverträge: `packages/shared-protocol/src/index.ts`

## Start

Relay startet standardmäßig auf Port `8787`. Globale `@telepat/otto`-Installationen enthalten Relay-Laufzeitabhängigkeiten, sodass Daemon-Lebenszyklusbefehle keine separate `@telepat/otto-relay`-Installation erfordern.

| Befehl | Verhalten |
|---|---|
| `otto start` | Relay-Daemon starten |
| `otto stop` | Relay-Daemon stoppen |
| `otto restart` | Relay-Daemon neu starten |
| `otto status` | Läuft oder gestoppt melden; bei gestopptem Status `otto start` vorschlagen |
| `otto setup` | Stellt sicher, dass der Relay-Daemon auf dem Setup-Relay-URL-Port läuft, bevor das Setup abgeschlossen wird |

Setup-Daemon-Ergebnisse: `started` (Setup hat Daemon für ausgewählten Port gestartet), `already_running` (bestehender Daemon wiederverwendet). Setup schlägt bei Daemon-Port-Nichtübereinstimmung mit expliziter Abhilfe fehl: Führen Sie `otto stop` aus und starten Sie dann das Setup mit der beabsichtigten Relay-URL neu.

## Umgebungsvariablen

| Variable | Standard | Beschreibung |
|---|---|---|
| `OTTO_RELAY_PORT` | `8787` | HTTP und WebSocket Listen-Port |
| `OTTO_TOKEN_SECRET` | — | **Erforderlich.** JWT-Signiergeheimnis |
| `OTTO_TOKEN_PREVIOUS_SECRET` | — | Gnadenzeit-Überprüfung für Geheimnisrotation |
| `OTTO_TOKEN_ISSUER` | — | JWT `iss` Behauptung |
| `OTTO_TOKEN_AUDIENCE` | — | JWT `aud` Behauptung |
| `OTTO_TOKEN_TTL_MINUTES` | — | Zugriffstoken-Lebensdauer |
| `OTTO_REFRESH_TTL_DAYS` | — | Aktualisierungstoken-Lebensdauer |
| `OTTO_EXTENSION_ORIGIN` | — | Erlaubte Browser-Erweiterungsursprung |
| `OTTO_LOG_DIR` | — | Verzeichnis für JSONL-Betriebsprotokolle |
| `OTTO_LOG_MAX_FILE_BYTES` | `100MB` | Tagesdateigröße vor Überlauf |
| `OTTO_RATE_LIMIT_PER_MIN` | — | WebSocket-Frame-Ratenlimit pro Client |
| `OTTO_REPLAY_WINDOW_MS` | — | Nonce-Deduplizierungsfenster |
| `OTTO_TAB_QUEUE_LIMIT` | — | Maximal wartende Befehle pro Tab |
| `OTTO_CONTROLLER_QUEUE_LIMIT` | — | Maximal wartende Befehle pro Controller |
| `OTTO_DEFAULT_CONTROLLER_SCOPES` | — | Bereiche, die neu registrierten Controllern zugewiesen werden |
| `OTTO_ALLOW_REMOTE_CONTROLLER_REGISTRATION` | — | Nicht authentifizierte Remote-Controller-Registrierung erlauben |
| `OTTO_CONTROLLER_REGISTRATION_SECRET` | — | Erforderlich, wenn Remote-Registrierung aktiviert ist |
| `OTTO_CONTROLLER_HEARTBEAT_INTERVAL_MS` | `8000` | Heartbeat-Prüfungsintervall |
| `OTTO_CONTROLLER_HEARTBEAT_MISS_LIMIT` | `3` | Verpasste Heartbeats vor veralteter Trennung |

:::warning
`OTTO_TOKEN_SECRET` ist erforderlich und muss geheim gehalten werden. Kommittern Sie es nicht in die Quellcodeverwaltung und geben Sie es nicht in Protokollen preis.
:::



## Endpunkte

### Kopplung und Auth

| Methode | Pfad | Auth |
|---|---|---|
| `POST` | `/api/pairing/request` | Keine |
| `GET` | `/api/pairing/pending` | Keine |
| `POST` | `/api/pairing/approve` | Node-Bearer |
| `GET` | `/api/pairing/status` | Keine |
| `POST` | `/api/auth/refresh` | Aktualisierungstoken |
| `POST` | `/api/auth/revoke` | Aktualisierungstoken |
| `GET` | `/api/nodes/connected` | Controller-Bearer |

### Controller-Client-Registrierung und ACL

| Methode | Pfad | Auth | Anmerkungen |
|---|---|---|---|
| `POST` | `/api/controller/register` | Keine oder Registrierungsgeheimnis | Body: `{ name, description, avatarSeed? }` |
| `POST` | `/api/controller/token` | Client-Geheimnis | Gibt Zugriffs- + Aktualisierungstoken-Paar zurück |
| `POST` | `/api/controller/remove` | Controller-Bearer | Body: `{ clientId }` — widerruft Datensatz, baut ACL, Aktualisierung und Sitzungen ab |
| `POST` | `/api/controller/remove-all` | Controller-Bearer | Widerruft und bereinigt alle Controller-Client-Datensätze |
| `GET` | `/api/controller/access` | Node-Bearer | Aktive ACL-Berechtigungen auflisten |
| `POST` | `/api/controller/access` | Node-Bearer | Controller-Zugriff gewähren |

ACL-Durchsetzung: Node-gerichtete Controller-Befehle ohne aktive Genehmigung geben `acl_missing_node_grant` zurück. Client-Geheimnis wird nur für `/api/controller/token` verwendet; Laufzeitautorisierung verwendet Zugriffstoken-Bereiche und Node-ACL-Berechtigungen.

### Protokolle

| Methode | Pfad | Abfrageparameter |
|---|---|---|
| `GET` | `/api/logs` | `since`, `level`, `source`, `latest`, `nodeId`, `requestId` |
| `GET` | `/api/logs/status` | — |
| `GET` | `/api/logs/export` | Wie `/api/logs` |

`source` unterstützt `relay`, `controller`, `node`, `all`. `latest` begrenzt auf die neuesten N Einträge. Ungültige Filterwerte geben `400` zurück.

### WebSocket

| Rolle | URL |
|---|---|
| Controller | `ws://host:port?role=controller` |
| Node | `ws://host:port?role=node` |

## Laufzeitverantwortlichkeiten

- `hello`/`auth`-Frame-Sequenzierung durchsetzen, bevor irgendein Befehl geroutet wird
- Befehlsframes validieren und an die richtige Node-Sitzung nach `targetNodeId` weiterleiten
- Befehlskorrelation und Terminal-Timeout-Verfolgung aufrechterhalten
- Synthetische Trennungsfehl für laufende Anfragen senden, wenn Nodes offline gehen
- Tab-Sperren-Leasings verwalten, Konflikte erkennen und Sperrlebenszyklusereignisse aussenden
- Strukturierte Betriebsprotokolle speichern und streamen
- Veraltete Controller nach Heartbeat-Richtlinie trennen und eigentumsbereichsbezogene Waisen-Tab-Bereinigung auslösen

## Protokollspeichermodell

Relay schreibt Protokolle in tagesfensterisierte JSONL-Dateien in `OTTO_LOG_DIR`:

- Aktive Tagesdatei: `operations-YYYY-MM-DD.jsonl`
- Überlauf bei Dateigröße: `operations-YYYY-MM-DD-1.jsonl`, `-2.jsonl` usw.
- Dateiaufbewahrung: 14 Tage
- `/api/logs/status` meldet Gesamtbytegröße über alle Betriebsprotokolldateien

Node-Logs aus der Erweiterung werden aufgenommen, wenn authentifizierte Node-Clients `event`-Frames mit `type=extension_log` senden. Relay bindet jeden Eintrag an die authentifizierte Node-Identität, wendet Schwärzung an und speichert als `source=node`.

## Listener-Verwaltung

- Relay aktiviert eine Listener-Abonnement erst nach einem erfolgreichen `result` für `listener.subscribe`
- Aktive Listener-Inhaberschaft wird nach Subscribe-`requestId` geschlüsselt und an Controller + Node-Identität gebunden
- `listener.unsubscribe` validiert `payload.targetRequestId`, Inhaberschaft und Node-Übereinstimmung vor dem Routing
- Erfolgreiches Unsubscribe entfernt Listener-Zustand; zukünftige Updates für diese `requestId` werden mit `listener_not_found` abgelehnt
- Listener-Zustand wird bei Controller-Trennung und Node-Trennung bereinigt

## Controller-Trennungsverhalten

Relay markiert einen Controller als veraltet, wenn innerhalb von `OTTO_CONTROLLER_HEARTBEAT_INTERVAL_MS x OTTO_CONTROLLER_HEARTBEAT_MISS_LIMIT` keine authentifizierten Frames eintreffen. Bei Trennung oder Timeout:

1. Relay entfernt die Listener- und Befehlsstream-Zustände dieses Controllers.
2. Relay verwirft sofort wartende Befehle, die dem getrennten Controller gehören.
3. Relay schickt `primitive.tab.close_owned` an verbundene Nodes mit dem getrennten Controller `clientId`.
4. Node-Laufzeit schließt nur Tabs, die dieser Controller-Identität gehören.

## Betriebliche Anmerkungen

- Terminalergebnisse für angenommene Befehle sind garantiert: `result` oder `error`-Frame.
- Pro-Tab-Befehlsausführung ist FIFO; cross-Tab-Ausführung ist parallelisiert.
- Aktualisierungssitzungen bleiben über Relay-Neustarts in `OTTO_LOG_DIR/refresh-sessions.jsonl` erhalten.
- Aktualisierungstoken werden bei erfolgreichem `/api/auth/refresh` rotiert; das vorherige Token wird sofort ungültig.
- Relay-Startprotokolle enthalten effektive TTL-Konfiguration und Ladestatistiken für Aktualisierungssitzungen, Controller-Clients und ACL-Speicher.

**Betriebliche Fehlerbehebungscheckliste:**

1. Bestätigen Sie, dass der Controller authentifiziert ist (`auth_ack` in Protokollen beobachtet).
2. Bestätigen Sie, dass die Aktion in Controller-Bereichen enthalten ist.
3. Bestätigen Sie, dass der Ziel-Node online ist (`node_offline` bedeutet, dass der Node nicht verbunden hat oder getrennt wurde).
4. Überprüfen Sie Warteschlangenlimits, wenn Befehle sich stapeln (`tab_queue_overflow`, `controller_queue_overflow`).
5. Überprüfen Sie Ratenlimits, wenn Befehle bei hoher Frequenz abfallen.

## Nächste Schritte

- [Relay-API-Referenz](./relay-api.md) — vollständige HTTP-Endpunkt-Anfrage- und Antwort schemata.
- [Konfigurationsreferenz](./configuration.md) — alle Umgebungsvariablen-Standardwerte und Beschreibungen.
- [Protokollierung und Debugging](./logging-debugging.md) — Korrelation von Protokollereignissen während der Vorfallbearbeitung.