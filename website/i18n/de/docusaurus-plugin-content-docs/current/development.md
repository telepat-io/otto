---
title: Entwicklung
sidebar_position: 1
description: Lokale Entwicklungsumgebung, erforderliche Validierungssequenz und Dokumentationsautoren-Richtlinien für Otto-Mitwirkende.
keywords:
  - entwicklung
  - mitwirkende
  - lokale einrichtung
  - build-befehle
---

## Lokale Entwicklung

Vom Repository-Stamm aus:

```bash
npm install
npm run build
```

Nützliche Befehle:

```bash
npm run dev:relay
npm run dev:cli
npm run dev:ext
npm run e2e:manual
```

## Erforderliche Validierungssequenz

Führen Sie nach jedem Code-Update in dieser Reihenfolge aus:

```bash
npm run check
npm run lint
npm run build
npm run -ws --if-present test
```

## Dokumentationsautorenschaft

- Die Quelldokumentationssite befindet sich unter website.
- Halten Sie die Abschnittsgliederung mit Erste Schritte, Anleitungen, Referenz, Technisch und Beiträge abgestimmt.
- Halten Sie sicherheitsrelevante Materialien geschwärzt und vermeiden Sie Anmeldeinformationsbeispiele.