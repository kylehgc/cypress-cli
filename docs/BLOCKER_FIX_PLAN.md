# Blocker Fix Plan — 1.0 Pre-Release

> Structured plan for resolving the three blockers and two cleanup items
> identified during the 1.0 validation runbook (`validation/LLM_VALIDATION_LOG.md`).
>
> **Rule:** After completing each numbered step, you MUST:
>
> 1. Re-read this plan (`docs/BLOCKER_FIX_PLAN.md`) in full
> 2. Re-read `validation/LLM_VALIDATION_LOG.md`
> 3. Append an entry to `validation/LLM_VALIDATION_LOG.md` with your
>    observations, problems found, and whether the fix resolved the issue
>
> Use the same log entry format established by the validation runbook.

---

## Overview

| #   | Task                                     | Severity | Est. Scope           |
| --- | ---------------------------------------- | -------- | -------------------- |
| 1   | Fix failed `open` returning stale output | Blocker  | daemon + client code |
| 2   | Update SKILL.md to match current CLI     | Blocker  | content rewrite      |
| 3   | Resolve REPL surface ambiguity           | Blocker  | code + docs          |
| 4   | Re-validate all three fixes live         | Gate     | live CLI testing     |
| 5   | Clean up stale doc claims                | Cleanup  | docs only            |

---

## Step 1: Fix Failed `open` Returning Stale Output

### Problem

When `open` fails to reach a target URL (network error, unreachable host),
the CLI still prints `### Page` metadata and a `### Snapshot` path from the
_previously active session_. This is misleading for LLM workflows because the
agent believes the new page loaded successfully.

**Validation reference:** Steps 2.5 and 4 in `validation/LLM_VALIDATION_LOG.md`.

### Root Cause Investigation

The `open` command flow is:

1. Client (`src/client/open.ts`) calls `openSession()`, which spawns or
   reuses a daemon and sends the `open` command
2. Daemon handler receives `open`, calls `cy.visit(url)` through the driver
   spec queue
3. On success, the driver spec takes a snapshot and returns page metadata +
   snapshot path
4. On failure, `cy.visit()` throws — but the daemon/client may still return
   the _previous_ session's page metadata and snapshot rather than a clean
   error

### What to Fix

Trace the failure path through these files in order:

1. **`src/cypress/driverSpec.ts`** — Find where `cy.visit()` is called for
   the `open` command. Check what happens when it fails. Does the error
   propagate, or does the spec fall through to a snapshot of the current
   (stale) page?

2. **`src/daemon/handlers.ts`** — Find the `open` command handler. Check
   whether it distinguishes between a successful visit and a failed one.
   If it always attaches the current page metadata to the response, that's
   the bug.

3. **`src/daemon/session.ts`** — Check whether the session updates its
   stored URL/title on `open` before confirming the visit succeeded.

### Expected Fix

When `cy.visit()` fails:

- The response MUST include an error message (e.g., the Cypress error text)
- The response MUST NOT include page metadata or snapshot paths from a
  previous session
- The session's stored URL/title MUST NOT be updated to the failed target
- The session MUST remain alive (not crash) so the user can retry or issue
  other commands

### Acceptance Criteria

- [ ] `node bin/cypress-cli open https://httpstat.us/503` (or similar
      unreachable URL) returns a clear error without any `### Page` or
      `### Snapshot` section
- [ ] After the failed open, `node bin/cypress-cli snapshot` still works
      against the previously opened page (session stays alive)
- [ ] After the failed open, a subsequent
      `node bin/cypress-cli open <valid-url>` succeeds normally
- [ ] Existing `open` tests still pass (`npx vitest run`)
- [ ] New unit test covers the failed-open-returns-error case

### Log Entry

After completing this step, append a log entry:

```
### Fix 1 — Failed Open Stale Output — [YYYY-MM-DD HH:MM]

**Status:** Pass / Fail / Partial

**Observations:**
- [What was the root cause?]
- [What files were changed?]
- [Does the fix handle all failure modes: network error, 4xx, 5xx, timeout?]

**Problems Found:**
- [Any unexpected issues encountered during the fix]

**Verification:**
- [ ] Error-only output on failed open
- [ ] Session stays alive after failed open
- [ ] Subsequent valid open works
- [ ] npx vitest run passes
- [ ] npx tsc --noEmit passes
```

---

## Step 2: Update SKILL.md to Match Current CLI

### Problem

