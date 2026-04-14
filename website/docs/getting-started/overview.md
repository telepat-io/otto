---
title: Overview
sidebar_position: 1
---

Otto runs controller commands against a browser extension node through a relay.

Runtime model:

1. Controller sends command envelopes over WebSocket to relay.
2. Relay authenticates and routes command by targetNodeId.
3. Node executes command against managed tabs.
4. Relay returns terminal outcome to controller.

Guaranteed command outcomes:

- completed
- failed
- timed_out
- cancelled

Key invariants:

- targetNodeId is required for command routing.
- Per-tab execution is serial; cross-tab execution is parallel.
- Replay protection uses replayNonce and timestamp windows.
- Sensitive fields are redacted before relay log persistence.

For architecture details, see Guides -> Architecture.
