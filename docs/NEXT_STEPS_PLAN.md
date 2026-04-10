# Next Steps Plan — Tasks 1–3

> Step-by-step instructions for an LLM agent to complete three tasks in order.
> Each task is a separate branch and PR. Complete one before starting the next.
>
> **Status (2026-04-08):** All three tasks are complete.

## Rules

1. **Read `AGENTS.md` before starting any task.** It contains the project
   conventions, check commands, and PR workflow.
2. **Read `CONVENTIONS.md` before writing any code.** It has the style rules.
3. **All changes must be verified by manual use of the repo.** Unit tests
   passing is not enough — you must run the CLI against a real page and confirm
   the feature works as described in `docs/LIVE_VALIDATION.md`.
4. **After completing each task**, re-read `AGENTS.md` to confirm you haven't
   missed any checklist items before opening the PR.

---

## Task 1: Fix Flaky queueBridge Test ✅ Complete

**Branch:** `fix/flaky-queue-bridge-test`
**Closes:** n/a (no issue — this is a test reliability fix)

### Problem

`tests/unit/cypress/queueBridge.test.ts` — the test
`'start() listens on a socket and stop() cleans it up'` fails intermittently.

The test calls `bridge.stop()` and then immediately asserts
`fs.access(socketPath)` rejects. But `QueueBridge.stop()` in
`src/cypress/queueBridge.ts` closes the server and unlinks the socket file
asynchronously — the `fs.unlink` may not have completed by the time the
assertion runs.

Additionally, the `afterEach` hook also calls `bridge.stop()`, so `stop()` is
called twice for this test. The second call should be a no-op but confirm
this.

### Steps

1. Read `src/cypress/queueBridge.ts`, focusing on the `stop()` method.
   Understand the order of operations: server close → unlink socket.
2. Read `tests/unit/cypress/queueBridge.test.ts` in full.
3. Fix the race condition. The most likely fix is ensuring `stop()` properly
   `await`s the `fs.unlink()` call (or that the test waits for the file to
   actually be gone). Check whether `stop()` returns a promise that resolves
   only after the unlink completes. If not, fix `stop()` so it does.
4. Ensure calling `stop()` twice is safe (the `afterEach` will call it again).
5. Run `npx vitest run tests/unit/cypress/queueBridge.test.ts` — must pass.
6. Run the full check commands:
   ```bash
   npx tsc --noEmit
   npx vitest run
   npx eslint src/ tests/
   npm run build
   ```
7. Commit: `fix: await socket unlink in QueueBridge.stop() to fix flaky test`

### Verification

Run the specific test 10 times in a row to confirm it's no longer flaky:

```bash
for i in {1..10}; do npx vitest run tests/unit/cypress/queueBridge.test.ts || break; done
```

---

## Task 2: Implement `run` Command (Issue #81) ✅ Complete

**Branch:** `issue-81-run-command`
**Closes:** #81

### Context

The `run` command closes the generate-then-execute loop: an LLM exports a
`.cy.ts` test file via the `export` command, then uses `run` to execute it and
see results.

Read the full issue body at: https://github.com/kylehgc/cypress-cli/issues/81

### Design

- `cypress-cli run <file> [--browser chrome|electron] [--headed]`
- Launches a **separate** `cypress.run()` invocation (not the REPL session)
- Uses standard `testIsolation: true` (normal Cypress test behavior)
- Returns structured results: pass/fail, failure messages, duration
- Does NOT affect the active REPL session

### Steps

1. **Read existing patterns:**
   - `src/client/commands.ts` — how commands are declared with `declareCommand()`
     and registered in `allCommands` + `buildRegistry()`.
   - `src/cypress/launcher.ts` — has `launchCypressRun()` which uses
     `cypress.default.run()`. The `run` command needs a similar but simpler
     invocation that just runs a spec file normally without the REPL bridge.
   - `src/daemon/handlers.ts` — how daemon-local commands are handled.
   - `src/codegen/codegen.ts` and `src/codegen/templateEngine.ts` — understand
     the export flow so `run` complements it.
   - `docs/COMMANDS.md` — for the protocol schema pattern.

2. **Declare the command schema** in `src/client/commands.ts`:

   ```typescript
   export const run = declareCommand({
   	name: 'run',
   	category: 'execution',
   	description: 'Run a Cypress test file and report results',
   	args: z.object({
   		file: z.string().describe('Path to the test file to run'),
   	}),
   	options: z.object({
   		browser: z
   			.enum(['chrome', 'electron'])
   			.optional()
   			.describe('Browser to use (default: electron)'),
   		headed: z
   			.boolean()
   			.optional()
   			.describe('Run in headed mode (default: false)'),
   	}),
   });
   ```

3. **Add to `allCommands` and `buildRegistry()`.**
   Update the command count test expectations in
   `tests/unit/client/commands.test.ts` (currently 63 commands / 67 registry).

4. **Implement the daemon handler** — this command is handled in the daemon
   (not forwarded to the Cypress REPL). The handler should:
   - Validate the file exists and has a `.cy.ts` or `.cy.js` extension.
   - Dynamically import `cypress` and call `cypress.default.run({ spec, browser, headed })`.
   - Map the Cypress `CypressCommandLine.CypressRunResult` to a structured
     response: `{ success, totalTests, totalPassed, totalFailed, failures[], duration }`.
   - Return the result as the command response.
   - Do NOT touch the active REPL session.