The packaged `skills/cypress-cli/SKILL.md` (installed by `cypress-cli install
--skills`) is stale:

1. **Wrong output format** — Documents `Snapshot → .cypress-cli/...` but CLI
   emits `[Snapshot](.cypress-cli/...)` (markdown link under `### Snapshot`)
2. **Missing commands** — Does not document: `cookie-set`, `cookie-get`,
   `cookie-delete`, `cookie-list`, `cookie-clear`, `localstorage-set`,
   `localstorage-get`, `localstorage-list`, `localstorage-delete`,
   `localstorage-clear`, `sessionstorage-set`, `sessionstorage-get`,
   `sessionstorage-list`, `sessionstorage-delete`, `sessionstorage-clear`,
   `state-save`, `state-load`, `console`, `eval`, `cyrun`, `run`
3. **Wrong example** — Shows `run-code "cy.get('#modal').should('be.visible')"`
   but `run-code` executes browser-side JavaScript (`window.eval`), not
   Cypress chain code. That's what `cyrun` does.

**Validation reference:** Step 6 in `validation/LLM_VALIDATION_LOG.md`.

### What to Fix

Edit `skills/cypress-cli/SKILL.md`:

1. **Update the output format section** to show the actual `### Page` /
   `### Snapshot` format with the markdown link syntax:

   ```
   ### Page
   - Page URL: https://example.com
   - Page Title: Example
   ### Snapshot
   [Snapshot](.cypress-cli/page-2026-04-10T19-22-42-679Z.yml)
   ```

2. **Add all missing commands** to the command table. Group them logically:
   - **Cookies:** `cookie-set`, `cookie-get`, `cookie-delete`,
     `cookie-list`, `cookie-clear`
   - **localStorage:** `localstorage-set`, `localstorage-get`,
     `localstorage-list`, `localstorage-delete`, `localstorage-clear`
   - **sessionStorage:** `sessionstorage-set`, `sessionstorage-get`,
     `sessionstorage-list`, `sessionstorage-delete`, `sessionstorage-clear`
   - **State:** `state-save`, `state-load`
   - **DevTools:** `console`
   - **Execution:** `eval`, `cyrun`, `run`

3. **Fix the `run-code` example** — Replace the Cypress-chain example with
   a browser-side JavaScript example:

   ```
   cypress-cli run-code "document.querySelectorAll('input').length"
   ```

   Add a separate `cyrun` example for Cypress chain execution:

   ```
   cypress-cli cyrun "cy.url().then(u => u)"
   ```

4. **Remove any REPL references** if present (see Step 3 decision below).

5. **Cross-check against `docs/COMMANDS.md`** — The skill does not need to
   document every command in detail, but its command table should cover all
   64 commands and the descriptions should match what the commands actually
   do.

### Source of Truth

Use these files as the authoritative reference for what each command does:

- `docs/COMMANDS.md` — Full command schemas and Cypress API mappings
- `src/client/commands.ts` — Command definitions with descriptions
- `validation/LLM_VALIDATION_LOG.md` — Observed real behavior during validation

### Acceptance Criteria

- [ ] Output format example matches actual CLI output
- [ ] All 64 commands are represented in the skill (at least by category
      if not individually)
- [ ] `run-code` example uses browser-side JS, not Cypress chain code
- [ ] `cyrun` is documented with a Cypress chain example
- [ ] No references to REPL (unless Step 3 decides to expose it)
- [ ] `node bin/cypress-cli install --skills` installs the updated file
- [ ] The installed SKILL.md matches the source in `skills/cypress-cli/`

### Log Entry

After completing this step, append a log entry:

```
### Fix 2 — SKILL.md Update — [YYYY-MM-DD HH:MM]

**Status:** Pass / Fail / Partial

**Observations:**
- [What sections were updated?]
- [How many commands were added?]
- [Were any other inaccuracies found during the update?]

**Problems Found:**
- [Any issues with install --skills or file placement]

**Verification:**
- [ ] Output format matches CLI
- [ ] All 64 commands represented
- [ ] run-code example is browser-side JS
- [ ] cyrun documented with Cypress chain example
- [ ] install --skills works correctly
```

---

## Step 3: Resolve REPL Surface Ambiguity

### Problem

`src/client/repl.ts` contains a fully implemented `startRepl()` function,
but it is not registered in `src/client/commands.ts` or dispatched in
`src/client/cli.ts`. Running `node bin/cypress-cli repl` returns
`Error: Unknown command "repl"`.

