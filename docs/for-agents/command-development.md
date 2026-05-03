---
title: Developing a New Command
sidebar_position: 3
description: End-to-end agent walkthrough for planning, implementing, debugging, and verifying a new site command — from protocol design through live DOM inspection and the reload loop.
keywords:
  - command development
  - site command
  - DOM inspection
  - for agents
  - agent walkthrough
---

# Developing a New Command

This walkthrough covers the full process of adding a new site command. It is written for autonomous agents and describes the exact sequence of decisions, helper commands, iteration loops, and verification steps to follow for any site.

For the command authoring API reference, see [Command Authoring](/guides/command-authoring). For copy-ready code templates, see [Command Authoring Templates](/guides/command-authoring-templates).

---

## Phase 1: Plan before writing code

Before touching any files, settle the following questions. Ambiguity here causes rework.

### 1.1 What does the command return?

Define the output shape explicitly. If the output represents a generic concept (search result, article, post), consider whether a new shared entity type belongs in the protocol. Reusable entity types pay off when the same concept appears across multiple site commands.

If your command returns something that is already represented as a `StreamDomainObject` (e.g. `Article`, `Post`, `ChatMessage`, `SearchResult`), reuse it. If the concept is genuinely new and likely to be reused across sites, add a new interface to `packages/shared-protocol/src/index.ts` and add it to the `StreamDomainObject` union. Otherwise, a plain typed object returned directly from `executeScript` is fine.

### 1.2 What inputs does the command need?

Distinguish required from optional inputs. For inputs with bounded ranges (page count, result limit), define the max and default up front — they affect both metadata validation and pagination logic.

Pagination inputs (e.g. `pages`, `limit`) should default conservatively — a caller who does not pass `pages` should not be surprised by a multi-page navigation.

### 1.3 What are the edge case semantics?

Settle ambiguous output fields before writing code:
- **Sponsored / promoted content:** Include it with a flag (e.g. `isAd: true`) rather than filtering silently. Callers can filter; they cannot recover hidden data.
- **Sub-links:** Only include links that are semantically meaningful to the item, not every anchor on the page.
- **Images:** Return a URL or `null`. Skip base64 data URIs — these are typically inline favicons, not meaningful images.

---

## Phase 2: Extend the protocol (if adding a new entity type)

When a command introduces a new shared entity type, update the protocol **first**, before any other code. The extension resolves `@telepat/otto-protocol` from the compiled `dist/` artifacts, not from TypeScript source — the dist must be rebuilt before `npm run check` will pass for the extension.

```bash
# 1. Edit packages/shared-protocol/src/index.ts
# 2. Rebuild immediately:
npm run build -w packages/shared-protocol
# 3. Now type-check passes across all packages:
npm run check
```

> **Why dist matters:** The extension's `tsconfig.json` resolves `@telepat/otto-protocol` via workspace `package.json`, which targets `dist/index.js`. If you skip the rebuild, `tsc` will not see your new types and `npm run check` will fail with "Module has no exported member".

---

## Phase 3: Scaffold the site bundle

A site bundle lives at `extension/src/commands/<hostname>/` and contains four files:

| File | Purpose |
|---|---|
| `check-login.ts` | `SiteCommand` that detects whether the user is logged in |
| `goto-login.ts` | `SiteCommand` that navigates to the site's login page |
| `<command-id>.ts` | Your command implementation |
| `index.ts` | Exports a `SiteCommandBundle` grouping all three |

Register the bundle in `extension/src/commands/index.ts`:

```typescript
import { exampleCommands } from './example.com/index.js';
const bundles = [...existingBundles, exampleCommands];
```

If the site does not require login, set `requiresAuth: false` on all commands and implement `checkLogin` as a stub that always returns `{ loggedIn: false }`.

---

## Phase 4: Inspect the live DOM before writing any selectors

This is the most important phase for any DOM-extraction command. **Never write CSS class selectors based on static inspection, documentation, or guessing.** CSS classes on modern web apps are often obfuscated or generated at build time and change across deployments. Instead, anchor on stable structural markers:

