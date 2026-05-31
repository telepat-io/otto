---
title: Otto vs. Jina Inhaltsextraktion
sidebar_position: 9.5
description: Seitenweiser Vergleich von Otto-Browser-DOM-Extraktion und Jina-Seiten-Scraping für LinkedIn-, Reddit- und Blog-Inhalte.
keywords:
  - otto
  - jina
  - inhaltsextraktion
  - browser-dom
  - scraping
---

# Otto vs. Jina Inhaltsextraktion

Diese Seite dokumentiert einen praktischen Vergleich zwischen zwei Extraktionsansätzen:

- **Otto** — Browser-DOM-Extraktion aus einer live Chrome-Sitzung über `otto extract-content`
- **Jina** — Remote-Seitenabruf und -Parse über `https://r.jina.ai/<url>`

Der Vergleich verwendet drei repräsentative URLs und erfasst sowohl rohe Ausgaben als auch Leistungsmetriken.

## Methodik

Für jede URL haben wir ausgeführt:

- `otto extract-content <url> --json`
- `curl -s "https://r.jina.ai/<url>" -w '\nTIME_TOTAL:%{time_total}\n'`

Dieser Test ließ bewusst einen API-Schlüssel weg und verwendet den anonymen `r.jina.ai`-Endpunkt. Jina-Antwortzeiten können zwischengespeichert werden, daher wird in diesem Vergleich nur die Dauer der ersten Anfrage verwendet.

Rohe Ausgabedateien wurden unter `docs/guides/outputs/` gespeichert:

- `otto_<slug>.json`
- `jina_<slug>.json`

Dieser Vergleich konzentriert sich auf:

- Extraktionsinhaltqualität
- UI/Lärm-Entfernung
- Kommentar/Thread-Erfassung
- Anfragedauer
- Seitenspezifische Abdeckung und Blockierverhalten

## Jina-Ratenlimit-Kontext

Jina setzt Ratenlimits in zwei Dimensionen durch:

- **RPM** — Anfragen pro Minute
- **TPM** — Token pro Minute

Limits werden pro IP oder pro API-Schlüssel durchgesetzt, welcher Schwellenwert zuerst erreicht wird. Anonyme Anfragen werden nach IP verfolgt; authentifizierte Anfragen werden nach Schlüssel verfolgt.

Das Dashboard listet endpunktspezifische Limits auf wie:

- **Reader API** (`https://r.jina.ai`): URL-zu-LLM-freundlicher-Text-Extraktion mit anonymen und authentifizierten Ratenlimits.
- **Search API** (`https://s.jina.ai`): Websuche + Parse mit festen Token-Kosten.
- **Embedding API** (`https://api.jina.ai/v1/embeddings`): Sowohl RPM als auch TPM gelten, mit Token-Verwendung basierend auf der Eingabegröße.
- **Reranker API** (`https://api.jina.ai/v1/rerank`): Auch RPM + TPM.
- **Classifier APIs** (`/v1/train`, `/v1/classify`): Anfrage- und Token-Budgets gelten mit separaten Few-Shot- und Zero-Shot-Limits.
- **Segmenter API** (`/v1/segment`): Anfragelimitiert und Token-Verwendung wird nicht gezählt.
- **DeepSearch** (`https://deepsearch.jina.ai/v1/chat/completions`): Konversationssuche mit separatem RPM-Budget.

Diese Limits sind relevant, weil Jina ein gehosteter Remote-Dienst ist, während Otto die Extraktion im eigenen Browser des Benutzers durchführt.

## 1. LinkedIn-Beitrag

URL: `https://www.linkedin.com/posts/techstars_ny-tech-week-were-coming-for-you-whether-activity-7454971517832011776-fXua`

### Otto-Ergebnis

- `durationMs`: `3009`
- `contentLength`: `7821`
- Ausgabe: bereinigte Markdown-Extraktion des Beitragsinhalts und sichtbarer Seitenelemente.
- Anmerkungen: Otto erzeugte DOM-basiertes Markdown aus der live Browser-Seite.

### Jina-Ergebnis

- `time_total`: `4.638154`
- Ausgabe: ein gemischtes Gästeseiten-Ergebnis als Markdown gekennzeichnet, aber immer noch LinkedIn-Anmeldeflow und UI-Shell-Markup enthaltend.
- Anmerkungen: Selbst ohne API-Schlüssel gab Jina einen LinkedIn-Gästeseiten-Wrapper zurück, anstatt eine saubere, destillierte Beitragsszusammenfassung.

### Vergleich

| Aspekt | Otto | Jina |
|---|---|---|
| Anfragedauer | 3,01 s | 4,64 s |
| Inhaltslänge | 7.821 Zeichen | Gemischtes Gästeseiten-Markdown |
| Ausgabetyp | Browser-DOM-Markdown | Roher LinkedIn-Gästeseiten-Inhalt |
| Kommentare | N/A | N/A |
| UI-Lärm | Minimal | Hoch (Anmeldung/Registrierung/Navigation/Footer) |
| Passt am besten zu | Agenten-bereite Inhaltsextraktion | Roher Profil/Gästeseiten-Abruf |

