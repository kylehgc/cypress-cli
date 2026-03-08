# Capability Matrix: playwright-cli vs cypress-cli

> Feasibility audit of every
> [`playwright-cli`](https://github.com/microsoft/playwright-cli) command mapped
> to Cypress capabilities. Each command is classified as **Direct**, **Workaround**,
> **Limited**, or **Infeasible**.

## Classification Key

| Classification   | Meaning                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| **Direct**       | A Cypress API exists that maps cleanly to the playwright-cli command    |
| **Workaround**   | Achievable via `cy.window()`, `cy.task()`, `cy.trigger()`, or similar  |
| **Limited**      | Partial support — some functionality is missing or has lower fidelity   |
| **Infeasible**   | No Cypress equivalent; architectural constraint prevents implementation |

## Command Matrix

### Core

| playwright-cli command             | Classification | cypress-cli        | Cypress API / Approach                                        | Notes                                                                         |
| ---------------------------------- | -------------- | ------------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `open [url]`                       | Direct         | `open`             | `cypress.run()` + `cy.visit(url)`                             | Implemented                                                                   |
| `goto <url>`                       | Direct         | `navigate`         | `cy.visit(url)`                                               | Implemented (alias `goto` planned in #55)                                     |
| `close`                            | Direct         | `stop`             | Terminate Cypress process                                     | Implemented (alias `close` planned in #55)                                    |
| `type <text>`                      | Direct         | `type`             | `cy.get(sel).type(text)`                                      | Implemented                                                                   |
| `click <ref>`                      | Direct         | `click`            | `cy.get(sel).click()`                                         | Implemented                                                                   |
| `dblclick <ref>`                   | Direct         | `dblclick`         | `cy.get(sel).dblclick()`                                      | Implemented                                                                   |
| `fill <ref> <text>`                | Direct         | —                  | `cy.get(sel).clear().type(text)`                              | Planned in #49                                                                |
| `drag <startRef> <endRef>`         | Limited        | —                  | `cy.trigger()` chain or plugin                                | Planned in #53; synthetic events — may not work with all drag-and-drop libs   |
| `hover <ref>`                      | Limited        | `hover`            | `cy.get(sel).trigger('mouseover')`                            | Implemented; synthetic event, not native hover — CSS `:hover` may not trigger |
| `select <ref> <val>`               | Direct         | `select`           | `cy.get(sel).select(value)`                                   | Implemented                                                                   |
| `upload <file>`                    | Direct         | —                  | `cy.get(sel).selectFile(path)`                                | Planned in #54; `selectFile()` available since Cypress 9.3                    |
| `check <ref>`                      | Direct         | `check`            | `cy.get(sel).check()`                                         | Implemented                                                                   |
| `uncheck <ref>`                    | Direct         | `uncheck`          | `cy.get(sel).uncheck()`                                       | Implemented                                                                   |
| `snapshot`                         | Direct         | `snapshot`         | Injected aria snapshot IIFE                                   | Implemented                                                                   |
| `snapshot --filename=f`            | Direct         | `snapshot`         | Same, with file output                                        | Planned in #45 (snapshot-to-file)                                             |
| `eval <func> [ref]`               | Workaround     | —                  | `cy.window().then(win => win.eval(func))`                     | Planned in #48; page-level eval is straightforward, element eval needs ref    |
| `dialog-accept [prompt]`          | Workaround     | —                  | `cy.on('window:confirm', () => true)`                         | Planned in #50; must register listener _before_ trigger action                |
| `dialog-dismiss`                   | Workaround     | —                  | `cy.on('window:confirm', () => false)`                        | Planned in #50; same pre-registration requirement                             |
| `resize <w> <h>`                   | Direct         | —                  | `cy.viewport(w, h)`                                           | Planned in #51                                                                |

### Navigation

| playwright-cli command | Classification | cypress-cli | Cypress API / Approach  | Notes                              |
| ---------------------- | -------------- | ----------- | ----------------------- | ---------------------------------- |
| `go-back`              | Direct         | `back`      | `cy.go('back')`         | Implemented (alias planned in #55) |
| `go-forward`           | Direct         | `forward`   | `cy.go('forward')`      | Implemented (alias planned in #55) |
| `reload`               | Direct         | `reload`    | `cy.reload()`           | Implemented                        |

### Keyboard

| playwright-cli command | Classification | cypress-cli | Cypress API / Approach                   | Notes                                                                         |
| ---------------------- | -------------- | ----------- | ---------------------------------------- | ----------------------------------------------------------------------------- |
| `press <key>`          | Direct         | `press`     | `cy.get('body').type('{key}')`           | Implemented; Cypress special key syntax `{enter}`, `{esc}`, etc.              |
| `keydown <key>`        | Limited        | —           | `cy.get('body').trigger('keydown', ...)` | Planned in #62; synthetic event — does not produce actual key input           |
| `keyup <key>`          | Limited        | —           | `cy.get('body').trigger('keyup', ...)`   | Planned in #62; synthetic event only, no native key release                   |

### Mouse

| playwright-cli command    | Classification | cypress-cli | Cypress API / Approach                              | Notes                                                                                     |
| ------------------------- | -------------- | ----------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `mousemove <x> <y>`       | Limited        | —           | `cy.get('body').trigger('mousemove', { clientX, clientY })` | Planned in #62; synthetic DOM event, not native mouse movement                    |
| `mousedown [button]`      | Limited        | —           | `cy.get('body').trigger('mousedown', ...)`          | Planned in #62; synthetic event, does not produce OS-level mouse press                    |
| `mouseup [button]`        | Limited        | —           | `cy.get('body').trigger('mouseup', ...)`            | Planned in #62; synthetic event only                                                      |
| `mousewheel <dx> <dy>`    | Limited        | —           | `cy.get(sel).trigger('wheel', { deltaX, deltaY })` | Planned in #62; synthetic — scroll effects may not fire in all frameworks                 |

### Save As

| playwright-cli command       | Classification | cypress-cli  | Cypress API / Approach      | Notes                                                                  |
| ---------------------------- | -------------- | ------------ | --------------------------- | ---------------------------------------------------------------------- |
| `screenshot [ref]`           | Direct         | —            | `cy.screenshot()` / `cy.get(sel).screenshot()` | Planned in #52; Cypress supports both page and element screenshots |
| `screenshot --filename=f`    | Direct         | —            | `cy.screenshot(filename)`   | Planned in #52                                                         |
| `pdf`                        | Infeasible     | —            | —                           | Cypress has no PDF generation API; would require CDP or external tool   |
| `pdf --filename=page.pdf`    | Infeasible     | —            | —                           | Same — no Cypress PDF support                                          |

### Tabs

| playwright-cli command   | Classification | cypress-cli | Cypress API / Approach | Notes                                                                                       |
| ------------------------ | -------------- | ----------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| `tab-list`               | Infeasible     | —           | —                      | Cypress runs inside a single browser tab; cannot enumerate or control other tabs             |
| `tab-new [url]`          | Infeasible     | —           | —                      | Cypress cannot open new tabs programmatically                                                |
| `tab-close [index]`      | Infeasible     | —           | —                      | Cypress cannot close arbitrary tabs                                                          |
| `tab-select <index>`     | Infeasible     | —           | —                      | Cypress cannot switch between tabs; this is an architectural limitation of the test runner   |

### Storage

| playwright-cli command           | Classification | cypress-cli | Cypress API / Approach                                      | Notes                                                       |
| -------------------------------- | -------------- | ----------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| `state-save [filename]`         | Workaround     | —           | Serialize cookies + localStorage via `cy.getCookies()` + `cy.window()` | Planned in #60; manual serialization to JSON file  |
| `state-load <filename>`         | Workaround     | —           | Restore via `cy.setCookie()` + `cy.window().then()`        | Planned in #60; manual deserialization from JSON file        |
| `cookie-list [--domain]`        | Direct         | —           | `cy.getCookies()`                                           | Planned in #56                                               |
| `cookie-get <name>`             | Direct         | —           | `cy.getCookie(name)`                                        | Planned in #56                                               |
| `cookie-set <name> <val>`       | Direct         | —           | `cy.setCookie(name, value)`                                 | Planned in #56                                               |
| `cookie-delete <name>`          | Direct         | —           | `cy.clearCookie(name)`                                      | Planned in #56                                               |
| `cookie-clear`                  | Direct         | —           | `cy.clearCookies()`                                         | Planned in #56                                               |
| `localstorage-list`             | Workaround     | —           | `cy.window().then(win => Object.entries(win.localStorage))` | Planned in #57                                               |
| `localstorage-get <key>`        | Workaround     | —           | `cy.window().then(win => win.localStorage.getItem(key))`    | Planned in #57                                               |
| `localstorage-set <k> <v>`      | Workaround     | —           | `cy.window().then(win => win.localStorage.setItem(k, v))`   | Planned in #57                                               |
| `localstorage-delete <k>`       | Workaround     | —           | `cy.window().then(win => win.localStorage.removeItem(k))`   | Planned in #57                                               |
| `localstorage-clear`            | Workaround     | —           | `cy.window().then(win => win.localStorage.clear())`         | Planned in #57                                               |
| `sessionstorage-list`           | Workaround     | —           | `cy.window().then(win => Object.entries(win.sessionStorage))`| Planned in #57                                               |
| `sessionstorage-get <k>`        | Workaround     | —           | `cy.window().then(win => win.sessionStorage.getItem(k))`    | Planned in #57                                               |
| `sessionstorage-set <k> <v>`    | Workaround     | —           | `cy.window().then(win => win.sessionStorage.setItem(k, v))` | Planned in #57                                               |
| `sessionstorage-delete <k>`     | Workaround     | —           | `cy.window().then(win => win.sessionStorage.removeItem(k))` | Planned in #57                                               |
| `sessionstorage-clear`          | Workaround     | —           | `cy.window().then(win => win.sessionStorage.clear())`       | Planned in #57                                               |

### Network

| playwright-cli command    | Classification | cypress-cli | Cypress API / Approach                     | Notes                                                                        |
| ------------------------- | -------------- | ----------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| `route <pattern> [opts]`  | Direct         | —           | `cy.intercept(pattern, response)`          | Planned in #59; Cypress `intercept` is powerful but API shape differs        |
| `route-list`              | Workaround     | —           | Track registered intercepts in daemon state | Planned in #59; Cypress has no built-in "list all intercepts" API           |
| `unroute [pattern]`       | Limited        | —           | Remove intercept handler                   | Planned in #59; Cypress intercepts are harder to selectively remove          |
| `network`                 | Workaround     | —           | Passive `cy.intercept('**', handler)` as listener | Planned in #59; must register a catch-all intercept before navigation  |

### DevTools

| playwright-cli command    | Classification | cypress-cli | Cypress API / Approach                                                     | Notes                                                                                         |
| ------------------------- | -------------- | ----------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `console [min-level]`     | Workaround     | —           | `Cypress.on('window:before:load', win => win.console.log = spy)`          | Planned in #58; requires monkey-patching console before page load                             |
| `run-code <code>`         | Workaround     | —           | `cy.window().then(win => win.eval(code))`                                 | Planned in #61; equivalent to eval but runs arbitrary Playwright code → needs Cypress mapping |
| `tracing-start`           | Infeasible     | —           | —                                                                          | Cypress only supports config-level `video: true`; no runtime start/stop                       |
| `tracing-stop`            | Infeasible     | —           | —                                                                          | Same — tracing is a launch-time config, not a runtime toggle                                  |
| `video-start`             | Infeasible     | —           | —                                                                          | Cypress `video: true` is config-only; cannot start mid-session                                |
| `video-stop [filename]`   | Infeasible     | —           | —                                                                          | Cannot stop/save video mid-session; file is written at Cypress process exit                   |

### Session Management

| playwright-cli command      | Classification | cypress-cli | Cypress API / Approach              | Notes                                                                                         |
| --------------------------- | -------------- | ----------- | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| `-s=name <cmd>`             | Limited        | —           | Separate Cypress+Electron process   | Each named session would need its own Cypress process; much heavier than Playwright's model   |
| `list`                      | Limited        | `status`    | Daemon tracks active sessions       | Implemented (single session); multi-session listing needs multi-process support                |
| `close-all`                 | Limited        | `stop`      | Kill all Cypress processes          | Would need multi-process tracking in the daemon                                               |
| `kill-all`                  | Limited        | —           | Force-kill all Cypress processes    | Same multi-process constraint                                                                 |
| `delete-data`               | Workaround     | —           | `cy.clearCookies()` + `cy.clearLocalStorage()` + clear sessionStorage | Planned in #63; can clear browser state but not disk profiles |
| `show` (dashboard)          | Infeasible     | —           | —                                   | Would require significant UI infrastructure; Cypress has no remote screencast API             |

### Open Parameters

| playwright-cli parameter   | Classification | cypress-cli | Cypress API / Approach                         | Notes                                                                  |
| -------------------------- | -------------- | ----------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| `--browser=chrome`         | Direct         | `open`      | `cypress.run({ browser: 'chrome' })`           | Cypress supports Chrome, Edge, Firefox, Electron                       |
| `--headed`                 | Direct         | `open`      | `cypress.run({ headed: true })`                | Supported                                                              |
| `--extension`              | Infeasible     | —           | —                                              | Cypress manages its own browser lifecycle; cannot attach to existing    |
| `--persistent`             | Limited        | —           | —                                              | Cypress uses its own profile management; no direct `userDataDir` equiv |
| `--profile=<path>`         | Limited        | —           | —                                              | Same — Cypress controls browser profile internally                     |
| `--config=file.json`       | Limited        | —           | `cypress.config.js`                            | Cypress has its own config format; not a 1:1 mapping                   |

## Summary by Classification

| Classification | Count | Percentage |
| -------------- | ----- | ---------- |
| **Direct**     | 28    | 37%        |
| **Workaround** | 20    | 26%        |
| **Limited**    | 16    | 21%        |
| **Infeasible** | 12    | 16%        |

**Total entries audited: 76** (includes command flag variants and open
parameters; some playwright-cli "commands" like `screenshot --filename` are
listed as separate entries from `screenshot` to clarify per-variant feasibility)

## Infeasible Commands — Detailed Rationale

### Tab Management (`tab-list`, `tab-new`, `tab-close`, `tab-select`)

Cypress executes tests inside a single browser tab using an iframe-based
architecture. The test runner (`cypress-runner.js`) occupies the outer frame and
the application under test (AUT) runs in an inner iframe. There is no API to
create, list, or switch between browser tabs. This is a fundamental architectural
constraint — Cypress intercepts and controls the page at the DOM level, not at
the browser level. Links with `target="_blank"` are rewritten to open in the same
tab.

### PDF Generation (`pdf`, `pdf --filename`)

Playwright uses the CDP `Page.printToPDF` method which is a Chrome DevTools
Protocol command. Cypress does not expose CDP access and has no built-in PDF
generation. A `cy.task()` bridge to a headless Chrome instance could theoretically
generate PDFs, but this would be a separate process outside Cypress's test runner
and would not capture the current page state.

### Tracing and Video (`tracing-start`, `tracing-stop`, `video-start`, `video-stop`)

Cypress supports `video: true` in `cypress.config.js`, but this is a
launch-time setting that records the entire test run. There is no API to
start/stop recording mid-session or to extract a video segment. Similarly,
Cypress has no equivalent to Playwright's tracing API which records a HAR-like
trace with screenshots, network events, and DOM snapshots that can be started
and stopped programmatically.

### Session Dashboard (`show`)

The `playwright-cli show` command opens a visual dashboard with live screencast
previews of all running sessions. Cypress has no remote screencast or live-preview
API. Building equivalent functionality would require a separate web UI, video
streaming infrastructure, and remote input forwarding — far outside Cypress's
architecture.

### Browser Extension Connect (`open --extension`)

Playwright can connect to an existing browser instance via a Chrome DevTools
Protocol endpoint or browser extension. Cypress launches and manages its own
browser instance; it cannot attach to a running browser. This is by design —
Cypress injects its test runner into the browser at launch time.

## Workaround Approaches

### `eval` / `run-code` — JavaScript Execution

**Approach**: `cy.window().then(win => win.eval(expression))` for page-level
evaluation. For element-level eval, resolve the ref to a DOM element first, then
pass it: `cy.wrap(element).then($el => func($el[0]))`.

**Limitation**: Cypress commands are asynchronous and chained. The result of
`eval` must be captured inside a `.then()` callback and cannot be directly
returned to the caller in the same tick.

### `dialog-accept` / `dialog-dismiss` — Dialog Handling

**Approach**: Register event listeners before the action that triggers the dialog:
```
cy.on('window:alert', () => true)       // auto-accept alerts
cy.on('window:confirm', () => true)     // accept confirms
cy.on('window:confirm', () => false)    // dismiss confirms
```

**Limitation**: Listeners must be registered _before_ the triggering action. The
`window:prompt` event does not exist in Cypress — prompts automatically return
`null` unless a stub is set up via `cy.stub(win, 'prompt').returns('text')`.

### `console` — Console Message Capture

**Approach**: Monkey-patch console methods during the `window:before:load` event:
```
Cypress.on('window:before:load', (win) => {
  const messages = [];
  ['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
    const original = win.console[method];
    win.console[method] = (...args) => {
      messages.push({ level: method, text: args.join(' ') });
      original.apply(win.console, args);
    };
  });
});
```

**Limitation**: Only captures messages after the hook is registered. Messages
from scripts that run before Cypress's injection point are missed.

### `network` — Request Logging

**Approach**: Register a catch-all intercept before navigation:
```
const requests = [];
cy.intercept('**', (req) => {
  requests.push({ method: req.method, url: req.url });
  req.continue();
});
```

**Limitation**: Must be registered before the requests you want to capture.
Passive logging (without modifying requests) still requires `req.continue()`.
Does not capture requests made before `cy.intercept()` is registered.

### `state-save` / `state-load` — Storage State

**Approach**: Serialize cookies via `cy.getCookies()`, localStorage/sessionStorage
via `cy.window().then(win => ...)`, and write to a JSON file via `cy.writeFile()`.
Restore by reading the file and calling `cy.setCookie()` / `win.localStorage.setItem()`.

**Limitation**: Does not capture IndexedDB, Cache API, or service worker state.
Cookie attributes like `HttpOnly` may have limitations when restoring.

### localStorage / sessionStorage Commands

**Approach**: All localStorage and sessionStorage operations use
`cy.window().then(win => win.localStorage.*)` or
`cy.window().then(win => win.sessionStorage.*)`.

**Limitation**: These are straightforward workarounds with near-identical
behavior to native APIs. The only caveat is that access is async through the
Cypress command chain.

## References

- playwright-cli commands: <https://github.com/microsoft/playwright-cli#commands>
- cypress-cli commands: [`docs/COMMANDS.md`](./COMMANDS.md)
- cypress-cli roadmap: [`docs/ROADMAP.md`](./ROADMAP.md)
- Driver spec implementation: [`src/cypress/driverSpec.ts`](../src/cypress/driverSpec.ts)
- Cypress API docs: <https://docs.cypress.io/api/table-of-contents>
