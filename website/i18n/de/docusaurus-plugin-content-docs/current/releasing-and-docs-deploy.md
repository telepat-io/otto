---
title: Veröffentlichung und Dokumentations-Deployment
sidebar_position: 2
description: Wie die Otto-Dokumentationssite erstellt und deployt, Pakete über Release Please veröffentlicht und Erweiterungsartefakte deployt werden.
keywords:
  - veröffentlichen
  - dokumentations-deployment
  - release please
  - github pages
---

## Dokumentation lokal erstellen

```bash
npm run docs:build
npm run docs:serve
```

## Lokaler Entwicklungsmodus

```bash
npm run docs:start
```

## Deployment-Variablen

Docusaurus-Konfiguration unterstützt:

- DOCS_URL (Standard https://docs.telepat.io)
- DOCS_BASE_URL (Standard /otto/)
- GITHUB_OWNER (Standard telepat-io)
- GITHUB_REPO (Standard otto)
- GH_PAGES_BRANCH (Standard gh-pages)

Verwenden Sie DOCS_LOCAL=true für localhost-Basispfad.

## Release Please Paketversionierung

Release-Verwaltung wird durch `.github/workflows/release-please.yml` mit `release-please-config.json` und `.release-please-manifest.json` gehandhabt.

- Verwaltete Komponenten umfassen CLI, Relay, Protokoll und Erweiterung.
- Alle Komponentenversionen werden über einen einzigen `.` (Root)-Paketeintrag in der Release-Please-Konfiguration mit `include-component-in-tag: false` synchronisiert, sodass alle Pakete ein `v<version>`-Tag teilen (z.B. `v0.8.5`).
- Die `extra-files`-Liste in der Release-Please-Konfiguration stellt sicher, dass `package.json`-Versionsfelder und `.version`-Dateien für CLI, Relay, Protokoll und Erweiterung alle zusammen aktualisiert werden, zusammen mit internen `@telepat/*`-Abhängigkeits-Pins.

Wenn ein Release-PR geöffnet wird, erwarten Sie, dass Versionsaktualisierungen und interne `@telepat/*`-Abhängigkeitsupdates zusammen enthalten sind.

## Workflow-Auslösung und Job-Ablauf

Der `release-please.yml`-Workflow löst bei jedem **Push auf `main`** aus. Nicht jeder Push erzeugt eine Veröffentlichung — der Workflow verwendet Job-Level-Gates, um sicherzustellen, dass Publish und Erweiterungsupload nur ausgeführt werden, wenn ein neues Release erstellt wird.

### Job 1: `release-please`

Führt `googleapis/release-please-action@v4` aus. Dieser Job:

- **Erstellt oder aktualisiert** einen Release-PR (noch kein neues Release — kein nachgelagerter Publish).
- **Erstellt ein GitHub-Release**, wenn ein Release-PR zusammengeführt wurde (setzt `releases_created: true` und `.--release_created: true`).

Wenn Release-please **kein** Release erstellt, prüft ein **Reconcile**-Schritt auf zusammengeführte PRs, die immer noch das `autorelease: pending`-Label tragen. Wenn ein zusammengeführter Release-PR von Release-please übersehen wurde (z.B. durch einen Wettlauf oder v4-Tag-Überspringung), erstellt der Reconcile-Schritt den fehlenden Tag und das GitHub-Release manuell und beschriftet den PR dann um mit `autorelease: tagged`.

### Job 2: `determine-release-tag`

Wirkt als Gate für nachgelagerte Jobs. Er prüft drei Bedingungen in dieser Reihenfolge:

1. **Release-please hat ein Release erstellt** (`cli_release_created == 'true'`): gibt den neuen Tag von Release-please aus.
2. **Reconcile hat einen feststeckenden PR wiederhergestellt** (`reconciled_tag` ist nicht leer): gibt den abgeglichenen Tag aus.
3. **Weder noch** (gewöhnlicher Push ohne neues Release): gibt eine leere Zeichenkette aus, wodurch alle nachgelagerten Jobs übersprungen werden.

Dieses Gate ist es, das verhindert, dass `publish-packages` und `upload-extension-assets` bei jedem Push auf `main` ausgeführt werden. Nur ein echtes neues Release oder ein erfolgreich abgeglichener feststeckendes Release erzeugt ein nicht-leeres `release_tag`.

### Job 3: `publish-packages`

Wird nur ausgeführt, wenn `release_tag != ''`. Checkt den Release-Tag aus, führt vollständige Paket-Qualitätstorer durch (Typecheck, Lint, Build, Test) für Protokoll, Relay und CLI und publiziert dann alle drei Pakete zu npm mit Provenienz.

Die Veröffentlichung validiert, dass jede Paketversion mit der Release-Tag-Version übereinstimmt, bevor fortgefahren wird.

### Job 4: `upload-extension-assets`

Wird nur ausgeführt, wenn `release_tag != ''`. Checkt den Release-Tag aus, baut die Erweiterung, führt Erweiterungs-Qualitätstoren durch (Typecheck, Lint, Build, Test), zippt die Erweiterung und lädt die `.zip`- und `.sha256`-Prüfsumme auf das `v<version>`-GitHub-Release hoch.

### Flussdiagramm

```
push to main
  │
  ▼
release-please job
  ├── release PR created/updated → no downstream publish
  ├── release created (merge!)   → cli_release_created=true
  └── no release, reconcile step → reconciled_tag=vX.Y.Z (or empty)
        │
        ▼
determine-release-tag job
  ├── release_created=true → tag=vX.Y.Z  ──► publish-packages
  │                                           └─► upload-extension-assets
  ├── reconciled tag      → tag=vX.Y.Z  ──► publish-packages
  │                                           └─► upload-extension-assets
  └── neither             → tag=             ✔ (skips publish & upload)
```

## Warum nicht `on: release` oder `on: push: tags`?

Der Workflow vermeidet absichtlich `on: release` oder `on: push: tags`-Auslöser, um Cross-Workflow-Verkettung zu vermeiden. Die Verwendung eines einzigen Workflows, der durch `on: push: branches: [main]` mit internen Job-Gates ausgelöst wird, bedeutet:

- Alle Release-Schritte (Tag-Erstellung, npm-Publish, Erweiterungsupload) finden in einem Workflow-Run mit einem `GITHUB_TOKEN` statt. Kein PAT erforderlich.
- Das `determine-release-tag`-Gate stellt sicher, dass nur tatsächliche Release-Ereignisse Publish auslösen, während gewöhnliche Pushes auf main early beim Gate austreten.
- Der Reconcile-Schritt fängt Fälle ab, in denen Release-please v4 die Tag-Erstellung für zusammengeführte PRs überspringt, ohne einen separaten Wiederherstellungsworkflow zu erfordern.