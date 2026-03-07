# Readiness Assessment for User Testing

> Generated 2026-03-07 against `main` branch.

## Build & CI Health

| Check                         | Status           | Notes                                                |
| ----------------------------- | ---------------- | ---------------------------------------------------- |
| TypeScript (`tsc --noEmit`)   | **Pass**         | Zero errors                                          |
| ESLint (`eslint src/ tests/`) | **Pass**         | 0 errors, 10 warnings (all unused-var / `any` style) |
| Build (`npm run build`)       | **Pass**         | IIFE bundle + TypeScript compile cleanly             |
| Unit + integration tests      | **634 pass**     | All green                                            |
| E2E tests                     | **29 pass**      | All green (real Cypress + Electron)                  |
| Node version                  | **Requires ≥18** | Default nvm is v16 — no `.nvmrc` exists yet          |

## Implementation Completeness

All 28 commands specified in `docs/COMMANDS.md` are fully implemented end-to-end.

### Module Status

| Module            | Status       | Summary                                                                                                                 |
| ----------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `src/client/`     | **Complete** | CLI parsing (minimist + zod), 28 validated commands, REPL mode, Unix socket client, session discovery                   |
| `src/daemon/`     | **Complete** | Unix socket server, FIFO command queue, session lifecycle state machine, persistence to `$XDG_STATE_HOME`, idle timeout |
| `src/cypress/`    | **Complete** | Module API launcher, `cy.task()` bridge, driver spec REPL loop, cross-process IPC via QueueBridge                       |
| `src/browser/`    | **Complete** | Element ref map, selector generation (`@cypress/unique-selector` with Cypress priority order), IIFE snapshot injection  |
| `src/codegen/`    | **Complete** | Export to `.cy.ts`, template engine with describe/it structure, meta-command filtering, TypeScript output               |
| `src/injected/`   | **Complete** | Ported Playwright aria snapshot (Apache 2.0), YAML tree generation, incremental diffing, element map                    |
| `bin/cypress-cli` | **Complete** | Executable shim (`#!/usr/bin/env node`)                                                                                 |

### Command Coverage (28/28)

| Category    | Count | Commands                                                                                                               |
| ----------- | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| Core        | 4     | `open`, `stop`, `status`, `snapshot`                                                                                   |
| Navigation  | 4     | `navigate`, `back`, `forward`, `reload`                                                                                |
| Interaction | 12    | `click`, `dblclick`, `rightclick`, `type`, `clear`, `check`, `uncheck`, `select`, `focus`, `blur`, `scrollto`, `hover` |
| Keyboard    | 1     | `press`                                                                                                                |
| Assertion   | 3     | `assert`, `asserturl`, `asserttitle`                                                                                   |
| Export      | 3     | `export`, `history`, `undo`                                                                                            |
| Wait        | 2     | `wait`, `waitfor`                                                                                                      |

## What's Ready for User Testing

The full happy path works end-to-end:

1. **`cypress-cli open <url>`** — launches daemon + Cypress via Module API, navigates to URL
2. **`snapshot`** — returns ARIA tree with `[ref=eN]` handles on interactable elements
3. **Interaction commands** (`click`, `type`, `select`, etc.) — execute as real Cypress commands via ref resolution
4. **Assertions** (`assert`, `asserturl`, `asserttitle`) — work with error recovery (manual chainer evaluation, not `cy.should()`)
5. **`export`** — generates a valid `.cy.ts` test file from session history
6. **`history` / `undo`** — manage the command log (daemon-local, no Cypress round-trip)
7. **REPL mode** — interactive readline-based session with shell-style quoting

### Architecture Highlights

- **cy.task() polling loop**: driver spec long-polls `getCommand` (110s timeout, `{ type: 'poll' }` sentinel for re-polls). This is the only viable approach since Cypress cannot accept out-of-band commands.
- **Cross-process IPC**: Cypress 14 loads config in a forked child process. QueueBridge creates a Unix socket bridge with embedded client code in the generated `cypress.config.js`.
- **Assertion error recovery**: Cypress `cy.should()` failures kill the test. The driver spec uses manual chainer comparison in `cy.then()` callbacks instead.

## Items to Address Before / During User Testing

### Must-fix

1. **Add `.nvmrc` file** — The project requires Node ≥18, but the default nvm version is 16. Without `.nvmrc`, anyone running `npm install` or `npx vitest` on the default Node will hit `crypto.getRandomValues is not a function` (Vite/Vitest) and `structuredClone is not defined` (ESLint).

2. **E2E tests require `npm run build` first** — The E2E suite expects `dist/cypress/driverSpec.js` to exist. Running `npx vitest run` without building first causes 6 E2E test failures with "no spec files were found." Consider adding a `pretest` script or documenting the requirement.

### Should-fix

3. **ESLint warnings (10)** — All are minor:
   - 3 unused variables (`_success`, `_positional` ×2)
   - 2 `any` types in test files
   - 3 unused imports in test files
   - 2 unused definitions in test utilities

4. **README quickstart** — Users need clear install + usage instructions. At minimum: prerequisites (Node ≥18, Cypress ≥12), install steps, and a basic workflow example.

5. **Verify `npm link` / local install** — The `bin` field points to `./dist/client/main.js`. Worth confirming `npm link` and `npx .` work for local testing before distributing.

### Nice-to-have

6. **`tsconfig-paths` warnings** — E2E runs print "Couldn't find tsconfig.json. tsconfig-paths will be skipped" (6 times). Cosmetic but noisy.

7. **Pretest build step** — Add `"pretest": "npm run build:iife"` to `package.json` so `npm test` works without a separate build step.

## Test Summary

```
Total:  663 tests (634 unit/integration + 29 E2E)
Pass:   663
Fail:   0
```

## Bottom Line

**The application is functionally complete and ready for user testing.** All specified commands are implemented, the full data flow (CLI → daemon → Cypress → browser → back) works end-to-end, and all 663 tests pass. The remaining gaps are operational (Node version pinning, docs, packaging) rather than functional.