5. **Wire the handler** in `src/daemon/daemon.ts` — add a case for the `run`
   command in the command dispatch. This should call the handler directly rather
   than enqueuing it in the Cypress command queue.

6. **Wire the CLI command** in `src/client/cli.ts` — ensure `run` is a
   top-level CLI subcommand (not a REPL-session command). The user invokes it
   as `cypress-cli run login.cy.ts`.

7. **Write unit tests:**
   - `tests/unit/client/commands.test.ts` — schema validation for the `run` command.
   - `tests/unit/daemon/` — handler test that mocks `cypress.default.run()`.
   - Test both success and failure result mapping.

8. **Update docs/COMMANDS.md** with the new command entry.

9. **Run all check commands:**

   ```bash
   npx tsc --noEmit
   npx vitest run
   npx eslint src/ tests/
   npm run build
   ```

10. **Commit:** `feat: add run command for executing generated test files (closes #81)`

### Verification

```bash
# 1. Open a session
node bin/cypress-cli open https://example.cypress.io/commands/actions

# 2. Do some actions
node bin/cypress-cli click e5
node bin/cypress-cli type e40 'test@example.com'

# 3. Export a test file
node bin/cypress-cli export --file test-actions.cy.ts

# 4. Run the exported test
node bin/cypress-cli run test-actions.cy.ts

# 5. Confirm structured output: success/fail, test count, duration
# 6. Confirm the REPL session is still active
node bin/cypress-cli snapshot

# 7. Clean up
node bin/cypress-cli stop
```

---

## Task 3: CI/CD Pipeline (Issue #15) ✅ Complete

**Branch:** `issue-15-ci-cd`
**Closes:** #15

### Context

Read the full issue at: https://github.com/kylehgc/cypress-cli/issues/15

No `.github/workflows/` directory exists yet. A previous WIP PR (#38) was
closed without merging — do not reuse it; start fresh.

### Acceptance Criteria (from issue)

- [ ] `.github/workflows/ci.yml` — lint, typecheck, unit tests, integration
      tests on push/PR (Node 20, ubuntu-latest)
- [ ] `.github/workflows/e2e.yml` — e2e tests on push to main (needs Cypress
      binary, longer timeout)
- [ ] `package.json` `files` field configured for minimal publish
      (`dist/`, `bin/`, `LICENSE`, `README`)
- [ ] `npm pack --dry-run` produces clean tarball under 500KB
- [ ] `prepublishOnly` script: lint + typecheck + test + build
- [ ] `.npmignore` or `files` whitelist excludes tests, docs, temp files
- [ ] Renovate or Dependabot config for dependency updates

### Steps

1. **Read `docs/PACKAGE_SPEC.md`** for the build pipeline and package.json
   specification.

2. **Create `.github/workflows/ci.yml`:**

   ```yaml
   name: CI
   on:
     push:
       branches: [main]
     pull_request:
       branches: [main]
   jobs:
     check:
       runs-on: ubuntu-latest
       strategy:
         matrix:
           node-version: [20]
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: ${{ matrix.node-version }}
             cache: npm
         - run: npm ci
         - run: npx tsc --noEmit
         - run: npx eslint src/ tests/
         - run: npx vitest run --project unit
         - run: npx vitest run --project integration
   ```

3. **Create `.github/workflows/e2e.yml`:**

   ```yaml
   name: E2E
   on:
     push:
       branches: [main]
   jobs:
     e2e:
       runs-on: ubuntu-latest
       timeout-minutes: 20
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 20
             cache: npm
         - run: npm ci
         - run: npm run build
         - run: npx vitest run --project e2e
   ```

4. **Update `package.json`:**
   - Add `"files": ["dist/", "bin/", "LICENSE", "README.md"]`
   - Add `"prepublishOnly": "npm run lint && npm run typecheck && npm test && npm run build"`
   - Verify existing script names match (`lint`, `typecheck`, `test`, `build`).

5. **Create `.github/dependabot.yml`:**

   ```yaml
   version: 2
   updates:
     - package-ecosystem: npm
       directory: /
       schedule:
         interval: weekly
     - package-ecosystem: github-actions
       directory: /
       schedule:
         interval: weekly
   ```

6. **Verify tarball size:**

   ```bash
   npm run build
   npm pack --dry-run 2>&1 | tail -5
   # Must be under 500KB and only contain dist/, bin/, LICENSE, README.md
   ```

7. **Run all check commands:**

   ```bash
   npx tsc --noEmit
   npx vitest run
   npx eslint src/ tests/
   npm run build
   ```

8. **Commit:** `chore: add CI/CD pipeline and release config (closes #15)`

### Verification

```bash
# Verify the files field is correct
npm pack --dry-run 2>&1

# Confirm only dist/, bin/, LICENSE, README.md are included
# Confirm tarball size is under 500KB

# Verify CI workflow syntax is valid
# (If act is installed: act -n to dry-run GitHub Actions locally)
# Otherwise, push the branch and check the Actions tab on GitHub

# Verify the prepublishOnly script works:
npm run prepublishOnly
```

---

## After Every Task

After completing each task above, before committing or opening a PR:

1. **Re-read `AGENTS.md`** in full — confirm every item on the PR Review
   Checklist is satisfied.
2. **Run all four check commands** (typecheck, test, lint, build) — all must
   pass with zero errors.
3. **Perform live validation** as described in `docs/LIVE_VALIDATION.md` and
   the Verification section of each task above. Do not skip this.
4. **Manual use of the repo is required.** Passing tests are necessary but not
   sufficient. You must confirm the feature works by actually running the CLI.
