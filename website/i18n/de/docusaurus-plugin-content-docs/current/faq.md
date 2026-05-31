---
title: Häufig gestellte Fragen
sidebar_position: 12
description: Antworten auf häufige Otto-Fragen, organisiert nach Kategorie. Behandelt Setup, Auth, Fehler, Debugging und Erweiterungsverwaltung.
keywords:
  - faq
  - fehlerbehebung
  - setup-fragen
  - auth-fehler
  - otto-befehle
---

# Häufig gestellte Fragen

## Setup

**Muss ich `@telepat/otto-relay` separat installieren?**

Nein. Die globale `@telepat/otto`-Installation enthält bereits Relay-Laufzeitabhängigkeiten für `otto start`, `otto stop`, `otto status` und Setup-Daemon-Bereitschaft.

**Startet `otto setup` den Relay-Daemon automatisch?**

Ja. `otto setup` stellt die Relay-Daemon-Bereitschaft für den ausgewählten Relay-URL-Port sicher. Wenn kein Daemon läuft, startet das Setup einen. Wenn ein passender Daemon bereits läuft, wird er wiederverwendet.

**Warum schlägt `otto setup` mit einem Relay-Daemon-Port-Konflikt fehl?**

Das Setup erkennt einen laufenden Daemon auf einem anderen Port als der ausgewählten Relay-URL. Stoppen Sie den bestehenden Daemon mit `otto stop` und starten Sie dann das Setup mit der beabsichtigten Relay-URL neu.

**Warum hat `otto setup` keine Chrome-Installationsschritte ausgegeben?**

`otto setup` gibt menschliche Anweisungen im interaktiven TTY-Modus aus. Übergeben Sie `--non-interactive` oder führen Sie es in einer non-TTY-Umgebung aus, um stattdessen deterministische JSON-Ausgabe zu erzeugen.

**Warum schlägt `otto setup` mit Download- oder Prüfsummenfehlern fehl?**

`otto setup` ruft Erweiterungsartefakte von Release-Assets ab und überprüft SHA-256-Prüfsummen. Fehler deuten normalerweise auf fehlende oder falsch benannte Releasedateien, Netzwerkprobleme oder eine Prüfsummen-Nichtübereinstimmung hin. Überprüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.

**Wie aktualisiere ich die Erweiterung nach dem Setup?**

```bash
otto extension update
```

Laden Sie dann die Erweiterung in `chrome://extensions` neu (oder starten Sie Ihren Browser neu), damit die aktualisierte Erweiterungslaufzeit eine Wiederverbindung herstellt.

**Wo werden Controller- und Erweiterungseinstellungen gespeichert?**

Controller-Einstellungen werden in `~/.otto/config.json` gespeichert. Erweiterungs-Node-Einstellungen werden in `chrome.storage.*` gespeichert und über das Erweiterungspopup und die Optionenseiten konfiguriert. Diese Speicher sind absichtlich getrennt, selbst wenn beide auf denselben Relay-Host zeigen.

---

## Auth und Kopplung

**Warum sieht die Otto-Erweiterung grau oder inaktiv aus?**

Öffnen Sie das Otto-Symbolleistenpopup und überprüfen Sie den Setup-Status. Ein neuer Node wartet auf Kopplungsgenehmigung und zeigt einen Kopplungscode. Genehmigen Sie ihn mit `otto pair <code>` und warten Sie, bis der Popup-Status „Verbunden" anzeigt.

**Warum zeigt das Popup eine Controller-Zeile als „wartend auf Genehmigung" an?**

Der Controller ist auf Relay-Ebene registriert, wurde aber noch keinen Node-Zugriff gewährt. Verwenden Sie die Aktions-Schaltfläche in der Erweiterung, um Zugriff zu gewähren.

**Warum gibt `otto test <site> <command>` `manual_login_required` zurück?**

Der Befehl erfordert Authentifizierung und die aktuelle Browser-Sitzung ist für diese Seite nicht angemeldet. Schließen Sie die Anmeldung im Browser-Tab ab und führen Sie den Befehl erneut aus.

**Warum schlägt `otto test` mit `acl_missing_node_grant` fehl, selbst nach der Client-Registrierung?**

Controller-Registrierung und Node-Zugriff sind separate Kontrollen. Öffnen Sie das Erweiterungspopup, gehen Sie zu Controller-Zugriff und gewähren Sie diesem Controller-Client den Zugriff auf den Ziel-Node. Befehle werden abgelehnt, bis diese node-eigene ACL-Berechtigung vorhanden ist.

**Warum zeigt das Popup eine Erweiterungsupdatenwarnung an, während verbunden?**

Die Erweiterungsversion unterscheidet sich von der Relay-Version, gegen die sie authentifiziert wurde. Führen Sie `otto extension update` aus und laden Sie dann die Erweiterung in `chrome://extensions` neu oder starten Sie den Browser neu.

