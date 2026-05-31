---
title: Entwicklung eines neuen Befehls
sidebar_position: 3
description: Vollständiger Agent-Walkthrough für Planung, Implementierung, Debugging und Verifizierung eines neuen Site-Befehls — vom Protokolldesign über Live-DOM-Inspektion bis zur Reload-Schleife.
keywords:
  - Befehlsentwicklung
  - Site-Befehl
  - DOM-Inspektion
  - für Agenten
  - Agent-Walkthrough
---

# Entwicklung eines neuen Befehls

Dieser Walkthrough deckt den vollständigen Prozess des Hinzufügens eines neuen Site-Befehls ab. Er richtet sich an autonome Agenten und beschreibt die genaue Abfolge von Entscheidungen, Hilfsbefehlen, Iterationsschleifen und Verifikationsschritten, die für jede Site zu befolgen sind.

Für die API-Referenz zur Befehlserstellung siehe [Befehlserstellung](/guides/command-authoring). Für kopierfertige Code-Vorlagen siehe [Befehlserstellungsvorlagen](/guides/command-authoring-templates).

---

## Phase 1: Planen vor dem Schreiben von Code

Bevor Sie Dateien anfassen, klären Sie die folgenden Fragen. Mehrdeutigkeit hier verursacht Nacharbeit.

### 1.1 Was gibt der Befehl zurück?

Definieren Sie die Ausgabeform explizit. Wenn die Ausgabe ein generisches Konzept darstellt (Suchergebnis, Artikel, Beitrag), überlegen Sie, ob ein neuer gemeinsamer Entitätstyp ins Protokoll gehört. Wiederverwendbare Entitätstypen zahlen sich aus, wenn dasselbe Konzept in mehreren Site-Befehlen vorkommt.

Wenn Ihr Befehl etwas zurückgibt, das bereits als `StreamDomainObject` dargestellt ist (z. B. `Article`, `Post`, `ChatMessage`, `SearchResult`), verwenden Sie es wieder. Wenn das Konzept wirklich neu ist und wahrscheinlich über Sites hinweg wiederverwendet wird, fügen Sie ein neues Interface zu `packages/shared-protocol/src/index.ts` hinzu und fügen Sie es der `StreamDomainObject`-Union hinzu. Andernfalls ist ein einfaches typisiertes Objekt, das direkt von `executeScript` zurückgegeben wird, in Ordnung.

### 1.2 Welche Eingaben benötigt der Befehl?

Unterscheiden Sie erforderliche von optionalen Eingaben. Für Eingaben mit begrenzten Bereichen (Seitenanzahl, Ergebnislimit) definieren Sie das Maximum und den Standardwert im Voraus — sie beeinflussen sowohl die Metadatenvalidierung als auch die Paginierungslogik.

Paginierungseingaben (z. B. `pages`, `limit`) sollten konservativ voreingestellt sein — ein Aufrufer, der `pages` nicht übergibt, sollte nicht von einer mehrseitigen Navigation überrascht werden.

### 1.3 Was sind die Grenzfall-Semantiken?

Klären Sie mehrdeutige Ausgabefelder vor dem Schreiben von Code:
- **Gesponserte/geförderte Inhalte:** Mit einem Flag einschließen (z. B. `isAd: true`), anstatt stillschweigend zu filtern. Aufrufer können filtern; sie können versteckte Daten nicht wiederherstellen.
- **Unterlinks:** Nur Links einschließen, die semantisch für das Element bedeutsam sind, nicht jeden Anker auf der Seite.
- **Bilder:** Eine URL oder `null` zurückgeben. Base64-Daten-URIs überspringen — dies sind typischerweise Inline-Favicons, keine bedeutungsvollen Bilder.

---

## Phase 2: Protokoll erweitern (wenn ein neuer Entitätstyp hinzugefügt wird)

Wenn ein Befehl einen neuen gemeinsamen Entitätstyp einführt, aktualisieren Sie das Protokoll **zuerst**, vor jedem anderen Code. Die Erweiterung löst `@telepat/otto-protocol` aus den kompilierten `dist/`-Artefakten auf, nicht aus TypeScript-Quellen — das dist muss neu gebaut werden, bevor `npm run check` für die Erweiterung bestanden wird.

```bash
# 1. packages/shared-protocol/src/index.ts bearbeiten
# 2. Sofort neu bauen:
npm run build -w packages/shared-protocol
# 3. Jetzt besteht die Typprüfung paketübergreifend:
npm run check
```

