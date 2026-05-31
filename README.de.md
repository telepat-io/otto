<p align="center"><img src="./assets/avatar/otto-logo.webp" width="128" alt="Otto"></p>
<h1 align="center">Otto</h1>
<p align="center"><em>Automatisieren Sie Web-Workflows auf echten Browser-Tabs — ohne eine Browser-Farm zu betreiben.</em></p>

<p align="center">
  <a href="https://docs.telepat.io/otto">📖 Docs</a>
  · <a href="./README.md">🇺🇸 English</a>
  · <a href="./README.zh-CN.md">🇨🇳 简体中文</a>
  · <a href="./README.de.md">🇩🇪 Deutsch</a>
</p>

<p align="center">
  <a href="https://github.com/telepat-io/otto/actions/workflows/ci.yml"><img src="https://github.com/telepat-io/otto/actions/workflows/ci.yml/badge.svg?branch=main" alt="Build"></a>
  <a href="https://codecov.io/gh/telepat-io/otto"><img src="https://codecov.io/gh/telepat-io/otto/graph/badge.svg" alt="Codecov"></a>
  <a href="https://www.npmjs.com/package/@telepat/otto"><img src="https://img.shields.io/npm/v/@telepat/otto" alt="npm"></a>
  <a href="https://github.com/telepat-io/otto/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-yellow.svg" alt="License"></a>
</p>

Otto ist eine sichere Remote-Browser-Automatisierungsplattform, mit der Sie echte Browser-Tabs von Ihrer CLI oder aus Skripten steuern können — ohne Browser-Farm, ohne Infrastruktur-Overhead. Senden Sie Befehle über WebSocket an einen Relay-Daemon, der sie an eine Chrome-Erweiterung weiterleitet, die Aktionen auf Live-Tabs ausführt.

Entwickelt für Entwickler und Automatisierungsteams, die echten Browser-Kontext für Tests, Überwachung und agentengesteuerte Workflows benötigen, ohne Headless-Infrastruktur verwalten zu müssen.

## Funktionen

- **Echte Browser-Tabs, keine Headless-Farmen** — Führen Sie Befehle auf Live-Chrome-Tabs über einen leichtgewichtigen Extension-Node aus. Kein Docker, keine Puppeteer-Farm, keine Cloud-Browser-Miete.
- **Remote-CLI-Steuerung** — Senden Sie Befehle von Ihrem Laptop an einen Browser, der irgendwo läuft. Das Relay übernimmt Routing und Authentifizierung, sodass Controller und Node nicht auf demselben Host sein müssen.
- **Code steuert den Browser. Das LLM entscheidet nur, was zu tun ist.** — Otto übernimmt Klicks, Tastatureingaben, Navigation und DOM-Interaktion mit deterministischem Code. Ihr Agent verbraucht Tokens nur für die Strategie, nicht für jede einzelne Interaktion.
- **Sicher per Default** — Token-Authentifizierung, Replay-Schutz, knotenbezogene ACL-Berechtigungen und Log-Redaktion vor der Speicherung. Secrets werden im OS-Keychain gespeichert.
- **Live-Debugging** — Streamen Sie Logs nach `requestId` mit `otto logs follow --source all`. Korrelieren Sie Relay-, Controller- und Node-Ereignisse in Echtzeit.
- **Netzwerk-Interception** — Abonnieren Sie HTTP-Traffic von verwalteten Browser-Tabs. Streamen Sie Antworten zurück zur Inspektion, Validierung oder Datenextraktion.
- **Site-bezogene Befehlsbündel** — Erstellen Sie benutzerdefinierte, wiederverwendbare Befehle für jede Domain, die innerhalb der Erweiterung ausgeführt werden. Versioniert, teilbar, testbar.
- **Agent- und CI-bereit** — Nicht-interaktive Einrichtung, `--json`-Ausgabe, MCP-Server, Streaming-Test-Harness und Agent-Runtime-Registrierung.

## Schnellstart

Voraussetzungen: Node.js 20+, Chrome und eine npm-Installation.

1. CLI global installieren:

```bash
npm install -g @telepat/otto
```

2. Geführte Einrichtung ausführen:

```bash
otto setup
```

3. Laden Sie die entpackte Erweiterung in Chrome (der genaue Pfad wird von `otto setup` ausgegeben).

4. Controller-Identität registrieren:

```bash
otto client register --name "my-laptop" --description "Local controller"
otto client login
```

5. Stack überprüfen:

```bash
otto commands list
```

