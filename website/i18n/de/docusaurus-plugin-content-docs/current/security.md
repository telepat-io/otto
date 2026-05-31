---
title: Sicherheit
sidebar_position: 1
description: Otto-Sicherheitskontrollen, Bedrohungsmodell und betriebliche Sicherheitscheckliste. Behandelt Token-Auth, Bereichserzwingung, Replay-Schutz, Interceptionsabdeckung und Deploymentrichtlinien.
keywords:
  - sicherheit
  - bedrohungsmodell
  - token-auth
  - replay-schutz
  - acl
---

# Sicherheit

## Wahrheitsquelle Codepfade

- Relay-Auth und Rate-Limiting: `packages/relay/src/index.ts`
- Protokollbasierte Auth und Fehlerschemata: `packages/shared-protocol/src/index.ts`
- Relay-Sicherheitsintegrationstests: `packages/relay/test/integration.test.mjs`

## Basislinienkontrollen

- Token-erste WebSocket-Authentifizierung
- Rollenbasierte Befehlsautorisierung
- Aktionsbereichsautorisierung für Controller-Befehle
- Strikte Schema-Validierung
- JWT-Aussteller- und Publikumsvalidierung
- Optionales vorheriges Signaturschlüsselüberprüfungsfenster für Geheimnisrotation
- Aktualisierungstoken-Widerrufsendpunkt (`/api/auth/revoke`)
- Dauerhafte relayseitige Aktualisierungssitzungspersistenz mit Startbereinigung von fehlerhaften/abgelaufenen Einträgen
- Controller-Client-Geheimnis-Hashing bei Ruhezustand (Relay speichert Salt+Hash, niemals Klartext)
- Controller-seitige Client-Geheimnisspeicherung bevorzugt OS-Keychain; Env-Var-Fallback unterstützt (`OTTO_CONTROLLER_CLIENT_SECRET`)
- Node-eigene ACL-Steuerung für Controller-zu-Node-Befehlsrouting
- Aktualisierungstoken-Rotation bei erfolgreichem HTTP-Refresh
- Befehlsrate-Limitierung pro Sitzung
- Replay-Schutz über Befehl `replayNonce` und Zeitstempel-Annahmefenster
- Ursprungs-Erlaubnislistenprüfungen für browserursprüngliche Node-WebSocket-Upgrades
- Node-WebSocket-Upgrade lehnt nicht erlaubten Ursprung mit HTTP 403 ab, wenn die Erlaubnisliste konfiguriert ist
- Standardmäßig geschwärzte Protokolle
- Auth-pflichtige Befehlsvorabprüfung, die Benutzer auf partnereigene Anmeldeseiten umleiten kann, ohne Anmelde erfassung
- Debugger-gestützte Netzwerkinterception ist auf verwalteten `tabSessionId` abgegrenzt und wird gegen deklarierte Seite validiert
- Interceptions-Header-Emission schwärzt sensible Felder (`Authorization`, `Cookie`, `Set-Cookie`, `Proxy-Authorization`)
- Einrichtungszeit Erweiterungsartefakt-Prüfsummenverifizierung vor der Extraktion

## Befehlssicherheitsmodell

Bedrohungsgrenzen:

- Relay-Auth und Bereiche schützen den Befehlseingang.
- Laufzeit-Controller-Befehlsautorisierung basiert auf Bearer-Token (Zugriffstoken-Bereiche + Node-ACL-Berechtigungen), nicht auf Client-Geheimnissen.
- Befehls-Auth-Vorabprüfung schützt Website-Sitzungsvoraussetzungen.
- Browser-Anmeldeinformationen bleiben benutzerverwaltet und werden niemals durch Otto-Befehlsploads übertragen.

Aktuelle Kontrollen:

- Seitenabgleich vor der Befehlsausführung (`site_mismatch` bei Nichtübereinstimmung).
- Explizite manuelle Übergabe für Website-Anmeldung (`manual_login_required`).
- Keine automatische Anmeldeeingabe oder Extraktion sensibler Felder.

## Missbrauchs- und Fehlerbegrenzungen