- **`data-*` attributes with semantic names** — attributes like `data-testid`, `data-item-id`, `data-type` are tied to application logic, not styling, and survive CSS redesigns.
- **ARIA roles and labels** — `role="article"`, `aria-label="..."`, `[role="listitem"]` are stable because they must remain correct for accessibility.
- **Structural element semantics** — `<article>`, `<h2>`, `<time>`, `<blockquote>` carry meaning independent of styling.
- **Application-specific compiled attributes** — some apps embed stable compiled identifiers (e.g. `jsname`, `jsaction`) that are more stable than class names. Look for attributes that repeat with the same value at the expected item count.

### How to inspect the live DOM

Use `primitive.dom.extract_html` with a `url` parameter. This opens a temporary tab, waits for the page to fully load, captures the full HTML, and closes the tab automatically. No `tabSessionId` management needed.

```bash
otto cmd --action primitive.dom.extract_html \
  --payload '{"url":"https://example.com/feed"}' \
  2>/dev/null > /tmp/serp.json
```

Then count candidate attributes in the captured HTML to discover stable anchors. You are looking for attributes whose count matches the number of items you can see on the page:

```bash
node -e "
const fs=require('fs');
const c=JSON.parse(fs.readFileSync('/tmp/serp.json')).payload.data.content;
const count=p=>(c.match(new RegExp(p,'g'))||[]).length;
// Replace these with attributes you spotted while browsing the page
console.log('data-testid=post-container:', count('data-testid=\"post-container\"'));
console.log('role=article:', count('role=\"article\"'));
console.log('<h2:', count('<h2'));
"
```

### Verify stability across queries

Load two or more different pages (or the same page in different states) and compare counts. A selector is stable if its count reliably equals the number of items you expect:

```bash
otto cmd --action primitive.dom.extract_html --payload '{"url":"https://example.com/feed?page=1"}' 2>/dev/null > /tmp/s1.json
otto cmd --action primitive.dom.extract_html --payload '{"url":"https://example.com/feed?page=2"}' 2>/dev/null > /tmp/s2.json

node -e "
const fs=require('fs');
for (const [label,f] of [['page1','/tmp/s1.json'],['page2','/tmp/s2.json']]) {
  const c=JSON.parse(fs.readFileSync(f)).payload.data.content;
  const n=p=>(c.match(new RegExp(p,'g'))||[]).length;
  console.log(label+': article='+n('role=\"article\"')+', h2='+n('<h2'));
}
"
```

If a candidate attribute count fluctuates unexpectedly between pages of equal length, it is not a reliable anchor. Keep searching.

### Consider distilled output

`primitive.dom.extract_markdown` produces a Readability-distilled markdown version of the page. Use it to quickly understand what content a page contains without parsing raw HTML:

```bash
otto cmd --action primitive.dom.extract_markdown \
  --payload '{"url":"https://example.com/article/123"}' \
  2>/dev/null | node -e "
const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
console.log(d.payload.data.content.slice(0,3000));
"
```

Distilled output is well-suited for **article or text content** pages. For **structured list pages** (feeds, search results, comment threads) it is less useful — it loses item boundaries and drops structured attributes. Use raw HTML extraction for those.

### Inspect the item container structure

Once you have identified a stable anchor, examine a full item block to understand the relationship between container, title, body, metadata, and sub-links:

```bash
node -e "
const fs=require('fs');
const c=JSON.parse(fs.readFileSync('/tmp/s1.json')).payload.data.content;
// Find first item anchor and show its context
const m=c.match(/data-testid=\"post-container\"/);
const pos=c.indexOf(m[0]);
const block=c.slice(pos-200,pos+800).replace(/<img[^>]*>/g,'');
console.log(block);
"
```

Sketch the resolved structure (item container → title element → body → metadata) before writing the `executeScript` callback. This sketch becomes your selector map.

---

## Phase 5: Implement the command

