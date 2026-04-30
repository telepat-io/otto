---
title: Skills
sidebar_position: 4
description: Otto skill packages for AI agent workflows.
keywords:
  - skills
  - SKILL.md
  - agent skills
  - automation
---

# Skills

Otto ships a skill package that provides AI agents with zero-context workflow guidance for browser automation.

## Primary skill package

The `skill/otto-cli/` package is the installable skill bundle for Otto.

- **Location**: `skill/otto-cli/SKILL.md` (repository root)
- **Purpose**: Guides agents through install, setup, command execution, debugging, and MCP integration
- **Format**: Agent Skills specification compliant

### Use cases

- Install and configure Otto from scratch
- Run browser automation commands reliably
- Debug failed commands using logs and requestId correlation
- Register Otto with agent frameworks (Claude, Cursor, VS Code, etc.)
- Use MCP server for programmatic access

### Core file

`skill/otto-cli/SKILL.md` contains:

- Installation and setup instructions
- Deterministic workflow for all operations
- MCP tool set documentation
- Argument semantics and constraints
- Gotchas and sharp edges
- Failure handling matrix
- Source evidence map

### Companion references

- `references/command-catalog.md` — full command/argument matrix
- `references/troubleshooting.md` — failure diagnostics
- `references/framework-patterns.md` — reusable workflow patterns

## Installation locations

### Project scope

- `.agents/skills/otto-cli/`
- `.github/skills/otto-cli/`
- `.cursor/skills/otto-cli/`

### User scope

- `~/.agents/skills/otto-cli/`
- `~/.copilot/skills/otto-cli/`
- `~/.claude/skills/otto-cli/`

## Required skill contract

Each shipped skill must document:

1. **Name**: `otto-cli` (kebab-case, matches directory)
2. **Inputs**: relay URL, site, command, node ID, tab session, auth mode
3. **Guardrails**: never automate credential submission, always require ACL approval
4. **Outputs**: command results, log entries, screenshots
5. **Failure modes**: `manual_login_required`, `acl_missing_node_grant`, `node_offline`, `timed_out`
6. **Verification prompts**: should-trigger and should-not-trigger examples

## Publication rules

- Canonical page: `docs/for-agents/skills.md`
- Links to human docs: `docs/installation.md`, `docs/quickstart.md`
- Concrete examples: all command examples are copy-paste safe
- Sync requirements: skill updates must happen in same change as CLI behavior changes

## Sync and drift policy

When MCP tool surface changes, update in the same change:

1. `packages/cli/src/mcp/tools.ts` (schemas and contracts)
2. `packages/cli/src/mcp/server.ts` (handlers)
3. `docs/for-agents/mcp-server.md` (MCP docs)
4. `skill/otto-cli/SKILL.md` (skill docs)

When agent install targets change, update:

1. `packages/cli/src/agent/install.ts` (install logic)
2. `docs/for-agents/agent-setup.md` (setup docs)
3. `skill/otto-cli/SKILL.md` (skill docs)

## Related pages

- [MCP Server](./mcp-server.md) — MCP server documentation
- [Agent Setup](./agent-setup.md) — framework registration instructions
- [For Agents](/for-agents/) — agent constraints and decision flow
