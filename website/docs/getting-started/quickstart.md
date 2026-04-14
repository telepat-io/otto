---
title: Quickstart
sidebar_position: 3
---

1. Ensure relay is running:

```bash
otto start
```

2. Register a controller identity and login:

```bash
otto client register --name "my-laptop"
otto client login
```

3. Pair node and controller (if needed):

```bash
otto authcode
otto pair <code>
```

4. Validate connectivity:

```bash
otto commands list
```

5. Run a command test:

```bash
otto test reddit.com getFeed
```

If command output returns manual_login_required, complete login in the opened browser tab and rerun.
