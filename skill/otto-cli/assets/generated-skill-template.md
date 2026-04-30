# Otto CLI Skill Template

Reusable scaffold for Otto-related skills.

## File tree

```text
skill/otto-cli/
├── SKILL.md
├── references/
│   ├── command-catalog.md
│   ├── troubleshooting.md
│   └── framework-patterns.md
└── assets/
    └── generated-skill-template.md
```

## Usage

This skill package is designed to be installed in agent frameworks that support the Agent Skills specification.

### Installation locations

Project scope:
- `.agents/skills/otto-cli/`
- `.github/skills/otto-cli/`
- `.cursor/skills/otto-cli/`

User scope:
- `~/.agents/skills/otto-cli/`
- `~/.copilot/skills/otto-cli/`

### MCP integration

This skill works alongside the Otto MCP server. Register the MCP server with:

```bash
otto agent install <runtime>
```

The MCP server provides programmatic access to all Otto commands, while this skill provides workflow guidance for agents.
