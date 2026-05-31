---
title: Protokollierung und Debugging
sidebar_position: 8
description: Betriebliches Runbook zur Diagnose von Otto-Befehlsrouting, Laufzeitausführung und Stream-Problemen. Behandelt CLI-Workflows, Ereignismodell, Protokollspeicher und Befehlsfehler-Handbuch.
keywords:
  - protokollierung
  - debugging
  - otto logs
  - log-follow
  - requestid-korrelation
---

# Protokollierung und Debugging

Diese Seite ist das betriebliche Runbook zur Diagnose von Befehlsrouting, Laufzeitausführung und Stream-Problemen. Verwenden Sie es zuerst als Workflow-Anleitung und dann als Befehlsreferenz.

## Wahrheitsquelle Codepfade

| Bereich | Quelle |
|---|---|
| Relay-Protokollaufnahme und -persistenz | `packages/relay/src/index.ts` |
| CLI-Log und Listener-UX | `packages/cli/src/index.ts` |
| Integrationsabdeckung für Protokollierung | `packages/relay/test/integration.test.mjs` |

## Kerne-CLI-Workflows | Ziel | Befehl |
|---|---|
| Begrenzte historische Beweise abrufen | `otto logs list --source all --latest 200` |
| Erweiterungslaufzeit-Protokolle live verfolgen | `otto logs follow --source node` |
| Mit vollständigen Hüllen verfolgen | `otto logs follow --source node --json` |
| NDJSON-Ausschnitt exportieren | `otto logs export --source relay --latest 500` |
| Netzwerk-Listener-Stream starten | `otto listener subscribe-network --tab-session <id> --site reddit.com --pattern 'https://www.reddit.com/api/*'` |
| Listener-Stream stoppen | `otto listener unsubscribe --target-request-id <subscribeRequestId>` |

Protokollquellen sind `relay`, `controller`, `node` und `all`. `logs follow` ist standardmäßig auf menschlich lesbare Zeilenausgabe eingestellt; verwenden Sie `--json`, wenn maschinelles Parsing wichtig ist.

## Empfohlene Debugging-Sequenz

Beginnen Sie mit begrenzten Beweisen und eskalieren Sie dann nur zu Live-Verfolgung, wenn die Reihenfolge wichtig ist:

1. Führen Sie den fehlgeschlagenen Befehl im JSON-Modus aus und erfassen Sie `requestId`.
2. Ziehen Sie korrelierte Protokolle mit `otto logs list --request-id <requestId> --source all --latest 100`.
3. Wenn das Verhalten erweiterungsspezifisch erscheint, schränken Sie auf Node-Protokolle ein.
4. Wenn Timing/Race-Bedingungen vermutet werden, führen Sie `logs follow --json` in einem begrenzten Erfassungsfenster aus.

Für vollständige Onboarding- und End-to-End-Controller-Fluss-Anleitungen lesen Sie die [Controller-Implementierungsanleitung](./guides/controller-implementation.md).

## Ereignismodell

Jedes gespeicherte Ereignis enthält stabile Hüllenfelder (`id`, `timestamp`, `level`, `source`, `type`) mit optionalen Korrelationsfeldern (`requestId`, `nodeId`) und geschwärzten `data`-Payloads.

| Ereignisfamilie | Typische Verwendung |
|---|---|
| `command_routed`, `result`, `error` | Befehlslebenszyklus und Terminalität |
| `lock_conflict`, `lock_expired` | Warteschlangen/Lock-Konkurrenzdiagnose |
| `pairing_requested`, `pairing_approved` | Node-Onboarding-Fluss |
| `offscreen.*`, `background.*` | Erweiterungstransport/Bootstrap-Gesundheit |
| `listener_update` | Stream-Payload-Updates (roher Transport oder Shared-Domain-Objekte) |
| `debugger_focus.*`, `network_listener.*` | Debugger-Attach/Wiederverwendung/Abbau-Verhalten |

Relay speichert Listener-Update-Metadaten und Formzusammenfassungen in Betriebsprotokollen, während volle Listener-Payloads an abonnierte Controller weitergeleitet werden.

## Listener- und Stream-Diagnose

Listener-Updates sollten immer durch die Subscribe-`requestId` korreliert werden. In `otto test`-Stream-Sitzungen ist dies absichtlich unterschiedlich von der ursprünglichen `command.test`-Anfrage-ID.

Bei der Diagnose von Duplikaten überprüfen Sie beide Schichten: Interceptions-Level-Hybrid-Unterdrückung und Adapter-Level-Semantik-Dedupe. Für adaptergestützte Streams (z.B. Reddit-Chat) erwarten Sie Shared-Domain-Typen wie `chat.message`, `chat.typing`, `chat.participant` und `chat.message_deleted`.

