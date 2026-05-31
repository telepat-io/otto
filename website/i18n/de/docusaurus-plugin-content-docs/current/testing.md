---
title: Testen
sidebar_position: 2
description: Wie Otto das Verhalten über Relay-, Erweiterungs- und CLI-Oberflächen validiert. Behandelt Abdeckungsmatrix, Annahmetore, Befehlsentwickler-Runbook und CI-Richtlinien.
keywords:
  - testen
  - abdeckungsmatrix
  - integrationstests
  - otto test
  - e2e
---

# Testen

Diese Seite beschreibt, wie Otto das Verhalten über Relay-, Erweiterungs- und CLI-Oberflächen validiert. Sie ist nach Testzweck und nicht nach Paketinterna organisiert, sodass Sie schnell die richtige Verifizierungsstufe vor oder nach einer Änderung wählen können.

## Wahrheitsquelle Codepfade

| Bereich | Quelle |
|---|---|
| Relay-Integrationssuite | `packages/relay/test/integration.test.mjs` |
| Erweiterungslaufzeit-Tests | `extension/test/*.test.ts` |
| CLI-Setup/Einstellungen und Befehls-UX-Tests | `packages/cli/test/*.test.ts` |
| Manuelles E2e-Harnisch | `packages/relay/scripts/manual-e2e.mjs` |

## Erforderliche Validierungsreihenfolge

Führen Sie diese Befehle nach jeder Codeänderung in dieser Reihenfolge aus:

1. `npm run check`
2. `npm run lint`
3. `npm run build`
4. `npm run -ws --if-present test`

Diese Reihenfolge hält Fehler hochsignatur. Typ- und Lint-Fehler sind normalerweise billiger zu beheben als nachgelagerte Integrationsfehler.

## Abdeckungsmatrix

| Schicht | Was wahr sein muss |
|---|---|
| Protokoll und Verträge | Geteilte Typen kompilieren und Aktions-Payloads bleiben vertragskompatibel |
| Relay-Auth und Routing | Kopplung, Token-Auth, Bereichserzwingung, Nonce-Replay-Verteidigung und deterministisches Befehlsrouting bestehen alle |
| Relay-Ausführungssemantik | Terminalergebnisse, Warteschlangen (`FIFO` pro Tab), cross-Tab-Parallelität und Lock-Lebenszyklusinvarianten bleiben deterministisch |
| Relay-Beobachtbarkeit | Protokollfilterung/Export/Follow-Verhalten, Listener-Subscribe/Unsubscribe-Lebenszyklus und Node-Listener-Update-Routing bleiben erhalten |
| Erweiterungslaufzeit-Resilienz | Offscreen-Wiederverbindung, Keep-Warm/Bootstrap-Abgleich, Replay-Dedupe und Tab-Sitzungs-Wiederherstellung bleiben stabil |
| Erweiterung-Befehlslaufzeit | Seitenvalidierung, Auth-Vorabprüfung, Metadatenvalidierung, Preload-Host-Gating, Execute/Test-Fallback und Befehlsfehler-Determinismus bleiben erhalten |
| Listener/Interceptions-Laufzeit | Optionenvalidierung, Body-Erfassungsverhalten, fetch/hybrid-Semantik, Duplikatunterdrückung und Trennsicherheit bleiben korrekt |
| CLI-UX und Automatisierungsmodus | `otto test`, Setup/Einstellungsverhalten, TTY/non-TTY-Ausgabeverträge und Transportunterbrechungsoberflächen bleiben vorhersagbar |

## Annahmetore

Eine Änderung ist nicht abgeschlossen, es sei denn, Befehlsergebnisse terminieren weiterhin als `completed`, `failed`, `timed_out` oder `cancelled`; Lock- und Warteschlangenverhalten bleibt unter Konkurrenz deterministisch; und Laufzeit-Neustart-Abgleich repariert weiterhin veraltete Tab/Gruppen-Zustände sicher.

## Befehlsentwickler-Runbook

Verwenden Sie diese Sequenz, wenn Sie einen Seitenbefehl hinzufügen oder ändern:

1. Entdecken Sie Befehlsmetadaten mit `otto commands list [--site <site>]`.
2. Führen Sie `otto test <site> <command>` mit der kleinsten sinnvollen Payload aus.
3. Wenn Sie `manual_login_required` erhalten, authentifizieren Sie sich im geöffneten Tab und führen Sie erneut aus.
4. Wenn Validierungsfehler auftreten (`missing_command_input`, `missing_command_input_one_of`, `invalid_command_input_type`, `unexpected_command_input`), richten Sie die Payload nach den Metadaten aus und führen Sie erneut aus.
5. Für streamfähige Befehle validieren Sie Follow-Verhalten und Abbau (`Ctrl+C` -> deterministischer Abbruch/Bereinigung).