- Kopplungsgenehmigung ist „Erster gewinnt"; wiederholte Genehmigungsversuche geben deterministisch `pairing_not_pending` zurück.
- Über `/api/controller/token` registrierte Controller-Clients werden für Node-Befehlsrouting abgelehnt, bis Node-eigene ACL Zugriff gewährt (`acl_missing_node_grant`).
- Controller-Client-Geheimnisse werden für `/api/controller/token`-Anmeldeinformationsaustausch verwendet und niemals in Laufzeit-Befehlsframes übertragen.
- Fehlerhafte oder abgelaufene Zugriffstoken werden bei der WebSocket-Auth mit `invalid_access_token` abgelehnt.
- Fehlerhafte Befehlshüllen (z.B. fehlendes `targetNodeId`) werden vor dem Routing abgelehnt.
- Warteschlangentiefe und pro-Sitzungs-Ratenlimits werden durchgesetzt, um Verhungern und Missbrauchsdruck zu reduzieren.
- Befehls-Auth-Ablauf automatisiert niemals die Anmeldeübermittlung des Endbenutzers; fehlgeschlagene Anmelde-Vorabprüfung gibt nach optionaler Weiterleitung zur Anmeldeseite `manual_login_required` zurück.
- `chrome.debugger`-Interception bleibt über Listener-Subscribe-Aktionen explizit opt-in und kann die Chrome-Debugger-Infobar nicht unterdrücken.
- Debugger-Fokus-Emulation auf Befehlsebene bleibt über `metadata.requiresDebuggerFocus=true` explizit opt-in.
- Debugger-Attach-Wiederverwendung ist eigentumsbereichsabgrenzt: Laufzeit löst nur Anhänge, die durch diesen Funktionspfad erstellt wurden, um Cross-Funktionsstörungen zu verhindern.
- Fetch-Domain-Interception setzt immer pausierte Anfragen fort, um Verkehrsdeadlock zu vermeiden, wenn die Body-Abrufung fehlschlägt.
- Hybrid-Interception-Duplikatunterdrückung begrenzt equivalente cross-source Antwortreplays und reduziert wiederholte Pload-Weiterleitungsoberflächen.

## Betriebliche Sicherheitscheckliste

1. Halten Sie `OTTO_TOKEN_SECRET` fern von der Quellcodeverwaltung und rotieren Sie es regelmäßig.
2. Setzen Sie `OTTO_EXTENSION_ORIGIN` in der Produktionsumgebung, um Browser-Node-Upgrades einzuschränken.
3. Verwenden Sie Controller-Bereiche mit geringsten Privilegien für Automatisierungsprinzipale.
4. Überprüfen Sie Protokolle auf wiederholte `forbidden_action`, `replay_rejected` und Sperrkonfliktmuster.
5. Behandeln Sie Befehlslasten als nicht vertrauenswürdig und validieren Sie Felder in der Befehlslogik.
6. Halten Sie Controller- und Erweiterungseinstellungen getrennt; kopieren Sie keine Controller-Token in den Erweiterungsspeicher.
7. Bevorzigen Sie einen geschützten Dateisystemspeicherort für `OTTO_LOG_DIR`; er enthält jetzt dauerhafte Aktualisierungssitzungsdaten (`refresh-sessions.jsonl`).
8. Halten Sie die Aktualisierungstoken-Lebensdauer über `OTTO_REFRESH_TTL_DAYS` begrenzt und vermeiden Sie unnötig hohe Werte.
9. Halten Sie `OTTO_ALLOW_REMOTE_CONTROLLER_REGISTRATION` deaktiviert, es sei denn, es ist erforderlich; bei Aktivierung der Remote-Registrierung setzen Sie `OTTO_CONTROLLER_REGISTRATION_SECRET` und schränken Sie den Netzwerkeingang ein.
10. Behandeln Sie Node-ACL-Genehmigungsaktionen als Endbenutzer-Berechtigungsoperationen und überprüfen Sie `controller_acl_granted` / `controller_acl_revoked`-Ereignisse.
11. Behandeln Sie Debugger-Fokus-Metadaten als privilegiertes Zuverlässigkeitstool; aktivieren Sie es nur für Befehle mit nachgewiesenem Hintergrundtab-Blockierverhalten.