---

## Befehlsfehler

**Warum gibt `otto cmd` `node_offline` zurück?**

Ihr `targetNodeId` ist nicht mit dem Relay verbunden. Überprüfen Sie die Erweiterungs-Node-Relay-URL und Node-ID im Erweiterungspopup.

**Warum schlägt ein Tab-Befehl mit Lock-Konflikt fehl?**

Ein anderer Controller hält derzeit eine Sperre für diese `tabSessionId`. Versuchen Sie es mit begrenztem Backoff erneut oder wechseln Sie zu `waitPolicy: wait_with_timeout`.

**Warum gibt `command.run` `site_mismatch` zurück?**

Die aufgelöste Tab-URL stimmt nicht mit dem Seitenbefehlsbundle überein. Navigieren Sie zur richtigen Seite oder öffnen Sie den Tab mit `primitive.tab.open` neu.

**Warum gibt `command.run` `unexpected_command_input` zurück?**

Der Befehl deklariert strenge `inputFields` und Ihr Payload enthielt nicht deklarierte Schlüssel. Entfernen Sie die zusätzlichen Schlüssel oder aktualisieren Sie die Befehlsmetadaten.

**Warum gibt `command.run` `missing_command_input_one_of` zurück?**

Der Befehl deklariert `inputAtLeastOneOf`. Mindestens ein Feld aus dieser Liste muss im Eingabe-Payload vorhanden sein.

**Warum gibt `command.run` `preload_host_mismatch` zurück?**

Der Befehl deklariert `preloadHost`, die Laufzeit navigierte dorthin vor der Ausführung, und der festgeschriebene URL-Host stimmte immer noch nicht überein. Dies kann mit Weiterleitungen, blockierter Navigation oder seiteninterstitiellen Seiten passieren.

**Warum schlägt `otto commands list` mit `forbidden_action` fehl?**

Ihre Controller-Token-Bereiche enthalten nicht `command.list`. Registrieren Sie sich mit breiteren Bereichen neu oder passen Sie `OTTO_DEFAULT_CONTROLLER_SCOPES` in der Relay-Konfiguration an.

---

## Debugging

**Warum wird ein Befehl als fehlgeschlagen markiert nach Wiederverbindung?**

Otto verwendet fail-fast-in-flight-Verhalten während der Trennung. Befehle, die beim Verbindungsabbruch in der Luft waren, geben `node_disconnected` zurück. Versuchen Sie es nach der Wiederverbindung erneut.

**Warum erschienen Chat-Stream-Zeilen in `otto test reddit.com getChatMessages` dupliziert?**

Otto unterdrückt Duplikate in zwei Schichten:
1. Laufzeitinterception unterdrückt äquivalente hybride cross-source Antwortemissionen.
2. Reddit-Befehlsadapter unterdrückt wiederholte semantische Chat-Objekte.

Wenn Sie immer noch Duplikate sehen, überprüfen Sie die Adapter-Schicht. Führen Sie `otto logs list --source node --latest 50` aus, um das Deduplizierungsverhalten auf Erweiterungsseite zu inspizieren.

**Warum hat `otto test` einen anderen Host als `<site>` geöffnet?**

`otto test` verwendet Befehls-`preloadHost` aus `command.list`-Metadaten, wenn verfügbar, sodass Vorbedingungen vor der Befehlsausführung erfüllt sind. Der Host kann sich von der Seite unterscheiden, wenn `preloadHost` auf einen Login- oder Einstiegspfad zeigt.

**Warum sieht die non-interaktive CLI-Ausgabe anders aus als der TUI-Modus?**

TTY-Sitzungen verwenden Ink-UI, während non-TTY-Sitzungen maschinenlesbare JSON zurückgeben und Beendigungscodes bei terminalen Fehlern setzen.

**Warum gibt `otto client remove --all` beim zweiten Ausführen Null zurück?**

Massenentfernung bereinigt Controller-Client-Datensätze nach dem Widerruf. Wenn alle Clients entfernt sind, geben nachfolgende `--all`-Ausführungen `removedCount: 0` zurück, bis neue Clients registriert sind.

## Nächste Schritte

- [Erweiterte Fehlerbehebung](./guides/troubleshooting-advanced.md) — Fehler-zu-Aktion-Workflows.
- [Fehlercodes](./error-codes.md) — vollständiger Fehlerkatalog mit Wiederholbarkeit.
- [Protokollierung und Debugging](./logging-debugging.md) — Protokollbefehle und Diagnosesequenz.

## Wie bearbeite ich Controller-Global-Einstellungen sicher?
Verwenden Sie `otto settings`. Navigieren Sie mit Auf/Ab, bearbeiten Sie mit Enter, speichern Sie mit `s` und beenden Sie mit `q` oder `Esc`. Während Sie ein Feld bearbeiten, bricht `Esc` die Bearbeitung ab.