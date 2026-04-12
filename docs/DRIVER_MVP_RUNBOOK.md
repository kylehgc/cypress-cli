# Driver Extraction MVP — Runbook

> **Audience:** An LLM agent executing this as a single long-running task.
> You MUST write to [DRIVER_MVP_LOGBOOK.md](DRIVER_MVP_LOGBOOK.md) after
> every step completes or fails. This is part of the task, not optional.
> The logbook is how progress is tracked across session boundaries.
>
> **Goal:** Boot the real Cypress driver in a browser, execute
> `cy.get('button').click()` against a same-origin iframe with full
> actionability + retry semantics, and return the result. No Node.js
> server.
>
> **MVP success criteria:** A page that loads in a browser where:
>
> 1. The Cypress driver boots without errors
> 2. `cy.get('button').click()` retries through a 1-second animation
>    delay (button appears after a spinner), proving actionability works
> 3. `cy.get('.result').should('have.text', 'Done')` retries until
>    the assertion passes, proving the retry loop works
> 4. A failed command (timeout on a missing element) produces a Cypress
>    error, not a crash
>
> **Non-goals for MVP:** No REPL UI, no codegen, no snapshot panel, no
> Service Worker, no cross-origin. Just the driver running and commands
> executing with real Cypress semantics.
>
> **Estimated bundle:** ~120KB gzip (jQuery + Bluebird + Lodash + Chai +
> driver core)

---

## Reference Documents

Read these before starting. They are your specification.

| Document                                                           | What it tells you                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------- |
| [DRIVER_EXTRACTION.md](DRIVER_EXTRACTION.md)                       | What the driver is, what's browser-safe, Mocha coupling |
| [DRIVER_BOOTSTRAP_SEQUENCE.md](DRIVER_BOOTSTRAP_SEQUENCE.md)       | Exact boot sequence to replicate                        |
| [DRIVER_SHIM_SPEC.md](DRIVER_SHIM_SPEC.md)                         | Implementation code for each shim                       |
| [DRIVER_BUILD_STRATEGY.md](DRIVER_BUILD_STRATEGY.md)               | Vendoring, esbuild config, import paths                 |
| [DRIVER_SERVER_DEPENDENCY_MAP.md](DRIVER_SERVER_DEPENDENCY_MAP.md) | Every server call in the driver                         |
| [TIER3_DRIVER_FORK_PLAN.md](TIER3_DRIVER_FORK_PLAN.md)             | Overall plan, risk assessment, file inventory           |

---

## Prerequisites

```bash
# Verify you're on the right branch
git branch --show-current   # should be feat/demo-site or a child branch

# Verify the existing project builds
npm run build && npx tsc --noEmit && npx vitest run

# Verify Cypress 14.3.2 is installed locally
ls ~/Library/Caches/Cypress/14.3.2/Cypress.app/Contents/Resources/app/packages/driver/src/
```

---

## Step 0: Clone Cypress Source at Pinned Tag

We vendor from source, not from the installed Cypress.app cache. The
cache has prebuilt bundles; we need the TypeScript source files.

```bash
git clone --depth 1 --branch v14.3.2 \
  https://github.com/cypress-io/cypress.git /tmp/cypress-source
```

Verify the driver source exists:

```bash
ls /tmp/cypress-source/packages/driver/src/cypress/cy.ts
ls /tmp/cypress-source/packages/driver/src/cy/actionability.ts
```

**Log:** Record the Cypress commit hash from `/tmp/cypress-source`.

---

## Step 1: Vendor the Driver Source

Create the directory structure and copy files. Follow
[DRIVER_BUILD_STRATEGY.md §Vendoring Process](DRIVER_BUILD_STRATEGY.md)
exactly.

### 1.1 Create directories

```bash
mkdir -p src/driver/vendor/{cypress,cy/commands/actions,cy/commands/querying,cy/keyboard,dom,config}
mkdir -p src/driver/shims
mkdir -p src/driver/commands
```

### 1.2 Copy core infrastructure

```bash
SRC=/tmp/cypress-source/packages/driver/src

# Core driver classes
cp $SRC/cypress/cy.ts           src/driver/vendor/cypress/
cp $SRC/cypress/command.ts      src/driver/vendor/cypress/
cp $SRC/cypress/command_queue.ts src/driver/vendor/cypress/
cp $SRC/cypress/chainer.ts      src/driver/vendor/cypress/
cp $SRC/cypress/error_utils.ts  src/driver/vendor/cypress/
cp $SRC/cypress/log.ts          src/driver/vendor/cypress/
cp $SRC/cypress/state.ts        src/driver/vendor/cypress/
cp $SRC/cypress/cypress.ts      src/driver/vendor/cypress/
cp $SRC/cypress/events.ts       src/driver/vendor/cypress/
```

