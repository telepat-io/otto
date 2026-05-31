---
title: CLI-Referenz
sidebar_position: 1
description: Vollständige Referenz aller Otto-CLI-Befehle, organisiert nach Befehlsgruppen. Deckt Relay-Lebenszyklus, Setup, Konfiguration, Kopplung, Client-Verwaltung, Befehlsausführung, Protokolle und Listener ab.
keywords:
  - CLI-Referenz
  - Otto-Befehle
  - Befehlsgruppen
  - Otto-CLI
---

# CLI-Referenz

Die `otto`-CLI verwaltet den Relay-Daemon, koppelt Erweiterungs-Nodes, registriert Controller-Clients, führt Browser-Befehle aus und verfolgt Betriebsprotokolle. Alle Befehle unterstützen `--help` für die Inline-Nutzung.

## Befehlsgruppen

| Gruppe | Befehle | Zweck |
|---|---|---|
| [Relay-Lebenszyklus](./start.md) | `otto start`, `otto stop`, `otto status` | Starten, stoppen und inspizieren des Relay-Daemons |
| [Setup](./setup.md) | `otto setup` | Interaktives oder nicht-interaktives Ersteinrichtung |
| [Konfiguration](./config.md) | `otto config`, `otto settings` | Lesen und Bearbeiten der Controller-Konfiguration |
| [Erweiterung](./extension.md) | `otto extension update`, `otto extension info` | Verwalten des gepackten Erweiterungs-Assets |
| [Kopplung](./pairing.md) | `otto authcode`, `otto pair`, `otto revoke` | Erweiterungs-Nodes mit dem Relay koppeln |
| [Client](./client.md) | `otto client register/login/status/forget/remove` | Controller-Client-Identitäten verwalten |
| [Befehle](./commands.md) | `otto commands list`, `otto cmd`, `otto test` | Browser-Befehle durchsuchen, ausführen und streamen |
| [Protokolle](./logs.md) | `otto logs list/follow/status/export` | Relay-Betriebsprotokolle abfragen und streamen |
| [Listener](./listener.md) | `otto listener subscribe-network/unsubscribe/list` | Netzwerkinterceptions-Streams verwalten |

## Globales Verhalten

- Alle Befehle akzeptieren `--help` für Nutzungshinweise und Flag-Beschreibungen.
- Verwenden Sie `--json` bei unterstützten Befehlen für maschinenlesbare Ausgabe. Der nicht-interaktive Modus entfernt die TTY-Formatierung.
- Befehle beenden mit `0` bei Erfolg, ungleich null bei Fehlschlag.
- Wenn genau ein Node verbunden ist, wird `targetNodeId` automatisch ausgewählt. Bei mehreren Nodes übergeben Sie `--node-id`.

## Konfigurationsdatei

Die Controller-Konfiguration wird unter `~/.otto/config.json` gespeichert. Verwenden Sie `otto config` zum Lesen und `otto settings` zum interaktiven Bearbeiten.

## Verwandte Seiten

- [Installation](../installation.md) — CLI und Relay installieren.
- [Schnellstart](../quickstart.md) — Ersteinrichtungs-Walkthrough.
- [Konfigurationsreferenz](../configuration.md) — alle Relay-Umgebungsvariablen.
