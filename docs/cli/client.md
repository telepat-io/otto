---
title: Client Management
sidebar_position: 7
description: CLI reference for otto client commands — register, login, check status, forget, and remove controller client identities.
keywords:
  - otto client
  - client register
  - client login
  - controller client
  - ACL
---

# Client Management

Register, authenticate, and manage controller client identities. Controller clients are the identity used by automation scripts to connect to the relay and issue commands.

## `otto client register`

Registers a new controller client on the relay.

### Usage

```bash
otto client register [options]
```

### Flags

| Flag | Shorthand | Required | Type | Default | Description |
|---|---|---|---|---|---|
| `--name` | | Yes | string | | Display name for the controller client |
| `--description` | | No | string | | Optional description |
| `--relay-url` | | No | string | From config | Relay URL to register on |
| `--json` | | No | boolean | false | Output result as JSON |

### Examples

```bash
# Register a new client interactively
otto client register --name "my-automation"

# Register with description
otto client register --name "ci-bot" --description "CI automation client"

# Register and capture JSON credentials
otto client register --name "ci-bot" --json
```

After registration, a client secret is returned. Store it securely — it is shown only once.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Client registered successfully |
| `1` | Registration failed or relay error |

---

## `otto client login`

Authenticates an existing controller client and stores access credentials locally.

### Usage

```bash
otto client login [options]
```

### Flags

| Flag | Shorthand | Required | Type | Default | Description |
|---|---|---|---|---|---|
| `--client-id` | | No | string | | Client ID to authenticate |
| `--relay-url` | | No | string | From config | Relay URL |

### Examples

```bash
# Login interactively
otto client login

# Login with specific client ID
otto client login --client-id abc123
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Logged in successfully |
| `1` | Login failed (invalid credentials or relay error) |

---

## `otto client status`

Shows the current controller client authentication status.

### Usage

```bash
otto client status [options]
```

### Flags

| Flag | Shorthand | Required | Type | Default | Description |
|---|---|---|---|---|---|
| `--json` | | No | boolean | false | Output as JSON |

### Examples

```bash
otto client status

otto client status --json
```

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Status reported |
| `1` | Not logged in or config missing |

---

## `otto client forget`

Removes locally stored controller client credentials without revoking them on the relay.

### Usage

```bash
otto client forget
```

### Examples

```bash
otto client forget
```

Use `otto client remove` to also revoke the client on the relay side.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Local credentials cleared |

---

## `otto client remove`

Revokes and removes a controller client from the relay, tearing down its ACL grants, refresh sessions, and active connections.

### Usage

```bash
otto client remove [options]
```

### Flags

| Flag | Shorthand | Required | Type | Default | Description |
|---|---|---|---|---|---|
| `--client-id` | | No | string | | Specific client ID to remove |
| `--all` | | No | boolean | false | Remove all registered controller clients |

### Examples

```bash
# Remove a specific client
otto client remove --client-id abc123

# Remove all clients
otto client remove --all
```

`--all` is idempotent after purge; subsequent calls return zero removals until new clients are registered.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | Client(s) removed |
| `1` | Removal failed or relay error |

---

## Related commands

- [otto pair / otto revoke](./pairing.md) — manage node pairing.
- [Pairing and Auth Guide](../guides/pairing-auth.md) — full auth lifecycle.
