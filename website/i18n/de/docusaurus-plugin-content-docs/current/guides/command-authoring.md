---
title: Befehlsautorenschaft
sidebar_position: 3
description: Einen Seitenbefehl zur Otto-Erweiterungslaufzeit hinzufügen. Behandelt Metadatenverträge, Laufzeitvalidierung, Fehleroberflächenmuster, Sicherheitsregeln und die Testmatrix.
keywords:
  - befehlsautorenschaft
  - seitenbefehl
  - erweiterungslaufzeit
  - befehlsmetadaten
  - browser-automatisierung
---

# Befehlsautorenschaft

Diese Anleitung erklärt, wie Sie einen Seitenbefehl in der Otto-Erweiterungslaufzeit hinzufügen, ohne Protokoll-, Auth- oder Lebenszyklusgarantien zu brechen. Nach Abschluss dieser Schritte ist Ihr Befehl über `otto commands list` discoverbar, über `otto cmd` ausführbar und über `otto test` testbar.

## Bevor Sie beginnen

- Vertrautheit mit der [Architekturübersicht](./architecture.md) und [Erweiterungslaufzeit](../extension-runtime.md).
- Funktionierender Monorepo-Build (`npm install && npm run build`).
- Verständnis des DOM- und Netzwerkverhaltens der Zielseite.

## Wahrheitsquelle

| Anliegen | Pfad |
|---|---|
| Befehlstypen und Metadatenverträge | `extension/src/commands/types.ts` |
| Seitenbefehlsregistrierung | `extension/src/commands/index.ts` |
| Seitenbefehlsorchestrierung | `extension/src/runtime/command-runtime.ts` |
| Aktionsausführungsdispatch | `extension/src/runtime/command-executor.ts` |

## Schritte

### 1. Befehlsmodul erstellen

Erstellen Sie `extension/src/commands/<site>/<command-id>.ts`. Deklarieren Sie Metadaten, die dem tatsächlichen Laufzeitverhalten entsprechen — Laufzeit verwendet Metadaten, um die Ausführung zu steuern und Eingaben zu bereinigen, bevor Ihr Handler läuft.

```typescript
import type { SiteCommand } from '../types.js';

export const getItemsCommand: SiteCommand = {
  metadata: {
    site: 'example.com',
    id: 'getItems',
    displayName: 'Get Items',
    requiresAuth: false,
    inputFields: [
      { name: 'limit', type: 'number', optional: true, description: 'Max items to return' }
    ]
  },
  async execute(ctx, input) {
    const limit = Number((input as { limit?: number }).limit ?? 20);
    const items = await ctx.executeScript((max: number) => {
      return Array.from(document.querySelectorAll('[data-item]'))
        .slice(0, max)
        .map((el) => ({ text: (el.textContent ?? '').trim() }));
    }, [limit]);
    return { count: items.length, items };
  }
};
```

### 2. Metadatenvertrag verstehen

| Feld | Erforderlich | Zweck |
|---|---|---|
| `site` | Ja | Seitenbundle-Eigentum und Tab-URL-Validierung |
| `id` | Ja | Befehlskennung, die in `command.run` / `command.test` verwendet wird |
| `requiresAuth` | Ja | Ob Auth-Vorabprüfung vor execute läuft |
| `requiresDebuggerFocus` | Nein | Opt-in für Fokus-Emulation über `chrome.debugger` |
| `preloadHost` | Nein | Navigation zum Host vor execute garantieren |
| `inputFields` | Nein | Deklaratives Eingabeschema; steuert Laufzeitvalidierung |
| `inputAtLeastOneOf` | Nein | Cross-Feld-bedingte Anforderung |

### 3. Execute mit begrenzter, deterministischer Logik implementieren

Halten Sie `execute(ctx, input, authMode)` begrenzt: keine Endlosschleifen, kein unbegrenztes DOM-Scraping. Geben Sie deterministische Fehler zurück, anstatt stille Wiederholungen zu verwenden. Automatisieren Sie niemals Anmeldeübermittlung.

### 4. Seitenfehler explizit behandeln

Bei Verwendung von `ctx.executeScript` oder `ctx.executeScriptWithDomHelpers` kann Chromium Seitenwerfe stillschweigend verschlucken. Verwenden Sie dieses Muster, um Seitenfehler zu erhalten:

```typescript
const result = await ctx.executeScriptWithDomHelpers(async () => {
  try {
    // Ihre Seitenlogik hier
    return { ok: true };
  } catch (error) {
    return {
      __ottoSerializedCommandError: true,
      code: 'site_specific_error_code',
      message: error instanceof Error ? error.message : 'site_specific_error_code',
    };
  }
}, []);

if (ctx.isSerializedScriptError(result)) {
  return result;
}
```

