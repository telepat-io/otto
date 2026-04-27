---
title: Development
sidebar_position: 1
description: Local development setup, required validation sequence, and docs authoring guidance for Otto contributors.
keywords:
  - development
  - contributing
  - local setup
  - build commands
---

## Local development

From repository root:

```bash
npm install
npm run build
```

Useful commands:

```bash
npm run dev:relay
npm run dev:cli
npm run dev:ext
npm run e2e:manual
```

## Required validation sequence

After any code update, run in order:

```bash
npm run check
npm run lint
npm run build
npm run -ws --if-present test
```

## Documentation authoring

- Source docs site lives under website.
- Keep section layout aligned with Getting Started, Guides, Reference, Technical, and Contributing.
- Keep security-sensitive material redacted and avoid credential examples.