Write the `executeScript` callback using the stable selectors from Phase 4. Key implementation notes:

### Use `executeScriptWithDomHelpers` for deep DOM workflows

Use `ctx.executeScriptWithDomHelpers(...)` when your page script needs Otto's injected helpers, especially for:
- shadow-root aware selectors (`__ottoDeepQuerySelector`)
- deterministic script-error serialization (`__ottoSerializeScriptError`)
- complex composer/editor interactions where plain selectors and one-shot `executeScript` become brittle

For simple extraction, `ctx.executeScript(...)` is enough. For interactive flows (compose, send, submit, rich editors), prefer `executeScriptWithDomHelpers(...)`.

```typescript
const result = await ctx.executeScriptWithDomHelpers(
  async (inputValue: string) => {
    const pageWindow = window as Window & {
      __ottoDeepQuerySelector?: (root: ParentNode, selector: string) => Element | null;
      __ottoSerializeScriptError?: (error: unknown, fallbackCode: string) => unknown;
    };

    const deepQuerySelector = pageWindow.__ottoDeepQuerySelector;
    const serializeScriptError = pageWindow.__ottoSerializeScriptError;

    if (typeof deepQuerySelector !== 'function') {
      throw new Error('otto_dom_query_helper_missing');
    }
    if (typeof serializeScriptError !== 'function') {
      throw new Error('otto_serialize_script_error_helper_missing');
    }

    try {
      const textbox = deepQuerySelector(document, '[role="textbox"]');
      if (!(textbox instanceof HTMLElement)) {
        throw new Error('composer_textbox_missing');
      }
      textbox.textContent = inputValue;
      return { ok: true };
    } catch (error) {
      return serializeScriptError(error, 'command_script_failed');
    }
  },
  ['hello'],
);
```

### Bubble browser-side errors out deterministically

Do not swallow page-script errors. Serialize them inside the page callback, then re-emit at command level.

```typescript
const submitResult = await ctx.executeScriptWithDomHelpers(/* ... */);

if (ctx.isSerializedScriptError(submitResult)) {
  return submitResult;
}

if (!submitResult || typeof submitResult !== 'object') {
  throw new Error('command_failed:missing_result_payload');
}

return {
  ok: true,
};
```

This pattern ensures runtime emits structured error codes (instead of opaque thrown values), and keeps retries/diagnostics deterministic in `command.run` and `command.test`.

### Use `closest()` to navigate upward to the container

Anchor on a specific child element (e.g. the title anchor) and walk upward to the item container:

```typescript
const container = titleAnchor.closest('[data-testid="post-container"]');
const bodyEl = container?.querySelector('[data-testid="post-body"]');
```

### Unwrap redirect URLs

Some sites wrap destination URLs in internal redirect URLs (e.g. `/redirect?url=<target>`). Detect and unwrap them before returning:

```typescript
function unwrapRedirectUrl(href: string, paramName: string): string | null {
  try {
    const u = new URL(href);
    const q = u.searchParams.get(paramName);
    if (q?.startsWith('http')) return decodeURIComponent(q);
    return href;
  } catch { return href; }
}
```

### Filter thumbnails from favicons

Favicon `<img>` elements are typically 16–32px. Filter by `naturalWidth` / `naturalHeight` to exclude them:

```typescript
const thumb = imgEls.find(img => {
  if (img.src.startsWith('data:')) return false;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  return w > 32 || h > 32;
});
```

### Cap accumulation against limit when fetching multiple pages

When paginating, cap each page's contribution to the remaining budget:

```typescript
allResults.push(...(pageResults as SearchResult[]).slice(0, remaining));
```

Without `.slice(0, remaining)`, a page that returns more results than the remaining budget will silently over-deliver.

---

## Phase 6: Build, reload, and test live

The extension must be rebuilt after any source change, and the browser must reload the rebuilt extension. This is a manual step — ask the user to do it.

```bash
# 1. Build the extension
npm run build -w extension
```

Then ask the user:

> Please reload the Otto extension in Chrome: open `chrome://extensions`, find Otto, and click **Reload**.

```bash
# 2. Verify the command is now registered
otto commands list | grep -A3 <commandId>

# 3. Run a live test
otto test <site> <commandId> --payload '{"<requiredInput>":"<value>"}' --json
```

If `results` is an empty array, the selectors did not match. Go back to Phase 4 and re-inspect the live DOM.

If the command errors with `missing_command_input`, you are not passing a required input. Add it to `--payload` explicitly.

### Reading debug logs during a live test

Open a live log stream in a second terminal before running the test. Extension-side logs appear under source `node`; relay routing under `relay`.

```bash
# Terminal 1: live log stream
otto logs follow --source all

# Terminal 2: trigger the command
otto test <site> <commandId> --payload '{"<requiredInput>":"<value>"}' --json
```

Correlate failures by `requestId` across both outputs. If the failure is only visible on the node side, narrow to `--source node`. If it is a routing issue, use `--source relay`.

---

## Phase 7: Diagnose empty or wrong results

### Empty results

If the test returns an empty array but you can see items in the Chrome tab, the selectors are not matching. Quick diagnosis:

```bash
# Fetch fresh HTML for the exact URL the command navigated to
otto cmd --action primitive.dom.extract_html \
  --payload '{"url":"https://example.com/feed"}' \
  2>/dev/null > /tmp/fresh.json

# Verify your candidate attributes are present in the fresh capture
node -e "
const c=JSON.parse(require('fs').readFileSync('/tmp/fresh.json')).payload.data.content;
['data-testid=\"post-container\"','role=\"article\"'].forEach(p=>
  console.log(p, (c.match(new RegExp(p,'g'))||[]).length)
);
"
```

If counts drop to 0, the site has changed its DOM. Re-run the cross-page comparison from Phase 4 to find the new stable anchors.

### Incorrect field values

If results are returned but fields are wrong (e.g. wrong title, missing description), use `node -e` to slice the HTML around one known item and inspect the exact element structure. Update the selector map accordingly.

### Script errors

Extension script errors surface in relay logs as `script_execution_error`. Check `otto logs list --source node --latest 50` for the stack trace.

---

## Phase 8: Write tests

Tests use `createChromeMock()`, which drives `scripting.executeScript` via a `scriptResults` array consumed sequentially. Each call to `ctx.executeScript` in a multi-page command consumes one element from the array.

```typescript
// Happy path
scriptResults.push([
  { kind: 'content.post', id: '1', title: 'Post A', url: 'https://a.com' },
  { kind: 'content.post', id: '2', title: 'Post B', url: 'https://b.com' },
]);

// Multi-page: one push per page
scriptResults.push([/* page 1 results */]);
scriptResults.push([/* page 2 results */]);

// Early-exit: empty page stops pagination
scriptResults.push([/* page 1 results */]);
scriptResults.push([]); // empty → loop breaks
```

Cover at minimum:
- Happy path with results returned
- `missing_command_input` for each required field
- `unexpected_command_input` for unknown fields
- `invalid_command_input_type` for wrong types
- Multi-page accumulation (if the command paginates)
- Early exit when a page returns empty results
- Limit enforcement across pages

---

## Phase 9: Final validation

Run the full validation sequence from AGENTS.md in order:

```bash
npm run check
npm run lint
npm run build
npm run -ws --if-present test
```

All four must pass before the implementation is considered complete. Do not skip `npm run build` — it ensures the compiled extension artifacts are in sync with source.

---

## Summary: the full loop

```
Plan schema → extend protocol → rebuild protocol dist →
scaffold bundle → inspect live DOM (primitive.dom.extract_html) →
verify selector stability across 2+ pages/states →
implement command with stable selectors →
build extension → ask user to reload extension in Chrome →
live test (otto test <site> <command> --json) →
iterate if empty or wrong results (re-inspect DOM, fix selectors) →
write tests → validate (check/lint/build/test)
```