Dies hält Befehlsfehler deterministisch und zeigt spezifische seitendiagnostiken (z.B. `reddit_post_comment_comcomposer_missing`) in `otto test`-Ausgabe.

### 5. Test-Hook für Stream-Befehle hinzufügen (optional)

Für Befehle, die Netzwerkereignisse streamen, fügen Sie `test(ctx, input, helpers)` hinzu. Siehe [Befehlsautorenschaft-Vorlagen](./command-authoring-templates.md) für eine kopierfertige Stream-Test-Hook-Vorlage.

### 6. Befehl im Seitenbundle registrieren

Fügen Sie Ihren Befehl zu `extension/src/commands/index.ts` im relevanten Seitenbundle hinzu. Der Befehl ist jetzt über `command.list` discoverbar.

### 7. Tests schreiben

Fügen Sie Tests hinzu, die Validierungsgates, Auth-Vorabprüfungsverhalten und Execute/Test-Fallback-Semantik abdecken. Siehe die Testmatrix unten.

## Laufzeitvalidierungsverhalten

Laufzeit validiert Eingaben strikt, wenn `inputFields` deklariert ist:

| Bedingung | Fehlercode |
|---|---|
| Unbekannter Eingabeschlüssel | `unexpected_command_input` |
| Fehlendes erforderliches Feld | `missing_command_input` |
| Typ-Nichtübereinstimmung | `invalid_command_input_type` |
| Nicht erfüllte Cross-Feld-Bedingung | `missing_command_input_one_of` |

Validierungsfehler lehnen den Befehl ab, bevor `execute` läuft. Befehlshandler erhalten immer bereinigte, validierte Eingaben.

## Erfolg überprüfen

Nach der Registrierung Ihres Befehls:

```bash
# Bestätigen Sie, dass er in der Discovery erscheint
otto commands list --site example.com

# Führen Sie ihn mit otto test aus
otto test example.com getItems

# Mit expliziter Eingabe ausführen
otto test example.com getItems --payload '{"limit": 5}'

# Zielseiteninhalt schnell inspizieren (Standard ist Markdown)
otto extract-content https://example.com
```

Ein erfolgreicher Lauf gibt ein JSON-Ergebnis mit `messageType: result` zurück und beendet sich mit Code `0`.

Für extraktionslastiges Debugging, bevorzugen Sie `otto extract-content` gegenüber handgeschriebenen primitiven Sequenzen. Es konsolidiert die Ausgabewahl an einem Ort:

- `--format markdown` (Standard) für schnelles Seitenverständnis
- `--format clean_html --selector <css>` für Selektor-Discovery und DOM-Debugging
- `--format distilled_html` für leserlichkeits sichere artikelstilige Erfassung
- `--format raw_html --selector <css>` nur, wenn genaue ungefilterte Markierung erforderlich ist
- `--format text --tab-session <id>` für sichtbare Textextraktion aus verwalteten Tabs

## Sicherheitsregeln

- Automatisieren Sie niemals Anmeldeübermittlung. Verwenden Sie `manual_login_required`-Übergabe für Auth-erforderliche Befehle.
- Halten Sie die Seiten-URL-Validierung strikt. Befehle laufen nur auf passenden Tab-Domains.
- Geben Sie deterministische Vorbedingungsfehler zurück, anstatt stille Wiederholungen zu verwenden.
- Halten Sie die Befehlsausgabe frei von sensiblen Werten.
- Halten Sie die Ausgabeform so stabil, dass sie für CLI- und Agenten-Parsing geeignet ist.

## Testmatrix

| Szenario | Warum es wichtig ist |
|---|---|
| Erfolgreiche Ausführung mit gültiger Eingabe | Bestätigt Happy-Path-Vertrag und Payload-Form |
| Fehlende erforderliche Eingabe | Überprüft Metadatenvalidierungs-Gating |
| Unerwarteter Eingabeschlüssel | Verhindert verstecktes/Legacy-Payload-Driften |
| `requiresAuth`-Befehl auf nicht authentifizierter Seite | Überprüft explizite `manual_login_required`-Übergabe |
| `command.test` Stream-Deklarationspfad | Bestätigt Stream-Lebenszyklus und Listener-Manifest-Verhalten |
| `command.test` Execute-Fallback-Pfad | Stellt Kompatibilität für Befehle ohne benutzerdefinierten Test-Hook sicher |

## Nächste Schritte

- [Befehlsautorenschaft-Vorlagen](./command-authoring-templates.md) — kopierfertige Code-Vorlagen.
- [Listener-Entwicklung](./listener-development.md) — Stream-Integrationsmuster.
- [Befehlsreferenz](../commands.md) — Aktionsoberfläche und Laufzeitablauf.
- [Fehlercodes](../error-codes.md) — alle Befehlsvalidierungsfehlercodes.