## 2. Reddit-Beitrag

URL: `https://www.reddit.com/r/LocalLLaMA/comments/1t1lfhj/minimax_m27_awq4bit_on_2x_spark_vs_2x_rtx_6000/`

### Otto-Ergebnis

- `durationMs`: `2313`
- `contentLength`: `27791`
- Ausgabe: Markdown-Extraktion des Reddit-Threads, einschließlich Beitragsinhalt und Kommentarstruktur.
- Anmerkungen: Otto konnte die live DOM des Ziel-Reddit-Threads extrahieren.

### Jina-Ergebnis

- `time_total`: `1.815514`
- Ausgabe: eine Jina-Markdown-Fehlerseite, die anzeigt, dass Reddit `403 Forbidden` zurückgegeben hat und die Anfrage blockiert wurde.
- Anmerkungen: Jina konnte den Reddit-Thread-Inhalt anonym nicht abrufen.

### Vergleich

| Aspekt | Otto | Jina |
|---|---|---|
| Anfragedauer | 2,31 s | 1,82 s |
| Inhaltslänge | 27.791 Zeichen | Blockierte Fehlerseite |
| Ausgabetyp | Markdown-Extraktion | Blockierte/Eingeschränkte Seiten-Hinweis |
| Kommentare | Extrahierte Beitrags-Kommentare | Kein brauchbarer Inhalt |
| UI-Lärm | Niedrig | Hoch (Blockierhinweis) |
| Passt am besten zu | Browser-DOM-Extraktion für Community-Inhalte | Nicht zuverlässig für anonymes Reddit-Scraping |

## 3. Blog-Beitrag

URL: `https://dennishodgson.blogspot.com/2025/05/photographic-highlights-202425.html`

### Otto-Ergebnis

- `durationMs`: `3017`
- `contentLength`: `39427`
- Ausgabe: bereinigte Markdown-Extraktion des Blogartikel-Inhalts.
- Anmerkungen: Otto entfernte Seiten-Chrome und extrahierte den Artikel aus der live DOM.

### Jina-Ergebnis

- `time_total`: `5.977519`
- Ausgabe: tatsächlicher Markdown-Inhalt für den Artikel, einschließlich Text und Bildlinks.
- Anmerkungen: Jina war auf dieser Veröffentlichungsseite erfolgreich und gab einen Markdown-fähigen Artikel zurück.

### Vergleich

| Aspekt | Otto | Jina |
|---|---|---|
| Anfragedauer | 3,02 s | 5,98 s |
| Inhaltslänge | 39.427 Zeichen | Markdown-Artikelinhalt |
| Ausgabetyp | Browser-DOM-Markdown | Markdown-fähiger Seitenextrakt |
| Kommentare | N/A | N/A |
| UI-Lärm | Minimal | Niedrig/Mittel (enthält immer noch extrahierten Navigationstext) |
| Passt am besten zu | Artikel-Extraktion aus live Browser-Zustand | Rohe öffentliche Blog-Extraktion |

## Gesamtergebnisse

- **Otto ist stärker für agentenbereite Extraktion, wenn die Seite bereits im Browser geladen ist.** Es liefert konsistent bereinigtes Markdown aus der live DOM.
- **Jina kann für öffentliche Blogseiten funktionieren,** ist aber weniger zuverlässig für Seiten mit Zugriffskontrollen oder Anti-Scraping-Schutz.
- **Reddit insbesondere schlug anonym über Jina mit einer `403 Forbidden`-Blockierseite fehl.**
- **LinkedIn über Jina gab immer noch Gästeseiten-Wrapper-Inhalt zurück,** kein destilliertes Beitragspayload.
- **Otto's Extraktionszeiten lagen bei 2,3–3,0 Sekunden** in dieser Menge, während Jinas Erstanfragezeiten zwischen 1,8 und 6,0 Sekunden lagen.
- **Nur die anfängliche Jina-Anfragezeitmessung ist hier sinnvoll.** Jina puffert Ergebnisse, sodass wiederholte Aufrufe künstlich schnell erscheinen können.

## Beweisdateien

Rohe Erfassungsdateien sind unter `docs/guides/outputs/` verfügbar:

- `otto_posts_techstars_ny-tech-week-were-coming-for-you-whether-activity-7454971517832011776-fXua.json`
- `jina_posts_techstars_ny-tech-week-were-coming-for-you-whether-activity-7454971517832011776-fXua.json`
- `otto_r_LocalLLaMA_comments_1t1lfhj_minimax_m27_awq4bit_on_2x_spark_vs_2x_rtx_6000.json`
- `jina_r_LocalLLaMA_comments_1t1lfhj_minimax_m27_awq4bit_on_2x_spark_vs_2x_rtx_6000.json`
- `otto_2025_05_photographic-highlights-202425.html.json`
- `jina_2025_05_photographic-highlights-202425.html.json`

Diese Dateien bewahren die genauen anfänglichen Tool-Ausgaben, Zeitmessungen und jede seitenspezifischen Lärm, der während des Vergleichs beobachtet wurde.