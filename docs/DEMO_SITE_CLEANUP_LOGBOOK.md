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
- 3.2: Rewrote `storage-state.md` to reflect all 17 implemented storage commands (state-save/load, cookie-*, localstorage-*, sessionstorage-*).
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