> **Warum dist wichtig ist:** Die `tsconfig.json` der Erweiterung löst `@telepat/otto-protocol` über die Workspace-`package.json` auf, die auf `dist/index.js` verweist. Wenn Sie den Neubau überspringen, sieht `tsc` Ihre neuen Typen nicht und `npm run check` schlägt mit "Module has no exported member" fehl.

---

## Phase 3: Site-Bundle gerüstbauen

Ein Site-Bundle befindet sich unter `extension/src/commands/<hostname>/` und enthält vier Dateien:

| Datei | Zweck |
|---|---|
| `check-login.ts` | `SiteCommand`, der erkennt, ob der Benutzer angemeldet ist |
| `goto-login.ts` | `SiteCommand`, der zur Anmeldeseite der Site navigiert |
| `<command-id>.ts` | Ihre Befehlssimplementierung |
| `index.ts` | Exportiert ein `SiteCommandBundle`, das alle drei gruppiert |

Registrieren Sie das Bundle in `extension/src/commands/index.ts`:

```typescript
import { exampleCommands } from './example.com/index.js';
const bundles = [...existingBundles, exampleCommands];
```

Wenn die Site keine Anmeldung erfordert, setzen Sie `requiresAuth: false` bei allen Befehlen und implementieren Sie `checkLogin` als Stub, der immer `{ loggedIn: false }` zurückgibt.

---

## Phase 4: Live-DOM inspizieren, bevor Sie Selektoren schreiben

Dies ist die wichtigste Phase für jeden DOM-Extraktionsbefehl. **Schreiben Sie niemals CSS-Klassenselektoren basierend auf statischer Inspektion, Dokumentation oder Raten.** CSS-Klassen in modernen Web-Apps sind oft obfuskiert oder werden zur Build-Zeit generiert und ändern sich über Bereitstellungen hinweg. Verankern Sie sich stattdessen an stabilen strukturellen Markern:

- **`data-*`-Attribute mit semantischen Namen** — Attribute wie `data-testid`, `data-item-id`, `data-type` sind an die Anwendungslogik gebunden, nicht an das Styling, und überstehen CSS-Redesigns.
- **ARIA-Rollen und -Labels** — `role="article"`, `aria-label="..."`, `[role="listitem"]` sind stabil, weil sie für Barrierefreiheit korrekt bleiben müssen.
- **Strukturelle Elementsemantik** — `<article>`, `<h2>`, `<time>`, `<blockquote>` tragen Bedeutung unabhängig vom Styling.
- **Anwendungsspezifische kompilierte Attribute** — einige Apps betten stabile kompilierte Identifikatoren ein (z. B. `jsname`, `jsaction`), die stabiler als Klassennamen sind. Suchen Sie nach Attributen, die sich mit demselben Wert bei der erwarteten Elementanzahl wiederholen.

### So inspizieren Sie das Live-DOM

Verwenden Sie `primitive.dom.extract_html` mit einem `url`-Parameter. Dies öffnet einen temporären Tab, wartet, bis die Seite vollständig geladen ist, erfasst das vollständige HTML und schließt den Tab automatisch. Kein `tabSessionId`-Management erforderlich.

```bash
otto cmd --action primitive.dom.extract_html \
  --payload '{"url":"https://example.com/feed"}' \
  2>/dev/null > /tmp/serp.json
```

Zählen Sie dann Kandidatenattribute im erfassten HTML, um stabile Anker zu entdecken. Sie suchen nach Attributen, deren Anzahl mit der Anzahl der sichtbaren Elemente auf der Seite übereinstimmt:

```bash
node -e "
const fs=require('fs');
const c=JSON.parse(fs.readFileSync('/tmp/serp.json')).payload.data.content;
const count=p=>(c.match(new RegExp(p,'g'))||[]).length;
// Ersetzen Sie diese durch Attribute, die Sie beim Durchsuchen der Seite entdeckt haben
console.log('data-testid=post-container:', count('data-testid=\"post-container\"'));
console.log('role=article:', count('role=\"article\"'));
console.log('<h2:', count('<h2'));
"
```

### Stabilität über Abfragen hinweg verifizieren

Laden Sie zwei oder mehr verschiedene Seiten (oder dieselbe Seite in verschiedenen Zuständen) und vergleichen Sie die Anzahlen. Ein Selektor ist stabil, wenn seine Anzahl zuverlässig der Anzahl der erwarteten Elemente entspricht:

```bash
otto cmd --action primitive.dom.extract_html --payload '{"url":"https://example.com/feed?page=1"}' 2>/dev/null > /tmp/s1.json
otto cmd --action primitive.dom.extract_html --payload '{"url":"https://example.com/feed?page=2"}' 2>/dev/null > /tmp/s2.json

node -e "
const fs=require('fs');
for (const [label,f] of [['page1','/tmp/s1.json'],['page2','/tmp/s2.json']]) {
  const c=JSON.parse(fs.readFileSync(f)).payload.data.content;
  const n=p=>(c.match(new RegExp(p,'g'))||[]).length;
  console.log(label+': article='+n('role=\"article\"')+', h2='+n('<h2'));
}
"
```

Wenn eine Kandidatenattributanzahl unerwartet zwischen Seiten gleicher Länge schwankt, ist es kein zuverlässiger Anker. Suchen Sie weiter.

### Destillierte Ausgabe in Betracht ziehen

`primitive.dom.extract_markdown` erzeugt eine Readability-destillierte Markdown-Version der Seite. Verwenden Sie sie, um schnell zu verstehen, welchen Inhalt eine Seite enthält, ohne rohes HTML zu parsen:

```bash
otto cmd --action primitive.dom.extract_markdown \
  --payload '{"url":"https://example.com/article/123"}' \
  2>/dev/null | node -e "
const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
console.log(d.payload.data.content.slice(0,3000));
"
```

Destillierte Ausgabe eignet sich gut für **Artikel- oder Textinhaltsseiten**. Für **strukturierte Listenseiten** (Feeds, Suchergebnisse, Kommentarthreads) ist sie weniger nützlich — sie verliert Elementgrenzen und lässt strukturierte Attribute fallen. Verwenden Sie dafür rohe HTML-Extraktion.

### Elementcontainer-Struktur inspizieren

Sobald Sie einen stabilen Anker identifiziert haben, untersuchen Sie einen vollständigen Elementblock, um die Beziehung zwischen Container, Titel, Body, Metadaten und Unterlinks zu verstehen:

```bash
node -e "
const fs=require('fs');
const c=JSON.parse(fs.readFileSync('/tmp/s1.json')).payload.data.content;
// Ersten Elementanker finden und seinen Kontext anzeigen
const m=c.match(/data-testid=\"post-container\"/);
const pos=c.indexOf(m[0]);
const block=c.slice(pos-200,pos+800).replace(/<img[^>]*>/g,'');
console.log(block);
"
```

Skizzieren Sie die aufgelöste Struktur (Elementcontainer → Titelelement → Body → Metadaten), bevor Sie den `executeScript`-Callback schreiben. Diese Skizze wird Ihre Selektor-Map.

---

## Phase 5: Befehl implementieren

Schreiben Sie den `executeScript`-Callback mit den stabilen Selektoren aus Phase 4. Wichtige Implementierungshinweise:

### `executeScriptWithDomHelpers` für tiefe DOM-Workflows verwenden

Verwenden Sie `ctx.executeScriptWithDomHelpers(...)`, wenn Ihr Seitenskript Ottos injizierte Helfer benötigt, insbesondere für:
- Shadow-Root-bewusste Selektoren (`__ottoDeepQuerySelector`)
- Deterministische Skriptfehler-Serialisierung (`__ottoSerializeScriptError`)
- Komplexe Composer/Editor-Interaktionen, bei denen einfache Selektoren und einmaliges `executeScript` brüchig werden

Für einfache Extraktion reicht `ctx.executeScript(...)`. Für interaktive Abläufe (Verfassen, Senden, Abschicken, Rich-Editoren) bevorzugen Sie `executeScriptWithDomHelpers(...)`.

```typescript
const result = await ctx.executeScriptWithDomHelpers(
  async (inputValue: string) => {
    const pageWindow = window as Window & {
      __ottoDeepQuerySelector?: (root: ParentNode, selector: string) => Element | null;
      __ottoSerializeScriptError?: (error: unknown, fallbackCode: string) => unknown;
    };

    const deepQuerySelector = pageWindow.__ottoDeepQuerySelector;
    const serializeScriptError = pageWindow.__ottoSerializeScriptError;

    if (typeof deepQuerySelector !== 'function') {
      throw new Error('otto_dom_query_helper_missing');
    }
    if (typeof serializeScriptError !== 'function') {
      throw new Error('otto_serialize_script_error_helper_missing');
    }

    try {
      const textbox = deepQuerySelector(document, '[role="textbox"]');
      if (!(textbox instanceof HTMLElement)) {
        throw new Error('composer_textbox_missing');
      }
      textbox.textContent = inputValue;
      return { ok: true };
    } catch (error) {
      return serializeScriptError(error, 'command_script_failed');
    }
  },
  ['hello'],
);
```

