# Browser Demo Site — Cleanup & Hardening Logbook

> **Linked runbook:** [DEMO_SITE_CLEANUP_RUNBOOK.md](DEMO_SITE_CLEANUP_RUNBOOK.md)
>
> **Instructions:** After completing (or failing) each runbook step, add
> an entry below. This is **part of the task**, not optional.
>
> **ABORT RULE:** If you cannot write a logbook entry for a completed
> step — for any reason (file locked, write failed, forgot, skipped) —
> **you must stop all work immediately.** Do not proceed to the next
> step. Do not attempt to batch entries later. Each entry must be
> written before starting the next step. Work without a logbook entry
> is invisible, unrecoverable, and not considered done.
>
> The logbook is how progress is tracked across session boundaries and
> how future agents recover context. If a session ends mid-task, the
> next agent reads this file to know exactly where to resume.
>
> **What to record:**
>
> - Date/time (with minutes) and step number
> - Outcome: PASS, FAIL, PARTIAL, or BLOCKED
> - Files created, modified, or deleted
> - Errors encountered and how they were resolved
> - Decisions made that deviate from the runbook
> - Anything that surprised you or contradicted expectations
>
> **Format:**
>
> ```
> ### YYYY-MM-DD HH:MM — Step N.M: Short Title [OUTCOME]
> [details, decisions, errors encountered, files changed]
> ```

---

<!-- Logbook entries go below this line -->

### 2026-04-12 10:00 — Step 1: Fix CypressLite.createConfig() — Detect Browser/Platform/Arch [PASS]

**Files changed:** `src/driver/index.ts`

**What was done:**

- Added `detectBrowser()` method: checks `navigator.userAgentData.brands` first (Edge, Chrome, Chromium), falls back to UA string parsing (Firefox, Edge, Safari, Chrome), defaults to `unknown`.
- Added `detectPlatform()` method: checks `navigator.userAgentData?.platform`, falls back to `navigator.platform`, keyword matching (mac/darwin → darwin, win → win32, linux/x11/cros/android → linux), defaults to `linux`.
- Added `detectArch()` method: checks `navigator.userAgentData?.architecture`, falls back to UA keywords (arm64/aarch64 → arm64, x86_64/win64/x64/amd64 → x64), defaults to `unknown`.
- Updated `createConfig()` to call all three detection methods instead of hard-coded values.

**Verification:**

- `npm run build:driver` → PASS (720 KB)
- No type errors.

**Decisions:** Used `'unknown'` (not `'chromium'`) as default browser family for genuinely unknown browsers, since lying about the browser family is the original bug. Safari mapped to `family: 'webkit'` matching Cypress conventions.

### 2026-04-12 10:10 — Step 2: Fix Shim Bugs (errors.ts, js-cookie.ts, network.ts) [PASS]

**Files changed:** `src/driver/shims/errors.ts`, `src/driver/shims/network.ts`

**What was done:**

- 2.1: Wrapped `JSON.stringify(args)` in `errByPath()` with try/catch, falling back to `' — [unserializable args]'` on circular refs.
- 2.2: SKIPPED — `js-cookie.ts` `get()` already handles `=` in cookie values correctly. The code uses rest destructuring `const [k, ...v] = c.trim().split('=')` and then `v.join('=')`, which preserves the full value. No change needed.
- 2.3: Fixed typo `shimg` → `shim` in `network.ts` line 1.

**Verification:**

- `npm run build:driver` → PASS (720 KB)

**Decisions:** Left `js-cookie.ts` unchanged because the existing destructuring pattern already handles the described bug correctly. The runbook description didn't match the actual code.

### 2026-04-12 10:20 — Step 3: Fix Stale Docs and Skill References [PASS]

**Files changed:** `.claude/skills/playwright-cli/SKILL.md`, `.github/skills/cypress-cli/references/storage-state.md`, `ARCHITECTURE.md`, `docs/READINESS_ASSESSMENT.md`

**What was done:**

- 3.1: Fixed corrupted YAML frontmatter in `.claude/skills/playwright-cli/SKILL.md` — replaced `Í›---` with `---`.
- 3.2: Rewrote `storage-state.md` to reflect all 17 implemented storage commands (state-save/load, cookie-_, localstorage-_, sessionstorage-\*).
- 3.3: Updated ARCHITECTURE.md command count from 64 to 65 (two occurrences).
- 3.4: Removed duplicate conflicting "Total: 1009" line from READINESS_ASSESSMENT.md, keeping "Total: 1012".

**Verification:**

- `npx tsc --noEmit` → PASS
- `npx eslint src/ tests/` → PASS

**Decisions:** Used 65 as the command count based on direct count of entries in `allCommands` array in `src/client/commands.ts`. Test count kept at 1012 (will re-verify with vitest run in final check).

