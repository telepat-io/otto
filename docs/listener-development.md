# Listener Development

Last Updated: 2026-04-14
Owner: Browser Runtime

This guide covers listener-based stream integrations for command modules.

## Invariant

Keep runtime listener infrastructure generic and command adapter logic site-specific.

## Lifecycle Model

Terminal commands:

- `listener.subscribe`
- `listener.unsubscribe`

Async updates:

- `event` frames
- `payload.type=listener_update`
- correlated by original subscribe `requestId`

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

- Parse site payloads into shared objects (`chat.message`, `content.post`, others).
- Add `originalEntity` only when safe and useful.
- Keep payloads compact to avoid serialization pressure.

## Dedupe

1. Transport-level duplicate suppression for hybrid cross-surface duplicates.
2. Domain-level duplicate suppression in command adapters.

## Fallback

If stream probe cannot confirm traffic in bounded window, return fallback metadata and use execute fallback helper.

## Related Docs

- `docs/commands.md`
- `docs/protocol.md`
- `docs/logging-debugging.md`
