# Agent Instructions

> Read this file first in every session. It tells you what this project is, how
> to work in it, and where to find everything.

## What This Project Is

A CLI tool that gives LLMs REPL-like access to a live web page through real
Cypress commands, using Playwright's aria snapshot for DOM representation.

**Not a Cypress plugin.** Not a test runner. It's a tool-use interface: the LLM
sends a command → the CLI executes it as a real Cypress command in a live
browser → the result (aria snapshot) comes back.

## Repository Layout

```
├── ARCHITECTURE.md          ← System design, data flow, component diagram
├── CONVENTIONS.md           ← Code style, naming, error handling, async patterns
├── AGENTS.md                ← You are here
├── docs/
│   ├── ARIA_SNAPSHOT_PORT.md ← Line-by-line keep/cut plan for porting Playwright code
│   ├── COMMANDS.md           ← All CLI commands, zod schemas, Cypress API mappings
│   ├── PACKAGE_SPEC.md       ← package.json, tsconfig.json, esbuild, vitest config
│   ├── TEST_PLAN.md          ← ~60 test cases, test structure, fixtures
│   └── TIME_TRAVEL.md        ← Future feature notes (not in scope yet)
├── src/
│   ├── client/              ← CLI entry point, arg parsing, socket client
│   ├── daemon/              ← Persistent process, session management, command queue
│   ├── cypress/             ← Plugin, driver spec, launcher (Module API)
│   ├── injected/            ← Ported aria snapshot code (esbuild → IIFE)
│   ├── browser/             ← Browser-context helpers (element map, ref tracking)
│   └── codegen/             ← Export recorded commands to Cypress test files
├── tests/
│   ├── unit/                ← Mirrors src/ structure
│   ├── integration/         ← Component interaction tests (real sockets, mock Cypress)
│   └── e2e/                 ← Full stack tests with real Cypress
└── dist/                    ← Build output (gitignored)
```

Each `src/` subdirectory has a `README.md` explaining its purpose.

## How to Work on an Issue

1. **Read the issue body** on GitHub. It has acceptance criteria as checkboxes,
   dependency references, and pointers to specific docs.
2. **Read the referenced docs.** Every issue links to the relevant sections of
   `ARCHITECTURE.md`, `CONVENTIONS.md`, `COMMANDS.md`, etc. These are your
   specification — follow them closely.
3. **Check dependencies.** If the issue says `Depends On: #N`, make sure those
   PRs are merged and their code is on `main` before starting.
4. **Branch** from `main`: `git checkout -b issue-N-short-description main`
5. **Implement** the code and tests listed in the acceptance criteria.
6. **Validate** before committing (see check commands below).
7. **Commit** with conventional commits: `feat:`, `fix:`, `test:`, `refactor:`,
   `docs:`, `chore:`
8. **Open a PR** referencing `Closes #N` in the body.

## Check Commands

Run all of these before opening a PR. All must pass.

```bash
# Type checking
npx tsc --noEmit

# Unit tests
npx vitest run

# Linting
npx eslint src/ tests/

# Build (if src/injected/ code exists)
npm run build
```

If `package.json` doesn't exist yet (you're working on issue #1), these commands
don't apply — just make sure tsc, vitest, and eslint are configured correctly.

## Code Style (Quick Reference)

Full rules in `CONVENTIONS.md`. Key points:

- **TypeScript strict mode, ESM, ESNext target**
- **Named exports only** (no default exports)
- **`.js` extensions in import paths** (required for ESM even with `.ts` sources)
- **camelCase** files, **PascalCase** types, **UPPER_SNAKE** compile-time constants
- **`async`/`await`** in Node.js code; **`.then()` chains** in Cypress test code
- **Typed errors**, not bare strings — always include actionable context
- **JSDoc on public API functions**
- **Pin exact dependency versions** (no `^` or `~`)
- **Conventional commits**: `feat:`, `fix:`, `test:`, etc.

## Ported Code Rules (src/injected/)

Code in `src/injected/` is ported from Playwright. Special rules apply:

- Keep original Apache 2.0 copyright headers; add ours below
- Only remove what's documented in `docs/ARIA_SNAPSHOT_PORT.md`
- Mark changes with `// MODIFIED: reason`
- Mark removals with `// REMOVED: functionName — reason`
- Do NOT reformat to match project style (preserves diff-ability with upstream)

## Tech Stack

| Component       | Tool                    |
|----------------|-------------------------|
| Language        | TypeScript (strict, ESM) |
| Target          | ESNext                  |
| Runtime         | Node.js ≥18             |
| CLI parsing     | minimist + zod          |
| IPC             | Unix domain sockets     |
| Wire format     | Newline-delimited JSON  |
| Browser bridge  | cy.task() polling loop  |
| Bundler (IIFE)  | esbuild                 |
| Test framework  | Vitest                  |
| Browser DOM tests| happy-dom              |
| Linting         | ESLint 9 (flat config)  |
| Peer dependency | Cypress ≥12             |

## Key Architecture Decisions

These are settled. Don't revisit them:

- **cy.task() polling loop** is the only viable bridge between the daemon and
  Cypress. Cypress cannot accept out-of-band commands. The driver spec polls
  `cy.task('getCommand')` in a loop.
- **Unix domain sockets** for IPC (not HTTP, not stdio). Matches Playwright's
  daemon pattern.
- **IIFE injection** for aria snapshot code. Built with esbuild, injected via
  `cy.window().then(win => win.eval(IIFE_STRING))`.
- **No Cypress plugin architecture** — we use Module API (`cypress.run()`) to
  launch Cypress with a generated config, plugin, and spec.
- **Minimist + zod** for CLI parsing — minimist handles the flags, zod validates
  the parsed result.

## Where Decisions Are Documented

| Question                          | Read this                    |
|----------------------------------|------------------------------|
| How does the system work?         | `ARCHITECTURE.md`            |
| What commands exist?              | `docs/COMMANDS.md`           |
| How should I write code?          | `CONVENTIONS.md`             |
| What's in package.json?           | `docs/PACKAGE_SPEC.md`       |
| What tests should I write?        | `docs/TEST_PLAN.md`          |
| What Playwright code to port?     | `docs/ARIA_SNAPSHOT_PORT.md` |
| What does each src/ dir do?       | `src/<dir>/README.md`        |

## Recovering Mid-Session

If you're picking up work that was started in a previous session:

1. Check `git status` and `git log --oneline -5` to see where things stand
2. Read the issue body for acceptance criteria
3. Check which criteria are already implemented (look at the code on the branch)
4. Continue from where the previous session left off

## PR Review Checklist

When reviewing a PR against an issue:

- [ ] Every acceptance criteria checkbox in the issue is addressed
- [ ] `npx tsc --noEmit` passes
- [ ] `npx vitest run` passes
- [ ] `npx eslint src/ tests/` passes
- [ ] Code follows `CONVENTIONS.md`
- [ ] Ported code follows ported code rules (if applicable)
- [ ] Commit messages use conventional format
- [ ] No unnecessary files (no `dist/`, no `node_modules/`, no temp files)
