---
title: Kopplung
sidebar_position: 6
description: CLI-Referenz für otto authcode, otto pair und otto revoke — Erweiterungs-Nodes mit dem Relay koppeln und Node-Anmeldeinformationen verwalten.
keywords:
  - otto authcode
  - otto pair
  - otto revoke
  - Node-Kopplung
  - Kopplungscode
---

# Kopplung

Erweiterungs-Nodes mit dem Relay koppeln und Node-Anmeldeinformationen verwalten.

## `otto authcode`

Generiert einen Kopplungs-Autorisierungscode, den die Erweiterung verwendet, um die Kopplung abzuschließen.

### Verwendung

```bash
otto authcode [Optionen]
```

### Flags

| Flag | Kurzform | Erforderlich | Typ | Standard | Beschreibung |
|---|---|---|---|---|---|
| `--relay-url` | | Nein | string | Aus Konfiguration | Relay-URL, von der der authcode angefordert wird |

### Beispiele

```bash
# Kopplungscode generieren
otto authcode

# Kopplungscode gegen ein bestimmtes Relay generieren
otto authcode --relay-url http://my-relay:8787
```

Der generierte Code wird im Popup oder auf der Optionsseite der Erweiterung eingegeben, um die Kopplung abzuschließen. Codes laufen nach einem kurzen Zeitfenster ab.

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Authcode generiert und angezeigt |
| `1` | Relay nicht erreichbar oder Relay-Fehler |

---

## `otto pair <code>`

Genehmigt eine ausstehende Kopplungsanfrage mit dem im Erweiterungs-Popup angezeigten Code.

### Verwendung

```bash
otto pair <code> [Optionen]
```

### Argumente

| Argument | Erforderlich | Beschreibung |
|---|---|---|
| `<code>` | Ja | Kopplungscode, der im Erweiterungs-Popup angezeigt wird |

### Flags

| Flag | Kurzform | Erforderlich | Typ | Standard | Beschreibung |
|---|---|---|---|---|---|
| `--relay-url` | | Nein | string | Aus Konfiguration | Relay-URL, auf der die Kopplung genehmigt werden soll |

### Beispiele

```bash
# Kopplungsanfrage genehmigen
otto pair ABC123

# Gegen ein bestimmtes Relay genehmigen
otto pair ABC123 --relay-url http://my-relay:8787
```

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Kopplung genehmigt |
| `1` | Code nicht gefunden, abgelaufen oder Relay-Fehler |

---

## `otto revoke`

Widerruft die Kopplung eines Erweiterungs-Nodes, macht dessen Token ungültig und erzwingt eine erneute Kopplung.

### Verwendung

```bash
otto revoke [Optionen]
```

### Flags

| Flag | Kurzform | Erforderlich | Typ | Standard | Beschreibung |
|---|---|---|---|---|---|
| `--node-id` | | Nein | string | | Bestimmte Node-ID zum Widerrufen (weglassen, um alle zu widerrufen) |

### Beispiele

```bash
# Alle gekoppelten Nodes widerrufen
otto revoke

# Einen bestimmten Node widerrufen
otto revoke --node-id node_abc123
```

### Beendigungscodes

| Code | Bedeutung |
|---|---|
| `0` | Node(s) widerrufen |
| `1` | Widerruf fehlgeschlagen oder Relay-Fehler |

---

## Verwandte Befehle

- [otto setup](./setup.md) — vollständige Ersteinrichtung einschließlich Kopplung.
- [otto client](./client.md) — Controller-Client-Identitäten verwalten.
- [Kopplungs- und Auth-Leitfaden](../guides/pairing-auth.md) — Kopplungslebenszyklus und Token-Verwaltung.
