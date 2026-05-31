---
slug: /features
title: "Echte Browser. Fernsteuerung. Keine Infrastruktur."
description: Was Otto für Entwickler, Automatisierungsteams und KI-Agenten tun kann.
keywords: [otto, features, browser automation, remote browser, chrome extension, cli]
sidebar_label: Funktionen
sidebar_position: 1
---

# Echte Browser. Fernsteuerung. Keine Infrastruktur.

Otto ist eine sichere Plattforme für automatisierte Fernsteuerung von Browsern, die echte Chrome-Tabs unter CLI- und Skriptkontrolle stellt — keine Browser-Farm, keine Cloud-Miete, kein headless-Raten.

Gebaut für Entwickler und Automatisierungsteams, die Live-Browser-Kontext für Testing, Monitoring und agentengetriebene Workflows benötigen, ohne Infrastruktur verwalten zu müssen.

---

## Echte Browser-Tabs, keine Headless-Farmen

Führen Sie Befehle auf live Chrome-Tabs über einen leichten Erweiterungs-Node aus. Keine Docker-Images zum Herunterladen. Keine Puppeteer-Farm zum Verwalten. Keine Cloud-Browser-Abonnement. Eine Erweiterung, ein Relay, volle Kontrolle.

```bash
otto cmd --action primitive.tab.open --payload '{"url":"https://example.com"}'
otto cmd --action primitive.tab.screenshot --tab-session <id>
```

---

## Fernsteuerung über CLI

Senden Sie Befehle von Ihrem Laptop an einen Browser, der irgendwo läuft — gleicher Computer, Büronetzwerk oder ein Fernserver. Der Relay-Daemon kümmert sich um Routing und Authentifizierung, damit Ihr Controller und Browser-Node nicht auf demselben Host sein müssen.

```bash
otto start          # Relay-Daemon starten
otto client login   # Controller authentifizieren
otto commands list  # Konnektivität überprüfen
```

---

## Code steuert den Browser. Das LLM entscheidet nur, was zu tun ist.

Die meisten Browser-Automatisierungstools lassen das LLM über jeden Klick, jedes Formularfeld, jedes DOM-Element nachdenken — und verbrennen Token für das *Wie*, nicht nur das *Was*. Otto behandelt Klicks, Tippen, Navigation und DOM-Interaktion mit deterministischem Code. Ihr Agent zahlt nur für Strategie und Entscheidungen.

Kein Kontextfenster wird für Button-Koordinaten verschwendet. Keine Halluzinationen über den Seitenzustand. Nur präzise Ausführung.

---

## Sicher als Standard

- **Token-basierte Authentifizierung** — Controller tauschen Client-Geheimnisse gegen Zugriffs- und Aktualisierungstoken aus
- **Pro-Node ACL-Berechtigungen** — Der Node-Besitzer entscheidet, welche Controller Befehle weiterleiten können
- **Replay-Schutz** — Jeder Befehl enthält einen Nonce und einen Zeitfenster
- **Pre-Ingress Protokollschwärzung** — Sensible Felder werden vor Speicherung oder Streaming entfernt
- **OS-Keychain-Speicherung** — Client-Geheimnisse werden sicher über den OS-Anmeldeinformationsmanager gespeichert

Otto automatisiert niemals Anmeldeübermittlung. Benutzer authentifizieren manuell und führen erneut aus.

---

## Live-Debugging

Streamen Sie strukturierte Protokolle in Echtzeit mit `requestId`-Korrelation. Verfolgen Sie einen Befehl von Controller → Relay → Node und zurück, alles in einem Terminal.

```bash
otto logs follow --source all
otto logs list --source node --latest 50
```

Jedes Ereignis ist mit seiner Quelle (`relay`, `controller`, `node`) markiert und durch `requestId` korreliert. Finden Sie die Ursache ohne Grep-und-Raten.

---

## Netzwerkinterception

Abonnieren Sie HTTP-Verkehr von verwalteten Browser-Tabs. Streamen Sie Antworten zurück an Ihren Controller zur Inspektion, Validierung oder Datenextraktion.

