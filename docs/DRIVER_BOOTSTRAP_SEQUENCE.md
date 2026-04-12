# Cypress Driver Bootstrap Sequence

> **Purpose:** Documents exactly what happens when Cypress boots the driver
> in the browser, step by step. This is the sequence we must replicate (in
> simplified form) to run the extracted driver without Cypress's server.
>
> **Based on:** Cypress 14.3.2 source code (`packages/driver`, `packages/app`,
> `packages/runner`, `packages/server`)

---

## Overview

Cypress uses a **three-window architecture** in the browser:

1. **Top window** — The Cypress app (Vue) + EventManager + WebSocket client
2. **Spec iframe** — Created per-spec; gets `Cypress` from parent, creates
   `cy`, Mocha, evaluates spec files
3. **AUT iframe** — The application under test, served through Cypress's
   proxy for same-origin access

The bootstrap sequence has four phases: **App Init**, **Spec Setup**,
**Driver Boot** (inside spec iframe), and **Run** (Mocha starts executing tests).

---

## Phase 1: App Initialization

**File:** `packages/app/src/runner/index.ts` — `UnifiedRunnerAPI.initialize()`

```
1.  Await window.UnifiedRunner (webpack bundle injection via <script>)
2.  Read config from window.__CYPRESS_CONFIG__ (base64 JSON)
3.  Reset MobX stores (autStore, studioStore, viewport dimensions)
4.  Create EventManager:
    - Takes CypressDriver constructor, MobX, selectorPlayground, WebSocket
5.  setupRunner():
    a. eventManager.addGlobalListeners(state, options)
       - Set up WebSocket listeners: automation:disconnected,
         watched:file:changed, dev-server:compile:success, etc.
    b. eventManager.start(config)
       - ws.emit('app:connect', { socketId })
    c. Create AutIframe model
    d. Create IframeModel + listen()
```

**What the server provides:**

- `window.__CYPRESS_CONFIG__` — base64-encoded JSON with: version, browser,
  platform, arch, projectName, testingType, baseUrl, viewportWidth/Height,
  defaultCommandTimeout, spec info, env vars, etc.
- WebSocket server at the same origin
- Static file serving for the app's JS/CSS bundles

---

## Phase 2: Spec Execution Setup

**File:** `packages/app/src/runner/index.ts` — `executeSpec(spec)`

```
1.  teardownSpec()
    - Stop previous Cypress instance
    - Clean up cross-origin communicators
    - Reset MobX stores

2.  mobxRunnerStore.setSpec(spec)

3.  UnifiedReporterAPI.resetReporter() + setupReporter()

4.  eventManager.setup(config):
    a. ws.emit('watch:test:file', config.spec)
    b. ws.emit('plugins:before:spec', config.spec)   ← await response
    c. Cypress = this.$CypressDriver.create(config)   ← KEY STEP
       - new $Cypress()
         - new PrimaryOriginCommunicator()
         - new SpecBridgeCommunicator()
         - setupAutEventHandlers()
       - cypress.configure(config)
         - Set document.domain if needed
         - Set static props: arch, spec, version, browser, platform
         - Create this.state = SetterGetter({})
         - Create this.config = SetterGetter(config, validateConfig)
         - Create this.env = SetterGetter(env)
         - Create this.Cookies = $Cookies.create()
         - Create this.ProxyLogging = new ProxyLogging()
    d. window.Cypress = Cypress
    e. this._addListeners()   ← wire driver ↔ socket ↔ reporter
    f. ws.emit('prompt:reset')

5.  runSpecE2E(config, spec):
    a. Create AUT iframe ($autIframe)
    b. autIframe.visitBlankPage()
    c. Create spec iframe (src = /__cypress/iframes/<spec>)
    d. eventManager.initialize({ $autIframe, config })
```

**What the server provides:**

- Response to `watch:test:file` (file watcher setup)
- Response to `plugins:before:spec` (run before:spec hooks)
- Spec iframe HTML at `/__cypress/iframes/<spec>` (see Phase 3)

---

## Phase 3: Driver Boot (inside Spec Iframe)

**Files:** `packages/server/lib/html/iframe.html`,
`packages/driver/src/cypress/cypress.ts`

### 3a. Spec iframe HTML template

The server serves this HTML for the spec iframe:

```html
<!doctype html>
<html>
	<head>
		<meta charset="utf-8" />
		<title>{{title}}</title>
	</head>
	<body>
		<script>
			// Optional: document.domain = '{{superDomain}}';
			(function (parent) {
				var Cypress = (window.Cypress = parent.Cypress);
				if (!Cypress) throw new Error('Tests cannot run without Cypress!');
			})(window.opener || window.parent);
		</script>
		<script>
			{
				{
					privilegedChannel | safe;
				}
			}
		</script>
		<script>
			window.Cypress.onSpecWindow(window, {{scripts | safe}});
		</script>
	</body>
</html>
```

The critical call is `Cypress.onSpecWindow(window, scripts)`.

### 3b. `Cypress.onSpecWindow(specWindow, scripts)`

This is the main driver bootstrap function. Everything flows from here:

```
Cypress.onSpecWindow(specWindow, scripts):
│
├─ 1. Create cy (command runner)
│     this.cy = new $Cy(specWindow, this, this.Cookies, this.state, this.config)
│     window.cy = this.cy
│     │
│     └─ $Cy constructor:
│        ├─ Store refs: specWindow, state, config, Cypress, Cookies
│        ├─ initVideoRecorder(Cypress)
│        ├─ new TestConfigOverride()
│        ├─ Create trait modules:
│        │   ├─ createTimeouts(state)         — timeout management
│        │   ├─ createStability(Cypress, state) — page stability tracking
│        │   ├─ createAssertions(Cypress, cy)  — assertion engine
│        │   ├─ createRetries(...)             — retry loop
│        │   ├─ createJQuery(state)            — cy.$$ for DOM queries
│        │   ├─ createLocation(state)          — URL/location utilities
│        │   ├─ createFocused(state)           — focus management
│        │   ├─ Keyboard class                 — keyboard simulation
│        │   ├─ Mouse class                    — mouse simulation
│        │   ├─ createTimer(Cypress)           — timer management
│        │   ├─ createChai(specWindow, state)  — Chai integration
│        │   ├─ createXhr(state)               — XHR tracking
│        │   ├─ createAliases(cy)              — .as() aliases
│        │   ├─ createSnapshots(cy.$$, state)  — DOM snapshot capture
│        │   └─ createOverrides(state, config) — native method wrapping
│        ├─ new CommandQueue(state, stability, cy)
│        ├─ Set top.onerror handler
│        ├─ Listen 'enqueue:command' → create $Command, add to queue
│        └─ Listen 'test:before:run:async' → close extra targets
│
├─ 2. Create log function
│     this.log = createLogFn(this, this.cy, this.state, this.config)
│
├─ 3. Create Mocha
│     this.mocha = $Mocha.create(specWindow, this, this.config)
│     │
│     └─ $Mocha.create:
│        ├─ restore()     — restore previously patched Mocha prototypes
│        ├─ override(specWindow, Cypress, config)
│        │   ├─ Patch Runner.prototype.fail
│        │   ├─ Patch Runnable.prototype.run → fire 'mocha:runnable:run'
│        │   ├─ Patch Runnable.prototype.clearTimeout / resetTimeout
│        │   ├─ Patch Suite.prototype.retries → throw error
│        │   ├─ Patch Runner.prototype.runTests → track testsQueue
│        │   ├─ Patch Test.prototype.clone → carry config/id/order
│        │   ├─ Patch Test.prototype.calculateTestStatus
│        │   └─ Patch Suite.addTest/addSuite/beforeAll/etc → invocation details
│        ├─ createMocha(specWindow)
│        │   └─ new Mocha({ reporter: noop, timeout: false })
│        ├─ getRunner(_mocha) → _mocha.run() → get Runner instance
│        ├─ _mocha.suite.file = Cypress.spec.relative
│        └─ mocha.ui('bdd') → defines describe/it/before/after as globals
│
├─ 4. Create Runner (wraps Mocha)
│     this.runner = $Runner.create(specWindow, mocha, this, this.cy, this.state)
│     │
│     └─ $Runner.create:
│        ├─ _runner = mocha.getRunner()
│        ├─ _runner.suite = mocha.getRootSuite()
│        ├─ specWindow.addEventListener('error', onSpecError('error'))
│        ├─ specWindow.addEventListener('unhandledrejection', onSpecError)
│        └─ overrideRunnerHook(Cypress, _runner, ...) → test lifecycle
│
├─ 5. Create Downloads tracker
│     this.downloads = $Downloads.create(this)
│
├─ 6. Register all commands
│     this.Commands = $Commands.create(this, this.cy, this.state, this.config)
│     │
│     └─ Calls cy.addCommand() for every Cypress command:
│        get, contains, within, focused, find, children, parent,
│        siblings, eq, first, last, then, invoke, its, each, spread,
│        should, and, as, visit, go, reload, click, dblclick, rightclick,
│        type, clear, check, uncheck, select, trigger, scrollTo, scrollIntoView,
│        wait, wrap, log, end, exec, task, readFile, writeFile, fixture,
│        request, getCookie, getCookies, setCookie, clearCookie, clearCookies,
│        screenshot, window, document, title, url, hash, location, ...
│
├─ 7. Proxy events: this.events.proxyTo(this.cy)
│
├─ 8. Load and eval spec/support scripts
│     $scriptUtils.runScripts({ browser, scripts, specWindow })
│        ├─ For each script URL:
│        │   ├─ fetch(script.relativeUrl)
│        │   ├─ Extract source maps
│        │   └─ eval() in specWindow context
│        │   └─ → describe/it blocks execute → tests defined in Mocha suite
│        └─ .catch → runner.onSpecError()
│
├─ 9. Wait for AUT iframe ready
│     await $autIframe.contentWindow ready
│
├─ 10. Connect cy to AUT
│      this.cy.initialize($autIframe)
│      │
│      └─ cy.initialize:
│         ├─ state('$autIframe', $autIframe)
│         ├─ setWindowDocumentProps(contentWindow, state)
│         ├─ contentWindowListeners(contentWindow)
│         └─ $autIframe.on('load', handler)
│            ├─ setWindowDocumentProps(newContentWindow)
│            ├─ urlNavigationEvent('load')
│            ├─ contentWindowListeners(newContentWindow)
│            ├─ Cypress.action('app:window:load', window, url)
│            └─ isStable(true, 'load')
│
└─ 11. Signal spec ready
       this.onSpecReady()  ← calls back to EventManager
```

