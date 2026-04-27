---
title: Otto Documentation
slug: /
sidebar_position: 1
description: Otto is a secure remote browser automation platform. Run CLI-driven commands against a browser on another machine via controller, relay, and extension node.
keywords:
  - browser automation
  - remote browser
  - CLI automation
  - chrome extension
  - relay daemon
---

# Otto Documentation

Otto is a secure remote browser automation platform built around three runtime components:

| Component | Package | Role |
|---|---|---|
| **Controller** | `@telepat/otto` | CLI that issues commands and receives results |
| **Relay** | `@telepat/otto-relay` | Central broker for auth, routing, locks, and logs |
| **Browser node** | `@telepat/otto-extension` | Chrome extension that executes browser operations |

Commands flow from controller → relay → node. Results and stream updates flow back in reverse. The relay enforces token authentication, per-tab serialization, and replay protection at every step.

## What you can do with Otto

- Automate site-specific workflows from the command line against a remote or local browser.
- Stream real-time network interception events from a managed browser tab.
- Build custom controllers over the relay WebSocket protocol.
- Author new site commands that run inside the browser extension.
- Run autonomous agent workflows using the documented For Agents patterns.

## Explore the documentation

| Section | What you will find |
|---|---|
| [Getting Started](./overview.md) | Install Otto, run setup, and send your first command |
| [Guides](./architecture.md) | Architecture, pairing, command authoring, troubleshooting |
| [Reference](./cli/index.md) | CLI commands, protocol, API, configuration, error codes |
| [Technical](./security.md) | Security controls and testing strategy |
| [Contributing](./development.md) | Local dev setup and release process |
| [For Agents](./for-agents/index.md) | Machine-readable automation guide for AI agents |

:::tip New here?
Start with the [Installation](./installation.md) guide, then follow the [Quickstart](./quickstart.md) to send your first command in under five minutes.
:::
