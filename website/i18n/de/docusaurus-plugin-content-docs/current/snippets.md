---
title: Wiederverwendbare Snippets
sidebar_position: 11
description: Kopierbare curl- und WebSocket-Snippets für Otto-Controller-Bootstrap, Sitzungsdiscovery, Token-Aktualisierung, Befehlsausführung, Stream-Lebenszyklus und Abbau.
keywords:
  - snippets
  - curl-beispiele
  - websocket-frames
  - controller-bootstrap
  - stream-lebenszyklus
---

# Wiederverwendbare Snippets

Kopierbare Snippets für gängige Controller-, Befehls- und Stream-Workflows. Alle Beispiele verwenden Umgebungsvariablen für sensible Werte.

## Snippet-Index

| Phase | Abschnitt |
|---|---|
| Controller-Bootstrap | [Registrieren und Token abrufen](#controller-registrierung-und-token) |
| Sitzungsdiscovery | [Verbundene Nodes](#node-discovery) |
| Sitzungswartung | [Token-Aktualisierung](#token-aktualisierung) |
| Transport-Bootstrap | [WebSocket hello- und auth-frames](#websocket-bootstrap) |
| Befehlsausführung | [command.run und command.test](#command-frames) |
| Stream-Lebenszyklus | [listener.subscribe und command_cancel](#stream-lebenszyklus) |

## Controller-Registrierung und Token

```bash
# Neuen Controller-Client registrieren
curl -sS -X POST "$OTTO_RELAY_HTTP_URL/api/controller/register" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-controller","description":"automation worker"}'

# Client-Anmeldeinformationen gegen Zugriffstoken austauschen
curl -sS -X POST "$OTTO_RELAY_HTTP_URL/api/controller/token" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"'$OTTO_CLIENT_ID'","clientSecret":"'$OTTO_CLIENT_SECRET'"}'
```

## Node-Discovery

```bash
curl -sS "$OTTO_RELAY_HTTP_URL/api/nodes/connected" \
  -H "Authorization: Bearer $OTTO_ACCESS_TOKEN"
```

Antwort:

```json
{ "nodes": [{ "nodeId": "node_local_1" }] }
```

## Token-Aktualisierung

```bash
curl -sS -X POST "$OTTO_RELAY_HTTP_URL/api/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"'$OTTO_REFRESH_TOKEN'"}'
```

## WebSocket-Bootstrap

Senden Sie `hello` und dann `auth` in dieser Reihenfolge. Warten Sie auf `auth_ack`, bevor Sie Befehlshüllen senden.

```json
{
  "protocolVersion": "1.0",
  "messageType": "hello",
  "requestId": "req_hello_1",
  "timestamp": "2026-04-14T13:10:00.000Z",
  "senderRole": "controller",
  "payload": {"role": "controller", "capabilities": ["commands", "logs"]}
}
```

```json
{
  "protocolVersion": "1.0",
  "messageType": "auth",
  "requestId": "req_auth_1",
  "timestamp": "2026-04-14T13:10:00.020Z",
  "senderRole": "controller",
  "payload": {"accessToken": "<jwt>"}
}
```

## Command-Frames

Minimale replay-sichere `command.run`-Hülle:

```json
{
  "protocolVersion": "1.0",
  "messageType": "command",
  "requestId": "req_cmd_run_1",
  "timestamp": "2026-04-14T13:10:40.000Z",
  "senderRole": "controller",
  "payload": {
    "targetNodeId": "node_local_1",
    "tabSessionId": "tab_abc",
    "action": "command.run",
    "payload": {"site": "reddit.com", "command": "getPosts"},
    "replayNonce": "nonce_cmd_run_1"
  }
}
```

`command.test`-Hülle (gleiche Form, andere Aktion):

```json
{
  "protocolVersion": "1.0",
  "messageType": "command",
  "requestId": "req_cmd_test_1",
  "timestamp": "2026-04-14T13:11:00.000Z",
  "senderRole": "controller",
  "payload": {
    "targetNodeId": "node_local_1",
    "tabSessionId": "tab_abc",
    "action": "command.test",
    "payload": {"site": "reddit.com", "command": "getChatMessages"},
    "replayNonce": "nonce_cmd_test_1"
  }
}
```

## Stream-Lebenszyklus

Abonnieren Sie einen Netzwerk-Listener. Verwenden Sie die Subscribe-`requestId`, um eingehende `listener_update`-Ereignisse zu korrelieren.

```json
{
  "protocolVersion": "1.0",
  "messageType": "command",
  "requestId": "req_sub_1",
  "timestamp": "2026-04-14T13:11:05.000Z",
  "senderRole": "controller",
  "payload": {
    "targetNodeId": "node_local_1",
    "action": "listener.subscribe",
    "payload": {
      "listener": "network.http_intercept",
      "options": {"tabSessionId": "tab_abc", "site": "reddit.com", "mode": "fetch"}
    },
    "replayNonce": "nonce_sub_1"
  }
}
```

Beenden Sie eine aktive Stream-Sitzung mit der ursprünglichen `command.test`-`requestId`:

```json
{
  "protocolVersion": "1.0",
  "messageType": "command_cancel",
  "requestId": "req_cancel_1",
  "timestamp": "2026-04-14T13:12:10.000Z",
  "senderRole": "controller",
  "payload": {"targetRequestId": "req_cmd_test_1"}
}
```

## Nächste Schritte

- [Controller-Implementierungsanleitung](./guides/controller-implementation.md) — vollständiger HTTP + WebSocket-Ablauf.
- [Protokollreferenz](./protocol.md) — Hüllenvertrag und alle Nachrichtenfamilien.
- [Relay-API-Referenz](./relay-api.md) — vollständige Endpunkt-Dokumentation.