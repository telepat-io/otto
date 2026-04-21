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

To update extension artifacts later:

```bash
otto extension update
```

After update completes, reload the extension in `chrome://extensions` or restart your browser.

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

Build and load local extension output manually (contributors only):

```bash
npm run --workspace @telepat/otto-extension build
```

Load unpacked from `extension/output/chrome-mv3` in `chrome://extensions`.

Run CLI in development mode:

```bash
npm run dev -- commands list
```
