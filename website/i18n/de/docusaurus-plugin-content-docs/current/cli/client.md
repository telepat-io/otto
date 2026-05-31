---
title: Client-Verwaltung
sidebar_position: 7
description: CLI-Referenz für otto client-Befehle — Controller-Client-Identitäten registrieren, anmelden, Status prüfen, vergessen und entfernen.
keywords:
  - otto client
  - client register
  - client login
  - Controller-Client
  - ACL
---

# Client-Verwaltung

Controller-Client-Identitäten registrieren, authentifizieren und verwalten. Controller-Clients sind die Identität, die von Automatisierungsskripten verwendet wird, um sich mit dem Relay zu verbinden und Befehle zu erteilen.

## `otto client register`

Registriert einen neuen Controller-Client beim Relay.

### Verwendung

```bash
otto client register [Optionen]
```

### Flags

| Flag | Kurzform | Erforderlich | Typ | Standard | Beschreibung |
|---|---|---|---|---|---|
| `--name` | | Ja | string | | Anzeigename für den Controller-Client |
| `--description` | | Nein | string | | Optionale Beschreibung |
| `--relay-url` | | Nein | string | Aus Konfiguration | Relay-URL für die Registrierung |
| `--json` | | Nein | boolean | false | Ergebnis als JSON ausgeben |

### Beispiele

```bash
# Neuen Client interaktiv registrieren
otto client register --name "my-automation"

# Mit Beschreibung registrieren
otto client register --name "ci-bot" --description "CI-Automatisierungsclient"

# Registrieren und JSON-Anmeldeinformationen erfassen
otto client register --name "ci-bot" --json
```

Nach der Registrierung wird ein Client-Secret zurückgegeben. Bewahren Sie es sicher auf — es wird nur einmal angezeigt.

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Client erfolgreich registriert |
| `1` | Registrierung fehlgeschlagen oder Relay-Fehler |

---

## `otto client login`

Authentifiziert einen bestehenden Controller-Client und speichert Zugangsdaten lokal.

### Verwendung

```bash
otto client login [Optionen]
```

### Flags

| Flag | Kurzform | Erforderlich | Typ | Standard | Beschreibung |
|---|---|---|---|---|---|
| `--client-id` | | Nein | string | | Zu authentifizierende Client-ID |
| `--relay-url` | | Nein | string | Aus Konfiguration | Relay-URL |

### Beispiele

```bash
# Interaktiv anmelden
otto client login

# Mit bestimmter Client-ID anmelden
otto client login --client-id abc123
```

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Erfolgreich angemeldet |
| `1` | Anmeldung fehlgeschlagen (ungültige Anmeldeinformationen oder Relay-Fehler) |

---

## `otto client status`

Zeigt den aktuellen Authentifizierungsstatus des Controller-Clients an.

### Verwendung

```bash
otto client status [Optionen]
```

### Flags

| Flag | Kurzform | Erforderlich | Typ | Standard | Beschreibung |
|---|---|---|---|---|---|
| `--json` | | Nein | boolean | false | Als JSON ausgeben |

### Beispiele

```bash
otto client status

otto client status --json
```

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Status gemeldet |
| `1` | Nicht angemeldet oder Konfiguration fehlt |

---

## `otto client forget`

Entfernt lokal gespeicherte Controller-Client-Anmeldeinformationen, ohne sie beim Relay zu widerrufen.

### Verwendung

```bash
otto client forget
```

### Beispiele

```bash
otto client forget
```

Verwenden Sie `otto client remove`, um den Client auch relay-seitig zu widerrufen.

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Lokale Anmeldeinformationen gelöscht |

---

## `otto client remove`

Widerruft und entfernt einen Controller-Client vom Relay, einschließlich seiner ACL-Grants, Refresh-Sessions und aktiven Verbindungen.

### Verwendung

```bash
otto client remove [Optionen]
```

### Flags

| Flag | Kurzform | Erforderlich | Typ | Standard | Beschreibung |
|---|---|---|---|---|---|
| `--client-id` | | Nein | string | | Bestimmte zu entfernende Client-ID |
| `--all` | | Nein | boolean | false | Alle registrierten Controller-Clients entfernen |

### Beispiele

```bash
# Bestimmten Client entfernen
otto client remove --client-id abc123

# Alle Clients entfernen
otto client remove --all
```

`--all` ist nach der Bereinigung idempotent; nachfolgende Aufrufe geben null Entfernungen zurück, bis neue Clients registriert werden.

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Client(s) entfernt |
| `1` | Entfernung fehlgeschlagen oder Relay-Fehler |

---

## Verwandte Befehle

- [otto pair / otto revoke](./pairing.md) — Node-Kopplung verwalten.
- [Kopplungs- und Auth-Leitfaden](../guides/pairing-auth.md) — vollständiger Auth-Lebenszyklus.