### Browserseitige Fehler deterministisch nach oben durchreichen

Verschlucken Sie keine Seitenskriptfehler. Serialisieren Sie sie innerhalb des Seiten-Callbacks und geben Sie sie dann auf Befehlsebene erneut aus.

```typescript
const submitResult = await ctx.executeScriptWithDomHelpers(/* ... */);

if (ctx.isSerializedScriptError(submitResult)) {
  return submitResult;
}

if (!submitResult || typeof submitResult !== 'object') {
  throw new Error('command_failed:missing_result_payload');
}

return {
  ok: true,
};
```

Dieses Muster stellt sicher, dass die Laufzeit strukturierte Fehlercodes ausgibt (statt undurchsichtiger geworfener Werte) und hält Wiederholungen/Diagnostik in `command.run` und `command.test` deterministisch.

### `closest()` verwenden, um zum Container nach oben zu navigieren

Verankern Sie sich an einem bestimmten Kindelement (z. B. dem Titelanker) und gehen Sie nach oben zum Elementcontainer:

```typescript
const container = titleAnchor.closest('[data-testid="post-container"]');
const bodyEl = container?.querySelector('[data-testid="post-body"]');
```

### Weiterleitungs-URLs entpacken

Einige Sites verpacken Ziel-URLs in internen Weiterleitungs-URLs (z. B. `/redirect?url=<target>`). Erkennen und entpacken Sie sie vor der Rückgabe:

```typescript
function unwrapRedirectUrl(href: string, paramName: string): string | null {
  try {
    const u = new URL(href);
    const q = u.searchParams.get(paramName);
    if (q?.startsWith('http')) return decodeURIComponent(q);
    return href;
  } catch { return href; }
}
```

### Thumbnails von Favicons filtern

Favicon-`<img>`-Elemente sind typischerweise 16–32px. Filtern Sie nach `naturalWidth`/`naturalHeight`, um sie auszuschließen:

```typescript
const thumb = imgEls.find(img => {
  if (img.src.startsWith('data:')) return false;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  return w > 32 || h > 32;
});
```

### Akkumulation gegen Limit kappen, wenn mehrere Seiten abgerufen werden

Beim Paginieren kappen Sie den Beitrag jeder Seite auf das verbleibende Budget:

```typescript
allResults.push(...(pageResults as SearchResult[]).slice(0, remaining));
```

Ohne `.slice(0, remaining)` liefert eine Seite, die mehr Ergebnisse als das verbleibende Budget zurückgibt, stillschweigend zu viel.

---

## Phase 6: Bauen, neu laden und live testen

Die Erweiterung muss nach jeder Quelländerung neu gebaut werden, und der Browser muss die neu gebaute Erweiterung neu laden. Dies ist ein manueller Schritt — bitten Sie den Benutzer, dies zu tun.

```bash
# 1. Erweiterung bauen
npm run build -w extension
```

Dann bitten Sie den Benutzer:

> Bitte laden Sie die Otto-Erweiterung in Chrome neu: Öffnen Sie `chrome://extensions`, suchen Sie Otto und klicken Sie auf **Neu laden**.

```bash
# 2. Prüfen, ob der Befehl jetzt registriert ist
otto commands list | grep -A3 <commandId>

# 3. Live-Test ausführen
otto test <site> <commandId> --payload '{"<requiredInput>":"<value>"}' --json
```

Wenn `results` ein leeres Array ist, haben die Selektoren nicht gepasst. Gehen Sie zurück zu Phase 4 und inspizieren Sie das Live-DOM erneut.

Wenn der Befehl mit `missing_command_input` fehlschlägt, übergeben Sie keine erforderliche Eingabe. Fügen Sie sie explizit zu `--payload` hinzu.

### Debug-Protokolle während eines Live-Tests lesen

Öffnen Sie einen Live-Protokollstream in einem zweiten Terminal, bevor Sie den Test ausführen. Erweiterungsseitige Protokolle erscheinen unter Quelle `node`; Relay-Routing unter `relay`.

```bash
# Terminal 1: Live-Protokollstream
otto logs follow --source all

# Terminal 2: Befehl auslösen
otto test <site> <commandId> --payload '{"<requiredInput>":"<value>"}' --json
```

