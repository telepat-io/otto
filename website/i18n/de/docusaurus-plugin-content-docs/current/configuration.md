---
title: Konfigurationsreferenz
sidebar_position: 2
description: Vollständige Konfigurationsreferenz für Otto Relay-Umgebungsvariablen, CLI-Konfigurationsdatei, Erweiterungslaufzeiteinstellungen und Build-Pfad-Vertrag.
keywords:
  - konfiguration
  - umgebungsvariablen
  - relay-konfiguration
  - cli-konfiguration
  - erweiterungseinstellungen
---

# Konfigurationsreferenz

Diese Seite behandelt alle konfigurierbaren Einstellungen für Otto: Relay-Umgebungsvariablen, CLI-Konfigurationsdatei, Erweiterungslaufzeiteinstellungen und den Build-Pfad-Vertrag.

## Relay-Umgebungsvariablen

Setzen Sie diese in der Relay-Prozessumgebung, bevor Sie mit `otto start` oder `otto relay:start` starten.

| Variable | Standard | Beschreibung |
|---|---|---|
| `OTTO_RELAY_PORT` | `8787` | Relay HTTP und WebSocket Listen-Port |
| `OTTO_TOKEN_SECRET` | automatisch generiert | JWT-Signiergeheimnis für alle Token |
| `OTTO_TOKEN_PREVIOUS_SECRET` | (leer) | Vorheriges Geheimnis für Rotationskompatibilität |
| `OTTO_TOKEN_ISSUER` | `otto-relay` | JWT `iss` Behauptung |
| `OTTO_TOKEN_AUDIENCE` | `otto-clients` | JWT `aud` Behauptung |
| `OTTO_TOKEN_TTL_MINUTES` | `15` | Zugriffstoken-Lebensdauer in Minuten |
| `OTTO_REFRESH_TTL_DAYS` | `30` | Aktualisierungstoken-Lebensdauer in Tagen |
| `OTTO_EXTENSION_ORIGIN` | (Erweiterungsursprung) | Erlaubte Ursprung für Node-WebSocket-Verbindungen |
| `OTTO_LOG_DIR` | `~/.otto/relay` | Verzeichnis für JSONL-Betriebsprotokolldateien |
| `OTTO_LOG_MAX_FILE_BYTES` | `104857600` (100 MB) | Maximale Größe pro Protokolldatei vor Überlauf |
| `OTTO_RATE_LIMIT_PER_MIN` | (Laufzeitstandard) | Maximal authentifizierte Frames pro Sitzung pro Minute |
| `OTTO_REPLAY_WINDOW_MS` | `60000` | Zeitstempel-Abweichungsfenster für Replay-Schutz |
| `OTTO_TAB_QUEUE_LIMIT` | (Laufzeitstandard) | Maximal wartende Befehle pro Tab-Sitzung |
| `OTTO_CONTROLLER_QUEUE_LIMIT` | (Laufzeitstandard) | Maximal wartende Befehle pro Controller-Sitzung |
| `OTTO_DEFAULT_CONTROLLER_SCOPES` | (Laufzeitstandard) | Bereiche, die neu registrierten Controller-Clients zugewiesen werden |
| `OTTO_ALLOW_REMOTE_CONTROLLER_REGISTRATION` | `false` | Auf `true` setzen, um eine nicht authentifizierte Remote-Client-Registrierung zu erlauben |
| `OTTO_CONTROLLER_REGISTRATION_SECRET` | (leer) | Gemeinsames Geheimnis, das für die Remote-Controller-Registrierung erforderlich ist |
| `OTTO_CONTROLLER_HEARTBEAT_INTERVAL_MS` | `8000` | Heartbeat-Prüfungsintervall für Controller-Sitzungen |
| `OTTO_CONTROLLER_HEARTBEAT_MISS_LIMIT` | `3` | Anzahl verpasster Heartbeats, bevor der Controller als veraltet markiert wird |

:::warning
Setzen Sie `OTTO_TOKEN_SECRET` explizit in der Produktionsumgebung. Der automatisch generierte Wert wird bei jedem Relay-Neustart rotiert, wodurch alle bestehenden Token ungültig werden.
:::

## CLI-Konfigurationsdatei

Pfad: `~/.otto/config.json`

Verwaltet durch die Befehle `otto config` und `otto client`. Häufige Felder:

| Feld | Beschreibung |
|---|---|
| `relayUrl` | WebSocket-URL für das Relay (z.B. `ws://localhost:8787`) |
| `relayHttpUrl` | HTTP-URL für das Relay (z.B. `http://localhost:8787`) |
| `nodeId` | Ziel-Node-ID für CLI-Befehle |
| `clientId` | Registrierte Controller-Client-ID |
| `accessToken` | Aktuelles Controller-Zugriffstoken |
| `refreshToken` | Aktuelles Controller-Aktualisierungstoken |

:::note
Bearbeiten Sie `~/.otto/config.json` nicht direkt. Verwenden Sie `otto config` zum Setzen von Relay-URLs und `otto client login` zum Verwalten von Token.
:::

## Erweiterungslaufzeiteinstellungen

Gespeichert in `chrome.storage.*` und verwaltet über das Erweiterungspopup und die Optionenseiten.

| Einstellung | Beschreibung |
|---|---|
| Relay-URL | WebSocket-URL, mit der sich der Erweiterungs-Node verbindet |
| Node-ID | Node-Identität für diese Browser-Instanz |
| Node-Token-Zustand | Kopplungs- und Auth-Token-Lebenszyklus |
| Wiederverbindungs-Zustand | Offscreen-WebSocket-Wiederverbindungs-Backoff-Metadaten |
| Lokale Dev-Protokollstreaming | Umschalten, um strukturierte Erweiterungsprotokolle an das Relay zu streamen (`source=node`) |

Erweiterungseinstellungen sind bewusst unabhängig von `~/.otto/config.json`, selbst wenn beide auf denselben Relay-Host zeigen.

## Build-Pfad-Vertrag

Lokaler Erweiterungs-Build-Ausgabepfad (verwendet von `otto extension update` und `otto setup`):

```
extension/output/chrome-mv3
```

Dieser Pfad ist die Quelle für lokale Erweiterungsladeanweisungen in Chrome.

## Nächste Schritte

- [Relay-Betrieb](./relay-operations.md) — Start, Daemon-Lebenszyklus und Betriebsanmerkungen.
- [Sicherheitskontrollen](./security.md) — Token-Signierungs- und Rotationsrichtlinien.
- [Installation](./installation.md) — `otto setup` automatisierter Konfigurationsablauf.