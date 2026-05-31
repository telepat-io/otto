---
title: Relay-API-Referenz
sidebar_position: 3
description: Vollständige HTTP- und WebSocket-API-Referenz für das Otto-Relay. Behandelt alle Endpunkte für Kopplung, Auth, Controller-Clients, ACL, Protokolle, Nodes und WebSocket-Verbindung.
keywords:
  - relay-api
  - http-endpunkte
  - websocket
  - controller-api
  - kopplungs-api
---

# Relay-API-Referenz

Diese Seite ist die vollständige HTTP- und WebSocket-API-Referenz für das Otto-Relay. Implementierungsquelle: `packages/relay/src/index.ts`.

## Authentifizierung

Die meisten Endpunkte erfordern ein Bearer-Token im `Authorization`-Header:

```
Authorization: Bearer <accessToken>
```

Rollenzuordnungen:

- Controller-Zugriffstoken — für controllerseitige Endpunkte (Befehle, Protokolle, Node-Discovery).
- Node-Zugriffstoken — für Node-ACL-Endpunkte (`/api/controller/access`).

## Kopplungsendpunkte

| Methode | Pfad | Beschreibung |
|---|---|---|
| `POST` | `/api/pairing/request` | Node beantragt eine Kopplungsherausforderung |
| `GET` | `/api/pairing/pending` | Ausstehende Kopplungscodes auflisten (Node-Auth erforderlich) |
| `POST` | `/api/pairing/approve` | Controller genehmigt einen Kopplungscode |
| `GET` | `/api/pairing/status` | Kopplungsstatus für eine Herausforderung prüfen |

**Anfrage: POST /api/pairing/request**

```json
{ "nodeId": "node_local_1" }
```

**Anfrage: POST /api/pairing/approve**

```json
{ "code": "ABCD-1234" }
```

**Fehlercodes:** `nodeId_required`, `code_required`, `pairing_not_found`, `pairing_not_pending`, `challengeId_required`, `challenge_not_found`

## Auth-Endpunkte

| Methode | Pfad | Beschreibung |
|---|---|---|
| `POST` | `/api/auth/refresh` | Zugriffstoken mit Aktualisierungstoken aktualisieren |
| `POST` | `/api/auth/revoke` | Aktualisierungstoken widerrufen |

**Anfrage: POST /api/auth/refresh**

```json
{ "refreshToken": "<refresh_token>" }
```

**Fehlercodes:** `refreshToken_required`, `invalid_refresh_token`

## Controller-Client-Endpunkte

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| `POST` | `/api/controller/register` | Keine (oder Geheimnis) | Neuen Controller-Client registrieren |
| `POST` | `/api/controller/token` | Keine | Client-Anmeldeinformationen gegen Token austauschen |
| `POST` | `/api/controller/remove` | Controller-Bearer | Controller-Client nach ID widerrufen |
| `POST` | `/api/controller/remove-all` | Controller-Bearer | Alle Controller-Clients widerrufen und bereinigen |

**Anfrage: POST /api/controller/register**

```json
{ "name": "my-controller", "description": "automation worker", "avatarSeed": "optional-seed" }
```

**Anfrage: POST /api/controller/token**

```json
{ "clientId": "clt_abc123", "clientSecret": "cs_xxx" }
```

**Anfrage: POST /api/controller/remove**

```json
{ "clientId": "clt_abc123" }
```

Entfernungssemantik:
- Einzelne Entfernung widerruft den Client-Datensatz und baut ACL-Berechtigungen, Aktualisierungssitzungen und aktive Controller-Sockets ab.
- Massenentfernung bereinigt zusätzlich Datensätze. Nachfolgende `remove-all`-Aufrufe geben `removedCount: 0` zurück, bis neue Clients registriert sind.

**Fehlercodes:** `registration_forbidden`, `controller_metadata_required`, `controller_name_conflict`, `client_credentials_required`, `invalid_client_credentials`, `client_not_found`

