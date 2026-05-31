---
title: Erweiterte Fehlerbehebung
sidebar_position: 8
description: Tiefe Debugging-Anleitung für Otto-Controller-, Relay- und Erweiterungs-Node-Workflows. Fehler-zu-Aktion-Tabelle, Stream-Diagnose und schrittweise Isolationsprozedur.
keywords:
  - fehlerbehebung
  - debugging
  - fehlercodes
  - stream-diagnose
  - otto logs
---

# Erweiterte Fehlerbehebung

Diese Anleitung behandelt tiefes Debugging über Controller-, Relay- und Erweiterungs-Node-Workflows hinweg. Beginnen Sie mit dem Kerndefining, um die Fehlschicht zu isolieren, und verwenden Sie dann die Fehler-zu-Aktion-Tabelle zur Lösung.

## Kern-Debugging-Workflow

1. **Mit frischer Anfrage reproduzieren** — vermeiden Sie Debugging von veraltetem Zustand.
2. **Breite Protokolle sammeln** — verwenden Sie zuerst `--source all`, um alle Komponenten zu sehen.
3. **Nach `requestId` isolieren** — verwenden Sie eine Anfrage-ID als primären Korrelationsschlüssel.
4. **Fehlschicht eingrenzen** — Auth, Routing, Ausführung, Listener-Lebenszyklus oder Bereinigung.

## Nützliche Befehle

| Ziel | Befehl |
|---|---|
| Alle Quellen live verfolgen | `otto logs follow --source all` |
| Erweiterungsseitige Laufzeit fokussieren | `otto logs follow --source node` |
| Begrenzte Node-Beweise abrufen | `otto logs list --source node --latest 300` |
| Befehlssichtbarkeit überprüfen | `otto commands list` |
| Mit maschinenlesbarer Ausgabe reproduzieren | `otto test <site> <command> --json` |
| Neuen verwalteten Tab öffnen | `otto cmd --action primitive.tab.open --payload '{"url":"https://example.com"}'` |

## Fehler-zu-Aktion-Tabelle

| Fehler | Symptom | Wahrscheinliche Ursache | Lösung |
|---|---|---|---|
| `manual_login_required` | Befehl pausiert, Tab bleibt offen | Browser-Sitzung für Seite fehlt | Melden Sie sich manuell im Browser-Tab an und führen Sie den Befehl dann erneut aus |
| `site_mismatch` | Befehl vor Ausführung abgelehnt | Tab-URL stimmt nicht mit Befehlsseite überein | Navigieren Sie zum richtigen Host oder öffnen Sie den Tab über `primitive.tab.open` neu |
| `tab_url_not_ready` | Befehl beim Start abgelehnt | URL wurde noch nicht im Chrome-Tab festgeschrieben | Nach kurzer Verzögerung erneut versuchen; verwenden Sie `primitive.tab.open`, um eine neue Sitzung zu erzeugen |
| `acl_missing_node_grant` | Node-gerichteter Befehl blockiert | Controller-Client fehlt Node-ACL-Genehmigung | Gewähren Sie Zugriff über die Node-ACL-API oder über den `otto client`-Ablauf |
| `tab_busy` / `tab_locked` | Befehl wartet auf Timeout wegen Sperre | Ein anderer Befehl hält die Tab-Sperre | Mit begrenztem Backoff erneut versuchen oder `wait_with_timeout`-Warte-Strategie konfigurieren |
| `invalid_access_token` | Auth schlägt bei jedem Befehl fehl | Zugriffstoken abgelaufen | Führen Sie `otto client login` aus, um Token zu aktualisieren |
| `forbidden_action` | Befehl vom Relay abgelehnt | Controller-Token fehlt erforderlicher Bereich | Registrieren Sie sich mit breiterem Token-Bereich neu oder aktualisieren Sie |

:::tip
Bei jedem Fehler erfassen Sie zuerst die `requestId` aus der Fehlerhülle. Verwenden Sie dann `otto logs list --request-id <id> --source all`, um den vollständigen Zeitablauf über Komponenten hinweg zu sehen.
:::

## Stream-Diagnose

Bei Stream-Fehlern folgen Sie dieser Isolationssequenz:

1. Bestätigen Sie, dass `command.test` `stream.listeners` in der Ergebnishülle zurückgegeben hat.
2. Überprüfen Sie, dass der Subscribe-Befehl ein terminalergebnis zurückgegeben hat (keinen Fehler).
3. Bestätigen Sie, dass `listener_update`-Ereignisse mit der **Subscribe**-`requestId` korreliert sind (nicht mit der ursprünglichen Befehls-`requestId`).
4. Überprüfen Sie, dass der Abbau explizit war: `listener.unsubscribe` oder `command_cancel` auf dem Stream-Befehl.

Für rohe Netzwerkerfassungsvalidierung:

```bash
otto listener subscribe-network \
  --tab-session <tabSessionId> \
  --site example.com \
  --pattern 'https://api.example.com/*' \
  --mode network
```

Erwartet: gestreamte `listener_update`-Ereignisse. Wenn nichts eintrifft, sind Muster, Host oder Modus möglicherweise falsch konfiguriert.

## Prävention

- Halten Sie `targetNodeId` in jedem Befehl explizit.
- Verwenden Sie `otto commands list` vor dem Debuggen von Ausführungsfehlern — bestätigt, dass Auth und Routing gesund sind.
- Aktualisieren Sie Token proaktiv für lang laufende Controller-Sitzungen.
- Verwenden Sie `--stream-follow-ms` mit Timeout für unbeaufsichtigte Stream-Tests, anstatt Sitzungen unbegrenzt offen zu lassen.

## Nächste Schritte

- [Controller-Fehlerbehebungsentscheidungsbaum](./controller-troubleshooting-decision-tree.md) — schrittweiser Entscheidungspfad.
- [requestId-Korrelations-Runbook](./requestid-correlation-runbook.md) — eine Anfrage über Komponenten hinweg verfolgen.
- [Fehlercodes](../error-codes.md) — vollständige Fehlercode-Referenz mit Wiederholbarkeit.