### 3c. `onSpecReady()` callback in EventManager

```
eventManager.onSpecReady():
│
├─ ws.emit('get:cached:test:state', callback)
│  └─ Server returns: (runState, testState)
│     runState = { tests, currentId, emissions, ... }
│     testState = {} (empty on first run)
│
├─ runnables = Cypress.runner.normalizeAll(runState.tests, ...)
│  └─ Build test tree: suites → tests → hooks
│
├─ reporterBus.emit('runnables:ready', runnables)
│  └─ Reporter UI renders the test list
│
├─ [run mode only] ws.emit('set:runnables:and:maybe:record:tests', runnables)
│
└─ _runDriver(runState, testState)
```

---

## Phase 4: Test Execution

**File:** `packages/app/src/runner/event-manager.ts` — `_runDriver()`

```
_runDriver(runState, testState):
│
├─ Cypress.run(testState, completionCallback)
│  │
│  ├─ this.state(testState)     — restore cached test state
│  │
│  └─ this.runner.run(fn)
│     │
│     ├─ _startTime = dayjs().toJSON()
│     ├─ _runnerListeners(_runner, Cypress, state)
│     │   └─ Map Mocha events → Cypress actions:
│     │      'suite' → 'runner:suite:start'
│     │      'suite end' → 'runner:suite:end'
│     │      'test' → 'runner:test:start'
│     │      'test end' → 'runner:test:end'
│     │      'hook' → 'runner:hook:start'
│     │      'hook end' → 'runner:hook:end'
│     │      'pass' → 'runner:pass'
│     │      'fail' → 'runner:fail'
│     │      'pending' → 'runner:pending'
│     │
│     └─ _runner.run(failures => { ... })
│        └─ Mocha starts executing tests:
│           for each suite:
│             run beforeAll hooks
│             for each test:
│               run beforeEach hooks
│               run test fn (your it() block)
│               run afterEach hooks
│             run afterAll hooks
│
└─ reporterBus.emit('reporter:start', { startTime, ... })
```

### What happens inside a test (`it()` block)

