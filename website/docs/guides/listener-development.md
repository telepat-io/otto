---
title: Listener Development
sidebar_position: 5
---

# Listener and Stream Development

Last Updated: 2026-04-14  
Owner: Browser Runtime

This guide explains how to build stream-capable command workflows using Otto listener infrastructure while keeping site logic in command modules.

## Architecture Rule

Keep listener runtime generic and keep site-specific stream parsing in command modules.

Runtime listener infrastructure handles:

- subscription lifecycle
- debugger/session ownership
- payload capture and redaction boundaries
- deterministic terminal behavior

Command module handles:

- stream adapter hints
- domain mapping
- semantic dedupe
- fallback policy

## Listener Lifecycle

Terminal lifecycle commands:

1. `listener.subscribe`
2. `listener.unsubscribe`

Async updates:

- `event` frames with `payload.type=listener_update`
- Correlated by original subscribe `requestId`

## network.http_intercept Options

| Option | Required | Description |
|---|---|---|
| `tabSessionId` | Yes | Managed tab session target |
| `site` | Yes | Site scope validation |
| `mode` | No | `network`, `fetch`, or `hybrid` |
| `urlPatterns` | No | URL globs to include |
| `requestHostAllowlist` | No | Cross-host explicit allowlist |
| `includeBody` | No | Include response bodies |
| `includeHeaders` | No | Include headers with redaction |
| `maxBodyBytes` | No | Body cap for safety |
| `mimeTypes` | No | MIME prefix allowlist |
| `streamAdapter` | No | Command-owned adapter hint |
| `selfUserId` | No | Optional adapter context |

## Command-owned Stream Adapter Pattern

Example options factory in site module:

```ts
export function createExampleListenerOptions(tabSessionId: string) {
  return {
    tabSessionId,
    site: 'example.com',
    streamAdapter: 'example.chat.v1',
    mode: 'fetch',
    includeBody: true,
    includeHeaders: false,
    urlPatterns: ['https://api.example.com/chat/sync*'],
    requestHostAllowlist: ['api.example.com'],
    mimeTypes: ['application/json'],
    maxBodyBytes: 500_000
  };
}
```

## Mapping to Shared Domain Objects

Normalize raw events in command code into shared objects, for example:

- `chat.message`
- `chat.typing`
- `chat.participant`
- `content.post`

Guidelines:

- Include `originalEntity` when safe and useful.
- Keep object sizes bounded.
- Never include secrets or cookies.

## Dedupe Strategy

Apply two layers:

1. Transport-level suppression for hybrid duplicate visibility.
2. Domain-level suppression for replayed semantic payloads.

Recommended keys:

- Stable message id if present.
- Otherwise content hash plus timestamp bucket.

## Fallback Design

When listener probe fails in `command.test`:

1. Return fallback metadata that explains strategy.
2. Call helper execute fallback (`helpers.execute`) for buffered output.
3. Keep fallback bounded and explicit.

Example fallback payload:

```json
{
  "fallback": {
    "strategy": "command_poll",
    "reason": "intercept_probe_unavailable"
  }
}
```

## Validation and Troubleshooting Checklist

- [ ] Subscribe succeeds with deterministic result.
- [ ] Listener updates appear on subscribe request id.
- [ ] Unsubscribe stops updates deterministically.
- [ ] Stream adapter emits valid shared object `kind` values.
- [ ] Duplicate events are suppressed at expected layer.
- [ ] Body/header capture honors max size and redaction.

## Related Docs

- `guides/command-authoring`
- `reference/protocol`
- `reference/extension-runtime`
- `reference/logging-debugging`
