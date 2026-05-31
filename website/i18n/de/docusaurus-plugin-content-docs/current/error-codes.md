---
title: Fehlercodes
sidebar_position: 1
description: Kanonischer Katalog der Otto-Fehlercodes mit Wiederholbarkeitsklassifizierung und Abhilfemaßnahmen. Behandelt Auth, Validierung, Routing, Lock/Timeout und seitenpezifische Fehler.
keywords:
  - fehlercodes
  - fehlerreferenz
  - fehlerbehebung
  - wiederholungsrichtlinie
  - acl-fehler
---

# Fehlercodes

Diese Seite ist die kanonische Fehlercode-Referenz für Otto. Jeder Code wird in `error`-Hüllen-Payloads ausgesendet. Verwenden Sie die Spalte **Wiederholbar**, um festzustellen, ob eine automatische Wiederholung sicher ist; verwenden Sie die Spalte **Aktion** für sofortige Abhilfe.

## Auth-Fehler

| Code | Wiederholbar | Aktion |
|---|---|---|
| `missing_access_token` | Nein | Token vor dem Senden von Befehlen beschaffen oder koppeln |
| `invalid_access_token` | Ja | Token mit `otto client login` aktualisieren, dann neu verbinden |
| `role_mismatch` | Nein | Verwenden Sie ein Token mit der richtigen Rolle für diesen Endpunkt |
| `unauthenticated` | Nein | Schließen Sie `hello` → `auth`-Handshake ab, bevor Sie Befehle senden |
| `acl_missing_node_grant` | Nein | Gewähren Sie Controller-Zugriff auf Node im Erweiterungspopup oder über `POST /api/controller/access` |

## Validierungsfehler

| Code | Wiederholbar | Aktion |
|---|---|---|
| `missing_target_node` | Nein | Setzen Sie `targetNodeId` in jeder Befehlshülle |
| `missing_tab_session` | Nein | Geben Sie `tabSessionId` für tab-bereichsspezifische Befehle an |
| `invalid_command_input_type` | Nein | Korrigieren Sie Feldtypen, um dem deklarierten `inputFields`-Schema zu entsprechen |
| `missing_command_input` | Nein | Geben Sie alle erforderlichen Felder an, die in `inputFields` deklariert sind |
| `missing_command_input_one_of` | Nein | Geben Sie mindestens ein Feld aus der `inputAtLeastOneOf`-Liste an |
| `unexpected_command_input` | Nein | Entfernen Sie Schlüssel, die nicht in `inputFields` deklariert sind |

## Routing- und Ausführungsfehler

| Code | Wiederholbar | Aktion |
|---|---|---|
| `node_offline` | Ja | Verbundene Nodes neu auflösen und erneut versuchen |
| `site_mismatch` | Nein | Tab zur richtigen Seite navigieren oder mit `primitive.tab.open` neu öffnen |
| `tab_url_not_ready` | Ja | Nach kurzer Verzögerung erneut versuchen; URL wurde noch nicht im Chrome-Tab festgeschrieben |
| `preload_host_mismatch` | Nein | `preloadHost`-Pfad validieren; auf Seitenweiterleitungen oder Interstitials prüfen |
| `manual_login_required` | Nein | Melden Sie sich manuell im Browser-Tab an und führen Sie den Befehl dann erneut aus |
| `unknown_site` | Nein | Überprüfen Sie unterstützte Seiten mit `otto commands list` |
| `unknown_command` | Nein | Überprüfen Sie verfügbare Befehle mit `otto commands list --site <site>` |
| `unknown_tab_session` | Nein | Öffnen Sie einen verwalteten Tab mit `primitive.tab.open` neu |

## Lock- und Timeout-Fehler

| Code | Wiederholbar | Aktion |
|---|---|---|
| `tab_busy` | Ja | Mit begrenztem Backoff erneut versuchen oder zu `waitPolicy: wait_with_timeout` wechseln |
| `tab_locked` | Ja | Nach Ablauf der Lock-Lease erneut versuchen |
| `queue_wait_timed_out` | Ja | `timeoutMs` erhöhen oder parallele Befehlskonkurrenz reduzieren |
| `command_timed_out` | Ja | `timeoutMs` erhöhen oder Befehlsoperationsbereich eingrenzen |
| `tab_queue_limit_exceeded` | Ja | Parallele Befehle auf dieser Tab-Sitzung reduzieren |
| `rate_limited` | Ja | Befehlsdurchsatz reduzieren; Relay-Einstellung `OTTO_RATE_LIMIT_PER_MIN` überprüfen |
| `replay_rejected` | Nein | Erzeugen Sie eine frische `replayNonce` und aktualisierten `timestamp` |
| `timestamp_out_of_window` | Nein | Systemuhr synchronisieren; `timestamp` muss innerhalb von `OTTO_REPLAY_WINDOW_MS` der Relay-Zeit sein |
| `node_disconnected` | Ja | Relay sendet dies, wenn der Node in der Mitte des Fluges abbricht; nach Wiederverbindung erneut versuchen |

## Seitenspezifische Fehler (Reddit)

| Code | Wiederholbar | Aktion |
|---|---|---|
| `reddit_user_not_found` | Nein | Ziel-Benutzername oder Benutzer-ID validieren |
| `reddit_user_unmessageable` | Nein | Wählen Sie einen alternativen Empfänger |
| `reddit_rate_limited` | Ja | Zurückweichen und erneut versuchen |
| `reddit_matrix_token_missing` | Nein | Reddit-Seitensitzung erneut authentifizieren |
| `reddit_chat_send_unconfirmed` | Nein | Sendestatus überprüfen und Befehl erneut ausführen |

## Nächste Schritte

- [Erweiterte Fehlerbehebung](./guides/troubleshooting-advanced.md) — Fehler-zu-Aktion-Workflows.
- [Controller-Fehlerbehebungsentscheidungsbaum](./guides/controller-troubleshooting-decision-tree.md) — Isolationspfad für Controller-Fehler.
- [Protokollreferenz](./protocol.md) — Fehlerhüllenform.