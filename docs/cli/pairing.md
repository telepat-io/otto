---
title: Pairing
sidebar_position: 6
description: CLI reference for otto authcode, otto pair, and otto revoke — pair extension nodes with the relay and manage node credentials.
keywords:
  - otto authcode
  - otto pair
  - otto revoke
  - node pairing
  - pairing code
---

# Pairing

Pair extension nodes with the relay and manage node credentials.

## `otto authcode`

Generates a pairing authorization code that the extension uses to complete pairing.

### Usage

```bash
otto authcode [options]
```

### Flags

| Flag | Shorthand | Required | Type | Default | Description |
|---|---|---|---|---|---|
| `--relay-url` | | No | string | From config | Relay URL to request the authcode from |

### Examples

```bash
# Generate a pairing code
otto authcode

# Generate a pairing code against a specific relay
otto authcode --relay-url http://my-relay:8787
```

The generated code is entered into the extension's popup or options page to complete pairing. Codes expire after a short window.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Authcode generated and displayed |
| `1` | Failed to contact relay or relay error |

---

## `otto pair <code>`

Approves a pending pairing request using the code displayed in the extension popup.

### Usage

```bash
otto pair <code> [options]
```

### Arguments

| Argument | Required | Description |
|---|---|---|
| `<code>` | Yes | Pairing code shown in the extension popup |

### Flags

| Flag | Shorthand | Required | Type | Default | Description |
|---|---|---|---|---|---|
| `--relay-url` | | No | string | From config | Relay URL to approve the pairing on |

### Examples

```bash
# Approve a pairing request
otto pair ABC123

# Approve against a specific relay
otto pair ABC123 --relay-url http://my-relay:8787
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Pairing approved |
| `1` | Code not found, expired, or relay error |

---

## `otto revoke`

Revokes an extension node's pairing, invalidating its tokens and forcing re-pairing.

### Usage

```bash
otto revoke [options]
```

### Flags

| Flag | Shorthand | Required | Type | Default | Description |
|---|---|---|---|---|---|
| `--node-id` | | No | string | | Specific node ID to revoke (omit to revoke all) |

### Examples

```bash
# Revoke all paired nodes
otto revoke

# Revoke a specific node
otto revoke --node-id node_abc123
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Node(s) revoked |
| `1` | Revocation failed or relay error |

---

## Related commands

- [otto setup](./setup.md) — full first-run setup including pairing.
- [otto client](./client.md) — manage controller client identities.
- [Pairing and Auth Guide](../pairing-auth.md) — pairing lifecycle and token management.
