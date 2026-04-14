---
title: Installation
sidebar_position: 2
---

## End-user install path

Install Otto globally:

```bash
npm install -g @telepat/otto
```

Then run guided setup:

```bash
otto setup
```

Load unpacked extension in Chrome using the path printed by setup.

## Monorepo development path

From repository root:

```bash
npm install
npm run build
```

Start relay daemon:

```bash
otto start
```

Run extension development runtime:

```bash
npm run dev:ext
```

Run CLI in development mode:

```bash
npm run dev -- commands list
```
