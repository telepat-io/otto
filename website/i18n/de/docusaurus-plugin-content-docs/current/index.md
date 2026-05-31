---
title: Otto Dokumentation
slug: /
sidebar_position: 1
description: Otto ist eine sichere Plattforme für automatisierte Fernsteuerung von Browsern. Führen Sie CLI-gesteuerte Befehle gegen einen Browser auf einem anderen Computer über Controller, Relay und Erweiterungs-Node aus.
keywords:
  - Browser-Automatisierung
  - Fernbrowser
  - CLI-Automatisierung
  - Chrome-Erweiterung
  - Relay-Daemon
---

# Otto Dokumentation

Otto ist eine sichere Plattforme für automatisierte Fernsteuerung von Browsern, die auf drei Laufzeitkomponenten aufgebaut ist:

| Komponente | Paket | Rolle |
|---|---|---|
| **Controller** | `@telepat/otto` | CLI, die Befehle sendet und Empfänge empfängt |
| **Relay** | `@telepat/otto-relay` | Zentraler Broker für Authentifizierung, Routing, Sperren und Protokolle |
| **Browser-Node** | `@telepat/otto-extension` | Chrome-Erweiterung, die Browser-Operationen ausführt |

Befehle fließen von Controller → Relay → Node. Ergebnisse und Stream-Updates fließen in umgekehrter Richtung zurück. Das Relay erzwingt Token-Authentifizierung, Tab-Serialisierung und Replay-Schutz bei jedem Schritt.

## Was Sie mit Otto tun können

- Automatisieren Sie Web-Workflows in echten Browser-Tabs von Ihrer CLI oder Skripten aus — Testing, Monitoring, Datenextraktion und mehr.
- Streamen Sie Echtzeit-Netzwerkinterceptionsereignisse von einem verwalteten Browser-Tab zur Inspektion und Validierung.
- Erstellen Sie benutzerdefinierte Controller über das Relay-WebSocket-Protokoll für spezialisierte Automatisierungsszenarien.
- Erstellen Sie seitenbereichsspezifische Befehle, die innerhalb der Browser-Erweiterung laufen — wiederverwendbar, testbar, versioniert.
- Führen Sie autonome Agent-Workflows mit nicht-interaktivem Modus, JSON-Ausgabe und MCP-Server-Integration aus.

## Dokumentation erkunden

| Abschnitt | Was Sie finden |
|---|---|
| [Erste Schritte](./overview.md) | Otto installieren, Setup ausführen und Ihren ersten Befehl senden |
| [Anleitungen](./guides/architecture.md) | Architektur, Kopplung, Befehlserstellung, Fehlerbehebung |
| [Referenz](./cli/index.md) | CLI-Befehle, Protokoll, API, Konfiguration, Fehlercodes |
| [SDK](./sdk/index.md) | JavaScript / TypeScript SDK zum Erstellen benutzerdefinierter Controller |
| [Technisch](./security.md) | Sicherheitskontrollen und Teststrategie |
| [Beitragen](./development.md) | Lokale Entwicklungsumgebung und Release-Prozess |
| [Für Agenten](./for-agents/index.md) | Maschinenlesbarer Automatisierungsführer für KI-Agenten |

:::tip Neu hier?
Beginnen Sie mit der [Installationsanleitung](./installation.md) und folgen Sie dann dem [Schnellstart](./quickstart.md), um Ihren ersten Befehl in unter fünf Minuten zu senden.
:::