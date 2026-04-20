# Command Authoring

Last Updated: 2026-04-14
Owner: Browser Runtime

This guide explains how to add a site command in Otto extension runtime without breaking protocol, auth, or lifecycle guarantees. It is written for command authors who need a reliable implementation flow and a compact validation checklist.

## Source-of-Truth Code Paths

| Concern | Source |
| --- | --- |
| Command types and metadata contracts | `extension/src/commands/types.ts` |
| Site command registration | `extension/src/commands/index.ts` |
| Site command orchestration | `extension/src/runtime/command-runtime.ts` |
| Action execution dispatch | `extension/src/runtime/command-executor.ts` |

## Implementation Steps

Start by creating a command module under `extension/src/commands/<site>/` and declaring metadata that matches actual runtime behavior. Metadata should not be treated as documentation only; runtime uses it to gate execution and sanitize inputs before your handler runs. Implement `execute(ctx, input, authMode)` with bounded work and deterministic errors. When command behavior needs setup, stream manifests, or assertions, add an optional `test(ctx, input, helpers)` hook and keep it deterministic.

After implementation, register the command in the site bundle index and add tests that cover validation, auth preflight behavior, and execute/test fallback semantics.

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

Runtime validation is strict when metadata declares input contracts. Unknown keys produce `unexpected_command_input`, missing required fields produce `missing_command_input`, type mismatches produce `invalid_command_input_type`, and unmet cross-field constraints produce `missing_command_input_one_of`.

## Inside-Page Error Surfacing

When a command uses `ctx.executeScript` or `ctx.executeScriptWithDomHelpers`, do not rely on browser injection APIs to propagate thrown page errors. In Chromium, in-page throws can be lost and appear as `null`/`undefined` results. Use an explicit error payload contract:

1. Wrap the injected script body in `try/catch`.
2. Return a serialized marker object from the `catch` path.
3. In command code, detect that marker and return it as-is.
4. Runtime will rethrow that payload as a command error so controller and CLI see the inside-page error.

Minimal pattern:

```typescript
const result = await ctx.executeScriptWithDomHelpers(async () => {
	try {
		// Page logic
		return { ok: true };
	} catch (error) {
		return {
			__ottoSerializedCommandError: true,
			code: 'site_specific_error_code',
			message: error instanceof Error ? error.message : 'site_specific_error_code',
		};
	}
}, []);

if (ctx.isSerializedScriptError(result)) {
	return result;
}
```

This keeps command failures deterministic and preserves specific inside-page diagnostics (for example `reddit_post_comment_composer_missing`) in `otto test` output.

## Safety Rules

Never automate credential submission, keep site URL validation strict, and return deterministic precondition errors instead of silent retries. Command output should avoid sensitive values and remain stable enough for CLI and agent parsing.

## Testing Matrix

| Scenario | Why it matters |
| --- | --- |
| Successful execution with valid input | Confirms happy-path contract and payload shape |
| Missing required input | Verifies metadata validation gating |
| Unexpected input key | Prevents hidden/legacy payload drift |
| Requires-auth command on unauthenticated page | Verifies explicit manual login handoff |
| `command.test` stream declaration path | Confirms stream lifecycle and listener manifest behavior |
| `command.test` execute fallback path | Ensures compatibility for commands without custom test hook |

## Related Docs

- `docs/commands.md`
- `docs/protocol.md`
- `docs/listener-development.md`
- `docs/use-cases.md`
- `docs/error-codes.md`
