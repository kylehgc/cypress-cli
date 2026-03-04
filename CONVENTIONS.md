# Code Conventions

> Style, naming, patterns, and rules for this codebase.

## Language

- **TypeScript** — strict mode, all files
- **ESM** — `import`/`export`, `.js` extensions in import paths (required for
  ESM resolution even though source files are `.ts`)
- **Target**: ESNext
- No `any` unless unavoidable (and commented why)
- No `@ts-ignore` — use `@ts-expect-error` with explanation if needed

## File Organization

- One module per file. No barrel files except `index.ts` for public API.
- Group imports: Node builtins → external packages → local imports, separated
  by blank lines.
- Named exports only (no default exports). Exception: Cypress test files export
  nothing.

```typescript
// Good
import fs from 'node:fs/promises';
import net from 'node:net';

import { z } from 'zod';
import minimist from 'minimist';

import { CommandQueue } from './commandQueue.js';
import type { Command } from './protocol.js';
```

## Naming

| Thing             | Convention                                  | Example                              |
| ----------------- | ------------------------------------------- | ------------------------------------ |
| Files             | camelCase                                   | `commandQueue.ts`, `ariaSnapshot.ts` |
| Types/Interfaces  | PascalCase                                  | `AriaNode`, `CommandResult`          |
| Functions         | camelCase                                   | `generateAriaTree()`, `resolveRef()` |
| Constants         | UPPER_SNAKE for true compile-time constants | `DEFAULT_TIMEOUT`, `IIFE_STRING`     |
| Local constants   | camelCase                                   | `const socketPath = ...`             |
| Private fields    | prefix with `_`                             | `this._pending`, `this._socket`      |
| Boolean variables | `is`/`has`/`can`/`should` prefix            | `isConnected`, `hasRef`              |
| Zod schemas       | camelCase matching the command name         | `const click = declareCommand(...)`  |

## Error Handling

- Use typed errors, not bare strings:

```typescript
// Good
class RefNotFoundError extends Error {
	constructor(ref: string) {
		super(`Ref "${ref}" not found in current snapshot`);
		this.name = 'RefNotFoundError';
	}
}

// Bad
throw new Error(`Ref "${ref}" not found in current snapshot`);
```

- Always include actionable context in error messages:

```typescript
// Good: tells the user what to do
'No session running. Run `cypress-cli open <url>` to start one.';

// Bad: just states the problem
'Session not found';
```

- Catch errors at boundaries (socket handler, task handler), not in business
  logic. Let errors propagate up to the handler that knows how to format and
  return them.

## Async Patterns

- Prefer `async`/`await` over `.then()` chains in Node.js code
- In Cypress test code (driver spec), use `.then()` chains because Cypress
  commands are not real Promises — they're chainable subjects
- Never mix `await` and Cypress commands:

```typescript
// WRONG — mixing async/await with Cypress chains
async function bad() {
	const win = await cy.window(); // This doesn't work!
	win.eval(code);
}

// CORRECT — use Cypress .then()
function good() {
	cy.window().then((win) => {
		win.eval(code);
	});
}
```

## Testing

- Test files: `*.test.ts` in `tests/` directory, mirroring `src/` structure
- Use `describe` for module/class grouping, `it` for individual behaviors
- Test names should be sentences starting with a verb:
  `"generates correct snapshot for simple page"`
- One assertion per test when practical; multiple assertions OK when testing
  a single logical behavior
- Use `beforeEach` for setup, not `before` (ensures test isolation)
- No shared mutable state between tests

## Comments

- No redundant comments (`// increment count` above `count++`)
- Comment the **why**, not the **what**:

```typescript
// Good: explains WHY
// Cypress tasks must return non-undefined, so we return true as acknowledgment
return true;

// Bad: explains WHAT (the code already says this)
// Return true
return true;
```

- Use JSDoc on public API functions:

```typescript
/**
 * Generates an aria tree from the DOM and renders it as YAML.
 *
 * @param rootElement - The root DOM element to snapshot
 * @param options - Must include `mode: 'ai'` for LLM consumption
 * @param previousSnapshot - If provided, renders incremental diff only
 * @returns YAML string with [ref=eN] handles on interactable elements
 */
export function takeSnapshot(
  rootElement: Element,
  options: AriaTreeOptions,
  previousSnapshot?: AriaSnapshot,
): string { ... }
```

## Ported Code (src/injected/)

Ported Playwright code follows these additional rules:

- **Keep original copyright headers** — add ours below
- **Minimize changes** — only remove what's documented in `docs/ARIA_SNAPSHOT_PORT.md`
- **Mark modifications** with `// MODIFIED: reason` above the changed code
- **Mark removals** with `// REMOVED: functionName — reason` in a comment block
  at the location where code was cut
- Do NOT reformat ported code to match our style (makes diffs against upstream
  harder to read)

## Dependencies

- Keep dependencies minimal. Every dependency is a liability.
- Pin exact versions in package.json (no `^` or `~`)
- Runtime dependencies: `minimist`, `zod`, `cypress` (peer)
- Dev dependencies: `typescript`, `vitest`, `esbuild`, `@types/node`
- No lodash, no axios, no express. Use Node.js builtins.

## Git

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- Branch naming: `feat/command-click`, `fix/timeout-handling`, `docs/architecture`
- Keep commits atomic: one logical change per commit
- Do not commit `dist/`, `node_modules/`, or `.session` files
