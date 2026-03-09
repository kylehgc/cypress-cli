# Agent Instructions

> Read this file first in every session. It tells you what this project is, how
> to work in it, and where to find everything.

## What This Project Is

A CLI tool that gives LLMs REPL-like access to a live web page through real
Cypress commands, using Playwright's aria snapshot for DOM representation.

**Not a Cypress plugin.** Not a test runner. It's a tool-use interface: the LLM
sends a command → the CLI executes it as a real Cypress command in a live
browser → the result (aria snapshot) comes back.

**Comparison target:** Our feature-parity target is
[`playwright-cli`](https://github.com/microsoft/playwright-cli) (the CLI +
SKILLS tool for coding agents), **not** `@playwright/mcp` (which is a separate
MCP server). See `docs/ROADMAP.md` for the detailed comparison and known
limitations.

## Repository Layout

```
├── ARCHITECTURE.md          ← System design, data flow, component diagram
├── CONVENTIONS.md           ← Code style, naming, error handling, async patterns
├── AGENTS.md                ← You are here
├── docs/
│   ├── ARIA_SNAPSHOT_PORT.md ← Line-by-line keep/cut plan for porting Playwright code
│   ├── COMMANDS.md           ← All CLI commands, zod schemas, Cypress API mappings
│   ├── LIVE_VALIDATION.md    ← How to validate usability changes with real CLI usage
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
6. **Validate** before committing — run all check commands below **and** live
   validation. Both are required.
7. **Commit** with conventional commits: `feat:`, `fix:`, `test:`, `refactor:`,
   `docs:`, `chore:`
8. **Open a PR** referencing `Closes #N` in the body.

## Check Commands

Run **all** of these before opening a PR. All must pass. Do not skip any step.

```bash
# 1. Type checking
npx tsc --noEmit

# 2. Unit tests
npx vitest run

# 3. Linting
npx eslint src/ tests/

# 4. Build
npm run build
```

## Live Validation

**This is not optional.** After the check commands above pass, you must open
the CLI against a real web page and manually confirm your changes work.
Unit tests mock boundaries that hide real-world failures. Do not commit or
open a PR until you have completed this.

See `docs/LIVE_VALIDATION.md` for the full procedure. Quick version:

```bash
# 5. Open a session (build must have succeeded in step 4)
node bin/cypress-cli open https://example.cypress.io/commands/actions

# 6. Exercise your feature against the live page.
#    Use commands relevant to your change. Examples:
node bin/cypress-cli type e40 'test@test.com'
node bin/cypress-cli assert e40 have.value 'test@test.com'
node bin/cypress-cli snapshot

# 7. Clean up
node bin/cypress-cli stop
```

Every command should return output in this format:

```
### Page
- Page URL: https://example.cypress.io/commands/actions
- Page Title: Cypress.io: Kitchen Sink
### Snapshot
[Snapshot](.cypress-cli/page-2026-03-07T19-22-42-679Z.yml)
```

If any command fails or returns unexpected output, fix the issue before
proceeding. Do not assume a passing test suite means the feature works.

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

## Where Decisions Are Documented

| Question                           | Read this                     |
| ---------------------------------- | ----------------------------- |
| How does the system work?          | `ARCHITECTURE.md`             |
| What commands exist?               | `docs/COMMANDS.md`            |
| How should I write code?           | `CONVENTIONS.md`              |
| Ported code rules (src/injected/)? | `CONVENTIONS.md` §Ported Code |
| Tech stack and architecture ADRs?  | `ARCHITECTURE.md` §Tech Stack |
| What's in package.json?            | `docs/PACKAGE_SPEC.md`        |
| What tests should I write?         | `docs/TEST_PLAN.md`           |
| What Playwright code to port?      | `docs/ARIA_SNAPSHOT_PORT.md`  |
| How to validate usability changes? | `docs/LIVE_VALIDATION.md`     |
| What does each src/ dir do?        | `src/<dir>/README.md`         |

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
- [ ] Live validation performed (see Live Validation section above)
