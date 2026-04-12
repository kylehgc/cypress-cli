# Browser Demo Site — Cleanup & Hardening Runbook

> **Audience:** An LLM agent executing this as a single long-running task.
> You MUST write to [DEMO_SITE_CLEANUP_LOGBOOK.md](DEMO_SITE_CLEANUP_LOGBOOK.md)
> after every step completes or fails. This is part of the task, not optional.
>
> **ABORT RULE:** If you are unable to write a logbook entry for a step
> (e.g., the file cannot be opened, the write fails, or you skip the
> entry), **stop all work immediately**. Do not proceed to the next step.
> The logbook is the only way progress is tracked across session
> boundaries. Work without a logbook entry is invisible and
> unrecoverable.
>
> **Branch:** `feature/browser-demo-site` (branched from `main`,
> includes all work from the original `feat/demo-site` PR #136).
>
> **Goal:** Fix all review findings from the PR #136 code review,
> convert Playwright demo validation to Cypress e2e specs, and update
> stale documentation. Every step produces a commit.

---

## Current State (pre-cleanup)

| Check command              | Status | Detail                 |
| -------------------------- | ------ | ---------------------- |
| `npx tsc --noEmit`         | PASS   | 0 errors               |
| `npx vitest run`           | PASS   | 1,012 tests (52 files) |
| `npx eslint src/ tests/`   | PASS   | 0 problems             |
| `npm run build`            | PASS   |                        |
| `npm run build:driver`     | PASS   | 719 KB                 |
| `npm run typecheck:driver` | PASS   | 0 errors               |

### Known issues from PR review

1. Hard-coded `platform: 'darwin'`, `arch: 'arm64'`, `browser: chrome` in `CypressLite.createConfig()`
2. `JSON.stringify(args)` in `errByPath()` can throw on circular refs
3. `js-cookie.ts` `get()` truncates cookie values containing `=`
4. Corrupted YAML frontmatter in `.claude/skills/playwright-cli/SKILL.md`
5. Stale storage-state skill reference says commands are "not implemented"
6. Playwright dependency uses `^` range instead of pinned version
7. Typo `shimg` → `shim` in `network.ts`
8. `handleRunTest` temp-dir approach untested (no assertion on `project:` arg)
9. Command count inconsistencies in docs (64 vs 65)
10. Test count inconsistencies in docs (1009 vs 1012)
11. Demo validation uses Playwright; should use Cypress external runner

---

## Step 1: Fix `CypressLite.createConfig()` — Detect Browser/Platform/Arch

**Why:** Hard-coding `platform: 'darwin'`, `arch: 'arm64'`, and
`browser.name: 'chrome'` means the driver lies about its environment on
non-macOS-ARM-Chrome setups. Cypress uses these values for feature
detection (key modifiers, pointer events, UA-dependent logic).

### 1.1 Add `detectBrowser()` method

In `src/driver/index.ts`, replace the hard-coded browser config with a
method that detects the actual browser from `navigator.userAgentData`
(preferred, Chromium 90+) with fallback to `navigator.userAgent` parsing.

Detection order:

1. `navigator.userAgentData.brands` — check for Edge, Chrome, Chromium
2. UA string fallback — Firefox (`/Firefox\//`), Edge (`/Edg\//`),
   Safari (`/Safari\/.*Version\//`), Chrome (`/Chrome\//`)
3. Unknown fallback

### 1.2 Add `detectPlatform()` method

Return `'darwin' | 'win32' | 'linux'` by checking:

1. `navigator.userAgentData?.platform` (preferred)
2. `navigator.platform` fallback
3. Keyword matching: `mac/darwin` → darwin, `win` → win32, `linux/x11/cros/android` → linux
4. Default: `'linux'`

### 1.3 Add `detectArch()` method

Return architecture string by checking:

1. `navigator.userAgentData?.architecture` (preferred)
2. UA string keywords: `arm64/aarch64` → arm64, `x86_64/win64/x64/amd64` → x64
3. Default: `'unknown'`

### 1.4 Update `createConfig()` to use detection methods

```typescript
private createConfig() {
    const browser = this.detectBrowser();
    return {
        ...existingConfig,
        browser,
        platform: this.detectPlatform(),
        arch: this.detectArch(),
    };
}
```

### 1.5 Verify

```bash
npm run build:driver
```

Build must succeed. Open `demo/driver-test.html` in Chrome — all 7 tests
must still pass.

**Write to logbook.** Include the detected values in Chrome (or
whatever browser you tested in).

---

## Step 2: Fix Shim Bugs (errors.ts, js-cookie.ts, network.ts)

**Why:** These are runtime bugs that will silently corrupt behavior.

### 2.1 Fix `errByPath()` in `src/driver/shims/errors.ts`

Wrap `JSON.stringify(args)` in a try/catch with a safe fallback:

```typescript
export function errByPath(path: string, args?: Record<string, unknown>): Error {
	let argStr = '';
	if (args) {
		try {
			argStr = ` — ${JSON.stringify(args)}`;
		} catch {
			argStr = ' — [unserializable args]';
		}
	}
	const err = new Error(`Cypress error: ${path}${argStr}`);
	err.name = 'CypressError';
	return err;
}
```

### 2.2 Fix `get()` in `src/driver/shims/js-cookie.ts`

Cookie values can contain `=` (e.g., base64 tokens). Replace the
naive `split('=')` with a split that preserves the full value:

```typescript
// Before (broken):
const [name, value] = cookie.split('=');

// After (correct):
const eqIdx = cookie.indexOf('=');
if (eqIdx === -1) continue;
const name = cookie.substring(0, eqIdx).trim();
const value = cookie.substring(eqIdx + 1);
```

### 2.3 Fix typo in `src/driver/shims/network.ts`

Line 1: `// @packages/network shimg` → `// @packages/network shim`

### 2.4 Verify

```bash
npm run build:driver
```

Build must succeed. Run demo in browser to confirm no regressions.

**Write to logbook.**

---

## Step 3: Fix Stale Docs and Skill References

**Why:** Stale documentation misleads agents and humans. Inconsistent
command/test counts look sloppy in a PR.

### 3.1 Fix corrupted YAML frontmatter

In `.claude/skills/playwright-cli/SKILL.md`, replace `Í›---` on line 1
with a standard `---`.

### 3.2 Update storage-state skill reference

In `.github/skills/cypress-cli/references/storage-state.md`, replace
the "not implemented yet" content with documentation reflecting the
current state. The following commands are implemented: `state-save`,
`state-load`, `cookie-list`, `cookie-get`, `cookie-set`,
`cookie-delete`, `cookie-clear`, `localstorage-list`,
`localstorage-get`, `localstorage-set`, `localstorage-delete`,
`localstorage-clear`, `sessionstorage-list`, `sessionstorage-get`,
`sessionstorage-set`, `sessionstorage-delete`, `sessionstorage-clear`.

### 3.3 Fix command count in ARCHITECTURE.md

Update references from "64 commands" to "65 commands" (the `repl`
command was added in this branch).

### 3.4 Fix test count in READINESS_ASSESSMENT.md

Remove the conflicting "Total: 1009" line or reconcile with the actual
count. Run `npx vitest run` and use the real number.

### 3.5 Verify

```bash
npx tsc --noEmit && npx eslint src/ tests/
```

**Write to logbook.**

---

## Step 4: Pin Playwright Version

**Why:** `CONVENTIONS.md` requires pinned exact versions. Playwright
uses `^1.59.1` which allows minor/patch drift.

### 4.1 Update `package.json`

Change `"playwright": "^1.59.1"` to `"playwright": "1.59.1"`.

### 4.2 Regenerate lockfile

```bash
npm install
```

### 4.3 Verify

```bash
grep '"playwright"' package.json
# Must show: "playwright": "1.59.1"
```

**Write to logbook.**

---

## Step 5: Add `handleRunTest` Temp-Dir Tests

**Why:** The `handleRunTest` function was substantially rewritten to
use a temporary Cypress project directory (temp dir, config generation,
symlinks, cleanup). The existing tests pass because they mock
`cypress.run`, but they never verify that the new `project:` argument
is passed or that `baseUrl` is derived from the session. This means a
regression could silently revert to the old behavior.

### 5.1 Add test: verifies `project:` tempDir is passed to `cypress.run`

In `tests/unit/daemon/handlers.test.ts`, add a test that:

- Creates a real `.cy.ts` file in a temp dir
- Calls `handleRunTest(conn, message)`
- Asserts `cypressMock.run` was called with `expect.objectContaining({ project: expect.any(String) })`
- Asserts the `project` arg is NOT the same as the spec file's directory
  (i.e., it's an isolated temp dir)
- Asserts `cypressMock.run` was NOT called with `spec:` (old behavior)

### 5.2 Add test: verifies `baseUrl` from session

Add a test that:

- Creates a real `.cy.ts` file
- Creates a `Session` with `url: 'https://example.com/page'`
- Calls `handleRunTest(conn, message, session)`
- After `cypress.run` resolves, reads the generated `cypress.config.js`
  from the temp dir (captured from the `project` arg) and verifies
  `baseUrl` is `'https://example.com'` (origin, not full URL)

**Note:** The temp dir is cleaned up in `finally`, so to inspect
generated files, the test needs to capture the `project` path from
the mock call args before the handler completes cleanup. One approach:
make `cypressMock.run` capture the project path synchronously and
inspect the files inside the mock.

### 5.3 Add test: verifies temp dir cleanup on success

Assert that the temp dir created during the run no longer exists after
`handleRunTest` returns.

### 5.4 Verify

```bash
npx vitest run tests/unit/daemon/handlers.test.ts
```

All tests must pass, including existing ones.

**Write to logbook.**

---

## Step 6: Convert Demo Validation to Cypress E2E Specs

**Why:** The project already depends on Cypress as a dev dependency.
Using Playwright for validation tests adds an unnecessary second browser
automation dependency and contradicts the project's identity. All demo
validation should use the external Cypress runner via `cypress run`.

### 6.1 Create Cypress config for demo validation

Create `demo/cypress.config.js` (or `.ts`) that:

- Sets `baseUrl` to `http://localhost:5555` (or whatever port `serve` uses)
- Sets `specPattern` to `demo/cypress/e2e/**/*.cy.{js,ts}`
- Disables video and screenshots for speed
- Sets `supportFile: false` (no custom support needed)

### 6.2 Create test spec: `demo/cypress/e2e/driver-boot.cy.js`

Convert the MVP tests (Tests 1–3 from `demo/driver-test.html`) into a
Cypress spec:

```javascript
describe('CypressLite driver boot', () => {
	beforeEach(() => {
		cy.visit('/demo/driver-test.html');
	});

	it('boots the driver and passes all MVP tests', () => {
		// Wait for the log panel to show all tests passed
		cy.get('#log', { timeout: 30000 }).should(
			'contain.text',
			'ALL MVP TESTS PASSED',
		);
	});

	it('passes all extended actionability tests', () => {
		cy.get('#log', { timeout: 30000 }).should(
			'contain.text',
			'ALL EXTENDED TESTS PASSED',
		);
	});

	it('reports no fatal errors', () => {
		cy.get('#log', { timeout: 30000 })
			.should('contain.text', 'ALL EXTENDED TESTS PASSED')
			.and('not.contain.text', 'FATAL');
	});
});
```

### 6.3 Create test spec: `demo/cypress/e2e/demo-app.cy.js`

Test the demo app (`demo/index.html`) directly:

```javascript
describe('Demo app', () => {
	beforeEach(() => {
		cy.visit('/demo/index.html');
	});

	it('loads the demo page', () => {
		cy.get('h1').should('exist');
	});
});
```

### 6.4 Create test spec: `demo/cypress/e2e/toy-app.cy.js`

Test the toy apps used as AUT targets:

```javascript
describe('Toy app - actionability', () => {
	it('loads the actionability test page', () => {
		cy.visit('/demo/toy-app/actionability-test.html');
		cy.get('#action-btn').should('not.exist'); // hidden initially
	});

	it('loads the todo app', () => {
		cy.visit('/demo/toy-app/todo.html');
		cy.get('h1').should('exist');
	});

	it('loads the form page', () => {
		cy.visit('/demo/toy-app/form.html');
		cy.get('form').should('exist');
	});
});
```

### 6.5 Add npm script

In `package.json`, add:

```json
"test:demo": "npx serve demo -l 5555 & sleep 2 && npx cypress run --project demo --browser chrome; kill %1"
```

Or use a more robust approach with `start-server-and-test` if available.
The key requirement is: serve the demo files, run Cypress against them,
tear down the server.

### 6.6 Remove Playwright dependency (deferred)

**Do NOT remove Playwright yet.** First get the Cypress specs passing.
Once they cover everything `cross-browser-test.mjs` validated, remove:

- `demo/cross-browser-test.mjs`
- `"playwright": "1.59.1"` from `package.json`
- Any Playwright browser binaries

This is a separate commit/step to keep the diff reviewable.

### 6.7 Verify

```bash
# Serve demo files in background
npx serve . -l 5555 &
SERVER_PID=$!

# Run Cypress specs
npx cypress run --project demo --browser chrome

# Cleanup
kill $SERVER_PID
```

All specs must pass.

**Write to logbook.** Include spec names, pass/fail, and any issues.

---

## Step 7: Remove Playwright Dependency

**Why:** With Cypress specs covering demo validation, the Playwright
dependency and `cross-browser-test.mjs` are redundant.

### 7.1 Remove files

- Delete `demo/cross-browser-test.mjs`
- Delete `demo/CROSS_VALIDATION_RESULTS.md` (references Playwright runs)

### 7.2 Remove from `package.json`

Remove `"playwright": "1.59.1"` from `devDependencies`.

### 7.3 Update docs

- Remove references to `cross-browser-test.mjs` from `demo/README.md`
- Update `docs/DRIVER_POST_MVP_RUNBOOK.md` Step 3 if it references
  Playwright validation
- Update any other docs that mention `cross-browser-test.mjs`

### 7.4 Regenerate lockfile

```bash
npm install
```

### 7.5 Verify

```bash
npx tsc --noEmit && npx vitest run && npx eslint src/ tests/ && npm run build
```

All checks must pass.

**Write to logbook.**

---

## Step 8: Improve Shim Quality (Optional)

**Why:** Several shims have known quality issues that could cause
subtle bugs as driver usage expands. These are lower priority than
Steps 1–7 but worth addressing for robustness.

### 8.1 Improve `md5.ts` hash quality

The current hash uses simple integer arithmetic with high collision
probability. Replace with a proper MD5 implementation (or a better
non-cryptographic hash like FNV-1a) that produces 32-char hex strings.
This is only used for IDs, not security.

### 8.2 Make `sinon.ts` stubs track calls

If any vendored code checks `stub.callCount`, `stub.calledWith`, etc.,
the current hardcoded values will give wrong answers. Add basic call
tracking:

- Increment `callCount` each time the stub is called
- Store args in a `calls` array
- Make `returns(val)` actually return `val` from the stub

### 8.3 Improve `process-shim.ts` `nextTick`

Replace `setTimeout(fn, 0)` with `Promise.resolve().then(fn)` for
correct microtask ordering that matches Node.js behavior.

### 8.4 Verify

```bash
npm run build:driver
```

Open demo in browser — all tests must pass.

**Write to logbook.**

---

## Completion Criteria

The branch is ready for PR when:

- [ ] `npx tsc --noEmit` passes (0 errors)
- [ ] `npx vitest run` passes (all tests green)
- [ ] `npx eslint src/ tests/` passes (0 problems)
- [ ] `npm run build` succeeds
- [ ] `npm run build:driver` succeeds
- [ ] `CypressLite.createConfig()` detects browser/platform/arch dynamically
- [ ] `errByPath()` handles circular args without throwing
- [ ] `js-cookie.ts` `get()` preserves cookie values with `=`
- [ ] All documentation counts are consistent and accurate
- [ ] Playwright skill frontmatter is valid YAML
- [ ] Storage-state skill reference reflects implemented commands
- [ ] All dependency versions are pinned (no `^` or `~`)
- [ ] `handleRunTest` temp-dir behavior has test coverage
- [ ] Demo validation runs as Cypress e2e specs (not Playwright)
- [ ] Playwright dependency removed from `package.json`
- [ ] Steps 1–7 have logbook entries

Step 8 is optional and can be done in a follow-up.
