# Readiness Assessment for User Testing

> Last updated 2026-04-10 against `main` branch.

## Build & CI Health

| Check                         | Status           | Notes                                    |
| ----------------------------- | ---------------- | ---------------------------------------- |
| TypeScript (`tsc --noEmit`)   | **Pass**         | Zero errors                              |
| ESLint (`eslint src/ tests/`) | **Pass**         | 0 errors, 0 warnings                     |
| Build (`npm run build`)       | **Pass**         | IIFE bundle + TypeScript compile cleanly |
| Vitest suite                  | **1012 pass**    | All green (52 test files)                |
| Node version                  | **Requires ≥18** | `.nvmrc` with content `18` exists        |

## Implementation Completeness

All 65 public commands are fully implemented end-to-end. `src/client/commands.ts`
is the authoritative inventory for the public CLI surface.

### Module Status

| Module            | Status       | Summary                                                                                                                 |
| ----------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `src/client/`     | **Complete** | CLI parsing (minimist + zod), 65 validated commands, public REPL mode, Unix socket client, session discovery            |
| `src/daemon/`     | **Complete** | Unix socket server, FIFO command queue, session lifecycle state machine, persistence to `$XDG_STATE_HOME`, idle timeout |
| `src/cypress/`    | **Complete** | Module API launcher, `cy.task()` bridge, driver spec REPL loop, cross-process IPC via QueueBridge                       |
| `src/browser/`    | **Complete** | Element ref map, selector generation (`@cypress/unique-selector` with Cypress priority order), IIFE snapshot injection  |
| `src/codegen/`    | **Complete** | Export to `.cy.ts`, template engine with describe/it structure, meta-command filtering, TypeScript output               |
| `src/injected/`   | **Complete** | Ported Playwright aria snapshot (Apache 2.0), YAML tree generation, incremental diffing, element map                    |
| `bin/cypress-cli` | **Complete** | Executable shim (`#!/usr/bin/env node`)                                                                                 |

### Command Coverage (65/65)

| Category       | Count | Commands                                                                                                                       |
| -------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------ |
| Core           | 6     | `open`, `repl`, `stop`, `status`, `install`, `snapshot`                                                                        |
| Navigation     | 4     | `navigate`, `back`, `forward`, `reload`                                                                                        |
| Interaction    | 13    | `click`, `dblclick`, `rightclick`, `type`, `clear`, `check`, `uncheck`, `select`, `focus`, `blur`, `scrollto`, `hover`, `fill` |
| Keyboard       | 1     | `press`                                                                                                                        |
| Assertion      | 3     | `assert`, `asserturl`, `asserttitle`                                                                                           |
| Execution      | 4     | `run-code`, `eval`, `cyrun`, `run`                                                                                             |
| Wait           | 2     | `wait`, `waitfor`                                                                                                              |
| Network        | 5     | `intercept`, `waitforresponse`, `unintercept`, `intercept-list`, `network`                                                     |
| Cookies        | 5     | `cookie-list`, `cookie-get`, `cookie-set`, `cookie-delete`, `cookie-clear`                                                     |
| State          | 2     | `state-save`, `state-load`                                                                                                     |
| localStorage   | 5     | `localstorage-list`, `localstorage-get`, `localstorage-set`, `localstorage-delete`, `localstorage-clear`                       |
| sessionStorage | 5     | `sessionstorage-list`, `sessionstorage-get`, `sessionstorage-set`, `sessionstorage-delete`, `sessionstorage-clear`             |
| DevTools       | 2     | `console`, `screenshot`                                                                                                        |
| Page           | 5     | `drag`, `upload`, `dialog-accept`, `dialog-dismiss`, `resize`                                                                  |
| Export         | 3     | `export`, `history`, `undo`                                                                                                    |

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

### ~~Must-fix~~ (Resolved)

1. ~~**Add `.nvmrc` file**~~ — ✅ `.nvmrc` with content `18` now exists.

2. ~~**E2E tests require `npm run build:iife` first**~~ — ✅ `pretest` script added to `package.json`.

### ~~Should-fix~~ (Resolved)

3. ~~**ESLint warnings (10)**~~ — ✅ All resolved. Lint now passes with 0 warnings.

4. ~~**README quickstart**~~ — ✅ README has complete install + usage instructions.

5. ~~**Verify `npm link` / local install**~~ — ✅ `bin` field points correctly to `./dist/client/main.js`.

### ~~Nice-to-have~~ (Resolved)

6. ~~**Pretest build step**~~ — ✅ `"pretest": "npm run build:iife"` added to `package.json`.

### Known Non-Blocking Warning Noise

7. **`tsconfig-paths` warnings** — Still appear during Cypress-backed `npx vitest run` slices as `Couldn't find tsconfig.json. tsconfig-paths will be skipped`. They are non-fatal, do not affect test results, and are not blocking 1.0.

8. **`MaxListenersExceededWarning`** — Still appears intermittently during navigation e2e coverage. It is non-fatal, does not fail the suite, and is not blocking 1.0.

## Test Summary

```
Total:  1009 tests (52 test files)
Total:  1012 tests (52 test files)
Pass:   1012
Fail:   0
```

## Bottom Line

**The application is functionally complete and ready for release.** All 65 public
commands are implemented, including the public `repl` command, the full data flow
(CLI → daemon → Cypress → browser → back) works end-to-end, and all 1012 tests pass.
The remaining baseline warning noise (`tsconfig-paths` skipped messages and an
intermittent `MaxListenersExceededWarning`) is still present, but it is non-fatal and
not blocking 1.0.