Korrelieren Sie Fehler nach `requestId` über beide Ausgaben hinweg. Wenn der Fehler nur auf der Node-Seite sichtbar ist, grenzen Sie auf `--source node` ein. Wenn es ein Routing-Problem ist, verwenden Sie `--source relay`.

---

## Phase 7: Leere oder falsche Ergebnisse diagnostizieren

### Leere Ergebnisse

Wenn der Test ein leeres Array zurückgibt, Sie aber Elemente im Chrome-Tab sehen können, passen die Selektoren nicht. Schnelldiagnose:

```bash
# Frisches HTML für die exakte URL abrufen, zu der der Befehl navigiert ist
otto cmd --action primitive.dom.extract_html \
  --payload '{"url":"https://example.com/feed"}' \
  2>/dev/null > /tmp/fresh.json

# Prüfen, ob Ihre Kandidatenattribute in der frischen Erfassung vorhanden sind
node -e "
const c=JSON.parse(require('fs').readFileSync('/tmp/fresh.json')).payload.data.content;
['data-testid=\"post-container\"','role=\"article\"'].forEach(p=>
  console.log(p, (c.match(new RegExp(p,'g'))||[]).length)
);
"
```

Wenn die Anzahlen auf 0 fallen, hat die Site ihr DOM geändert. Führen Sie den seitenübergreifenden Vergleich aus Phase 4 erneut aus, um die neuen stabilen Anker zu finden.

### Falsche Feldwerte

Wenn Ergebnisse zurückgegeben werden, aber Felder falsch sind (z. B. falscher Titel, fehlende Beschreibung), verwenden Sie `node -e`, um das HTML um ein bekanntes Element herum zu schneiden und die genaue Elementstruktur zu inspizieren. Aktualisieren Sie die Selektor-Map entsprechend.

### Skriptfehler

Erweiterungsskriptfehler erscheinen in Relay-Protokollen als `script_execution_error`. Prüfen Sie `otto logs list --source node --latest 50` auf den Stack-Trace.

---

## Phase 8: Tests schreiben

Tests verwenden `createChromeMock()`, das `scripting.executeScript` über ein `scriptResults`-Array steuert, das sequenziell konsumiert wird. Jeder Aufruf von `ctx.executeScript` in einem mehrseitigen Befehl konsumiert ein Element aus dem Array.

```typescript
// Erfolgsfall
scriptResults.push([
  { kind: 'content.post', id: '1', title: 'Beitrag A', url: 'https://a.com' },
  { kind: 'content.post', id: '2', title: 'Beitrag B', url: 'https://b.com' },
]);

// Mehrseitig: ein Push pro Seite
scriptResults.push([/* Seite-1-Ergebnisse */]);
scriptResults.push([/* Seite-2-Ergebnisse */]);

// Vorzeitiger Abbruch: leere Seite stoppt Paginierung
scriptResults.push([/* Seite-1-Ergebnisse */]);
scriptResults.push([]); // leer → Schleife bricht ab
```

Decken Sie mindestens ab:
- Erfolgsfall mit zurückgegebenen Ergebnissen
- `missing_command_input` für jedes erforderliche Feld
- `unexpected_command_input` für unbekannte Felder
- `invalid_command_input_type` für falsche Typen
- Mehrseitige Akkumulation (wenn der Befehl paginiert)
- Vorzeitiger Abbruch, wenn eine Seite leere Ergebnisse zurückgibt
- Limit-Durchsetzung über Seiten hinweg

---

## Phase 9: Abschließende Validierung

Führen Sie die vollständige Validierungssequenz aus AGENTS.md der Reihe nach aus:

```bash
npm run check
npm run lint
npm run build
npm run -ws --if-present test
```

Alle vier müssen bestanden werden, bevor die Implementierung als abgeschlossen gilt. Überspringen Sie nicht `npm run build` — es stellt sicher, dass die kompilierten Erweiterungsartefakte mit der Quelle synchron sind.

---

## Zusammenfassung: die vollständige Schleife

```
Schema planen → Protokoll erweitern → Protokoll-dist neu bauen →
Bundle rüstbauen → Live-DOM inspizieren (primitive.dom.extract_html) →
Selektorstabilität über 2+ Seiten/Zustände verifizieren →
Befehl mit stabilen Selektoren implementieren →
Erweiterung bauen → Benutzer bitten, Erweiterung in Chrome neu zu laden →
Live-Test (otto test <site> <command> --json) →
Iterieren bei leeren oder falschen Ergebnissen (DOM erneut inspizieren, Selektoren korrigieren) →
Tests schreiben → Validieren (check/lint/build/test)
```
