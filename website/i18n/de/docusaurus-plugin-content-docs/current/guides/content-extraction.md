---
slug: /guides/content-extraction
title: Inhaltsextraktion
sidebar_position: 9
description: Wie Otto Seiteninhalt aus live Browser-Tabs extrahiert, die unterstützten Formate und warum dies Agenten schneller, genauer und lokal betrieben macht.
keywords:
  - inhaltsextraktion
  - markdown-extraktion
  - browser-automatisierung
  - seiten-scraping
  - agenten-workflows
---

# Inhaltsextraktion

Otto extrahiert Seiteninhalt aus einem live Browser-Tab unter Verwendung der eigenen Chrome-Sitzung des Benutzers. Das macht es für Agenten besser geeignet als Remote-Scraping oder Browser-Farmen, da der Inhalt von der echten Seite stammt, wie sie für den Benutzer gerendert wurde.

## Wie es funktioniert

Wenn ein Agent oder Controller `otto extract-content` aufruft, leitet Otto die Anfrage über das Relay an die Erweiterung weiter, die am Ziel-Tab angehängt ist. Die Erweiterung führt die Extraktion direkt in der Browser-Laufzeit aus und verwendet die live DOM der Seite und den aktuellen Sitzungszustand.

Das bedeutet, Otto extrahiert von der finalen gerenderten Seite nach JavaScript-Ausführung, Benutzerauthentifizierung und nachgeladenem Inhalt.

## Unterstützte Formate

Otto unterstützt mehrere Extraktionsausgaben, sodass Automatisierungsworkflows die richtige Form für die Aufgabe wählen können:

- `markdown` — browsersicheres Markdown, das Überschriften, Listen, Links, Inline-Code und Tabellenstruktur erhält. Dies ist der Standard und am besten für Agenten-Verarbeitung geeignet.
- `clean_html` — DOM-erhaltendes HTML mit entfernten Skripten/Styles/Inline-Handlern, während semantische Attribute (`data-*`, `aria-*`, `role`) erhalten bleiben. Dies ist das beste Format für Selektor-Discovery und Befehlsautorenschaft.
- `distilled_html` — inhaltssentriertes HTML für leserlichkeitsorientierte Extraktionsabläufe.
- `raw_html` — vollständiges HTML aus dem aktuellen DOM, einschließlich Seiten-Chrome und Skript/Style-Tags.
- `text` — reine Text-Extraktion für Zusammenfassungen oder schnelle Inhaltsprüfungen.

## Welches Format sollte ich verwenden?

- Verwenden Sie `markdown` für Zusammenfassungen und LLM-Verarbeitung.
- Verwenden Sie `clean_html` für DOM-Inspektion und zuverlässigen Selektorbau.
- Verwenden Sie `distilled_html` nur, wenn Sie speziell artikelartigen bereinigten Inhalt wünschen.
- Verwenden Sie `raw_html` nur, wenn Sie genaue Seitenmarkierungstreue benötigen.
- Verwenden Sie `text` für schnelle reine Text-Prüfungen.

## Warum es für Agenten wichtig ist

- **Kostenlos und lokal** — Extraktion läuft im eigenen Browser des Benutzers. Kein externer Scraping-Dienst, keine Remote-Cloud-Browser-Farm, keine zusätzlichen Seitenabrufe.
- **Schnell** — Der Browser-Node hat die Seite bereits geladen, sodass Otto den Inhalt sofort aus dem live Tab extrahieren kann, anstatt ihn aus einer Remote-Anfrage neu zu erstellen.
- **Genau** — Die Extraktion sieht das tatsächliche gerenderte DOM, einschließlich dynamischem Inhalt, clientseitigem Zustand und seitenpezifischer Seitenzusammensetzung.
- **Agenten-bereit** — Markdown-Ausgabe ist für LLM-Verarbeitung optimiert und hält Struktur und Lesbarkeit bei, während Token-Overhead minimiert wird.

## Befehle

Verwenden Sie den hochstufigen Extraktionsbefehl:

```bash
# Am besten für Selektor-Discovery und Automatisierungsautorenschaft
otto extract-content https://example.com/article --format clean_html

# Am besten für Agenten-Zusammenfassungen (Standard)
otto extract-content https://example.com/article --format markdown
```

Im Inneren ordnet dies Otto Browser-DOM-Extraktionsprimitiven zu:

- `primitive.dom.extract_markdown`
- `primitive.dom.extract_clean_html`
- `primitive.dom.extract_distilled_html`
- `primitive.dom.extract_html`
- `primitive.dom.extract_text`

## Siehe auch

- [Architektur](/guides/architecture) — Otte's Controller-, Relay- und Node-Modell.
- [Kopplung und Authentifizierung](/guides/pairing-auth) — Browser-Node-Kopplung und Token-Lebenszyklus.
- [Listener-Entwicklung](/guides/listener-development) — streamfähige Befehls- und Netzwerkautomatisierung.
- [Otto vs. Jina Inhaltsextraktion](./otto-vs-jina-content-extraction.md) — realer Vergleich von Browser-DOM-Extraktion gegen Jina-Remote-Seitenabruf.