## Node-ACL-Endpunkte

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| `GET` | `/api/controller/access` | Node-Bearer | ACL-Berechtigungen für verbundenen Node auflisten |
| `POST` | `/api/controller/access` | Node-Bearer | Controller-Zugriff auf Node gewähren oder widerrufen |

**Anfrage: POST /api/controller/access**

```json
{ "clientId": "clt_abc123", "grant": true, "expiresAt": 1776165600000 }
```

Ohne aktive Genehmigung geben Node-gerichtete Befehle `acl_missing_node_grant` zurück. Client-Geheimnis wird nur für `/api/controller/token` verwendet; Laufzeit-Befehlsautorisierung verwendet Zugriffstoken-Bereiche und Node-ACL-Berechtigungen.

**Fehlercodes:** `missing_access_token`, `forbidden_role`, `clientId_and_grant_required`, `invalid_expiresAt`

## Node-Discovery-Endpunkte

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| `GET` | `/api/nodes/connected` | Controller-Bearer | Verbundene Node-IDs auflisten |

**Antwort: GET /api/nodes/connected**

```json
{ "nodes": [{ "nodeId": "node_local_1" }] }
```

**Fehlercodes:** `missing_access_token`, `forbidden_role`, `invalid_access_token`

## Protokollendpunkte

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| `GET` | `/api/logs` | Controller-Bearer | Betriebsprotokolle abfragen |
| `GET` | `/api/logs/status` | Controller-Bearer | Protokollspeicherstatus und Gesamtbytegröße |
| `GET` | `/api/logs/export` | Controller-Bearer | Protokolle als NDJSON exportieren |

**Abfrageparameter (Protokolle und Export):**

| Parameter | Beschreibung |
|---|---|
| `since` | ISO-8601-Zeitstempel-Untergrenze |
| `level` | `debug` \| `info` \| `warn` \| `error` |
| `source` | `relay` \| `controller` \| `node` \| `all` |
| `latest` | Auf die neuesten N übereinstimmenden Einträge begrenzen |
| `nodeId` | Nach Node-Identität filtern |
| `requestId` | Nach Anfrage-Korrelations-ID filtern |

**Antwort: GET /api/logs**

```json
{
  "logs": [
    {
      "timestamp": "2026-04-14T13:00:00.000Z",
      "source": "relay",
      "type": "command_routed",
      "requestId": "req_cmd_1"
    }
  ]
}
```

**Fehlercodes:** `invalid_since`, `invalid_level`, `invalid_source`, `invalid_latest`

## WebSocket-Verbindungen

| Rolle | URL-Muster |
|---|---|
| Controller | `ws://host:port?role=controller` |
| Node | `ws://host:port?role=node` |

Nach dem Verbinden senden Sie `hello` und dann `auth`-Frames. Relay antwortet mit `auth_ack`, wenn die Authentifizierung erfolgreich ist. Siehe [Wiederverwendbare Snippets](./snippets.md) für Frame-Beispiele.

## CLI-Zuordnung

| CLI-Befehl | API-Operation |
|---|---|
| `otto authcode` | `GET /api/pairing/pending` |
| `otto pair <code>` | `POST /api/pairing/approve` |
| `otto revoke` | `POST /api/auth/revoke` |
| `otto client register` | `POST /api/controller/register` |
| `otto client login` | `POST /api/controller/token` + `POST /api/auth/refresh` |
| `otto client remove` | `POST /api/controller/remove` |
| `otto client status` | Überprüft gespeicherte Token |
| `otto logs list` | `GET /api/logs` |
| `otto logs export` | `GET /api/logs/export` |
| `otto logs status` | `GET /api/logs/status` |
| `otto commands list` | WebSocket `command.list` |
| `otto cmd` | WebSocket `command.run` |

## Nächste Schritte

- [Wiederverwendbare Snippets](./snippets.md) — curl- und WebSocket-Frame-Beispiele.
- [Controller-Implementierungsanleitung](./guides/controller-implementation.md) — vollständige Bootstrap-Sequenz.
- [Protokollreferenz](./protocol.md) — WebSocket-Hüllen- und Nachrichtenfamilienverträge.