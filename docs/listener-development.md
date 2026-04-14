# Listener Development

Last Updated: 2026-04-14
Owner: Browser Runtime

This guide covers listener-based stream integrations for command modules. The key design rule is separation of concerns: runtime owns transport lifecycle and safety, while command modules own site-specific parsing and stream shaping.

## Invariant

Keep runtime listener infrastructure generic and command adapter logic site-specific.

## Lifecycle Model

`listener.subscribe` and `listener.unsubscribe` are terminal commands that return normal result or error envelopes. Stream data is emitted asynchronously as `event` frames with `payload.type=listener_update`, correlated by the original subscribe `requestId`.

## network.http_intercept Options

| Option | Required | Notes |
|---|---|---|
| `tabSessionId` | Yes | Managed session target |
| `site` | Yes | Site scope |
| `mode` | No | `network`, `fetch`, `hybrid` |
| `urlPatterns` | No | URL globs |
| `requestHostAllowlist` | No | Host allowlist |
| `includeBody` | No | Capture bodies |
| `includeHeaders` | No | Capture headers with redaction |
| `maxBodyBytes` | No | Response body cap |
| `mimeTypes` | No | MIME prefix allowlist |
| `streamAdapter` | No | Adapter hint |

## Stream Adapter Guidance

Adapter modules should map raw transport payloads into shared-domain objects such as `chat.message` or `content.post`, and attach `originalEntity` only when it is safe and operationally useful. Keep objects compact to avoid cross-context serialization pressure during sustained streams.

## Dedupe

Duplicate suppression is intentionally layered. Runtime transport suppression handles hybrid cross-surface duplicates, and command adapters handle semantic duplicates that can still appear in replayed site payloads.

## Fallback

If a bounded stream probe cannot confirm traffic, return fallback metadata and use execute fallback helpers rather than leaving stream state ambiguous.

## Related Docs

- `docs/commands.md`
- `docs/protocol.md`
- `docs/use-cases.md`
- `docs/logging-debugging.md`
