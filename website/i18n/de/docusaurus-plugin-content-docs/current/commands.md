---
title: Befehlsreferenz
sidebar_position: 5
description: Vollständige Referenz für Otto-Befehlsaktionen, Seitenbefehlsmodell, Laufzeitablauf, Eingabemetadaten, Netzwerkinterceptions-API und mitgelieferte Seitenbefehle.
keywords:
  - befehlsreferenz
  - aktionsoberfläche
  - seitenbefehle
  - command.run
  - netzwerkinterception
---

# Befehlsreferenz

Otto-Befehle dienen zwei Zielgruppen: Befehlsautoren, die Erweiterungsbundles implementieren, und Controller-Benutzer, die das Verhalten über CLI-Ausführung validieren. Das Befehlsmodell ist seitenbereichsspezifisch, metadatengetrieben und streng validiert, sodass Handler sanitisierte Eingaben in einem gültigen Tab-Kontext erhalten.

## Wahrheitsquelle Codepfade

| Anliegen | Quelle |
|---|---|
| Befehlsdispatch und -ausführung | `extension/src/runtime/command-executor.ts` |
| Seitenbefehlsorchestrierung | `extension/src/runtime/command-runtime.ts` |
| Seitenbefehlsbundles | `extension/src/commands/**` |
| Geteilte Aktionsverträge | `packages/shared-protocol/src/index.ts` |
| Relay-Terminalisierung und Routing | `packages/relay/src/index.ts` |

## Aktionsoberfläche

| Gruppe | Aktionen |
|---|---|
| Primitiver Tab | `primitive.tab.open`, `primitive.tab.close`, `primitive.tab.navigate`, `primitive.tab.query` |
| Primitives DOM | `primitive.dom.extract_text`, `primitive.dom.extract_html`, `primitive.dom.extract_clean_html`, `primitive.dom.extract_distilled_html`, `primitive.dom.extract_markdown` |
| Primitive Seite | `primitive.page.screenshot` |
| Befehl | `command.list`, `command.run`, `command.test`, `command.reddit_posts` (Legacy-Alias) |
| Listener | `listener.subscribe`, `listener.unsubscribe` |
| Häufige CLI-Einstiegspunkte | `otto commands list`, `otto test <site> <command>`, `otto extract-content [url]`, `otto cmd --action ...` |

`otto extract-content` ist der empfohlene hochstufenige CLI-Pfad für Inhaltsextraktion und gibt standardmäßig Markdown aus. Er ordnet im Inneren primitive Aktionen zu (`primitive.dom.extract_markdown`, `primitive.dom.extract_clean_html`, `primitive.dom.extract_distilled_html`, `primitive.dom.extract_html` und `primitive.dom.extract_text`) basierend auf `--format`.

Für DOM/Selektor-Debugging ist `--format clean_html` normalerweise der nützlichste Modus.

## Seitenbefehlsmodell

Befehle werden nach Seiten unter `extension/src/commands/<site>/` gruppiert. Jedes Seitenbundle stellt primitive Auth-Funktionen bereit (`checkLogin`, `gotoLogin`) plus ein oder mehrere Befehlsmodule, die Metadaten und Ausführungslogik exportieren.

Laufzeit stellt `executeScript(...)` und `executeScriptWithDomHelpers(...)` bereit. Verwenden Sie die DOM-Helfer-Variante, wenn Selektor verschachteltes Shadow DOM durchqueren müssen.

`primitive.page.screenshot` akzeptiert entweder `tabSessionId` oder `url`-Zielauflösung. Nur-URL-Aufrufe verwenden einen temporären Hintergrundtab und geben terminale Payloads mit Bildmetadaten und `contentBase64` zurück. `mode=viewport` verwendet Tab-Erfassungs-APIs; `mode=full_page` verwendet CDP.

## Befehlsvertrag

Jedes Befehlsmodul kombiniert deklarative Metadaten mit Ausführungshooks.

| Feld | Erforderlich | Zweck |
|---|---|---|
| `metadata` | Ja | Identität, Anzeigemetadaten, Tags, Auth-Anforderung |
| `metadata.requiresDebuggerFocus` | Nein | Opt-in-Fokus-Emulation für drosselungssensible Abläufe |
| `metadata.inputFields` | Nein | Deklaratives Eingabeschema (`name`, `type`, `description`, `optional`) |
| `metadata.inputAtLeastOneOf` | Nein | Cross-Feld-Mindestanwesenheitsbeschränkung |
| `metadata.preloadHost` | Nein | Host-Gate, der vor dem Ausführungspfad durchgesetzt wird |
| `execute(ctx, input, authMode)` | Ja | Hauptbefehlsverhalten |
| `test(ctx, input, helpers)` | Nein | Dedizierter `command.test`-Hook |

