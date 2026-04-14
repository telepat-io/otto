# Command Authoring

Last Updated: 2026-04-14
Owner: Browser Runtime

This guide explains how to add and validate a new site command in Otto extension runtime.

## Source-of-Truth Code Paths

- `extension/src/commands/types.ts`
- `extension/src/commands/index.ts`
- `extension/src/runtime/command-runtime.ts`
- `extension/src/runtime/command-executor.ts`

## Implementation Steps

1. Create a command file in `extension/src/commands/<site>/`.
2. Define metadata with correct `site`, `id`, and auth flags.
3. Declare `inputFields` and optional `inputAtLeastOneOf`.
4. Implement bounded `execute(ctx, input, authMode)` logic.
5. Optional: implement `test(ctx, input, helpers)` for stream readiness and fallback.
6. Register command in site bundle index.
7. Add tests for validation, auth, and fallback behavior.

## Metadata Contract Table

| Field | Required | Purpose |
|---|---|---|
| `site` | Yes | Site bundle ownership |
| `id` | Yes | Command id |
| `requiresAuth` | Yes | Auth preflight behavior |
| `requiresDebuggerFocus` | No | Focus emulation opt-in |
| `preloadHost` | No | Pre-execution host guarantee |
| `inputFields` | No | Declarative input schema |
| `inputAtLeastOneOf` | No | Conditional input requirement |

## Runtime Validation Behavior

- Unknown keys: `unexpected_command_input`
- Missing required keys: `missing_command_input`
- Invalid types: `invalid_command_input_type`
- Missing one-of group: `missing_command_input_one_of`

## Safety Rules

- Never automate credential submission.
- Keep site-scoped URL validation strict.
- Return deterministic errors for expected precondition failures.
- Do not leak sensitive values in outputs.

## Testing Matrix

1. Successful execution with valid input.
2. Missing required input.
3. Unexpected input key.
4. Requires-auth command with unauthenticated page state.
5. command.test stream declaration path.
6. command.test fallback execute path.

## Related Docs

- `docs/commands.md`
- `docs/protocol.md`
- `docs/listener-development.md`
- `docs/error-codes.md`
