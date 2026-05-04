---
title: Otto vs Jina Content Extraction
sidebar_position: 9.5
description: Side-by-side comparison of Otto browser DOM extraction and Jina page scraping for LinkedIn, Reddit, and blog content.
keywords:
  - otto
  - jina
  - content extraction
  - browser DOM
  - scraping
---

# Otto vs Jina Content Extraction

This page documents a practical comparison between two extraction approaches:

- **Otto** — browser DOM extraction from a live Chrome session via `otto extract-content`
- **Jina** — remote page fetch and parse via `https://r.jina.ai/<url>`

The comparison uses three representative URLs and captures both raw outputs and performance metrics.

## Methodology

For each URL we ran:

- `otto extract-content <url> --json`
- `curl -s "https://r.jina.ai/<url>" -w '\nTIME_TOTAL:%{time_total}\n'`

This test deliberately omitted an API key, using the anonymous `r.jina.ai` endpoint. Jina response times can be cached, so only the first request duration is used in this comparison.

Raw output files were saved under `docs/guides/outputs/`:

- `otto_<slug>.json`
- `jina_<slug>.json`

This comparison focuses on:

- extraction content quality
- UI/noise removal
- comment/thread capture
- request duration
- site-specific coverage and blocking behavior

## Jina rate limit context

Jina enforces rate limits in two dimensions:

- **RPM** — requests per minute
- **TPM** — tokens per minute

Limits are enforced per IP or per API key, whichever threshold is reached first. Anonymous requests are tracked by IP; authenticated requests are tracked by key.

The dashboard lists endpoint-specific limits such as:

- **Reader API** (`https://r.jina.ai`): URL-to-LLM-friendly-text extraction with anonymous and authenticated rate limits.
- **Search API** (`https://s.jina.ai`): web search + parsing with fixed token costs.
- **Embedding API** (`https://api.jina.ai/v1/embeddings`): both RPM and TPM apply, with token usage based on input size.
- **Reranker API** (`https://api.jina.ai/v1/rerank`): also RPM + TPM.
- **Classifier APIs** (`/v1/train`, `/v1/classify`): request and token budgets apply with separate few-shot and zero-shot limits.
- **Segmenter API** (`/v1/segment`): request-limited and token usage not counted.
- **DeepSearch** (`https://deepsearch.jina.ai/v1/chat/completions`): conversational search with a separate RPM budget.

These limits are relevant because Jina is a hosted remote service, while Otto performs extraction in the user's own browser.

## 1. LinkedIn post

URL: `https://www.linkedin.com/posts/techstars_ny-tech-week-were-coming-for-you-whether-activity-7454971517832011776-fXua`

### Otto result

- `durationMs`: `3009`
- `contentLength`: `7821`
- Output: cleaned markdown extraction of the post content and visible page elements.
- Notes: Otto produced DOM-based markdown from the live browser page.

### Jina result

- `time_total`: `4.638154`
- Output: a mixed guest-page result labeled as markdown, but still containing LinkedIn login flow and UI shell markup.
- Notes: even without an API key, Jina returned a LinkedIn guest-page wrapper rather than a clean, distilled post summary.

### Comparison

| Aspect | Otto | Jina |
|---|---|---|
| Request duration | 3.01 s | 4.64 s |
| Content length | 7,821 chars | Mixed guest-page markdown |
| Output type | Browser DOM markdown | Raw LinkedIn guest-page content |
| Comments | N/A | N/A |
| UI noise | Minimal | High (login/signup/navigation/footer) |
| Best fit | agent-ready content extraction | raw profile/guest page fetch |

## 2. Reddit post

URL: `https://www.reddit.com/r/LocalLLaMA/comments/1t1lfhj/minimax_m27_awq4bit_on_2x_spark_vs_2x_rtx_6000/`

### Otto result

- `durationMs`: `2313`
- `contentLength`: `27791`
- Output: markdown extraction of the Reddit thread, including post content and comment structure.
- Notes: Otto was able to extract the live page DOM from the target Reddit thread.

### Jina result

- `time_total`: `1.815514`
- Output: a Jina markdown error page showing that Reddit returned `403 Forbidden` and the request was blocked.
- Notes: Jina could not retrieve the Reddit thread content anonymously.

### Comparison

| Aspect | Otto | Jina |
|---|---|---|
| Request duration | 2.31 s | 1.82 s |
| Content length | 27,791 chars | Blocked error page |
| Output type | Markdown extraction | Blocked/restricted page notice |
| Comments | Extracted post comments | No usable content |
| UI noise | Low | High (block notice) |
| Best fit | browser DOM extraction for community content | not reliable for anonymous Reddit scraping |

## 3. Blog post

URL: `https://dennishodgson.blogspot.com/2025/05/photographic-highlights-202425.html`

### Otto result

- `durationMs`: `3017`
- `contentLength`: `39427`
- Output: cleaned markdown extraction of the blog article content.
- Notes: Otto removed page chrome and extracted the article from the live DOM.

### Jina result

- `time_total`: `5.977519`
- Output: actual markdown content for the article, including text and image links.
- Notes: Jina succeeded on this publication page and returned a markdown-ready article.

### Comparison

| Aspect | Otto | Jina |
|---|---|---|
| Request duration | 3.02 s | 5.98 s |
| Content length | 39,427 chars | Markdown article content |
| Output type | Browser DOM markdown | Markdown-ready page extract |
| Comments | N/A | N/A |
| UI noise | Minimal | Low/medium (still includes some extracted navigation text) |
| Best fit | article extraction from live browser state | raw public blog extraction |

## Overall conclusions

- **Otto is stronger for agent-ready extraction when the page is already loaded in a browser.** It consistently delivers cleaned markdown from the live DOM.
- **Jina can work for public blog pages,** but it is less reliable for sites with access controls or anti-scraping protection.
- **Reddit in particular failed anonymously through Jina** with a `403 Forbidden` block page.
- **LinkedIn via Jina still returned guest-page wrapper content,** not a distilled post payload.
- **Otto’s extraction times were 2.3–3.0 seconds** on this set, while Jina’s first-request times ranged from 1.8 to 6.0 seconds.
- **Only the initial Jina request timing is meaningful here.** Jina caches results, so repeated calls can appear artificially fast.

## Evidence files

Raw capture files are available in `docs/guides/outputs/`:

- `otto_posts_techstars_ny-tech-week-were-coming-for-you-whether-activity-7454971517832011776-fXua.json`
- `jina_posts_techstars_ny-tech-week-were-coming-for-you-whether-activity-7454971517832011776-fXua.json`
- `otto_r_LocalLLaMA_comments_1t1lfhj_minimax_m27_awq4bit_on_2x_spark_vs_2x_rtx_6000.json`
- `jina_r_LocalLLaMA_comments_1t1lfhj_minimax_m27_awq4bit_on_2x_spark_vs_2x_rtx_6000.json`
- `otto_2025_05_photographic-highlights-202425.html.json`
- `jina_2025_05_photographic-highlights-202425.html.json`

These files preserve the exact initial tool outputs, timing measurements, and any site-specific noise observed during the comparison.
