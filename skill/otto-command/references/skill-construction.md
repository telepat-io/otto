# Skill Construction Notes

This file explains how `otto-command` is structured and how to evolve it safely.

## Purpose

Keep the skill narrowly focused on command authoring and debugging with minimal user input.

## Structure

- `SKILL.md`: discovery text, workflow, gates, completion criteria, command surface, and network/focus/log guidance.
- `references/skill-construction.md`: maintenance notes.

## Design principles

1. Narrow scope.
   - Do not absorb general setup or relay operations.
2. Deterministic flow.
   - enforce readiness gate and explicit stop conditions.
3. Progressive loading.
   - keep SKILL.md clear and tightly scoped, even when guidance is bundled.
4. Operational reliability.
   - require rebuild + manual extension reload confirmation after each code change.
5. Runtime truth first.
   - update references only from current code and docs.
6. Registration visibility.
   - surface the fact that new commands are discovered only after the extension bundle is rebuilt and manually reloaded, and that controller auth is a separate lifecycle concern.

## Required update checklist

When Otto command/runtime behavior changes:
1. update bundled metadata, primitive inventory, and output-kind guidance in `SKILL.md`
2. update bundled focus/interception/error notes in `SKILL.md`
3. update workflow or gates in `SKILL.md` if behavior changed
4. verify skill still excludes otto-cli scope topics

## Source files to keep in sync

- Otto command authoring documentation
- Otto command authoring templates
- Otto listener development documentation
- Otto commands and protocol references
- Otto extension runtime behavior documentation
- Otto logging and debugging documentation
- Otto error code reference
- Otto shared protocol type definitions
- Otto command execution context type definitions
- Otto command runtime and executor implementation details
- Otto debugger focus emulation implementation details

## Ambiguity guardrails

If uncertain whether content belongs here, apply this test:
- Does it directly help an agent implement or debug command code?
- If no, move it to the main otto-cli skill instead of this skill.
