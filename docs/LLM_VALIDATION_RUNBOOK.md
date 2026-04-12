# LLM Validation Runbook — Step-by-Step Instructions

> **Audience:** An LLM agent executing the 1.0 launch validation (§1.1 of
> `docs/LAUNCH_PLAN.md`, issue #73).
>
> **Rule:** After completing each numbered step, you MUST:
>
> 1. Re-read `docs/LAUNCH_PLAN.md` in full
> 2. Re-read `validation/LLM_VALIDATION_LOG.md` (the log you're maintaining)
> 3. Append an entry to the log with your observations, problems found, and
>    any suggested changes to the launch plan
>
> This is not optional. The log is the primary deliverable alongside the
> validation itself.

---

## Before You Start

### 0.1 Read all project documentation

Read every one of these files. Do not skim. Understand what this project is,
how it works, how commands flow, and what the existing validation found.

**Required reading (read in this order):**

1. `AGENTS.md` — project overview, repo layout, check commands, workflow
2. `CONVENTIONS.md` — code style, naming, error handling
3. `ARCHITECTURE.md` — system design, data flow, component diagram
4. `docs/COMMANDS.md` — all 65 public commands, schemas, Cypress API mappings
5. `docs/ROADMAP.md` — feature parity tracking, known limitations vs playwright-cli
6. `docs/CAPABILITY_MATRIX.md` — per-command feasibility classification
7. `docs/LIVE_VALIDATION.md` — how to validate, expected output format
8. `docs/LAUNCH_PLAN.md` — the plan you are executing (§1.1 specifically)
9. `validation/README.md` — existing scenario descriptions
10. `validation/FINDINGS.md` — previous validation results (4 sites, 73 steps)
11. `validation/scenarios/01-todomvc.md` — scenario 1 detail
12. `validation/scenarios/02-saucedemo.md` — scenario 2 detail
13. `validation/scenarios/03-the-internet.md` — scenario 3 detail
14. `validation/scenarios/04-realworld-conduit.md` — scenario 4 detail
15. `validation/examples/todomvc.cy.ts` — generated test from scenario 1
16. `validation/examples/saucedemo.cy.ts` — generated test from scenario 2
17. `validation/examples/the-internet.cy.ts` — generated test from scenario 3
18. `README.md` — the public-facing README
19. `skills/cypress-cli/SKILL.md` — the AI agent skill definition
20. `docs/PACKAGE_SPEC.md` — package.json structure, build config

After reading all files, proceed to Step 0.2.

### 0.2 Create the validation log

Create the file `validation/LLM_VALIDATION_LOG.md` with this initial content:

```markdown
# LLM Validation Log

> Running log maintained during the 1.0 validation runbook.
> Each entry is appended after completing a step from `docs/LLM_VALIDATION_RUNBOOK.md`.

## Format

Each entry follows this structure:

### Step N.N — [Step Title] — [YYYY-MM-DD HH:MM]

**Status:** Pass / Fail / Partial / Blocked

**Observations:**

- [What happened]

**Problems Found:**

- [Description] → [Severity: blocker / should-fix / nice-to-have] → [Action: filed #N / fixed inline / deferred]

**Launch Plan Notes:**

- [Any observations about `docs/LAUNCH_PLAN.md` — is anything missing, wrong, or needs updating?]

---

## Entries
```

### 0.3 Log your initial observations

Now re-read `docs/LAUNCH_PLAN.md` and `validation/LLM_VALIDATION_LOG.md`.

Append your first log entry:

```
### Step 0 — Documentation Review — [timestamp]

**Status:** Complete

**Observations:**
- [Summarize your understanding of the project]
- [Note any gaps, contradictions, or unclear areas in the docs]
- [Note the current state: how many commands, tests, what's already validated]

**Problems Found:**
- [Any issues spotted during doc review]

**Launch Plan Notes:**
- [Initial thoughts on the plan — does it miss anything?]
- [Is the timeline realistic given what you've read?]
```

---

## Step 1: Build and Verify Baseline

### 1.1 Build the project

```bash
npm run build
```

Confirm it succeeds with zero errors. If it fails, diagnose and fix before
proceeding — nothing else will work without a clean build.

### 1.2 Run the full test suite

```bash
npx vitest run
```

Record: total tests, pass count, fail count, test file count.

### 1.3 Run type checking and lint

```bash
npx tsc --noEmit
npx eslint src/ tests/
```

Both must pass with zero errors and zero warnings.

### 1.4 Log entry

Re-read `docs/LAUNCH_PLAN.md` and `validation/LLM_VALIDATION_LOG.md`.
Append a log entry for Step 1 with the test counts, any issues, and whether
the baseline matches what `docs/READINESS_ASSESSMENT.md` claims (1012 tests,
0 errors, 0 warnings).

---

## Step 2: Validate Existing Scenarios (Re-run)

The previous validation (`validation/FINDINGS.md`) was run when only 43
commands existed. The project now has 65 commands. Re-run the existing
scenarios to confirm they still work with the current codebase.

### 2.1 Scenario 1: TodoMVC

Read `validation/scenarios/01-todomvc.md`. Execute every step against the live
site. For each step:

- Run the command exactly as specified
- Verify the output matches expected format (`### Page` + `### Snapshot`)
- Read the snapshot file and confirm refs make sense
- If a step fails, note the exact error and whether it's a tool bug or site change

After all steps, run `export` and save the generated test.

Then run the exported test:

```bash
node bin/cypress-cli run <exported-file>
```

Record whether it passes.

### 2.2 Log entry

Re-read `docs/LAUNCH_PLAN.md` and `validation/LLM_VALIDATION_LOG.md`.
Append a log entry for Step 2.1 with per-step results.

### 2.3 Scenario 2: SauceDemo

Read `validation/scenarios/02-saucedemo.md`. Execute every step. Same procedure
as 2.1.

### 2.4 Log entry

Re-read both files. Append log entry for Step 2.3.

### 2.5 Scenario 3: The Internet

Read `validation/scenarios/03-the-internet.md`. Execute every step. Same
procedure. This is the broadest scenario (30 commands across many page types).

### 2.6 Log entry

Re-read both files. Append log entry for Step 2.5.

### 2.7 Scenario 4: RealWorld Conduit

Read `validation/scenarios/04-realworld-conduit.md`. Execute every step. Note
that the previous run found the backend API was down (530 errors). If still
down, note that and proceed — focus on the steps that don't require a live API.

### 2.8 Log entry

Re-read both files. Append log entry for Step 2.7.

---

## Step 3: Test NEW Commands Not Covered by Existing Scenarios

The previous validation (43 commands) did not cover commands added since then.
The following commands need explicit validation. Design and execute a mini-test
for each group against appropriate live sites.

### 3.1 Storage commands

Use `https://example.cypress.io/commands/actions` or any site that uses
localStorage/sessionStorage.

```bash
# Open session
node bin/cypress-cli open <url>

# localStorage
node bin/cypress-cli localstorage-set testKey testValue
node bin/cypress-cli localstorage-get testKey
node bin/cypress-cli localstorage-list
node bin/cypress-cli localstorage-delete testKey
node bin/cypress-cli localstorage-list  # confirm empty

# sessionStorage
node bin/cypress-cli sessionstorage-set sessKey sessValue
node bin/cypress-cli sessionstorage-get sessKey
node bin/cypress-cli sessionstorage-list
node bin/cypress-cli sessionstorage-delete sessKey
node bin/cypress-cli sessionstorage-clear

# State save/load
node bin/cypress-cli cookie-set myCook testVal
node bin/cypress-cli localstorage-set myKey myVal
node bin/cypress-cli state-save
# Navigate away, clear state
node bin/cypress-cli navigate https://example.com
node bin/cypress-cli cookie-clear
node bin/cypress-cli localstorage-clear
# Restore
node bin/cypress-cli state-load
node bin/cypress-cli cookie-get myCook
node bin/cypress-cli localstorage-get myKey
```

Verify each command returns expected output.

### 3.2 Log entry

Re-read both files. Append log entry for Step 3.1.

### 3.3 Console command

```bash
node bin/cypress-cli open https://example.cypress.io
node bin/cypress-cli run-code "console.log('hello from validation')"
node bin/cypress-cli console
```

Verify the console output includes the logged message.

### 3.4 Log entry

Re-read both files. Append log entry for Step 3.3.

### 3.5 Network commands

```bash
node bin/cypress-cli open https://jsonplaceholder.typicode.com
node bin/cypress-cli network
node bin/cypress-cli intercept '**/posts' --status 200 --body '[]'
node bin/cypress-cli intercept-list
node bin/cypress-cli navigate https://jsonplaceholder.typicode.com/posts
node bin/cypress-cli network
node bin/cypress-cli unintercept '**/posts'
node bin/cypress-cli intercept-list  # confirm empty
```

### 3.6 Log entry

Re-read both files. Append log entry for Step 3.5.

### 3.7 Execution commands (cyrun, run-code, eval)

```bash
node bin/cypress-cli open https://example.cypress.io/commands/actions
node bin/cypress-cli eval "document.title"
node bin/cypress-cli run-code "document.querySelectorAll('input').length"
node bin/cypress-cli cyrun "cy.url().then(u => u)"
```

Verify each returns a sensible result.

### 3.8 Log entry

Re-read both files. Append log entry for Step 3.7.

### 3.9 Run command (test execution)

Export from the current session and run it:

```bash
node bin/cypress-cli export --file /tmp/validation-test.cy.ts
node bin/cypress-cli run /tmp/validation-test.cy.ts
```

Verify the run command returns structured results (pass/fail, test count,
duration).

### 3.10 Log entry

Re-read both files. Append log entry for Step 3.9.

### 3.11 REPL mode

```bash
node bin/cypress-cli repl
```

Inside the REPL, run at least 5 commands:

```
> open https://example.cypress.io
> snapshot
> click e5
> history
> stop
```

Verify REPL input/output works, quoting is handled, and `stop` exits cleanly.

### 3.12 Log entry

Re-read both files. Append log entry for Step 3.11.

---

## Step 4: Error Recovery Validation

Test that the tool survives bad input gracefully. The LLM experience depends
heavily on error messages being actionable.

### 4.1 Bad ref

```bash
node bin/cypress-cli open https://example.cypress.io
node bin/cypress-cli click e99999
```

Verify: session stays alive, error message mentions the invalid ref, and a
subsequent `snapshot` command still works.

### 4.2 Invalid command arguments

```bash
node bin/cypress-cli assert  # missing required args
node bin/cypress-cli type    # missing ref and text
node bin/cypress-cli navigate  # missing url
```

Verify: each returns a clear error, not a crash.

### 4.3 Command after session stop

```bash
node bin/cypress-cli stop
node bin/cypress-cli snapshot
```

Verify: clear error message about no active session.

### 4.4 Double open

```bash
node bin/cypress-cli open https://example.cypress.io
node bin/cypress-cli open https://example.com
```

Verify: second open either reuses or cleanly replaces the session.

### 4.5 Log entry

Re-read both files. Append log entry for Step 4 (all sub-steps).

---

## Step 5: Export Quality Audit

### 5.1 Run a comprehensive session

Open a site with diverse interactions. Execute at least 15 commands covering:

- Navigation (`open`, `navigate`)
- Form interaction (`type`, `fill`, `clear`, `select`, `check`)
- Assertions (`assert`, `asserturl`, `asserttitle`)
- Wait patterns (`waitfor`)
- Screenshots (`screenshot`)

### 5.2 Export and review the generated test

```bash
node bin/cypress-cli export --file /tmp/comprehensive.cy.ts
```

Read the exported file. Check:

- [ ] Valid TypeScript syntax
- [ ] `describe()` and `it()` structure
- [ ] Correct Cypress commands (`.type()`, `.click()`, `.should()`, etc.)
- [ ] Selectors look reasonable (not overly fragile)
- [ ] No meta-commands leaked (no `snapshot`, `history`, `status` in output)
- [ ] `baseUrl` handling (if applicable)
- [ ] Imports and test boilerplate

### 5.3 Run the exported test

```bash
node bin/cypress-cli run /tmp/comprehensive.cy.ts
```

Record pass/fail. If it fails, diagnose whether it's a codegen issue or a
site timing issue.

### 5.4 Log entry

Re-read both files. Append log entry for Step 5.

---

## Step 6: SKILL File and Agent Discoverability

### 6.1 Test skill installation

```bash
# Clean slate
rm -rf .github/skills/cypress-cli

# Install
node bin/cypress-cli install --skills

# Verify
ls -la .github/skills/cypress-cli/
cat .github/skills/cypress-cli/SKILL.md
```

Verify the SKILL.md is installed correctly and contains accurate command docs.

### 6.2 Review SKILL.md accuracy

Compare `skills/cypress-cli/SKILL.md` against the actual command set in
`docs/COMMANDS.md`. Check:

- [ ] All 65 commands are listed or at least the most important ones
- [ ] Command syntax examples are accurate
- [ ] The "how to read snapshots" section matches actual output format
- [ ] No stale references to removed or renamed commands

### 6.3 Log entry

Re-read both files. Append log entry for Step 6.

---

## Step 7: README and Package Audit

### 7.1 README accuracy check

Read `README.md` and verify:

- [ ] Install instructions work (`npm install -g cypress-cli`)
- [ ] Quick start commands match actual behavior
- [ ] Command table is complete and accurate
- [ ] No broken links
- [ ] Version references are consistent

### 7.2 Package contents check

```bash
npm pack --dry-run
```

Verify the output includes: `dist/`, `bin/cypress-cli`, `skills/`, `README.md`,
`LICENSE`, `THIRD_PARTY_LICENSES`. Check nothing unexpected is included
(no `tests/`, no `node_modules/`, no `.github/`).

### 7.3 Log entry

Re-read both files. Append log entry for Step 7.

---

## Step 8: Final Assessment

### 8.1 Re-read everything

Read all of these one final time:

1. `docs/LAUNCH_PLAN.md`
2. `validation/LLM_VALIDATION_LOG.md` (your full log)
3. `validation/FINDINGS.md` (previous validation)
4. `docs/READINESS_ASSESSMENT.md`

### 8.2 Write the final results document

Create `validation/LLM_VALIDATION_RESULTS.md` with:

```markdown
# LLM Validation Results — 1.0 Gate

**Date:** [YYYY-MM-DD]
**Agent:** [Your model name]
**Codebase:** 65 commands, [N] tests

## Summary

| Category                   | Steps | Pass | Fail | Blocked |
| -------------------------- | ----- | ---- | ---- | ------- |
| Scenario re-runs (4 sites) |       |      |      |         |
| New command validation     |       |      |      |         |
| Error recovery             |       |      |      |         |
| Export quality             |       |      |      |         |
| Skill & package audit      |       |      |      |         |
| **Total**                  |       |      |      |         |

## Blockers Found

[List any issues that MUST be fixed before 1.0, or "None"]

## Should-Fix Issues

[List issues that should be fixed but aren't blockers]

## Launch Plan Observations

[Summarize all your notes about `docs/LAUNCH_PLAN.md` from the log entries.
Include suggested changes, missing items, timeline concerns, etc.]

## Verdict

**[READY / NOT READY] for 1.0 release.**

[Reasoning in 2-3 sentences]
```

### 8.3 Final log entry

Re-read both files. Append your final log entry with the verdict and a summary
of the full run.

### 8.4 Clean up

```bash
node bin/cypress-cli stop  # if session is still active
```

---

## Reminders

- **Re-read the launch plan and your log after EVERY step.** This is the whole
  point — the log is a living document of observations that feeds back into
  launch readiness.
- **Don't skip steps because "it probably works."** The previous validation
  found 0 failures across 73 steps but also found 2 workarounds and a dead
  backend. Real surprises only show up when you actually execute.
- **If you find a bug:** Fix it inline if it's small (< 20 lines). If it's
  larger, file a GitHub issue with reproduction steps and note it in your log
  as a blocker or should-fix.
- **If a site is down:** Note it in the log and substitute a different
  publicly accessible site that exercises similar commands.
- **Time yourself loosely.** Note how long each step group takes — this data
  is useful for estimating Phase 1 duration in the launch plan.