Für die vollständige Anleitung siehe die [Installation](https://docs.telepat.io/otto/installation)- und [Quickstart](https://docs.telepat.io/otto/quickstart)-Guides.

## Verfügbare Befehle

Verwenden Sie `otto commands list --site <site>`, um die verfügbaren Befehle für Ihren verbundenen Node anzuzeigen.

### Site-Befehle

| Site | Verfügbare Befehle |
|---|---|
| `reddit.com` | `getPosts`, `getUserInfo`, `sendChatMessage`, `getChatMessages`, `commentOnPost` |
| `linkedin.com` | `getPosts`, `commentOnPost` |
| `news.ycombinator.com` | `getFrontPage` |
| `google.com` | `getSearchResults` |

### Primitive (Universal)

| Kategorie | Verfügbare Primitive |
|---|---|
| Tab | `open`, `close`, `navigate`, `query` |
| DOM-Extraktion | `extract_text`, `extract_markdown`, `extract_clean_html`, `extract_distilled_html`, `extract_html` |
| Seite | `screenshot` (Viewport oder ganze Seite) |
| High-Level | `otto extract-content [url]` (empfohlen für Markdown/HTML-Extraktion) |

### Unterstützte Quellen

Sowohl Reddit- als auch LinkedIn-`getPosts`-Befehle unterstützen konfigurierbare Quellen:

| Site | Quelle | Beschreibung |
|---|---|---|
| `reddit.com` | `home` (Standard) | Personalisierter Home-Feed |
| `reddit.com` | `subreddit` | Subreddit-Auflistung (erfordert `subreddit`-Parameter) |
| `reddit.com` | `user` | Eingereichte Beiträge eines Nutzers (erfordert `username`-Parameter) |
| `linkedin.com` | `home` (Standard) | Personalisierter Home-Feed |
| `linkedin.com` | `search` | Keyword-Suchergebnisse (erfordert `keyword`-Parameter, unterstützt `sort` und `t`) |

Reddit `getPosts` unterstützt `sort` (`best`, `hot`, `new`, `top`, `rising`) und `t` (`hour`, `day`, `week`, `month`, `year`, `all`) bei Home- und Subreddit-Quellen. LinkedIn `getPosts` unterstützt `sort` (`top`, `latest`) und `t` (`day`, `week`, `month`) bei der Search-Quelle.

Für Befehlspayloads, Verhaltenshinweise und Beispiele siehe die [Commands Reference](https://docs.telepat.io/otto/commands).

## Voraussetzungen

- Node.js 20+
- npm 10+
- Chrome (neueste stabile Version)
- macOS, Linux oder Windows

## Funktionsweise

```
Controller (otto CLI / Skript)
        |  WebSocket (authentifiziert)
        v
   Relay-Daemon  (:8787)
        |  WebSocket (authentifiziert, Node)
        v
   Extension-Node (Chrome)
        |  chrome.tabs / chrome.scripting
        v
   Browser-Tab (verwaltet, site-bezogen)
```

1. Controller sendet Befehlshüllen über WebSocket an das Relay.
2. Relay authentifiziert, autorisiert nach Aktionsbereich und leitet nach `targetNodeId` weiter.
3. Node führt die Aktion aus und gibt das endgültige `result` oder `error` zurück.
4. Relay leitet das Endergebnis an den ursprünglichen Controller zurück.

Ausführungsgarantien:

- `targetNodeId` ist für alle Befehle erforderlich.
- Pro-Tab-Ausführung ist seriell; tabübergreifende Ausführung ist parallel.
- Replay-Schutz wird erzwungen (`replayNonce` plus Zeitstempelfenster).
- Sensible Felder werden vor der Log-Persistenz und dem Streaming redigiert.

## Verwendung mit KI-Agenten

Otto ist für Headless-Automatisierung und agentengesteuerte Workflows konzipiert:

- **Nicht-interaktive Einrichtung** — `otto setup --non-interactive` gibt deterministische JSON-Ausgabe ohne TTY-Prompts aus.
- **Maschinenlesbare Ausgabe** — Hängen Sie `--json` an die meisten CLI-Befehle an (`otto commands list`, `otto test`, `otto logs list`) für strukturierte Weiterverarbeitung.
- **Programmatische API** — Das Relay stellt HTTP- und WebSocket-Endpunkte für die direkte Integration bereit. Siehe die [Protocol](https://docs.telepat.io/otto/protocol)-Dokumentation für Nachrichtenschemata.
- **Live-Log-Streaming** — `otto logs follow --source all` streamt strukturierte Ereignisse nach `requestId` für Echtzeit-Agent-Debugging.
- **Agent-Dokumentation** — [For Agents](https://docs.telepat.io/otto/for-agents) bietet Automatisierungs-Runbooks, Anleitungen zur Befehlentwicklung und curl-Snippets.

## Sicherheit und Vertrauen

- Controller-Authentifizierung verwendet Client-Secret-Token-Austausch; Secrets werden im OS-Keychain gespeichert, sofern verfügbar.
- Node-seitige ACL-Berechtigungen sind erforderlich, bevor ein Controller Befehle an einen bestimmten Node routen kann.
- Replay-Schutz und Zeitstempelfenster verhindern Befehlswiederholungen.
- Sensible Felder werden vor der Persistenz aus Logs und Streams redigiert.
- Otto automatisiert niemals die Übermittlung von Anmeldeinformationen; Benutzer authentifizieren sich manuell und führen den Befehl erneut aus.

Um ein Sicherheitsproblem zu melden, öffnen Sie einen privaten Bericht über den Security-Flow des Repositories.

## Dokumentation und Support

- [Dokumentationsseite](https://docs.telepat.io/otto)
- [Installation](https://docs.telepat.io/otto/installation)
- [Quickstart](https://docs.telepat.io/otto/quickstart)
- [Architektur](https://docs.telepat.io/otto/overview)
- [Protokoll](https://docs.telepat.io/otto/protocol)
- [CLI-Referenz](https://docs.telepat.io/otto/cli)
- [Sicherheit](https://docs.telepat.io/otto/security)
- [Für Agenten](https://docs.telepat.io/otto/for-agents)
- [Repository](https://github.com/telepat-io/otto)
- [npm-Paket](https://www.npmjs.com/package/@telepat/otto)

## Mitwirken

Beiträge sind willkommen. Siehe [Development](https://docs.telepat.io/otto/development) für lokale Einrichtung, Build-Befehle und Test-Workflows.

## Lizenz

MIT. Siehe [LICENSE](./LICENSE).
