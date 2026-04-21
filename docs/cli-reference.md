---
title: CLI Reference
sidebar_position: 1
---

## Core lifecycle

```bash
otto start
otto stop
otto status
otto setup
```

## Discovery and execution

```bash
otto commands list
otto test <site> <command>
otto cmd --action <action> --payload '<json>'
```

## Pairing and auth

```bash
otto authcode
otto pair <code>
otto revoke
```

Controller client workflows:

```bash
otto client register
otto client login
otto client status
otto client remove --client-id <id>
otto client remove --all
```

## Logs and listeners

```bash
otto logs list --source all --latest 200
otto logs follow --source node
otto logs export --source relay --latest 500

otto listener subscribe-network --tab-session <id> --site reddit.com --pattern 'https://www.reddit.com/api/*'
otto listener unsubscribe --target-request-id <subscribeRequestId>
```

## Settings

```bash
otto settings
otto extension update
otto extension info
```

Use up/down for selection, Enter to edit, s to save, q or Esc to exit.