## Lokale Entwicklungsprotokollstreaming

Erweiterungs-lokales Dev-Protokollstreaming ist über Popup/Optionen opt-in. Wenn aktiviert, werden Erweiterungsprotokolle als strukturierte Node-Ereignisse in die Warteschlange gestellt und nach WebSocket-Auth geflusht. Relay speichert sie als `source=node`-Einträge und integriert sie in normale list/export/follow-APIs.

Debug-Log-Transport ist bewusst vom Listener-Update-Transport getrennt. Bei Last können Debug-Log-Frames gedrosselt werden, während Listener-Updates über den Datenpfad weiterlaufen.

## Druckausgleich und `rate_limited`-Signale

Wenn Offscreen `rate_limited`-Warnungen meldet, hat Relay einen oder mehrere eingehende Node-Frames im aktiven Minutenfenster abgelehnt. Bei normalen Hochlast-Szenarien sind weggeworfene Frames mit höherer Wahrscheinlichkeit Erweiterungstelemetrie (`extension_log`) als Listener-Updates, da Relay Listener-Updates auf Node-Sitzungen priorisiert.

Behandeln Sie wiederholte Ratenlimit-Warnungen als Signal, um Debug-Log-Volumen oder Flushing-Frequenz zu reduzieren, bevor Sie globale Relay-Limits erhöhen.

## Speicher und Aufbewahrung

| Richtlinie | Verhalten |
|---|---|
| Schnelle aktuelle Abfragen | In-Memory-Ringpuffer |
| Dauerhafter Verlauf | Tagesfensterisierte JSONL-Dateien (`operations-YYYY-MM-DD*.jsonl`) |
| Dateigrößensteuerung | Überlaufsdateien, wenn aktive Datei `OTTO_LOG_MAX_FILE_BYTES` überschreitet |
| Aufbewahrung | 14-tägiges Bereinigungsfenster |
| Kompatibilität | Legacy `operations.jsonl` weiterhin lesbar |

Umgebungssteuerungen:

- `OTTO_LOG_DIR`
- `OTTO_LOG_MAX_FILE_BYTES` (Minimum `1024`, Standard `104857600`)

## Befehlsfehler-Handbuch

Verwenden Sie diese Checkliste für Befehlsfehler:

1. Wenn `manual_login_required`, authentifizieren Sie sich manuell im Browser und führen Sie erneut aus.
2. Wenn `site_mismatch`, überprüfen Sie, ob die aktive `tabSessionId`-URL mit der Befehlsseite übereinstimmt.
3. Wenn `tab_url_not_ready`, führen Sie nach kurzer Verzögerung erneut aus.
4. Wenn `forbidden_action`, überprüfen Sie den Controller-Token-Bereich.
5. Wenn `acl_missing_node_grant`, genehmigen Sie den Controller im Erweiterungspopup Controller-Zugriff.
6. Wenn der Socket vor der Antwort schließt, behandeln Sie es zuerst als Transportunterbrechung und versuchen Sie es dann nach einer Relay/Node-Gesundheitsprüfung erneut.

Nach jedem Fehler korrelieren Sie nach `requestId`, bevor Sie zu globalen Protokollscans erweitern.

## Setup- und Kopplungsfehlerbehebung

Für Setup-Probleme, bevorzugen Sie `otto setup --non-interactive` und inspizieren Sie deterministische JSON-Felder für Daemon-Bereitschaft, Artefaktabruf und Übergabepfadwerte. Port-Konflikte sollten vor dem erneuten Ausführen aufgelöst werden, und wiederholte Ausführungen gegen dieselbe Relay-URL sollten Daemon-Wiederverwendung (`already_running`) melden, anstatt einen duplizierten Prozess zu starten.

Für Kopplungswiederherstellungsprobleme, erfassen Sie Popup-Status, Service-Worker-Protokolle und Offscreen-Wiederverbindungs/Auth-Verfolgungen um einen Aktualisierungsversuch. Erwartetes gehärtetes Verhalten ist automatische Bereinigung von veraltetem Herausforderungszustand, sofortige Herausforderungswiederausstellung, wenn Relay eine Herausforderung nicht mehr erkennt, und deterministische Statusaktualisierungsabwicklung.

## Nächste Schritte

- [RequestId-Korrelations-Runbook](./guides/requestid-correlation-runbook.md) — Vorfall-Korrelations-Workflow.
- [Erweiterte Fehlerbehebung](./guides/troubleshooting-advanced.md) — Stream-Diagnose, Fehler-zu-Aktion-Tabelle.
- [Relay-Betrieb](./relay-operations.md) — Protokollspeichermodell und Aufbewahrungseinstellungen.