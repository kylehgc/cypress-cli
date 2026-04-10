# Cypress Driver Extraction: Architecture & Analysis

> **Audience:** Anyone who wants to use Cypress's command queue, actionability
> engine, and retry loop outside of Cypress's test runner.  
> **Status:** Research complete, implementation not started.  
> **Cypress version analyzed:** 14.3.2 (MIT licensed, `packages/driver/src/`)

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Why Extract, Not Rewrite](#why-extract-not-rewrite)
3. [The Cypress Driver in Context](#the-cypress-driver-in-context)
4. [What the Driver Actually Is](#what-the-driver-actually-is)
5. [The Three Layers](#the-three-layers)
6. [Server Dependencies — Complete Audit](#server-dependencies--complete-audit)
7. [Mocha Coupling — Detailed Analysis](#mocha-coupling--detailed-analysis)
8. [Extraction Strategy](#extraction-strategy)
9. [Bundle Dependencies](#bundle-dependencies)
10. [Trade-offs & Alternatives](#trade-offs--alternatives)

---

## Problem Statement

The Cypress driver contains a battle-tested command queue with retry,
actionability, and auto-wait — the things that make `cy.get('button').click()`
work even when the button is animating, covered by an overlay, or not
yet in the DOM.

This engine is **browser code that runs in the browser**. Cypress's
server exists only to bootstrap it, proxy the AUT into a same-origin
iframe, and handle Node.js-only operations (filesystem, process exec,
CDP automation).

If we can boot the driver without the server, we get real Cypress
semantics — real `cy.get()`, real actionability, real retry loop — in
any browser context. This unlocks:

- **Live editing:** A REPL where commands execute against a live page
  with full retry/wait semantics, without restart-on-edit.
- **LLM tool use:** An agent sends `cy.get('button').click()` and gets
  back a result only after actionability passes, not a racy immediate
  click.
- **Demo/teaching:** Interactive Cypress playground in a browser with
  zero install.
- **Studio-like products:** Codegen, visual testing, or recording tools
  that reuse Cypress's interaction engine.

---

## Why Extract, Not Rewrite

The actionability engine alone (`actionability.ts`, ~635 LOC) handles:

- Scroll into view (with configurable scroll behavior)
- Visibility check (CSS `display`, `visibility`, `opacity`,
  `overflow: hidden` clipping, off-screen position,
  `transform: scale(0)`, `<details>` open state)
- Animation detection (element position sampled over two animation
  frames, compared with configurable distance threshold)
- Covered-element check (hit test at element center, handle `pointer-events:
none`, floating overlays, sticky headers)
- Disabled check (native disabled attribute, fieldset disabled
  propagation, `aria-disabled` in some cases)
- Detached-from-DOM check (element removed between command enqueue and
  execution)

Each of these has dozens of edge cases accumulated over years of
real-world bug reports. Reimplementing this from scratch would take
months and produce an inferior result that would gradually converge
toward the same code.

**The retry loop** (`retries.ts` + `assertions.ts`, ~500 LOC) implements:

- Retry any function until it stops throwing or timeout expires
- Configurable retry interval (50ms default)
- Wait for page stability (no pending XHR/fetch, document ready)
- Integration with upcoming assertions (the "assertion retry" pattern:
  `cy.get('.items').should('have.length', 3)` retries the `cy.get()`
  until the assertion passes, not just until elements exist)

**The input simulation** (keyboard ~1500 LOC, mouse ~500 LOC) handles:

- Character-by-character typing with modifier key state tracking
- Special key sequences (`{enter}`, `{selectAll}`, `{moveToEnd}`)
- Input event sequence (keydown → beforeinput → input → keyup) per
  the W3C UI Events spec
- Mouse event coordinates, button state, movement between elements
- Click event sequence (mousedown → focus → mouseup → click)
- Selection range management during typing

---

## The Cypress Driver in Context

Cypress is a monorepo at `github.com/cypress-io/cypress`. The packages
that matter for understanding the driver:

```
packages/
├── driver/          ← The browser-side test execution engine (our target)
├── runner/          ← Webpack bundles driver + React reporter → cypress_runner.js
├── app/             ← Vue app (Cypress UI), EventManager, UnifiedRunnerAPI
├── server/          ← Express HTTP server + proxy + socket.io + CDP
├── proxy/           ← HTTP/HTTPS proxy that rewrites AUT for same-origin
├── rewriter/        ← HTML/JS rewriting for same-origin iframe
├── net-stubbing/    ← cy.intercept() implementation (proxy + driver)
├── extension/       ← Chrome extension for automation (legacy, being phased out)
├── errors/          ← Error message registry
└── config/          ← Configuration schema and validation
```

At build time, `packages/runner` uses Webpack to bundle:

- `packages/driver` (the Cypress object, cy, commands, DOM utils)
- React + MobX (for the Reporter UI)
- jQuery, Bluebird, Lodash, Mocha, Chai, sinon

This produces `cypress_runner.js` (~8.6 MB unminified, a single
webpack bundle) which Cypress's server serves to the browser.

---

## What the Driver Actually Is

`packages/driver/src/` contains:

| Directory/File              | Purpose                                 | Browser-safe? |
| --------------------------- | --------------------------------------- | ------------- |
| `cypress/cypress.ts`        | The `$Cypress` class — top-level object | Mostly        |
| `cypress/cy.ts`             | The `$Cy` class — command orchestrator  | Mostly\*      |
| `cypress/command.ts`        | `$Command` class — single command repr  | Yes           |
| `cypress/command_queue.ts`  | FIFO queue with run/next/stop           | Mostly\*      |
| `cypress/chainer.ts`        | `.should().and()` chaining              | Yes           |
| `cypress/log.ts`            | Command log entry creation              | Yes           |
| `cypress/state.ts`          | Getter/setter state management          | Yes           |
| `cypress/error_utils.ts`    | Error formatting                        | Yes           |
| `cypress/runner.ts`         | Wraps Mocha Runner                      | No†           |
| `cypress/mocha.ts`          | Mocha prototype patching                | No†           |
| `cy/actionability.ts`       | The actionability engine                | Yes           |
| `cy/retries.ts`             | Retry loop                              | Mostly\*      |
| `cy/assertions.ts`          | Assertion integration                   | Yes           |
| `cy/ensures.ts`             | `ensure.isVisible()`, `.isAttached()`   | Yes           |
| `cy/keyboard/`              | Keyboard simulation                     | Yes           |
| `cy/mouse.ts`               | Mouse simulation                        | Yes           |
| `cy/focused.ts`             | Focus tracking                          | Yes           |
| `cy/commands/actions/`      | click, type, check, scroll, etc.        | Yes           |
| `cy/commands/querying/`     | cy.get, cy.contains                     | Yes           |
| `cy/commands/traversals.ts` | .find, .children, .parent, etc.         | Yes           |
| `cy/commands/connectors.ts` | .then, .invoke, .its                    | Yes           |
| `cy/commands/asserting.ts`  | .should, .and                           | Yes           |
| `cy/commands/aliasing.ts`   | .as                                     | Yes           |
| `cy/commands/window.ts`     | cy.window, cy.document                  | Yes           |
| `cy/commands/misc.ts`       | cy.wrap, cy.log                         | Yes           |
| `cy/commands/waiting.ts`    | cy.wait (timeout)                       | Yes           |
| `cy/commands/storage.ts`    | localStorage / sessionStorage           | Yes           |
| `cy/commands/navigation.ts` | cy.visit, cy.go, cy.reload              | No‡           |
| `cy/commands/cookies.ts`    | Cookie commands                         | No‡           |
| `cy/commands/request.ts`    | cy.request                              | No‡           |
| `cy/commands/task.ts`       | cy.task                                 | No‡           |
| `cy/commands/exec.ts`       | cy.exec                                 | No‡           |
| `cy/commands/files.ts`      | cy.readFile, cy.writeFile               | No‡           |
| `cy/commands/sessions/`     | cy.session                              | No‡           |
| `cy/commands/origin/`       | cy.origin (cross-origin)                | No†           |
| `cy/net-stubbing/`          | cy.intercept driver-side                | No‡           |
| `cross-origin/`             | Spec-bridge communicator                | No†           |
| `dom/`                      | DOM utilities (visibility, etc.)        | Yes           |

**Legend:**

- Yes = runs as-is in a browser, no server dependency
- Mostly\* = works but has isolated references to Mocha state or server calls that need 1-5 line patches
- No† = remove entirely (not needed for REPL/studio use case)
- No‡ = replace with browser-alternative shim

**Summary: ~55% is browser-safe, ~25% is removable, ~20% needs
shims.**

---

## The Three Layers

Understanding how Cypress structures its browser execution is critical
to extracting the driver. There are three nested frames:

```
┌─────────────────────────────────────────────────────────────┐
│  Top Window (Cypress app — Vue + EventManager)              │
│  - window.__Cypress__ = true                                │
│  - Loads cypress_runner.js → window.UnifiedRunner           │
│  - Manages WebSocket to server                              │
│  - Creates iframes, coordinates lifecycle                   │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Spec Iframe (src = /__cypress/iframes/<spec>)        │  │
│  │  - Gets Cypress from parent window                    │  │
│  │  - Cypress.onSpecWindow(window, scripts) runs here    │  │
│  │  - Creates cy, Mocha, Commands, evals the spec        │  │
│  │  - Commands execute in THIS window's context          │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  AUT Iframe (the actual application under test)       │  │
│  │  - Served through Cypress proxy (same-origin hack)    │  │
│  │  - Parent has full DOM access via contentWindow       │  │
│  │  - injection.js sets window.Cypress = parent.Cypress  │  │
│  │  - Timer wrapping for cy.clock() support              │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### What each layer does during bootstrap

**Top Window:**

1. Load Vue app → render Cypress UI (spec list, reporter, etc.)
2. Parse `window.__CYPRESS_CONFIG__` (base64 JSON injected by server)
3. Create `EventManager` with WebSocket and `CypressDriver` constructor
4. When user selects a spec → call `executeSpec(spec)`

**Spec execution (EventManager):**

1. `Cypress = CypressDriver.create(config)` — construct the `$Cypress` object
2. `Cypress.initialize({ $autIframe, onSpecReady })` — store AUT iframe ref
3. Create spec iframe → server serves `iframe.html` template
4. Spec iframe loads → calls `Cypress.onSpecWindow(window, scripts)`:
   - `this.cy = new $Cy(specWindow, ...)` — command queue, actionability
   - `this.mocha = $Mocha.create(specWindow, ...)` — set up Mocha
   - `this.runner = $Runner.create(specWindow, ...)` — wrap Mocha runner
   - `this.Commands = $Commands.create(...)` — register all commands
   - Eval spec/support scripts → test blocks (`describe`/`it`) are defined
   - `cy.initialize($autIframe)` — connect cy to AUT
   - `onSpecReady()` callback fires
5. `Cypress.run()` → `mocha._runner.run()` → tests execute

**What we keep vs. replace in extraction:**

- Top Window: **Replace** — our studio UI replaces the Vue app
- EventManager/WebSocket: **Replace** — direct function calls instead
- Spec iframe: **Merge** — driver runs in the studio page directly (or
  a minimal iframe), no separate spec iframe needed
- AUT iframe: **Keep** — same concept, same-origin content, but without
  the proxy (content is already same-origin)

---

## Server Dependencies — Complete Audit

### `Cypress.backend()` — RPC to Node.js server

Every `backend()` call sends a socket.io message to the server and
waits for a response Promise. These are the calls found in the driver
source, with their replacement strategy:

| Call                                             | Used by                                                                        | Replacement                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `resolve:url`                                    | `cy.visit()`                                                                   | Not needed — same-origin iframe navigation is direct |
| `http:request`                                   | `cy.request()`                                                                 | `fetch()` with CORS limitations, or omit             |
| `reset:server:state`                             | Before each test                                                               | No-op (no proxy state to reset)                      |
| `get:fixture`                                    | `cy.fixture()`                                                                 | `fetch()` to same-origin path, or embed fixtures     |
| `run:privileged`                                 | `cy.exec()`, `cy.task()`, `cy.readFile()`, `cy.writeFile()`, `cy.selectFile()` | Not available in browser; throw descriptive error    |
| `net` (substub events)                           | `cy.intercept()`                                                               | Service Worker (phase 2), or omit in phase 1         |
| `preserve:run:state`                             | Cross-origin navigation                                                        | Not needed (same-origin only)                        |
| `save:session` / `get:session` / `clear:session` | `cy.session()`                                                                 | `sessionStorage` / `IndexedDB`, or omit              |
| `close:extra:targets`                            | Before each test (CDP)                                                         | No-op (we don't control browser targets)             |
| `cross:origin:*`                                 | Cross-origin cookie sync                                                       | Not needed (same-origin only)                        |
| `get:rendered:html:origins`                      | Proxy HTML tracking                                                            | Not needed (no proxy)                                |

### `Cypress.automation()` — Browser automation protocol

Automation calls go through socket.io → server → CDP/extension:

| Call                               | Used by           | Replacement                               |
| ---------------------------------- | ----------------- | ----------------------------------------- |
| `get:cookies` / `get:cookie`       | Cookie commands   | `document.cookie` (no httpOnly access)    |
| `set:cookie` / `set:cookies`       | Cookie commands   | `document.cookie`                         |
| `clear:cookie` / `clear:cookies`   | Cookie commands   | Delete via `document.cookie` with expiry  |
| `add:cookies`                      | Cross-origin sync | Not needed                                |
| `take:screenshot`                  | `cy.screenshot()` | `html2canvas` or canvas API, or omit      |
| `focus:browser:window`             | Focus management  | `window.focus()`                          |
| `reset:browser:state`              | Between tests     | Clear cookies, storage, etc. via DOM APIs |
| `reset:browser:tabs:for:next:test` | Between tests     | Not needed (single tab)                   |
| `get:heap:size:limit`              | Memory pressure   | `performance.memory` (Chrome only)        |

### `Cypress.emit()` socket-forwarded events

The EventManager forwards certain driver events to the server:

| Event                       | Purpose                          | Replacement                |
| --------------------------- | -------------------------------- | -------------------------- |
| `backend:request`           | Routes to backend()              | Handled by backend shim    |
| `automation:request`        | Routes to automation()           | Handled by automation shim |
| `mocha`                     | Test lifecycle events → reporter | Not needed (no Mocha)      |
| `recorder:frame`            | Test Replay recording            | Not needed                 |
| `dev-server:on-spec-update` | Component testing HMR            | Not needed                 |

### Server → Driver pushed events

| Event                  | Purpose                     | Replacement                     |
| ---------------------- | --------------------------- | ------------------------------- |
| `net:stubbing:event`   | Proxy intercepted a request | Service Worker (phase 2)        |
| `request:event`        | HTTP request lifecycle      | Service Worker (phase 2)        |
| `script:error`         | Script load error           | Standard `error` event listener |
| `cross:origin:cookies` | Cookie sync                 | Not needed                      |
| `watched:file:changed` | HMR                         | Not needed                      |
| `aut:destroy:init`     | Destroy AUT                 | Direct iframe manipulation      |

---

## Mocha Coupling — Detailed Analysis

The driver was built to run inside Mocha. This coupling exists at
five specific points. Understanding each is necessary to decide whether
to keep Mocha (and boot it ourselves) or remove it (and shim the touch
points).

### 1. `state('runnable')` guard in retry loop

**Location:** `cy/retries.ts`, `cypress/command_queue.ts`

The retry loop calls `state('runnable')` to get the current Mocha
`Runnable` object. If it's `null`, the command queue won't start.
This is Cypress's way of ensuring commands only run inside `it()` blocks.

```typescript
// retries.ts (simplified)
retry(fn, options) {
  const runnable = state('runnable')
  if (!runnable) {
    // Queue hasn't started -- can't retry
    return
  }
  // ...
}
```

**Impact:** Without a runnable, the command queue is inert.

**Fix:** Set `state('runnable')` to a permanent fake object:

```typescript
state('runnable', {
	timeout: () => {},
	clearTimeout: () => {},
	resetTimeout: () => {},
	isPending: () => false,
	title: 'REPL Session',
	fullTitle: () => 'REPL Session',
	titlePath: () => ['REPL Session'],
});
```

### 2. Command queue startup tied to Mocha Runner

**Location:** `cypress/cy.ts`, `cypress/runner.ts`

The command queue's `run()` method is called when a Mocha test's
callback is invoked. The Runner detects enqueued commands and calls
`cy.queue.run()` inside the test execution context.

```typescript
// runner.ts (simplified)
onRunnableRun(runnableRun, runnable, args) {
  // If the runnable has commands enqueued, run the queue
  if (cy.queue.length) {
    cy.queue.run()
  }
}
```

**Impact:** Without the Runner calling `queue.run()`, enqueued commands
sit in the queue forever.

**Fix:** Call `queue.run()` directly after enqueueing:

```typescript
// After enqueue, if not already running:
if (!queue.isRunning) queue.run();
```

### 3. Timeout management via Mocha Runnable

**Location:** `cy/timeouts.ts`, `cypress/cy.ts`

Cypress doesn't use JavaScript `setTimeout` for command timeouts.
Instead it delegates to Mocha's `Runnable.prototype.timeout()`:

```typescript
// timeouts.ts (simplified)
timeout(ms) {
  const runnable = state('runnable')
  runnable.timeout(ms)
}

clearTimeout() {
  const runnable = state('runnable')
  runnable.clearTimeout()
}
```

Mocha's `Runnable` stores the timeout value and calls `done(new Error('timeout'))`
if it expires.

**Impact:** Without a real Mocha Runnable, timeout calls are undefined.

**Fix:** The fake runnable from point #1 needs working timeout methods:

```typescript
{
  _timeout: 4000,
  _timer: null,
  timeout(ms) { this._timeout = ms },
  clearTimeout() { clearTimeout(this._timer) },
  resetTimeout() {
    this.clearTimeout()
    const ms = this._timeout
    if (ms) {
      this._timer = setTimeout(() => {
        this.callback(new Error(`Timed out after ${ms}ms`))
      }, ms)
    }
  },
  callback: (err) => { /* route to command error handler */ },
}
```

### 4. Error propagation through Mocha callback

**Location:** `cypress/cy.ts`

When a command fails, the error is propagated to Mocha via
`state('runnable').callback(err)`. Mocha then marks the test as failed
and moves to the next test/hook.

```typescript
// cy.ts (simplified)
fail(err) {
  const runnable = state('runnable')
  runnable.callback(err)
}
```

**Impact:** Without Mocha handling the error, it's lost.

**Fix:** The fake runnable's `callback` function routes to our own
error handler:

```typescript
callback: (err) => {
	if (err) {
		// Stop command queue, emit error event
		queue.stop();
		emit('command:error', err);
	} else {
		// Queue finished successfully
		emit('command:complete');
	}
};
```

### 5. ~30 callsites referencing Mocha state in cy.ts

**Location:** `cypress/cy.ts`

Throughout cy.ts there are references to:

- `state('test')` — current Mocha Test object
- `state('runnable')` — current Mocha Runnable
- `state('suite')` — current Mocha Suite
- `Cypress.action('runner:...')` — Runner lifecycle events

These are used for logging (adding test context to log entries),
test-level state management (resetting subjects between tests),
and retry count tracking.

**Impact:** Most of these are non-critical. They add metadata to logs
or manage per-test state that doesn't apply to a REPL.

**Fix:** Populate `state('test')` and `state('suite')` with minimal
fake objects. The logging code will harmlessly read properties from
them. Don't need to handle lifecycle events.

### Decision: Remove Mocha vs. Keep Mocha

**Removing Mocha** means:

- ~50 LOC fake runnable/test/suite objects
- ~500 LOC modifications across cy.ts, command_queue.ts, retries.ts
- No Mocha in the bundle (-100KB unminified)
- Simpler mental model: command queue runs commands, period
- Direct control over execution flow

**Keeping Mocha** means:

- Bundle Mocha (~150KB unminified, ~25KB gzipped)
- Manually create Mocha Runner + Suite + Test (the server normally
  does this via the spec iframe template)
- Call `runner.run()` with a single never-ending `it()` block
- Override timeout behavior (prevent Mocha from killing idle sessions)
- Override error behavior (prevent Mocha from marking "test failed"
  and stopping)
- Still understand the same 5 coupling points to work around them

**Both approaches require roughly the same depth of understanding.**
Removing Mocha results in less code shipped, fewer workarounds, and
a simpler debugging experience. The recommendation is to remove it.

---

## Extraction Strategy

### Approach: Build from Source

Copy `packages/driver/src/` from the `cypress-io/cypress` repository
(pinned to a release tag), modify the copied source to remove server
dependencies, and build with esbuild targeting `es2022` for browsers.

**Why build from source instead of using the prebuilt bundle:**

The prebuilt `cypress_runner.js` (8.6MB) includes React, MobX, the
Reporter UI, and many dependencies we don't need. It's a monolithic
webpack bundle with no tree-shaking opportunity. Building from source
lets us include only the driver's core modules and their direct
dependencies.

**Why copy/vendor instead of patching at build time:**

The modifications needed (removing Mocha coupling, swapping backend
calls) are semantic changes, not simple string replacements. Having the
source in our repo means:

- Full IDE support (types, navigation, refactoring)
- Clear git diff showing exactly what we changed
- No build-time transforms that are hard to debug
- Can upgrade by diffing against a new Cypress release

### What to copy

```
From: cypress-io/cypress packages/driver/src/
Into: src/driver/vendor/

Directories:
  cy/actionability.ts
  cy/assertions.ts
  cy/retries.ts
  cy/ensures.ts
  cy/focused.ts
  cy/keyboard/            (entire directory)
  cy/mouse.ts
  cy/commands/actions/    (click, type, check, focus, scroll, select, trigger)
  cy/commands/querying/   (get, contains, within, focused)
  cy/commands/traversals.ts
  cy/commands/connectors.ts
  cy/commands/asserting.ts
  cy/commands/aliasing.ts
  cy/commands/waiting.ts
  cy/commands/window.ts
  cy/commands/misc.ts
  cy/commands/storage.ts
  cypress/cy.ts
  cypress/command.ts
  cypress/command_queue.ts
  cypress/chainer.ts
  cypress/error_utils.ts
  cypress/log.ts
  cypress/state.ts
  dom/                    (entire directory)

Files to NOT copy:
  cypress/runner.ts       (Mocha wrapper — remove)
  cypress/mocha.ts        (Mocha patching — remove)
  cy/commands/navigation.ts  (replace with shim)
  cy/commands/cookies.ts     (replace with shim)
  cy/commands/request.ts     (replace with shim)
  cy/commands/task.ts        (replace with shim)
  cy/commands/exec.ts        (replace with shim)
  cy/commands/files.ts       (replace with shim)
  cy/commands/sessions/      (remove)
  cy/commands/origin/        (remove)
  cy/net-stubbing/           (remove for phase 1)
  cross-origin/              (remove)

Estimated: ~11,000 LOC copied
```

### New code to write

```
src/driver/
├── shims/
│   ├── backend.ts        (~100 LOC) Replaces Cypress.backend()
│   ├── automation.ts     (~80 LOC)  Replaces Cypress.automation()
│   ├── navigation.ts     (~120 LOC) cy.visit/go/reload via iframe
│   ├── config.ts         (~60 LOC)  Default config with browser metadata
│   ├── runnable.ts       (~50 LOC)  Fake Mocha Runnable/Test/Suite
│   └── events.ts         (~40 LOC)  No-op event forwarder (replaces socket)
├── commands/
│   ├── navigation.ts     (~100 LOC) Browser-mode visit/go/reload
│   └── cookies.ts        (~60 LOC)  Browser-mode cookie commands
└── index.ts              (~200 LOC) CypressLite entry point

Estimated: ~810 LOC new
```

### Modifications to vendored code

```
cypress/cy.ts           Remove Mocha/Runner imports and references
                        Replace state('runnable') initialization
                        Remove test lifecycle event handling
                        (~200 LOC changed)

cypress/command_queue.ts  Remove runnable guard on queue.run()
                          Add direct run trigger
                          (~50 LOC changed)

cy/retries.ts           Remove state('runnable') guard
                        Use fake runnable for timeout
                        (~30 LOC changed)

cy/commands/actions/*   Remove any Cypress.backend() calls
                        (usually ~5 LOC per file)

Estimated: ~350 LOC modified
```

---

## Bundle Dependencies

The driver has these runtime dependencies that must be bundled:

| Dependency         | Size (min+gzip)       | Used for                                                                                              | Keep?                                                  |
| ------------------ | --------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| jQuery 3.x         | ~30KB                 | DOM queries, `.is()`, `.find()`, `.offset()`, etc. Used in hundreds of callsites                      | **Yes** — not worth removing                           |
| Bluebird 3.x       | ~17KB                 | Promise extensions: `.delay()`, `.timeout()`, `Promise.try()`, cancellation. Used in every async path | **Yes** — pervasive, would touch every file to replace |
| Lodash 4.x         | ~25KB (cherry-picked) | `_.defaults`, `_.isElement`, `_.clone`, `_.uniq`, etc.                                                | **Yes** — driver imports specific functions            |
| Chai + chai-jquery | ~15KB                 | Assertion library for `.should()`                                                                     | **Yes** — this IS the assertion engine                 |
| sinon/fake-timers  | ~10KB                 | `cy.clock()`, `cy.tick()`                                                                             | **Optional** — only if we want clock commands          |
| Mocha              | ~25KB                 | Test runner framework                                                                                 | **No** — removing it                                   |

**Estimated total bundle:** ~120KB min+gzip for dependencies + ~40KB
for the driver source itself. **~160KB total** — comparable to a
medium-sized UI library.

For comparison:

- The current `cypress_runner.js` is 8.6MB unminified
- React alone is ~40KB min+gzip
- Our Tier 1 demo bundle is ~35KB

### Build configuration

```javascript
// esbuild config for the extracted driver
{
  entryPoints: ['src/driver/index.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  outfile: 'dist/cypress-driver.js',
  external: [],  // bundle everything
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  // jQuery, Bluebird, Lodash are bundled (not external)
}
```

---

## Trade-offs & Alternatives

### Trade-off: Vendor vs. Depend

**Vendoring (copy source):**

- Full control over modifications
- Clear diff trail
- No risk of upstream breaking changes
- Must manually port security fixes
- Git history diverges from upstream

**Depending (import as module):**

- Automatic security updates
- No source duplication
- Cannot modify internals (the driver isn't published as a standalone package)
- Webpack bundle isn't importable as a module

**Decision:** Vendor. The driver isn't published standalone, and we
need to modify internal files. There's no alternative.

### Trade-off: Keep all commands vs. Subset

**All ~40 browser-safe commands:**

- Feature parity marketing
- More utility for users
- More code to maintain
- Wider surface area for bugs

**Subset (cy.get, .click, .type, .should — the MVP):**

- Faster to ship
- Smaller bundle
- Easier to validate
- Can add more incrementally

**Decision:** Start with the subset: `cy.get()`, `.find()`, `.click()`,
`.type()`, `.should()`, `cy.contains()`, `.check()`, `cy.wrap()`,
`cy.wait()`. Add more after the core loop is proven.

### Trade-off: Fake runnable vs. Real Mocha

Covered in detail in the Mocha Coupling section above.  
**Decision:** Fake runnable. Less code, fewer workarounds.

### Alternative considered: Playwright's actionability

Playwright's actionability checks are in their injected page scripts
(~1,200 LOC). We already ported their aria snapshot code. We could
port their actionability too, avoiding the Cypress driver extraction
entirely.

**Rejected because:**

- Playwright's actionability is tightly coupled to their CDP-based
  execution model (checks run in the page context but are orchestrated
  from Node.js via CDP `Runtime.evaluate`)
- No command queue — Playwright uses sequential awaits, not a queue
- No assertion retry integration — `.toHaveText()` retry is in the
  Node.js test runner, not in the injected script
- We'd end up building our own command queue + retry loop + assertion
  engine — which is exactly what the Cypress driver already is

### Alternative considered: Testing Library user-event

`@testing-library/user-event` (~1,800 LOC) provides `click()`, `type()`,
`selectOptions()`, etc. with realistic event dispatch.

**Rejected because:**

- No retry or auto-wait (throws immediately if element isn't ready)
- No actionability checks (no visibility, covered-element, animation)
- No command queue (imperative await-based API)
- Would need to build retry + actionability + queue on top of it
- At that point, we're reimplementing the Cypress driver

### Alternative considered: Use the prebuilt bundle (Approach A)

Load `cypress_runner.js` from the user's Cypress cache at
`~/Library/Caches/Cypress/<version>/Cypress.app/.../packages/runner/dist/`.

**Pros:**

- Zero build work
- Exact same code Cypress uses (byte-for-byte identical)

**Cons:**

- 8.6MB bundle (includes React, Reporter, MobX)
- Can't redistribute (must require user's Cypress installation)
- Can't modify (it's compiled, no source maps)
- Breaks when user upgrades Cypress (internal APIs can change between
  the bundle's expectations and actual Cypress behavior)
- Undocumented internal API surface — `window.UnifiedRunner.CypressDriver`
  is not a public contract

**Decision:** Build from source. The prebuilt bundle is useful for a
proof-of-concept experiment but not viable for a real product.