Unterstützte deklarative Eingabetypen: `string`, `number`, `boolean`, `object`, `array`.

Wenn `metadata.inputFields` vorhanden ist, setzt die Laufzeit erforderliche Felder, genaue Typüberprüfung (keine Coercion), Unbekannt-Schlüssel-Ablehnung, optionale `inputAtLeastOneOf`-Prüfungen und Bereinigung nur auf deklarierte Schlüssel durch.

## Laufzeitablauf

Otto's Befehlsausführung ist absichtlich für deterministisches Scheitern angeordnet:

1. Befehlspayload parsen (`command.run`, `command.test` oder Legacy-Alias-Zuordnung).
2. Seitenbundle und Befehlsmetadaten auflösen.
3. `tabSessionId` und Seiten-URL-Übereinstimmung auflösen und validieren.
4. Deklarierte Eingabemetadaten validieren und bereinigen, wenn vorhanden.
5. Auth-Vorabprüfung für `requiresAuth`-Befehle ausführen.
6. `preloadHost`-Gate anwenden, wenn konfiguriert.
7. Befehlsmodus ausführen (`execute` für run, `test`-Hook mit execute-Fallback für test).
8. Normalisiertes Tergebnis oder strukturierten Fehler zurückgeben.

Befehle, die Auth erfordern, automatisieren niemals Anmeldeeingabe. In `authMode=auto` kann die Laufzeit zur Anmeldung navigieren und gibt `manual_login_required` für explizite manuelle Übergabe zurück.

## Fokus-Emulation und DOM-Helfer-Richtlinien

`requiresDebuggerFocus` aktiviert die Fokus-Emulation erst nach erfolgreicher Seiten/Tab-Validierung. Aktivierungsfehl sind deterministisch: `debugger_focus_unavailable`, `debugger_focus_conflict`, `debugger_focus_permission_denied`, `debugger_focus_attach_failed`, `debugger_focus_command_failed`.

`executeScriptWithDomHelpers(...)` installiert idempotente Deep-Query-Helfer im Seitenkontext:

- `window.__ottoDeepQuerySelector(root, selector)`
- `window.__ottoDeepQuerySelectorAll(root, selector)`

## Mitgelieferte Seiten

| Seite | Befehle |
|---|---|
| `reddit.com` | `getPosts`, `getUserInfo`, `sendChatMessage`, `getChatMessages`, `commentOnPost` |
| `linkedin.com` | `getPosts`, `commentOnPost` |
| `news.ycombinator.com` | `getFrontPage` |
| `google.com` | `getSearchResults` |

### Google-Befehlsanmerkungen

| Befehl | Schlüsselverhalten |
|---|---|
| `getSearchResults` | Erfordert `query`; navigiert zu Google-Suche und extrahiert standardmäßig Ergebnisse der ersten Seite. Optionales `pages` (1–5, Standard 1) steuert, wie viele SERP-Seiten abgerufen werden. Optionales `limit` (1–100, Standard 10) begrenzt die Gesamtzahl der zurückgegebenen Ergebnisse. Jedes Ergebnis enthält `title`, `url`, `description`, `links` (Sitelinks), `image` (Thumbnail oder null), `rank` und `isAd`. Gibt `content.search_result`-Entitäten zurück. |

### Reddit-Befehlsanmerkungen

| Befehl | Schlüsselverhalten |
|---|---|
| `getPosts` | Ruft Reddit-Beiträge über JSON-API vom Startfeed, Subreddits oder Benutzereinsendungen ab; unterstützt source, sort, t und minReturnedPosts-Eingaben; gibt `content.post`-Bäume zurück |
| `getUserInfo` | Sucht nach Benutzername/ID oder Standard für aktuelle Sitzung; gibt `entity.user` zurück |
| `sendChatMessage` | Unterstützt `roomId`-Direktsendung oder benutzernamebasierte Raum-Erstellung + Sendung über Shadow DOM |
| `commentOnPost` | Navigiert zur Beitrags-URL; füllt `shreddit-composer`; reicht Kommentar auf oberster Ebene ein |
| `getChatMessages` | Liest Matrix-Verlauf/Sync; kann Stream-Manifest mit `network.http_intercept` aussenden |