### 2026-04-12 10:25 — Step 4: Pin Playwright Version [PASS]

**Files changed:** `package.json`, `package-lock.json`

**What was done:**

- Changed `"playwright": "^1.59.1"` to `"playwright": "1.59.1"` in `package.json`.
- Ran `npm install` to regenerate lockfile.

**Verification:**

- `grep '"playwright"' package.json` → `"playwright": "1.59.1"` ✓

**Decisions:** None — straightforward pin per CONVENTIONS.md.

### 2026-04-12 10:35 — Step 5: Add handleRunTest Temp-Dir Tests [PASS]

**Files changed:** `tests/unit/daemon/handlers.test.ts`

**What was done:**

- 5.1: Added test "passes project tempDir (not spec dir) to cypress.run" — verifies `project:` arg is a temp dir, not the spec file's directory, and that no `spec:` arg is passed.
- 5.2: Added test "derives baseUrl from session URL origin" — creates a Session with `url: 'https://example.com/page/sub?q=1'`, verifies generated `cypress.config.js` contains `https://example.com`. Reads the config inside the mock before cleanup.
- 5.3: Added test "cleans up temp dir after successful run" — verifies `fs.access(capturedProject)` rejects after `handleRunTest` returns.

**Verification:**

- `npx vitest run tests/unit/daemon/handlers.test.ts` → 12 tests passed (12/12)
- 3 new tests + 1 existing infrastructure failure test that was already there = 4 new assertions on temp-dir behavior.

**Decisions:** Used `mockImplementation` to capture the project path and inspect generated files inside the mock (before the `finally` cleanup). This follows the runbook suggestion.

### 2026-04-12 10:50 — Step 6: Convert Demo Validation to Cypress E2E Specs [PASS]

**Files created:** `demo/cypress.config.js`, `demo/cypress/e2e/driver-boot.cy.js`, `demo/cypress/e2e/demo-app.cy.js`, `demo/cypress/e2e/toy-app.cy.js`
**Files changed:** `package.json`

**What was done:**

- 6.1: Created `demo/cypress.config.js` with ESM syntax (project uses `"type": "module"`), baseUrl `http://localhost:5555`, specPattern `cypress/e2e/**/*.cy.{js,ts}`, video/screenshots disabled, no support file.
- 6.2: Created `driver-boot.cy.js` — 3 tests: MVP pass check, extended tests pass check, no fatal errors check. Uses 30s timeout for `#log`.
- 6.3: Created `demo-app.cy.js` — 1 test: loads demo page, checks `h1` exists.
- 6.4: Created `toy-app.cy.js` — 3 tests: actionability test page (hidden button), todo app, form page.
- 6.5: Added `test:demo` script to package.json using background server approach.

**Errors encountered and resolved:**

1. Config used CommonJS (`require`/`module.exports`) — failed because project is ESM. Fixed with `import`/`export default`.
2. `specPattern: 'demo/cypress/e2e/...'` doubled up with project dir. Fixed to `'cypress/e2e/...'` (relative to project).

**Verification:**

- `npx cypress run --project demo --browser chrome` → 7 tests passed (7/7) across 3 spec files.
  - demo-app.cy.js: 1 passing (252ms)
  - driver-boot.cy.js: 3 passing (7s)
  - toy-app.cy.js: 3 passing (266ms)

**Decisions:** Served from project root (`.`) at port 5555 so `/demo/...` paths resolve correctly for both the demo app and the driver-test.html (which uses `../dist/cypress-driver.js` relative path).

### 2026-04-12 11:00 — Step 7: Remove Playwright Dependency [PASS]

**Files deleted:** `demo/cross-browser-test.mjs`, `demo/CROSS_VALIDATION_RESULTS.md`
**Files changed:** `package.json`, `package-lock.json`

**What was done:**

- 7.1: Deleted `demo/cross-browser-test.mjs` and `demo/CROSS_VALIDATION_RESULTS.md`.
- 7.2: Removed `"playwright": "1.59.1"` from devDependencies in `package.json`.
- 7.3: Checked for doc references — `demo/README.md` had no Playwright mentions. `docs/DRIVER_POST_MVP_RUNBOOK.md` Step 3 mentions "Cross-Browser Validation" but uses manual browser testing, not Playwright. `docs/DRIVER_POST_MVP_LOGBOOK.md` has a historical entry about Playwright usage — left as-is since it's a historical log.
- 7.4: Ran `npm install` to regenerate lockfile.

**Verification:**

- `npx tsc --noEmit` → PASS
- `npx eslint src/ tests/` → PASS
- `npm run build` → PASS

**Decisions:** Left historical logbook entries (DRIVER_POST_MVP_LOGBOOK.md) referencing Playwright unchanged since they document what was done at that time.