### 1.3 Copy actionability, retry, assertions

```bash
cp $SRC/cy/actionability.ts     src/driver/vendor/cy/
cp $SRC/cy/assertions.ts        src/driver/vendor/cy/
cp $SRC/cy/retries.ts           src/driver/vendor/cy/
cp $SRC/cy/ensures.ts           src/driver/vendor/cy/
cp $SRC/cy/focused.ts           src/driver/vendor/cy/
```

### 1.4 Copy keyboard and mouse simulation

```bash
cp -r $SRC/cy/keyboard          src/driver/vendor/cy/
cp    $SRC/cy/mouse.ts          src/driver/vendor/cy/
```

### 1.5 Copy command implementations

```bash
# Action commands (click, type, check, etc.)
cp -r $SRC/cy/commands/actions   src/driver/vendor/cy/commands/

# Querying commands (get, contains, within)
cp -r $SRC/cy/commands/querying  src/driver/vendor/cy/commands/

# Other browser-safe commands
cp $SRC/cy/commands/traversals.ts  src/driver/vendor/cy/commands/
cp $SRC/cy/commands/connectors.ts  src/driver/vendor/cy/commands/
cp $SRC/cy/commands/asserting.ts   src/driver/vendor/cy/commands/
cp $SRC/cy/commands/aliasing.ts    src/driver/vendor/cy/commands/
cp $SRC/cy/commands/waiting.ts     src/driver/vendor/cy/commands/
cp $SRC/cy/commands/window.ts      src/driver/vendor/cy/commands/
cp $SRC/cy/commands/misc.ts        src/driver/vendor/cy/commands/
cp $SRC/cy/commands/storage.ts     src/driver/vendor/cy/commands/
```

### 1.6 Copy DOM utilities

```bash
cp -r $SRC/dom                   src/driver/vendor/
```

### 1.7 Copy config helpers

```bash
mkdir -p src/driver/vendor/config
cp $SRC/config/jquery.ts         src/driver/vendor/config/
cp $SRC/config/lodash.ts         src/driver/vendor/config/
```

### 1.8 Verify the copy

```bash
find src/driver/vendor -name '*.ts' | wc -l
# Expected: ~40-60 files

# Spot-check key files exist
test -f src/driver/vendor/cypress/cy.ts && echo "OK: cy.ts"
test -f src/driver/vendor/cy/actionability.ts && echo "OK: actionability.ts"
test -f src/driver/vendor/cy/commands/actions/click.ts && echo "OK: click.ts"
test -f src/driver/vendor/dom/visibility.ts || test -d src/driver/vendor/dom && echo "OK: dom/"
```

### 1.9 DO NOT copy these

Double-check none of these were copied (they shouldn't have been, but
verify):

```bash
# These should NOT exist
test ! -f src/driver/vendor/cypress/runner.ts    && echo "GOOD: no runner.ts"
test ! -f src/driver/vendor/cypress/mocha.ts     && echo "GOOD: no mocha.ts"
test ! -d src/driver/vendor/cross-origin         && echo "GOOD: no cross-origin/"
test ! -d src/driver/vendor/cy/net-stubbing      && echo "GOOD: no net-stubbing/"
test ! -f src/driver/vendor/cy/commands/task.ts   && echo "GOOD: no task.ts"
test ! -f src/driver/vendor/cy/commands/exec.ts   && echo "GOOD: no exec.ts"
test ! -f src/driver/vendor/cy/commands/files.ts  && echo "GOOD: no files.ts"
```

**Write to [DRIVER_MVP_LOGBOOK.md](DRIVER_MVP_LOGBOOK.md):** Record
file count, any files that were unexpectedly missing from Cypress
source, and any decisions made about additional files to include/exclude.

---

## Step 2: Discover and Copy Missing Dependencies

The vendored files will have imports that reference files we didn't
copy. This step is iterative — you attempt a build, find missing
imports, and either copy the source file or create a shim.

### 2.1 Scan for imports