Meanwhile, these docs still reference REPL as part of the product surface:

- `docs/READINESS_ASSESSMENT.md` — Claims REPL mode is "complete"
- `docs/LLM_VALIDATION_RUNBOOK.md` — Step 3.11 expects to test it

The README was already fixed inline during validation (REPL section removed).

**Validation reference:** Step 3.11 in `validation/LLM_VALIDATION_LOG.md`.

### Decision: Expose REPL as a public command

The REPL implementation in `src/client/repl.ts` is fully functional — it
has a readline loop, command parsing with quoting support, session reuse,
and clean exit handling. It was built as part of the original CLI client
PR but was never wired into the dispatch path. The code has been maintained
across subsequent PRs (including `fix: route local commands in repl`).

The fix is small: register the command and add a dispatch case.

### What to Fix

1. **`src/client/commands.ts`** — Register `repl` as a command:
   - Category: `core`
   - Description: something like `Start interactive REPL mode`
   - Schema: no required args (session and json are global flags)
   - This will increment `allCommands.length` and `commandRegistry.size`
     — update the count expectations in
     `tests/unit/client/commands.test.ts` accordingly

2. **`src/client/cli.ts`** — Add dispatch before the daemon send path:

   ```typescript
   if (parsedCommand.command === 'repl') {
   	await startRepl({ session: flags.session, json: flags.json });
   	return { exitCode: EXIT_SUCCESS, output: '' };
   }
   ```

   Import `startRepl` from `./repl.js`.

3. **`skills/cypress-cli/SKILL.md`** — Document REPL usage in the command
   table and add a brief workflow example (handled in Step 2).

4. **Tests** — The command registration test in
   `tests/unit/client/commands.test.ts` checks `allCommands.length` and
   `commandRegistry.size`. Update both counts (+1 each). Add a test that
   `repl` is in the registry.

### Acceptance Criteria

- [ ] `node bin/cypress-cli repl` enters interactive mode with a
      `cypress-cli> ` prompt
- [ ] Commands typed in REPL (e.g. `snapshot`, `status`) execute and
      return output
- [ ] `exit` or Ctrl+D exits cleanly
- [ ] `node bin/cypress-cli --help` lists `repl` under core commands
- [ ] Unit test for REPL command registration exists
- [ ] `allCommands.length` and `commandRegistry.size` test expectations
      updated
- [ ] SKILL.md documents REPL usage (done in Step 2)

### Log Entry

After completing this step, append a log entry:

```
### Fix 3 — REPL Wired Up — [YYYY-MM-DD HH:MM]

**Status:** Pass / Fail / Partial

**Observations:**
- [What files were changed]
- [Does it work interactively?]
- [What are the new command/registry counts?]

**Problems Found:**
- [Any unexpected issues]

**Verification:**
- [ ] `node bin/cypress-cli repl` enters interactive mode
- [ ] Commands execute in REPL
- [ ] exit/Ctrl+D works
- [ ] --help lists repl
- [ ] Command count tests updated and passing
- [ ] npx vitest run passes
- [ ] npx tsc --noEmit passes
```

---

## Step 4: Re-Validate All Three Fixes Live

### Purpose

Steps 1–3 are code/doc changes. This step confirms they actually work
against a live browser, not just in tests. **Do not skip this.**

### Procedure

```bash
# 1. Build
npm run build

# 2. Run full check suite
npx tsc --noEmit
npx vitest run
npx eslint src/ tests/

# 3. Validate Fix 1: Failed open returns clean error
node bin/cypress-cli open https://example.cypress.io/commands/actions
# Should succeed normally

node bin/cypress-cli open https://httpstat.us/503
# Should return error WITHOUT ### Page or ### Snapshot from previous session

node bin/cypress-cli snapshot
# Should still work (session alive from the first successful open)

node bin/cypress-cli open https://example.cypress.io/commands/actions
# Should succeed (recovery after failed open)

# 4. Validate Fix 2: SKILL.md is accurate
node bin/cypress-cli install --skills
cat .github/skills/cypress-cli/SKILL.md
# Visually confirm: output format matches, all commands present,
# run-code example is browser JS, cyrun example is Cypress chain

# 5. Validate Fix 3: REPL works
node bin/cypress-cli repl
#    Type: snapshot
#    Type: exit
#    Should work interactively and exit cleanly

# 6. Clean up
node bin/cypress-cli stop
```