### LinkedIn-Befehlsanmerkungen

| Befehl | Schlüsselverhalten |
|---|---|
| `getPosts` | Extrahiert LinkedIn-Beiträge aus dem Startfeed oder Suchergebnissen mit semantischer Filterung, kanonischer Beitrags-URL-Erfassung über Kontrollmenü-Link-Kopierung, begrenzter Scroll-Hydratation und Timeout-Richtlinien-Skalierung nach `minReturnedPosts`. Unterstützt `source`, `keyword`, `sort` und `t` Eingaben. |
| `commentOnPost` | Navigiert zu einer LinkedIn-Beitrags-URL, füllt den Kommentareditor auf der Seite aus, reicht Kommentar ein und bestätigt das Senden durch Abgleich des neuesten gerenderten Kommentartexts |

#### linkedin.com commentOnPost Eingaben

| Feld | Typ | Erforderlich | Anmerkungen |
|---|---|---|---|
| `postUrl` | string | Ja | LinkedIn-Beitrags-URL auf `linkedin.com`; normalisiert zu kanonischer `https://www.linkedin.com/...` Form. |
| `commentBody` | string | Ja | Kommentartext zum Einreichen. Leere oder nur Leerzeichen enthaltende Werte werden abgelehnt. |

#### linkedin.com commentOnPost Bestätigungssemantik

- Der Befehl wartet auf einen Kommentareditor (`.ql-editor[contenteditable="true"]`) und injiziert `commentBody`.
- Er wartet, dass ein Senden-Steuerelement erscheint/aktiviert wird (unterstützt mehrere Senden-Button-Selektoren).
- Nach dem Klicken auf Senden versucht er erneut, den ersten `.comments-comment-item__main-content`-Node mit kurzen Verzögerungen zu lesen.
- Erfolg erfordert, dass normalisierter gerendertertext mit normalisiertem `commentBody` übereinstimmt; andernfalls gibt er deterministische unbestätigte Diagnosen zurück.

#### linkedin.com commentOnPost Beispiele

```bash
# Kommentar auf oberster Ebene für einen LinkedIn-Beitrag einreichen
otto test linkedin.com commentOnPost --payload '{"postUrl":"https://www.linkedin.com/posts/example_post-id","commentBody":"Looks great"}'
```

#### linkedin.com getPosts Eingaben

| Feld | Typ | Standard | Anmerkungen |
|---|---|---|---|---|
| `source` | string | `home` | Feed-Quelle: `home` (Standard) oder `search` |
| `keyword` | string | — | Suchstichwörter. Erforderlich, wenn `source` `search` ist |
| `sort` | string | `top` | Sortierreihenfolge für Suche: `top` (Relevanz) oder `latest` (Veröffentlichungsdatum) |
| `t` | string | `day` | Zeitfilter für Suche: `day`, `week` oder `month` |
| `minReturnedPosts` | number | `5` | Mindestanzahl der Beiträge, die zurückgegeben werden sollen. Laufzeit klemmt auf `1..200`. |
| `getClipboardPermission` | boolean | `false` | Berechtigungshilfe-Modus. Hält die Seite kurz am Leben, damit der Benutzer die Clipboard-Lese-Berechtigung erteilen kann, und wiederholt die Extraktion. In diesem Modus zielt der Befehl auf einen Beitrag ab. |

#### linkedin.com getPosts Ausgabesemantik

- Gibt `{ posts: content.post[] }` zurück.
- `title` ist für LinkedIn-Beiträge absichtlich leer.
- `content` ist erforderlich und nicht leer; Beiträge mit fehlendem/leerem Inhalt werden fallengelassen.
- `url` ist der kanonische Beitragslink, der aus dem Beitrags-Kontrollmenü kopiert wurde, keine Profil-URL.
- `id` ist als `linkedin:<post-slug-from-url>` normalisiert.
- `author` enthält normalisierte Identitätsfelder und bewahrt die ursprüngliche Profil-URL in `author.originalEntity.profileUrl`.

#### linkedin.com getPosts Timeout-Richtlinie

Der Befehlsdeskriptor bewirbt Timeout-Hinweise über `timeoutPolicy`:

