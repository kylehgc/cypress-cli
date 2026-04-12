# Driver Extraction MVP — Logbook

> **Linked runbook:** [DRIVER_MVP_RUNBOOK.md](DRIVER_MVP_RUNBOOK.md)
>
> **Instructions:** After completing (or failing) each runbook step, add
> an entry below. This is **part of the task**, not optional. The logbook
> is how progress is tracked across session boundaries and how future
> agents recover context.
>
> **What to record:**
>
> - Date/time and step number
> - Outcome: pass, fail, partial, or blocked
> - Files created, modified, or deleted
> - Errors encountered and how they were resolved
> - Decisions made that deviate from the runbook
> - Anything that surprised you or contradicted the architecture docs
>
> **Format:**
>
> ```
> ### YYYY-MM-DD HH:MM — Step N.M: [outcome]
> [details, decisions, errors encountered, files created]
> ```

---

<!-- Logbook entries go below this line -->

### 2026-04-10 — Step 0: Clone Cypress Source [PASS]

- Cloned `cypress-io/cypress` at tag `v14.3.2` to `/tmp/cypress-source`
- Commit hash: `b2a2c90`
- Verified key files exist: `packages/driver/src/cypress/cy.ts`, `packages/driver/src/cy/actionability.ts`
- Branch: `feat/demo-site`

### 2026-04-10 — Step 1: Vendor the Driver Source [PASS]

- 94 TypeScript files vendored to `src/driver/vendor/`
- **Structure deviations from docs:**
  - `ensures.ts` doesn't exist — it's `cypress/ensure.ts`
  - `cy/keyboard/` is not a directory — it's a single `cy/keyboard.ts`
  - `cypress/cypress.ts` (main $Cypress class) is at the source root `src/cypress.ts`, not in `src/cypress/`
  - Config dir has 4 files: `jquery.ts`, `lodash.ts`, `bluebird.ts`, `jquery.scrollto.ts`
- Additional cy/ files copied beyond runbook spec: `chai.ts`, `jquery.ts`, `aliases.ts`, `listeners.ts`, `location.ts`, `overrides.ts`, `snapshots.ts`, `snapshots_css.ts`, `stability.ts`, `timeouts.ts`, `timers.ts`, `top_attr_guards.ts`, `testConfigOverrides.ts`, `xhrs.ts`, `logGroup.ts`, `navigation.ts`, `video-recorder.ts`
- Additional cypress/ files: `ensure.ts`, `commands.ts`, `utils.ts`, `cookies.ts`, `error_messages.ts`, `setter_getter.ts`, `setter_getter.d.ts`, `location.ts`
- DOM dir has `elements/` subdirectory with 10 files
- Verified exclusions: no `runner.ts`, no `mocha.ts`, no `cross-origin/`

### 2026-04-10 — Step 2: Discover and Copy Missing Dependencies [PASS]

- Installed browser/runtime deps needed by the vendored driver: `jquery`, `bluebird`, `lodash`, `chai`, `chai-jquery`, `path-browserify`, `eventemitter2`, `dayjs`, `clone`, `blob-util`, `underscore.string`, `url-parse`, plus corresponding `@types/*` packages where available
- Additional vendor files copied after the first import scan: `cypress/browser.ts`, `cypress/local_storage.ts`, `cypress/selector_playground.ts`, `cypress/screenshot.ts`, `cypress/network_utils.ts`, `cypress/stack_utils.ts`, `cypress/shadow_dom_utils.ts`, `cypress/clock.ts`, `cypress/proxy-logging.ts`, `cypress/aut_event_handlers.ts`, `cypress/resolvers.ts`, `cypress/UsKeyboardLayout.ts`, `cypress/chai_jquery.ts`, `util/config.ts`, `util/privileged_channel.ts`, `util/escape.ts`, `util/limited_map.ts`, `util/queue.ts`, `util/trackTopUrl.ts`, `util/commandAUTCommunication.ts`, `util/what-is-circular.ts`, `util/serialization/*`, `cy/chai/inspect.ts`, `cy/commands/location.ts`, `cy/commands/navigation.ts`, `cy/commands/popups.ts`, `cy/commands/xhr.ts`
- Final vendor tree size after discovery work: 100+ TypeScript files under `src/driver/vendor/`
- Errors hit:
  - `cypress.ts` import paths failed because upstream `src/cypress.ts` had been placed under `vendor/cypress/`; fixed by moving it to `src/driver/vendor/cypress.ts` so its original relative imports resolve
  - repeated esbuild resolve failures identified missing browser-safe files vs server-only surfaces; browser-safe files were copied, server-only surfaces were shimmed