```bash
# Find all imports in vendored code
grep -rh "from ['\"]" src/driver/vendor/ | sort -u > /tmp/driver-imports.txt

# Find @packages/* imports
grep "@packages/" /tmp/driver-imports.txt

# Find relative imports that go outside vendor/
grep "\.\.\/" /tmp/driver-imports.txt
```

### 2.2 Categorize each import

For each unique import found, decide:

| Import pattern                                | Action                                                  |
| --------------------------------------------- | ------------------------------------------------------- |
| Relative within vendor (`./`, `../cy/`, etc.) | Should resolve — verify target exists                   |
| `@packages/errors`                            | Create a minimal shim at `src/driver/shims/errors.ts`   |
| `@packages/types`                             | Copy type definitions needed for compilation            |
| `@packages/config`                            | Our config shim replaces this                           |
| `jquery`, `lodash`, `bluebird`, `chai`        | npm install as devDependencies                          |
| `mocha`, `sinon`                              | Should not appear — we didn't copy files that use these |
| Node.js builtins (`path`, `events`, `fs`)     | Inline shim or browser polyfill                         |

### 2.3 Install npm dependencies

```bash
npm install --save-dev jquery@3 bluebird@3 lodash@4 chai@4 chai-jquery
npm install --save-dev @types/jquery @types/bluebird @types/lodash @types/chai
npm install --save-dev path-browserify eventemitter3
```

### 2.4 Copy type definitions from Cypress

```bash
# Copy whatever type files are needed — run this once, then expand
# based on what the TypeScript compiler says is missing
mkdir -p src/driver/vendor/types
cp /tmp/cypress-source/packages/types/src/index.ts src/driver/vendor/types/ 2>/dev/null || true
```

### 2.5 First build attempt

```bash
npx tsc --noEmit -p src/driver/tsconfig.json 2>&1 | head -100
```

This **will** fail. That's expected. Read the errors and iterate:

- **"Cannot find module X"** → copy the file or create a shim
- **"Property X does not exist on type Y"** → type definition issue,
  copy the type file or add a declaration
- **"Module not found: @packages/Z"** → create the matching shim

### 2.6 Iterate until imports resolve

Repeat 2.1-2.5 until all imports resolve. This is the most
unpredictable step — it may take 3-10 iterations. The import graph
may pull in more files than the initial copy covered.

**Decision framework:**

- If a missing file is **browser-safe code** (DOM utils, error
  messages, type definitions): **copy it**
- If a missing file is **server-dependent** (socket.io, CDP,
  process, fs): **create a shim that throws or no-ops**
- If a missing file is **Mocha-related**: **create a stub that
  satisfies the type**

**Write to [DRIVER_MVP_LOGBOOK.md](DRIVER_MVP_LOGBOOK.md):** Record
the final file count, every additional file copied beyond Step 1,
every shim created, and the npm packages added. This is the most
important log entry — it captures the real dependency graph that the
specs estimated.

---

## Step 3: Write the Shim Layer

Follow [DRIVER_SHIM_SPEC.md](DRIVER_SHIM_SPEC.md) to implement each
shim. The spec has implementation code — use it, but adapt to what
the vendored source actually imports (the interfaces may have
diverged from what the spec predicted).

### 3.1 Backend shim

Create `src/driver/shims/backend.ts` per the spec.

MVP scope — implement only these events:

| Event                 | Implementation                               |
| --------------------- | -------------------------------------------- |
| `resolve:url`         | Return URL as-is with `isOkStatusCode: true` |
| `reset:server:state`  | No-op, return `{}`                           |
| `close:extra:targets` | No-op, return `{}`                           |
| `run:privileged`      | Throw "not available in browser mode"        |

Everything else: throw identifying the event name.

### 3.2 Automation shim

Create `src/driver/shims/automation.ts` per the spec.

MVP scope: only `focus:browser:window` (return `{}`). Everything
else throws. Cookies are not needed for the MVP test page.

### 3.3 Navigation shim

Create `src/driver/shims/navigation.ts` per the spec.

MVP scope: `visit()` only (iframe.location + load event + timeout).
`go()` and `reload()` can be stubs.

### 3.4 Config shim

Create `src/driver/shims/config.ts` per the spec.

This is the static config object. Key values for MVP:

- `defaultCommandTimeout: 4000`
- `pageLoadTimeout: 60000`
- `waitForAnimations: true`
- `animationDistanceThreshold: 5`
- `viewportWidth: 1000`, `viewportHeight: 660`