```bash
otto listener subscribe-network \
  --tab-session <id> \
  --site reddit.com \
  --request-host matrix.redditspace.com \
  --pattern 'https://matrix.redditspace.com/_matrix/client/v3/*' \
  --mode network
```

Verwenden Sie es für API-Monitoring, Datenextraktion, Integrationstests oder zum Nachweis von Netzwerkverhalten beim Debuggen.

---

## Browser-lokale Inhaltsextraktion

Extrahieren Sie gerenderten Seiteninhalt direkt aus einem live Chrome-Tab und geben Sie ihn als Markdown, `clean_html`, rohes HTML oder Text zurück. Otto führt die Extraktion innerhalb der Browser-Sitzung des Benutzers aus, damit Agenten lokal surfen können, anstatt sich auf Remote-Scraping oder Headless-Farmen zu verlassen.

```bash
otto extract-content https://example.com/article --format clean_html
```

Verwenden Sie `clean_html` für Selektor-Builder und DOM-Debugging, und `markdown` für Zusammenfassung/LLM-Verarbeitung.

---

## Multi-Plattform-Inhaltsextraktion

Extrahieren Sie Beiträge von mehreren Plattformen mit einer einheitlichen `getPosts`-Befehlsschnittstelle. Sowohl Reddit als auch LinkedIn unterstützen konfigurierbare Quellen, Sortieroptionen und Zeitfilter:

```bash
# Reddit-Startseite
otto test reddit.com getPosts --payload '{"source":"home","sort":"hot"}'

# Reddit-Subreddit mit Zeitfilter
otto test reddit.com getPosts --payload '{"source":"subreddit","subreddit":"programming","sort":"top","t":"week"}'

# LinkedIn-Startseite
otto test linkedin.com getPosts --payload '{"source":"home"}'

# LinkedIn-Suche nach Stichwort mit Sortierung und Zeitfilter
otto test linkedin.com getPosts --payload '{"source":"search","keyword":"aluminum purchasing","sort":"top","t":"week"}'
```

| Plattform | Quellen | Sortieroptionen | Zeitfilter |
|---|---|---|---|
| Reddit | `home`, `subreddit`, `user` | `best`, `hot`, `new`, `top`, `rising` | `hour`, `day`, `week`, `month`, `year`, `all` |
| LinkedIn | `home`, `search` | `top`, `latest` | `day`, `week`, `month` |

---

## Seitenbereichsspezifische Befehlsbündel

Erstellen Sie benutzerdefinierte, wiederverwendbare Befehle für jede Domain. Befehle laufen innerhalb der Erweiterungslaufzeit und sind seitenbereichsspezifisch, sodass `getChatMessages` für Reddit und `getChatMessages` für LinkedIn getrennt, vorhersagbar und testbar sind.

```bash
otto test reddit.com getChatMessages --stream-follow-ms 45000 --json
otto test ... --stream-probe  # erzwingt sofortigen Verkehr für schnelle Iteration
```

Versionieren Sie Ihre Befehle. Teilen Sie sie über Controller hinweg. Bauen Sie eine Bibliothek von Seitenautomatisierungsprimitiven auf.

---

## Agenten- und CI-bereit

- **Nicht-interaktives Setup** — `otto setup --non-interactive` gibt deterministische JSON-Ausgabe aus
- **Maschinenlesbar alles** — `--json`-Flag für Befehle, Listen, Protokolle und Test
- **MCP-Server** — `otto mcp` stellt Otto-Tools über stdio für Claude Code, ChatGPT, Gemini oder jeden MCP-Host bereit
- **Streaming-Testvorrichtung** — `otto test` mit `--stream-follow-ms` für autonome Validierung
- **Agent-Laufzeitregistrierung** — `otto agent install <runtime>` für unterstützte Plattformen

---

## Bereit zu automatisieren?

[Loslegen →](./installation.md)

Oder springen Sie direkt zum [Schnellstart](./quickstart.md) und [CLI-Referenz](./cli/index.md).