- `defaultMs`: `60000`
- Skalierung: `baseMs + (minReturnedPosts * perUnitMs)`
- Aktuelle Skalierungswerte: `baseMs=45000`, `perUnitMs=4000`, `minMs=45000`, `maxMs=300000`

Controller können diese Metadaten verwenden, wenn der Benutzer-Timeout auf Standard belassen wird.

#### linkedin.com getPosts Auth- und Berechtigungsfehler

- `manual_login_required`: Benutzer muss sich manuell bei LinkedIn anmelden und dann erneut ausführen.
- `clipboard_permission_prompt_pending`: Clipboard-Berechtigung befindet sich noch im Aufforderungsstatus; erteilen Sie die Berechtigung und führen Sie erneut mit `getClipboardPermission=true` aus.
- `clipboard_permission_denied`: Clipboard-Berechtigung verweigert; aktivieren Sie den Clipboard-Zugriff in den Seiteneinstellungen und führen Sie erneut aus.

#### linkedin.com getPosts Beispiele

```bash
# Standard-Startfeed-Extraktion
otto test linkedin.com getPosts

# Mindestens 15 Beiträge aus dem Startfeed anfordern
otto test linkedin.com getPosts --payload '{"minReturnedPosts":15}'

# Nach Beiträgen suchen
otto test linkedin.com getPosts --payload '{"source":"search","keyword":"aluminum purchasing","sort":"top","t":"week"}'

# Berechtigungshilfe-Ablauf für Clipboard-Lesen
otto test linkedin.com getPosts --payload '{"getClipboardPermission":true}'
```

## Befehls-Netzwerkinterceptions-API

Befehle können Antwortinterception mit dem Laufzeitkontext-Helfer starten:

```typescript
const stream = await ctx.startNetworkInterception({
  urlPatterns: ['https://www.reddit.com/api/*'],
  mode: 'hybrid',
  includeBody: true,
  maxBodyBytes: 200_000,
});

await ctx.navigateTab('https://www.reddit.com/');

const deadline = Date.now() + 5000;
const captured: unknown[] = [];
while (Date.now() < deadline) {
  const updates = stream.takeUpdates();
  if (updates.length > 0) {
    captured.push(...updates);
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
}

await stream.stop();
return { capturedCount: captured.length, captured };
```

Interception ist immer an die verwaltete `tabSessionId` des Befehls gebunden. Laufzeit stoppt automatisch alle aktiven befehlsinitiierten Interceptions, wenn die Befehlsausführung abschließt oder wirft.

Update-Typen, die vom Laufzeitinterceptionsmanager ausgesendet werden: `network.response`, `network.error`, `network.detached`.

## Fehlercodes

| Klasse | Codes |
|---|---|
| Allgemeine deterministische | `unknown_site`, `unknown_command`, `site_mismatch`, `missing_tab_session`, `unknown_tab_session`, `manual_login_required` |
| Reddit-spezifische | `reddit_user_not_found`, `reddit_user_unmessageable`, `reddit_rate_limited`, `reddit_matrix_token_missing` |

Das vollständige Katalog finden Sie unter [Fehlercodes](./error-codes.md).

## Autorichtlinien

1. Halten Sie die Befehlsausführung zeitlich und in der Payload-Größe begrenzt.
2. Fügen Sie keine Geheimnisse oder Anmeldeinformationen in zurückgegebene Daten ein.
3. Bevorzugen Sie stabile Selektoren und null-sichere Extraktion.
4. Geben Sie strukturierte Objekte mit vorhersagbaren Feldern zurück.
5. Verwenden Sie `requiresAuth` nur, wenn der Website-Sitzungszustand erforderlich ist.
6. Fügen Sie `originalEntity` bei, wenn Quell-Payloads sicher ausgegeben werden können.

## Entwickler-Testablauf

```bash
# Befehlsmetadaten und deklarierte Eingaben inspizieren
otto commands list --site <site>

# Lokalen Ausführungstest starten
otto test <site> <command>

# Mit Payload ausführen
otto test <site> <command> --payload '{"limit": 5}'
```

## Nächste Schritte

- [Befehlsautorenschaft](./guides/command-authoring.md) — neuen Seitenbefehl erstellen.
- [Befehlsautorenschaft-Vorlagen](./guides/command-authoring-templates.md) — kopierfertige TypeScript-Vorlagen.
- [Listener-Entwicklung](./guides/listener-development.md) — streamfähige Befehlsintegration.