- Major dependency graph surprise: vendored code references far more optional Cypress surfaces than the runbook predicted, including `@packages/network/*`, `@packages/server/*`, `@packages/telemetry/*`, `cross-origin/*`, `net-stubbing/*`, and several Chai internals
- Deviation from runbook: instead of stopping at the first TypeScript pass, I used esbuild resolution as the fastest discriminating check for the real dependency graph because it surfaced missing runtime modules more directly than `tsc`

### 2026-04-10 — Step 3: Write the Shim Layer [PASS]

- Created browser-mode shims in `src/driver/shims/`: `errors.ts`, `types.ts`, `network.ts`, `telemetry.ts`, `server.ts`, `runnable.ts`, `privileged_channel.ts`, `config_validate.ts`, `buffer.ts`, `noop.ts`, `node-util.ts`, `sinon.ts`, `fake-timers.ts`, `sinon-chai.ts`, `debug.ts`, `minimatch.ts`, `common-tags.ts`, `methods.ts`, `md5.ts`, `ordinal.ts`, `js-cookie.ts`, `errors-stack-utils.ts`, `error-stack-parser.ts`, `code-frame.ts`, `structured-clone.ts`, `process-shim.ts`
- Created vendor-local stubs to satisfy deep imports without pulling server/Mocha code back in: `vendor/cypress/mocha.ts`, `vendor/cypress/runner.ts`, `vendor/cypress/script_utils.ts`, `vendor/cypress/source_map_utils.ts`, `vendor/cypress/downloads.ts`, `vendor/cypress/server.ts`, `vendor/cross-origin/communicator.ts`, `vendor/cross-origin/events/cookies.ts`, `vendor/cy/net-stubbing/*`, `vendor/cy/commands/*` stubs for server-only command groups, `vendor/cypress/util/to_posix.ts`
- Errors hit and resolved:
  - multiple build failures were caused by missing named exports from early shims; I expanded the shims incrementally to match what vendored code actually imports (`stripAnsi`, `CookieJar`, `isSupportedKey`, `isDynamicAliasingPossible`, `addCommand`, config validator exports, etc.)
  - `@packages/errors/src/stackUtils`, `@babel/code-frame`, `error-stack-parser`, and `core-js-pure/actual/structured-clone` all required dedicated shim aliases
- Deviation from runbook: rather than only implementing the explicit runbook shims, I had to add a second layer of compatibility shims for non-MVP subsystems that are still imported transitively by the driver

### 2026-04-10 — Step 5: Write the Entry Point [PASS]

- Created `src/driver/index.ts` with a `CypressLite` class that:
  - creates a minimal config object
  - boots vendored `$Cypress`
  - wires `backend:request` and `automation:request` handlers inline
  - seeds `state('runnable')`, `state('test')`, and `state('suite')` with fake Mocha objects
  - exposes `run(fn)` that enqueues commands and waits on `command:queue:end` or `fail`
- Decision/deviation: the backend + automation shims are currently wired directly in `CypressLite` instead of separate `createBackendShim()` / `createAutomationShim()` helpers because the faster path was proving the event interception contract first
- Remaining risk: this boot path still depends on the vendored `onSpecWindow()` semantics, so runtime behavior has not yet been validated in a browser

### 2026-04-10 — Step 6: Build Configuration [PARTIAL]

- Created `esbuild.driver.js` with browser bundling, alias rewrites for `@packages/*`, injected `process` shim support, and browser replacements for Node-oriented dependencies
- Initial bundle built successfully at `1639 KB` raw / `326 KB gzip`, which crossed the runbook’s soft-abort threshold
- Re-read `docs/DRIVER_BUILD_STRATEGY.md` and found the missing production minification setting; after adding `minify: true`, the bundle dropped to `719 KB` raw / `222 KB gzip`
- This clears the size threshold, so Step 6 can continue without soft-aborting, but it is still partial because `src/driver/tsconfig.json` and package scripts have not been added yet
- Files created or modified in this step: `esbuild.driver.js` plus most files in `src/driver/shims/` via alias targets

### 2026-04-10 — Step 4: Modify the Vendored Code [PARTIAL]

- Created `src/driver/VENDORED.md` and recorded all current upstream deviations before proceeding further
- Actual modification strategy diverged from the runbook: instead of immediately editing `vendor/cypress/cy.ts`, `vendor/cypress/command_queue.ts`, and `vendor/cy/retries.ts`, I first inserted thin vendored compatibility shims (`vendor/cypress/mocha.ts`, `vendor/cypress/runner.ts`, `vendor/cross-origin/*`, `vendor/cy/net-stubbing/*`, and server-only command stubs) so the bundle can build and boot can be tested end-to-end
- Core Mocha/Runner decoupling is still pending and will likely move from design-time speculation to targeted runtime fixes once the browser test page is exercised

