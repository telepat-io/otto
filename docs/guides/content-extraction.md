---
slug: /guides/content-extraction
title: Content Extraction
sidebar_position: 9
description: How Otto extracts page content from live browser tabs, the supported formats, and why this makes agents faster, more accurate, and locally powered.
keywords:
  - content extraction
  - markdown extraction
  - browser automation
  - page scraping
  - agent workflows
---

# Content Extraction

Otto extracts page content from a live browser tab using the user's own Chrome session. That makes it a better fit for agents than remote scraping or browser farms because the content comes from the real page as it was rendered for the user.

## How it works

When an agent or controller calls `otto extract-content`, Otto routes the request through the relay to the extension node attached to the target tab. The extension runs the extraction directly in the browser runtime, using the page's live DOM and current session state.

That means Otto extracts from the final rendered page after JavaScript execution, user authentication, and lazy-loaded content.

## Supported formats

Otto supports multiple extraction outputs so automation workflows can choose the right shape for the task:

- `markdown` — browser-safe markdown that preserves headings, lists, links, inline code, and table structure. This is the default and the best fit for agent ingestion.
- `clean_html` — DOM-preserving HTML with scripts/styles/inline handlers removed while keeping semantic attributes (`data-*`, `aria-*`, `role`). This is the best format for selector discovery and command authoring.
- `distilled_html` — content-centric HTML for readability-first extraction flows.
- `raw_html` — full HTML from the current DOM, including page chrome and script/style tags.
- `text` — plain text extraction for summary or quick content checks.

## Which format should I use?

- Use `markdown` for summarization and LLM ingestion.
- Use `clean_html` for DOM inspection and reliable selector building.
- Use `distilled_html` only when you specifically want article-like cleaned content.
- Use `raw_html` only when you need exact page markup fidelity.
- Use `text` for quick plain-text checks.

## Why it matters for agents

- **Free and local** — extraction runs in the user's own browser. No external scraping service, no remote cloud browser farm, no additional page fetch.
- **Fast** — the browser node already has the page loaded, so Otto can extract content immediately from the live tab rather than rebuilding it from a remote request.
- **Accurate** — the extraction sees the actual rendered DOM, including dynamic content, client-side state, and site-specific page composition.
- **Agent-ready** — markdown output is optimized for LLM consumption, keeping structure and readability while minimizing token overhead.

## Commands

Use the high-level extraction command:

```bash
# Best for selector discovery and automation authoring
otto extract-content https://example.com/article --format clean_html

# Best for agent summaries (default)
otto extract-content https://example.com/article --format markdown
```

Under the hood, Otto maps this to browser DOM extraction primitives:

- `primitive.dom.extract_markdown`
- `primitive.dom.extract_clean_html`
- `primitive.dom.extract_distilled_html`
- `primitive.dom.extract_html`
- `primitive.dom.extract_text`

## See also

- [Architecture](/guides/architecture) — Otto's controller, relay, and node model.
- [Pairing and Auth](/guides/pairing-auth) — browser node pairing and token lifecycle.
- [Listener Development](/guides/listener-development) — stream-capable command and network automation.
- [Otto vs Jina Content Extraction](./otto-vs-jina-content-extraction.md) — real-world comparison of browser DOM extraction against Jina remote page fetch.