### 3.5 Runnable shim

Create `src/driver/shims/runnable.ts` per the spec.

This is the ~50 LOC fake runnable. Critical — without it, the retry
loop throws immediately because `state('runnable')` is undefined.

### 3.6 Event forwarder shim

Create `src/driver/shims/events.ts` per the spec.

MVP: route `backend:request` to backend shim, `automation:request`
to automation shim. Log `command:start` / `command:end` to console.
Drop everything else.

### 3.7 @packages/errors shim

Create `src/driver/shims/errors.ts`.

The driver calls `errByPath('command.timeout', { ... })` to get
formatted error messages. For MVP, return a simple error with the
path and args stringified:

```typescript
export function errByPath(path: string, args?: Record<string, unknown>): Error {
	const msg =
		`Cypress error: ${path}` + (args ? ` — ${JSON.stringify(args)}` : '');
	const err = new Error(msg);
	err.name = 'CypressError';
	return err;
}

// Other exports the driver may reference
export function getError(path: string, ...args: unknown[]): Error {
	return errByPath(path, args[0] as Record<string, unknown>);
}

export function throwErr(path: string, args?: Record<string, unknown>): never {
	throw errByPath(path, args);
}
```

**Write to [DRIVER_MVP_LOGBOOK.md](DRIVER_MVP_LOGBOOK.md):** Record
which shims were created, which spec predictions were accurate vs.
needed changes, and any additional interfaces the vendored code
expected that the spec didn't cover.

---

## Step 4: Modify the Vendored Code

The vendored driver code needs surgical modifications. Keep changes
minimal — every change is a future merge conflict when upgrading.

### 4.1 `cypress/cy.ts` — Remove Mocha/Runner references

This is the biggest modification. See [DRIVER_EXTRACTION.md §Mocha
Coupling](DRIVER_EXTRACTION.md) for the 5 coupling points.

**Strategy:** Don't delete the code that reads `state('runnable')` —
our fake runnable satisfies those reads. Instead:

- Remove imports of `runner.ts` and `mocha.ts`
- Remove code that creates Mocha Runner/Suite/Test instances
- Remove `$Runner` class references
- Keep all code that reads `state('runnable')`, `state('test')`,
  `state('suite')` — our shim populates these

### 4.2 `cypress/command_queue.ts` — Remove runnable guard

If the command queue checks `state('runnable')` before running,
our fake runnable handles this. If it imports Mocha types, remove
the import and use `any` or a local interface.

### 4.3 `cy/retries.ts` — Ensure retry loop works

The retry loop may check `state('runnable').timeout()` to know
the current timeout. Our fake runnable provides `.timeout()`.
Verify this works. If it checks for a Mocha-specific property
(like `_allowedGlobals`), stub it.

### 4.4 Remove server-only command registrations

If `cypress/cypress.ts` or an `index.ts` registers commands like
`task`, `exec`, `readFile`, `writeFile` — remove those registrations
or wrap them in a guard. For MVP, it's fine to let them register
and fail at runtime with our `run:privileged` shim error.

### 4.5 Track all modifications

Create `src/driver/VENDORED.md`:

```markdown
# Vendored Cypress Driver Source

- **Source:** github.com/cypress-io/cypress
- **Tag:** v14.3.2
- **Commit:** <hash from Step 0>
- **Date:** <today>
- **License:** MIT

## Modifications from upstream

- `cypress/cy.ts`: <list each change>
- `cypress/command_queue.ts`: <list each change>
- `cy/retries.ts`: <list each change>
- (any others)
```

**Write to [DRIVER_MVP_LOGBOOK.md](DRIVER_MVP_LOGBOOK.md):** Record
every file modified, what was changed, and the approximate LOC delta.
Flag any unexpected coupling that forced larger changes than planned.

---

## Step 5: Write the Entry Point

Create `src/driver/index.ts` — the CypressLite class that boots the
driver and exposes a command execution API.

### 5.1 Bootstrap sequence

Follow [DRIVER_BOOTSTRAP_SEQUENCE.md §What We Need to
Replicate](DRIVER_BOOTSTRAP_SEQUENCE.md):