### 2026-04-10 — Step 5.1: Entry Point Adjustment [PASS]

- Corrected `src/driver/index.ts` boot sequencing after noticing the vendored `onSpecWindow()` waits on `this.$autIframe`
- Fix: import jQuery, wrap the AUT iframe as `$autIframe`, call `Cypress.initialize({ $autIframe, onSpecReady })`, then call `Cypress.onSpecWindow(window, [])` and await the `onSpecReady` callback before using `this.Cypress.cy`
- Validation: `npm run build:driver` still succeeds after the boot-sequence fix

### 2026-04-10 — Step 6.1: Build/Typecheck Validation [PARTIAL]

- Added `src/driver/tsconfig.json` and package scripts `build:driver` / `typecheck:driver`
- `npm run build:driver` passes
- `npm run typecheck:driver` still fails with a large vendored ambient-type surface:
  - Cypress globals/namespaces are partially addressed with `src/driver/types/cypress/log.d.ts`, but many upstream-only types remain (`InternalTypeOptions`, `InternalClearOptions`, `KeyPressSupportedKeys`, `AutomationCommands`, `RunState`, proxy/net-stubbing types, etc.)
  - some vendored files also carry TS-specific cleanup issues (`@ts-expect-error` directives now unused in this environment, narrow shim signatures, and browser-only command option types)
- Decision: keep Step 6 marked partial and continue toward runtime boot validation, since the bundle itself now builds and the remaining failures are type-surface issues rather than current runtime blockers

### 2026-04-10 — Step 7: Create the Test Page [PASS]

- Created `demo/toy-app/actionability-test.html`
- Created `demo/driver-test.html`
- First browser-backed load showed an empty log panel with no console output; root cause was the harness attaching its iframe `load` handler after the same-origin iframe had already finished loading
- Fix: refactored the harness to run immediately when `iframe.contentDocument.readyState === 'complete'`, with a `started` guard to prevent double execution
- Validation path used: `npx serve . -l 5555` and `node bin/cypress-cli open http://localhost:5555/demo/driver-test.html`

### 2026-04-10 — Step 8: Debug and Iterate [PASS]

- Runtime failures encountered in order and fixes applied:
  - `Buffer is not defined` during `$Cypress.create()`
    - fixed by exposing the browser `Buffer` shim on `globalThis` from `src/driver/shims/process-shim.ts`
  - `e.join is not a function` during stack capture on the first `cy.get()`
    - fixed by correcting `src/driver/shims/errors-stack-utils.ts` so `splitStack()` returns `[messageLines, stackLines]` and `unsplitStack()` accepts both arrays like the upstream helper contract
  - first command chain executed but `CypressLite.run()` never resolved
    - fixed by correcting boot/init sequencing and then iterating on run completion strategy
  - second command chain stalled after Test 1
    - fixed by resetting the vendored runnable per `run()` call with `cy.setRunnable(...)` and giving the fake runnable a no-op `fn`
  - missing-element test resolved immediately instead of rejecting
    - fixed by awaiting the vendored queue promise from `state('promise')` instead of an early queue-end hook
- Files modified during iteration: `src/driver/index.ts`, `src/driver/shims/process-shim.ts`, `src/driver/shims/errors-stack-utils.ts`, `src/driver/shims/runnable.ts`, `demo/driver-test.html`
- Final browser-backed result from the harness log:
  - driver booted successfully
  - `cy.get('#action-btn').click()` retried through the delayed button and passed
  - `cy.get('#result').should('have.text', 'Done')` passed
  - `cy.get('#nonexistent', { timeout: 1000 })` rejected with a Cypress timeout error and was caught as expected
- Final observed passing log lines:
  - `Test 1 PASSED`
  - `Test 2 PASSED`
  - `Test 3 PASSED — got expected error: Timed out retrying after 1000ms: Expected to find element: \`#nonexistent\`, but never found it.`
  - `=== ALL MVP TESTS PASSED ===`

### 2026-04-10 — Final Status [PASS]

- Success criteria met in the browser-backed demo harness at `demo/driver-test.html`
- Remaining known gap: `typecheck:driver` is still partial because the vendored Cypress type surface has not been fully reconciled to this extracted browser-only environment
- Remaining optional follow-up from the runbook that was not completed in this pass: cross-browser validation and broader actionability scenario expansion