### Ausführungsverhaltenshinweise

`otto test` sendet `command.test` und greift auf `execute` zurück, wenn kein Befehlshook existiert. Wenn `targetNodeId` fehlt oder veraltet ist und genau ein Node verbunden ist, wählt die CLI diesen Node automatisch aus; bei mehreren Nodes übergeben Sie `--node-id`. Wenn `--tab-session` weggelassen wird, öffnet die CLI `preloadHost` automatisch, wenn verfügbar, sonst `https://<site>`, und schließt diesen Tab nach Abschluss automatisch, es sei denn, `--wait-for-interrupt` wird verwendet.

Für die Timeout-Handhabung können `otto test` und `otto cmd --action command.run` den Timeout aus Befehlsdeskriptormetadaten auflösen, wenn der Standard-CLI-Timeout verwendet wird. Wenn ein Befehlsdeskriptor `timeoutPolicy` enthält, kann die CLI einen eingabeskaliierten Timeout (z.B. nach `minReturnedPosts`) mit min/max-Klemmen ableiten. Explizite Nicht-Standard-`--timeout`-Werte überschreiben immer deskriptorabgeleitetes Timeout-Verhalten.

## TTY vs. non-TTY-Verträge

| Oberfläche | TTY-Verhalten | Non-TTY-Verhalten |
|---|---|---|
| `otto test` Erfolg/Fehler | Menschlich lesbare Statuszeilen und Footer-Warnungen | JSON-Hüllen und Nicht-Null-Beendigung bei terminalem Fehler |
| Streaming-Befehle | Live-Verfolgung bis Interrupt | Maschinenlesbare Stream-Frames bis Caller-Timeout/Stopp |
| Setup-Ausgabe | Menschliche Onboarding-Anweisungen und Chrome-Übergabetext | Nur deterministisches JSON |

Wenn der Controller-WebSocket schließt, bevor eine Befehlsantwort eintrifft, sollte die CLI Transportunterbrechungsanweisungen ausgeben und mit Nicht-Null ohne rohe Stack-Ausgabe beenden.

## Manuelles E2e-Harnisch

Führen Sie `npm run e2e:manual` aus, nachdem Relay und Erweiterungs-Node verbunden sind.

| Umgebungsvariable | Standard | Zweck |
|---|---|---|
| `OTTO_RELAY_HTTP_URL` | `http://127.0.0.1:8787` | Relay HTTP-Endpunkt |
| `OTTO_RELAY_WS_URL` | `ws://127.0.0.1:8787/?role=controller` | Relay Controller WebSocket-Endpunkt |
| `OTTO_NODE_ID` | `node_manual_e2e` | Ziel-Node-Identität |
| `OTTO_E2E_OPEN_URL` | `https://www.reddit.com/` | Anfängliche geöffnete URL |
| `OTTO_E2E_EXTRACT_SELECTOR` | `title` | DOM-Extract-Selektor |
| `OTTO_E2E_COMMAND_TIMEOUT_MS` | `10000` | Befehls-Timeout-Budget |
| `OTTO_E2E_RUN_COMMAND` | nicht gesetzt (`0`) | Auf `1` setzen, um `command.run` einzuschließen |
| `OTTO_E2E_COMMAND_SITE` | `reddit.com` | Seite für manuellen Befehlslauf |
| `OTTO_E2E_COMMAND_ID` | `getPosts` | Befehls-ID für manuellen Befehlslauf |
| `OTTO_CONTROLLER_ACCESS_TOKEN` | nicht gesetzt | Überspringt automatische Kopplungsgenehmigung, wenn angegeben |

## Setup- und Einstellungsvalidierungsschwerpunkt

`otto setup` muss in interaktiven und nicht-interaktiven Umgebungen deterministisch bleiben, einschließlich Daemon-Bereitschaftsmeldung und Erweiterungsartefakt-Prüfsummenbehandlung. Erneutes Ausführen des Setups auf einem bereits passenden Daemon sollte Wiederverwendung melden, anstatt Duplikate zu erzeugen, und Daemon-Port-Konflikte müssen mit expliziten Abhilfeanweisungen fehlschlagen.

`otto settings` muss Tastaturkonsistenz (`Auf/Ab`, `Enter`, `s`, `q`, `Esc`) beibehalten und validierte Controller-Global-Werte in `~/.otto/config.json` persistieren.

## CI- und Agenten-Automatisierungshinweise

Für autonome Workflows, bevorzugen Sie non-TTY-JSON-Ausgabe, halten Sie Payloads begrenzt und korrelieren Sie Fehler nach `requestId`, bevor Sie den Bereich erweitern. Wenn Debugging Protokolle erfordert, verwenden Sie zuerst begrenzte Abrufe und wechseln Sie nur zu Live-Verfolgung, wenn Sie zeitliche Sequenzierung benötigen.