```
it('should click button', () => {
  cy.get('button')       → enqueue $Command { name: 'get', args: ['button'] }
    .should('be.visible') → enqueue $Command { name: 'should', args: ['be.visible'] }
    .click()             → enqueue $Command { name: 'click', args: [] }
})

After the it() function returns, commands are enqueued but NOT executed.
Mocha's Runner detects the enqueued commands and calls cy.queue.run():

queue.run():
│
├─ Command 1: get('button')
│  ├─ cy.$$(selector) → jQuery query on AUT document
│  ├─ retry(query, { timeout: defaultCommandTimeout })
│  │   └─ If no match: wait 50ms, re-query, repeat until match or timeout
│  ├─ Found: set state('subject', $elements)
│  └─ Peek ahead: next command is .should() → verifyUpcomingAssertions()
│     └─ Run assertion against current subject
│     └─ If fails: RE-RUN get('button') from scratch, re-assert
│     └─ Retry until assertion passes or timeout
│
├─ Command 2: should('be.visible')
│  └─ Already satisfied by get()'s verifyUpcomingAssertions
│     (assertions are consumed by the preceding command's retry loop)
│
└─ Command 3: click()
   ├─ Get subject from state('subject')
   ├─ Actionability checks (in order):
   │   ├─ ensure.isAttached($el)          — still in DOM?
   │   ├─ ensure.isVisible($el)           — CSS visible?
   │   ├─ ensure.isNotDisabled($el)       — not disabled?
   │   ├─ ensure.isNotReadonly($el)        — not readonly? (for type)
   │   ├─ ensure.isNotAnimating($el)      — stable position?
   │   ├─ ensure.isNotCovered($el)         — no overlay blocking?
   │   └─ ensure.isScrollable($el)         — can scroll to it?
   ├─ If any check fails: retry (re-query subject + re-check)
   ├─ All pass: scroll element into view
   ├─ Compute click coordinates (center of element)
   ├─ Fire events: mousedown → focus → mouseup → click
   └─ Move to next command (or resolve queue)
```

---

## What We Need to Replicate

For an extracted driver running without Cypress's server, we need to
replicate this sequence in simplified form:

```
Our bootstrap (no Mocha, no server, no spec iframe):
│
├─ 1. Create config object (hardcoded defaults)
│
├─ 2. Cypress = $CypressDriver.create(config)
│     └─ Same as Phase 2 step 4c, but with stubbed backend/automation
│
├─ 3. Cypress.onSpecWindow(window, [])
│     ├─ Creates cy, commands, keyboard, mouse — all same
│     ├─ SKIP Mocha creation (steps 3-4 in original)
│     ├─ SKIP script loading (step 8 — no spec files to eval)
│     └─ cy.initialize($autIframe) — same
│
├─ 4. Set state('runnable', fakeRunnable)
│     └─ Unblocks command queue and retry loop
│
├─ 5. Ready to execute commands:
│     cy.get('button').click()
│     └─ Commands enqueue and run immediately
│        (no Mocha Runner trigger needed — queue auto-runs)
│
└─ 6. Results returned via events or Promise resolution
```

### Stubbed entry points

| Original                           | Our replacement                |
| ---------------------------------- | ------------------------------ |
| `window.__CYPRESS_CONFIG__`        | Hardcoded config object        |
| `ws.emit('plugins:before:spec')`   | No-op (resolve immediately)    |
| `ws.emit('get:cached:test:state')` | Return `({}, {})`              |
| `Cypress.backend(event, ...)`      | Switch on event → browser shim |
| `Cypress.automation(event, ...)`   | Switch on event → browser shim |
| `$scriptUtils.runScripts(scripts)` | Skip (no spec files)           |
| `$Mocha.create(specWindow, ...)`   | Skip                           |
| `$Runner.create(specWindow, ...)`  | Skip                           |
| `this.runner.run()`                | Skip (direct queue.run())      |

---

## AUT Iframe Injection

In normal Cypress, the server injects this into the AUT iframe's HTML:

```javascript
// injection.js (from packages/runner/dist/injection.js)
const Cypress = window.Cypress = parent.Cypress;
// Timer wrapping for cy.clock()
const timers = { wrap(), reset(), pause() };
Cypress.on('app:timers:reset', timers.reset);
Cypress.on('app:timers:pause', timers.pause);
timers.wrap();
Cypress.action('app:window:before:load', window);
```

For our use case:

- **Timer wrapping:** Optional. Only needed if we support `cy.clock()`.
- **`window.Cypress = parent.Cypress`:** We set this ourselves after
  the iframe loads. Or we inject via a `load` event listener.
- **`app:window:before:load`:** We fire this event ourselves when the
  iframe loads, before the AUT's scripts run.

For same-origin content, we can inject by directly accessing
`iframe.contentWindow` after the load event — no proxy needed.