### Acceptance Criteria

- [ ] `npm run build` succeeds
- [ ] `npx tsc --noEmit` passes
- [ ] `npx vitest run` — all tests pass, no regressions
- [ ] `npx eslint src/ tests/` — 0 errors, 0 warnings
- [ ] Fix 1 verified live: clean error on failed open, session survives
- [ ] Fix 2 verified live: installed SKILL.md matches current CLI
- [ ] Fix 3 verified live: REPL behavior matches chosen option

### Log Entry

After completing this step, append a log entry:

```
### Fix 4 — Re-Validation — [YYYY-MM-DD HH:MM]

**Status:** Pass / Fail / Partial

**Baseline:**
- Build: [pass/fail]
- Typecheck: [pass/fail]
- Tests: [count] passing, [count] failing
- Lint: [errors] errors, [warnings] warnings

**Fix 1 Re-Validation:**
- Failed open output: [clean error / still stale — describe]
- Session alive after failed open: [yes/no]
- Recovery open: [success/fail]

**Fix 2 Re-Validation:**
- install --skills: [success/fail]
- Output format correct: [yes/no]
- Command coverage complete: [yes/no]
- Examples accurate: [yes/no]

**Fix 3 Re-Validation:**
- REPL behavior: [matches chosen option / unexpected behavior — describe]

**Problems Found:**
- [Any issues found during re-validation]

**Verdict:**
- [ ] All three fixes confirmed working live
- [ ] Ready to proceed to Step 5 (doc cleanup)
```

---

## Step 5: Clean Up Stale Doc Claims

### Problem

`docs/READINESS_ASSESSMENT.md` claims certain issues are resolved when
validation proved they are not. This creates confusion for anyone reading
the docs to assess release readiness.

### What to Fix

1. **`docs/READINESS_ASSESSMENT.md`** — Find the "Nice-to-have (Resolved)"
   section that claims `tsconfig-paths` warnings were addressed. Update it
   to reflect reality:
   - The warnings still appear during `npx vitest run`
   - They are non-fatal and do not affect test results
   - Classify as "known noise, not blocking 1.0"

2. **`docs/READINESS_ASSESSMENT.md`** — Find ANY claims about
   `MaxListenersExceededWarning` being resolved. Update similarly:
   - The warning still appears during e2e navigation tests
   - It is non-fatal
   - Classify as "known noise, not blocking 1.0"

3. **`docs/READINESS_ASSESSMENT.md`** — Update the REPL status to match
   the decision from Step 3.

4. **`docs/LLM_VALIDATION_RUNBOOK.md`** — If Step 3 chose Option B (REPL
   removed from 1.0), update or annotate Step 3.11 to note that REPL
   validation is deferred.

5. **General sweep** — Search for any other stale claims across `docs/`
   and `validation/` that were flagged in the validation log. The log
   entries marked `→ Action: deferred` are the candidates. For each one,
   either fix the doc or add a note acknowledging the known limitation.

### Acceptance Criteria

- [ ] No doc claims `tsconfig-paths` warnings are resolved
- [ ] No doc claims `MaxListenersExceededWarning` is resolved
- [ ] REPL status in docs matches Step 3 decision
- [ ] Runbook Step 3.11 updated if REPL was deferred
- [ ] No other stale claims remain in docs that contradict validation findings

### Log Entry

After completing this step, append a log entry:

```
### Fix 5 — Doc Cleanup — [YYYY-MM-DD HH:MM]

**Status:** Pass / Fail / Partial

**Observations:**
- [What docs were updated]
- [How many stale claims were found and fixed]

**Problems Found:**
- [Any surprises]

**Final Verdict:**
- [ ] All 5 steps complete
- [ ] All check commands pass (build, typecheck, test, lint)
- [ ] All 3 blockers resolved and verified live
- [ ] Docs are consistent with actual product behavior
- [ ] Ready for 1.0 tag and release
```

---

## After All Steps

Once all five steps are complete and all log entries are appended, update
`validation/LLM_VALIDATION_RESULTS.md`:

1. Change the verdict from **NOT READY** to **READY** (or document why
   it's still not ready)
2. Move the three resolved blockers to a "Resolved" section
3. Update the summary table with final step counts
4. Add a final timestamp

Then proceed to the release steps in `docs/LAUNCH_PLAN.md` Phase 2.