```typescript
// src/driver/index.ts
import { createDefaultConfig } from './shims/config.js';
import { createBackendShim } from './shims/backend.js';
import { createAutomationShim } from './shims/automation.js';
import { createFakeRunnable, createFakeTest, createFakeSuite } from './shims/runnable.js';
// ... import $Cypress or CypressDriver from vendored code

export class CypressLite {
  private Cypress: any; // The $Cypress instance
  private cy: any;      // The $Cy instance

  constructor(private autIframe: HTMLIFrameElement) {}

  async boot(): Promise<void> {
    // 1. Create config
    const config = createDefaultConfig();

    // 2. Create Cypress instance
    //    This mirrors: CypressDriver.create(config)
    this.Cypress = /* $CypressDriver.create(config) or new $Cypress(config) */;

    // 3. Wire shims
    //    Intercept backend/automation events before they reach socket.io
    this.Cypress.backend = createBackendShim(this.autIframe);
    this.Cypress.automation = createAutomationShim(this.autIframe);

    // 4. Call onSpecWindow (creates cy, commands, keyboard, mouse)
    //    Pass empty scripts array — no spec files to eval
    this.Cypress.onSpecWindow(window, []);
    this.cy = this.Cypress.cy;

    // 5. Connect to AUT iframe
    this.cy.initialize(this.autIframe);

    // 6. Set fake runnable to unblock command queue
    const state = this.Cypress.state;
    state('runnable', createFakeRunnable((err) => {
      console.error('Command error:', err);
    }));
    state('test', createFakeTest());
    state('suite', createFakeSuite());
  }

  /** Execute a Cypress command chain and wait for completion. */
  async run(fn: (cy: any) => void): Promise<void> {
    // Enqueue commands via the fn
    fn(this.cy);
    // Wait for queue to drain
    // The exact mechanism depends on what the vendored queue exposes
    // Options: listen for 'end' event, poll queue.length, or
    // wrap in a Bluebird promise
  }
}
```

### 5.2 Export for browser use

The entry point should work both as an ES module import and as a
global when loaded via `<script>`:

```typescript
// At bottom of index.ts
if (typeof window !== 'undefined') {
	(window as any).CypressLite = CypressLite;
}
```

**Write to [DRIVER_MVP_LOGBOOK.md](DRIVER_MVP_LOGBOOK.md):** Record
the actual bootstrap code that worked. Note any deviations from the
planned sequence — these are the most valuable findings for the
architecture docs.

---

## Step 6: Build Configuration

### 6.1 Create `esbuild.driver.js`

Follow [DRIVER_BUILD_STRATEGY.md §Build
Configuration](DRIVER_BUILD_STRATEGY.md):

```javascript
import esbuild from 'esbuild';

await esbuild.build({
	entryPoints: ['src/driver/index.ts'],
	bundle: true,
	format: 'esm',
	target: 'es2022',
	platform: 'browser',
	outfile: 'dist/cypress-driver.js',
	external: [],
	define: {
		'process.env.NODE_ENV': '"production"',
		'process.env.DEBUG': '""',
		global: 'globalThis',
	},
	sourcemap: true,
	alias: {
		'@packages/errors': './src/driver/shims/errors.ts',
		'@packages/types': './src/driver/vendor/types/index.ts',
		'@packages/config': './src/driver/shims/config.ts',
		path: 'path-browserify',
		events: 'eventemitter3',
	},
	mainFields: ['browser', 'module', 'main'],
	logLevel: 'warning',
});
```

### 6.2 Create `src/driver/tsconfig.json`

```json
{
	"compilerOptions": {
		"target": "ES2022",
		"module": "ESNext",
		"moduleResolution": "bundler",
		"lib": ["ES2022", "DOM", "DOM.Iterable"],
		"strict": false,
		"esModuleInterop": true,
		"allowSyntheticDefaultImports": true,
		"skipLibCheck": true,
		"noEmit": true,
		"paths": {
			"@packages/errors": ["./shims/errors"],
			"@packages/types": ["./vendor/types"],
			"@packages/config": ["./shims/config"]
		}
	},
	"include": ["vendor/**/*", "shims/**/*", "commands/**/*", "index.ts"]
}
```

Note: `strict: false` initially because the vendored Cypress code was
not written under strict mode. Tighten later.

### 6.3 Add npm scripts

```json
{
	"build:driver": "node esbuild.driver.js",
	"typecheck:driver": "tsc --noEmit -p src/driver/tsconfig.json"
}
```

### 6.4 First build attempt

```bash
node esbuild.driver.js 2>&1
```

This **will** fail. Read the errors and fix:

- **"Could not resolve X"** → missing alias, missing shim file, or
  missing npm package
- **"No matching export for import Y"** → wrong export name in shim,
  or vendored code expects a different interface

Iterate until the build produces `dist/cypress-driver.js`.

### 6.5 Measure bundle size

```bash
ls -lh dist/cypress-driver.js
gzip -c dist/cypress-driver.js | wc -c | awk '{printf "%.0f KB gzip\n", $1/1024}'
```

Target: under 200KB gzip.

**Write to [DRIVER_MVP_LOGBOOK.md](DRIVER_MVP_LOGBOOK.md):** Record
the final bundle size, every alias/shim/polyfill needed, and build
errors that required non-obvious fixes.

---

## Step 7: Create the Test Page

A minimal HTML page that loads the driver bundle and executes commands
against an iframe containing a test fixture.

### 7.1 Create the test fixture

Create `demo/toy-app/actionability-test.html`:

```html
<!DOCTYPE html>
<html>
	<head>
		<title>Actionability Test</title>
	</head>
	<body>
		<h1>Actionability Test Page</h1>

		<!-- Button that appears after a 1-second delay (tests retry) -->
		<div id="delayed-section">
			<p>Loading...</p>
		</div>

		<script>
			// After 1 second, replace the loading text with a clickable button
			setTimeout(() => {
				document.getElementById('delayed-section').innerHTML = `
        <button id="action-btn">Click Me</button>
        <p id="result" style="display:none">Done</p>
      `;
				document.getElementById('action-btn').addEventListener('click', () => {
					document.getElementById('result').style.display = 'block';
				});
			}, 1000);
		</script>
	</body>
</html>
```

This page proves actionability: `cy.get('#action-btn').click()` must
wait for the button to appear (retry through the 1s delay), then click
it. `cy.get('#result').should('have.text', 'Done')` must then pass.

### 7.2 Create the driver test page

Create `demo/driver-test.html`:

```html
<!DOCTYPE html>
<html>
	<head>
		<title>Cypress Driver MVP Test</title>
		<style>
			body {
				font-family: monospace;
				margin: 20px;
			}
			#log {
				white-space: pre-wrap;
				background: #111;
				color: #0f0;
				padding: 12px;
				min-height: 300px;
				overflow: auto;
			}
			.pass {
				color: #0f0;
			}
			.fail {
				color: #f00;
			}
			.info {
				color: #0af;
			}
			iframe {
				border: 1px solid #ccc;
				width: 600px;
				height: 400px;
			}
		</style>
	</head>
	<body>
		<h1>Cypress Driver MVP</h1>
		<iframe id="aut" src="toy-app/actionability-test.html"></iframe>
		<div id="log"></div>

		<script type="module">
			import { CypressLite } from '../dist/cypress-driver.js';

			const log = document.getElementById('log');
			function print(msg, cls = 'info') {
				const line = document.createElement('div');
				line.className = cls;
				line.textContent = `[${new Date().toISOString().slice(11, 23)}] ${msg}`;
				log.appendChild(line);
				log.scrollTop = log.scrollHeight;
			}

			const iframe = document.getElementById('aut');

			iframe.addEventListener('load', async () => {
				print('AUT iframe loaded');

				try {
					// Boot the driver
					print('Booting CypressLite...');
					const lite = new CypressLite(iframe);
					await lite.boot();
					print('Driver booted successfully', 'pass');

					// Test 1: cy.get() with retry (button appears after 1s)
					print('Test 1: cy.get("#action-btn").click()');
					print('  → Button will appear after 1s delay. Driver must retry...');
					await lite.run((cy) => {
						cy.get('#action-btn').click();
					});
					print('Test 1 PASSED — click executed after retry', 'pass');

					// Test 2: Assertion retry
					print('Test 2: cy.get("#result").should("have.text", "Done")');
					await lite.run((cy) => {
						cy.get('#result').should('have.text', 'Done');
					});
					print('Test 2 PASSED — assertion passed', 'pass');

					// Test 3: Timeout on missing element
					print('Test 3: cy.get("#nonexistent", {timeout: 1000})');
					try {
						await lite.run((cy) => {
							cy.get('#nonexistent', { timeout: 1000 });
						});
						print('Test 3 FAILED — should have thrown', 'fail');
					} catch (err) {
						print(`Test 3 PASSED — got expected error: ${err.message}`, 'pass');
					}

					print('\\n=== ALL MVP TESTS PASSED ===', 'pass');
				} catch (err) {
					print(`FATAL: ${err.message}`, 'fail');
					print(err.stack, 'fail');
				}
			});
		</script>
	</body>
</html>
```

