---
title: Installation
sidebar_position: 2
description: Install the Otto CLI and extension. Covers the global end-user install path and the monorepo contributor development setup.
keywords:
  - install otto
  - npm install
  - otto setup
  - chrome extension install
  - monorepo development
---

# Installation

Otto has two install paths: a global CLI install for end users, and a monorepo dev install for contributors.

## Before you start

- **Node.js 18 or later** — required for the CLI and relay.
- **npm 9 or later** — used to install the CLI globally.
- **Google Chrome** — the extension node runs as a Chrome extension.
- **Internet access** — `otto setup` downloads the extension artifact from Otto release assets.

## End-user install

Install the Otto CLI globally:

```bash
npm install -g @telepat/otto
```

The CLI package includes relay runtime dependencies, so relay commands (`otto start`, `otto stop`, `otto status`) work without a separate relay install.

Run the guided setup wizard:

```bash
otto setup
```

Setup does the following:

1. Confirms your relay URL (defaults to `ws://127.0.0.1:8787?role=controller`).
2. Starts the relay daemon if it is not running.
3. Downloads the extension artifact from release assets and verifies its checksum.
4. Prints the exact extension folder path for Chrome.

Load the extension in Chrome:

```
1. Open chrome://extensions
2. Enable Developer mode (top-right toggle)
3. Click Load unpacked
4. Select the folder path printed by otto setup
```

:::tip Updating the extension
When a new Otto version is released, update the extension artifact with:
```bash
otto extension update
```
After the update completes, reload the extension at `chrome://extensions` or restart Chrome.
:::

## Contributor monorepo install

This path is for contributors working on Otto itself. You build and run everything locally from source.

Clone the repository and install all workspace dependencies:

```bash
git clone https://github.com/telepat-io/otto.git
cd otto
npm install
```

Build all packages:

```bash
npm run build
```

Start the relay daemon:

```bash
otto start
```

Run the extension in development mode with hot reload:

```bash
npm run dev:ext
```

Load the extension manually from the build output:

```bash
# Build extension output
npm run --workspace @telepat/otto-extension build
# Then load chrome-mv3/ from chrome://extensions > Load unpacked
```

Extension output path: `extension/output/chrome-mv3`.

Run the CLI in development mode:

```bash
npm run dev -- commands list
```

:::note
Monorepo builds require all packages to build without TypeScript errors. Run `npm run check` to verify before loading extension output.
:::

## Next steps

- [Quickstart](./quickstart.md) — start relay, pair node, run first command.
- [otto setup command reference](./cli/setup.md) — full setup options and non-interactive mode.
- [Development guide](./development.md) — local dev workflow and validation sequence.