### 7.3 Serve and test

```bash
# Serve from the project root so imports resolve
npx serve . -l 5555

# Open in browser
open http://localhost:5555/demo/driver-test.html
```

Watch the log panel. All three tests should show green PASSED.

**Write to [DRIVER_MVP_LOGBOOK.md](DRIVER_MVP_LOGBOOK.md):** Record
what happened in the browser. Did the driver boot? Did tests pass?
If not, what was the first error? This is the most critical log entry.

---

## Step 8: Debug and Iterate

This step exists because Steps 5-7 almost certainly will not work on
the first try. The driver's internal code makes assumptions about its
environment that we haven't fully mapped. This is expected.

### Common failure modes and fixes

| Symptom                                       | Likely cause                           | Fix                                                         |
| --------------------------------------------- | -------------------------------------- | ----------------------------------------------------------- |
| `Cannot read property 'timeout' of undefined` | `state('runnable')` is not set         | Verify Step 5.1 #6 runs before any commands                 |
| `Cypress is not defined` (in AUT iframe)      | Driver tried to inject into AUT        | Check if `cy.initialize()` sets up `contentWindow.Cypress`  |
| `$(...).jquery is not defined`                | jQuery not loaded in the right context | Verify jQuery is in the bundle and accessible to `$Cypress` |
| `Cypress.backend is not a function`           | Shim not wired correctly               | Check how `backend` is accessed (property? event? method?)  |
| `queue.run is not a function`                 | Command queue API mismatch             | Read vendored `command_queue.ts` exports                    |
| Bundle is >500KB gzip                         | Pulled in too many deps                | Check for server-side code that got included                |
| `mocha is not defined`                        | Vendored code still references Mocha   | Grep for `mocha` imports, remove or stub                    |
| `Bluebird.config is not a function`           | Bluebird not initialized               | Call `Bluebird.config({ cancellation: true })` early        |
| `TypeError: X.default is not a function`      | ESM/CJS interop issue                  | Add `allowSyntheticDefaultImports`, check esbuild settings  |

### Debug strategy

1. Open browser DevTools console
2. Set breakpoint in `CypressLite.boot()`
3. Step through — the first error reveals the next shim/fix needed
4. Fix, rebuild, reload
5. Repeat

### When to change approach

If after 10+ iterations the driver won't boot due to a fundamental
assumption (e.g., it requires a real WebSocket connection for the
initial handshake, or the `$Cypress` constructor is not exported):

- **Fallback A:** Use the prebuilt `cypress_runner.js` from the
  Cypress cache instead of vendored source. It's 8.6MB but it's
  known to work.
- **Fallback B:** Build only the actionability engine + command queue
  (skip the full `$Cypress` class) and wire them manually. This is
  a partial extraction — less Cypress surface area but guaranteed to
  be browser-safe.

**Log every iteration.** Each failed attempt and its fix is valuable
documentation for anyone who tries this next.

---

## Step 9: Validate the MVP

Once all three tests pass in the browser:

### 9.1 Cross-browser check

Test in at least Chrome and Firefox. The driver's event simulation
uses browser-specific APIs. Verify both work.

### 9.2 Verify actionability is real

Modify `actionability-test.html` to test more scenarios:

- Button that's initially `display: none`, then becomes visible
- Button covered by an overlay that fades out
- Button inside a scrollable container (not in viewport)
- Disabled button that becomes enabled

For each: `cy.get('button').click()` should wait and retry until
the actionability condition is met, then succeed.

### 9.3 Measure performance

```javascript
const start = performance.now();
await lite.run((cy) => {
	cy.get('#action-btn').click();
});
const elapsed = performance.now() - start;
console.log(`Click command took ${elapsed.toFixed(0)}ms`);
// Expected: ~1050-1200ms (1s delay + small overhead)
```

### 9.4 Document the final state

Update `src/driver/VENDORED.md` with the complete list of
modifications. Update the architecture docs with any corrections
to the predicted behavior.

**Write to [DRIVER_MVP_LOGBOOK.md](DRIVER_MVP_LOGBOOK.md):** Record
the final pass/fail status, bundle size, browser compatibility
results, and any architecture doc corrections needed.
