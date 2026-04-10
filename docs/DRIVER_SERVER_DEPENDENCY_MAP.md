# Cypress Driver: Server Dependency Map

> Research output: What Node.js/server dependencies does `packages/driver` have,
> and what would need to be replaced to run it in a pure browser context?

---

## 1. `Cypress.backend()` — Driver-to-Server RPC

**Mechanism:** `$Cypress.backendRequestHandler()` emits a `'backend:request'` event
via socket.io. The server's `socket-base.ts` receives it in `socket.on('backend:request', …)`,
dispatches to the appropriate handler, and calls back with `{ response }` or `{ error }`.

| Backend Event                                    | Used By                                                                        | Server Handler                                       | What It Does                                                                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `resolve:url`                                    | `cy.visit()`                                                                   | `server-base._onResolveUrl()`                        | Makes the actual HTTP request from Node, follows redirects, checks status codes, returns response metadata (url, originalUrl, cookies, redirects, contentType, filePath, isOkStatusCode, isHtml) |
| `http:request`                                   | `cy.request()`                                                                 | `server-base._onRequest()` → `lib/request.js`        | Performs HTTP requests from Node.js (with cookie jar, redirect following, auth)                                                                                                                  |
| `reset:server:state`                             | Navigation (before each test)                                                  | `server-base.startWebsockets` → `onResetServerState` | Resets network proxy, net-stubbing state, remote states, credentials                                                                                                                             |
| `get:fixture`                                    | `cy.fixture()`                                                                 | `lib/fixture.ts`                                     | Reads fixture files from disk at `config.fixturesFolder`                                                                                                                                         |
| `run:privileged`                                 | `cy.exec()`, `cy.task()`, `cy.readFile()`, `cy.writeFile()`, `cy.selectFile()` | Privileged command handler                           | Executes Node.js-only operations: spawn processes, run task plugins, read/write arbitrary filesystem paths                                                                                       |
| `net`                                            | `cy.intercept()` (net-stubbing)                                                | `net-stubbing/lib/server/driver-events.ts`           | Sub-events: `route:added`, `subscribe`, `event:handler:resolved`, `send:static:response`. Manages request interception in the proxy                                                              |
| `preserve:run:state`                             | `cy.visit()` (cross-origin)                                                    | `socket-base.ts` stores in var `runState`            | Preserves Mocha runner state when navigating to a different origin (top-level window reload)                                                                                                     |
| `save:session` / `get:session` / `clear:session` | `cy.session()`                                                                 | `lib/session.ts`                                     | Session state persistence across tests                                                                                                                                                           |
| `close:extra:targets`                            | `cy.ts` (before each test)                                                     | CDP automation                                       | Closes extra browser tabs/targets before test runs                                                                                                                                               |
| `cross:origin:cookies:received`                  | Cross-origin cookie sync                                                       | Cookie handler                                       | Notifies server that cross-origin cookies were received                                                                                                                                          |
| `cross:origin:set:cookie`                        | Cross-origin cookie set                                                        | Cookie handler                                       | Sets cookies for cross-origin contexts                                                                                                                                                           |
| `get:rendered:html:origins`                      | Cross-origin HTML                                                              | Proxy HTML origin tracker                            | Returns which origins have been rendered as HTML (for proxy injection decisions)                                                                                                                 |
| `request:sent:with:credentials`                  | Cross-origin credential tracking                                               | Credential manager                                   | Tracks whether a request was sent with credentials                                                                                                                                               |

### Replacement Difficulty

| Event                    | Browser Alternative                                                                                                                          | Difficulty                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `resolve:url`            | `fetch()` with `redirect: 'manual'` + manual redirect following. Loses: cookie jar integration, proxy-level response buffering, file serving | **Hard** — The proxy's URL resolution does much more than a simple HTTP request          |
| `http:request`           | `fetch()` or `XMLHttpRequest`. Loses: CORS bypass (Node makes the request, not the browser), cookie jar                                      | **Hard** — The whole point is bypassing browser CORS                                     |
| `reset:server:state`     | Would need browser-side state tracking. No proxy/net-stubbing state to reset                                                                 | **Moderate** — Only needed if you keep the proxy                                         |
| `get:fixture`            | `fetch('/fixtures/...')` from a static file server, or embed fixtures in the bundle                                                          | **Easy**                                                                                 |
| `run:privileged`         | Not possible in browser. `cy.exec()`, `cy.task()` are inherently Node.js                                                                     | **Impossible** for exec/task; **Easy** for readFile/writeFile via fetch to a file server |
| `net`                    | Service Worker-based interception (like MSW). Partial: can't intercept non-fetch requests transparently                                      | **Hard** — Would need to rewrite the entire net-stubbing layer                           |
| `preserve:run:state`     | `sessionStorage` or `postMessage` between frames                                                                                             | **Moderate**                                                                             |
| `save/get/clear:session` | `sessionStorage` / `IndexedDB`                                                                                                               | **Easy**                                                                                 |
| `close:extra:targets`    | Not possible without CDP/automation                                                                                                          | **Impossible** in pure browser                                                           |
| `cross:origin:*`         | `postMessage` between frames (already partially done via specBridgeCommunicator)                                                             | **Moderate**                                                                             |

---

## 2. `Cypress.automation()` — Driver-to-Browser Automation

**Mechanism:** `$Cypress.automation()` emits `'automation:request'` via socket.io.
The server's `Automation` class receives it, normalizes the request, and delegates
to the active automation client (CDP, browser extension, or WebKit Playwright).

| Automation Event                   | Used By                     | Handled By                                                       | What It Does                                                             |
| ---------------------------------- | --------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `get:cookies`                      | `cy.getCookies()`           | CDP `Network.getAllCookies` / Extension `browser.cookies.getAll` | Get all cookies matching filter                                          |
| `get:cookie`                       | `cy.getCookie()`            | CDP / Extension                                                  | Get a specific cookie                                                    |
| `set:cookie`                       | `cy.setCookie()`            | CDP `Network.setCookie` / Extension                              | Set a cookie                                                             |
| `set:cookies` / `add:cookies`      | Internal cookie sync        | CDP / Extension                                                  | Set multiple cookies (used by cross-origin cookie sync)                  |
| `clear:cookie`                     | `cy.clearCookie()`          | CDP / Extension                                                  | Clear a specific cookie                                                  |
| `clear:cookies`                    | `cy.clearCookies()`         | CDP / Extension                                                  | Clear all cookies matching filter                                        |
| `take:screenshot`                  | `cy.screenshot()`           | CDP `Page.captureScreenshot` / WebKit `page.screenshot()`        | Capture a screenshot                                                     |
| `get:aut:url`                      | `cy.url()`, `cy.location()` | CDP `Runtime.evaluate` on AUT frame                              | Get the actual URL of the AUT iframe (bypasses same-origin restrictions) |
| `get:aut:title`                    | `cy.title()`                | CDP `Runtime.evaluate` on AUT frame                              | Get the document title from the AUT                                      |
| `reload:aut:frame`                 | `cy.reload()`               | CDP evaluation                                                   | Reload the AUT iframe                                                    |
| `focus:browser:window`             | Internal                    | CDP / Extension                                                  | Focus the browser window                                                 |
| `reset:browser:state`              | Between specs               | Extension `resetBrowserState`                                    | Reset browser state                                                      |
| `reset:browser:tabs:for:next:spec` | Between specs               | CDP                                                              | Reset tabs for next spec                                                 |

### Replacement Difficulty

| Event                            | Browser Alternative                                                                                                     | Difficulty                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `get:cookies` / `get:cookie`     | `document.cookie` parsing; `js-cookie` library (already used in driver). Loses: httpOnly cookies, path/domain filtering | **Moderate** — httpOnly cookies are invisible to JS |
| `set:cookie`                     | `document.cookie = ...` or `js-cookie`. Loses: httpOnly, secure flag on http: origins                                   | **Moderate**                                        |
| `clear:cookie` / `clear:cookies` | `document.cookie` with expiry in the past. Loses: httpOnly cookies                                                      | **Moderate**                                        |
| `take:screenshot`                | `html2canvas` or `dom-to-image`. Loses: full-page capture, native rendering fidelity                                    | **Hard** — No perfect browser-only screenshot       |
| `get:aut:url`                    | `contentWindow.location.href` if same-origin. Fails cross-origin                                                        | **Easy** same-origin / **Impossible** cross-origin  |
| `get:aut:title`                  | `contentWindow.document.title` if same-origin                                                                           | **Easy** same-origin / **Impossible** cross-origin  |
| `reload:aut:frame`               | `iframe.contentWindow.location.reload()` if same-origin                                                                 | **Easy** same-origin / **Impossible** cross-origin  |
| `focus:browser:window`           | `window.focus()` — limited effectiveness                                                                                | **Trivial**                                         |
| `reset:browser:*`                | Not possible without CDP                                                                                                | **Impossible**                                      |

---

## 3. HTTP Proxy Role

The Cypress proxy (`packages/proxy`) sits between the browser and the internet.
Every HTTP request from the AUT goes through it. The driver has tight coupling:

### What the proxy does:

1. **Script injection**: Injects `packages/runner/injection/main.js` into AUT `<head>`.
   This script sets `window.Cypress = parent.Cypress`, patches `XMLHttpRequest`,
   patches timers, and patches `fetch` — making the Cypress driver available in the AUT.

2. **`document.domain` injection**: For cross-subdomain testing, the proxy injects
   `document.domain = 'superdomain'` so the parent frame and AUT can communicate.

3. **Response modification**: Strips `X-Frame-Options`, `Content-Security-Policy`,
   and other headers that would prevent the AUT from loading in an iframe.

4. **Browser pre-request correlation**: Pairs CDP `Network.requestWillBeSent` events
   with actual HTTP requests flowing through the proxy, enabling accurate network logging.

5. **Net-stubbing / `cy.intercept()`**: The proxy's request middleware checks all
   outgoing requests against registered route matchers and applies static responses,
   delays, throttling, etc.

6. **Cookie management**: The proxy attaches cross-origin cookies to requests and
   manages the `__cypress.initial` cookie for load detection.

7. **File serving**: Serves spec files, support files, and fixtures from
   `/__cypress/tests/`, `/__cypress/iframes/`, etc.

### Driver-side proxy coupling:

- **`ProxyLogging`** (`src/cypress/proxy-logging.ts`): The driver has a `ProxyLogging`
  class that tracks proxy requests/responses for the command log. It listens to
  `request:event` socket events from the server.

- **`__cypress.initial` cookie**: Used by `cy.visit()` to detect page load. Set before
  navigation, checked after load.

- **`/__cypress/*` URL paths**: The driver knows about special proxy routes for
  serving test files, iframes, and screenshots.

### Replacement for pure browser:

| Proxy Function                          | Alternative                                                                                                                                                                                          | Difficulty                     |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Script injection                        | Pre-inject scripts via build step, or use a Service Worker to intercept and modify HTML responses                                                                                                    | **Hard**                       |
| Header stripping (X-Frame-Options, CSP) | Service Worker can modify response headers. Or: use `chrome.declarativeNetRequest` API. Or: just don't use iframes (run tests in same frame)                                                         | **Hard** without SW            |
| Net-stubbing                            | Service Worker + `FetchEvent.respondWith()`. Libraries like MSW do this. Loses: non-fetch request interception (images, scripts loaded via `<script>` tags work, but WebSocket interception doesn't) | **Hard** — significant rewrite |
| Browser pre-request correlation         | Not needed without the proxy                                                                                                                                                                         | **N/A**                        |
| Cookie management                       | `document.cookie` + `cookieStore` API                                                                                                                                                                | **Moderate**                   |
| File serving                            | Static file server or bundled fixtures                                                                                                                                                               | **Easy**                       |

---

## 4. WebSocket / Socket.IO Connection

### Architecture:

```
Browser (Driver)  ←— socket.io —→  Node.js (Server)
                                        ↕
                              Browser Automation
                              (CDP / Extension / WebKit)
```

**Client-side setup** (`packages/app/src/runner/index.ts`):

```ts
import { createWebsocket as createWebsocketIo } from '@packages/socket/browser/client';

export function createWebsocket(config: Cypress.Config) {
	const ws = createWebsocketIo({
		path: config.socketIoRoute, // typically '/__socket'
		browserFamily: config.browser.family,
	});
	ws.on('connect', () => ws.emit('runner:connected'));
	return ws;
}
```

**Two transport modes:**

1. **Socket.IO (WebSocket upgrade)**: Standard for non-Chromium browsers (Firefox, WebKit)
2. **CDP Browser Socket** (`@packages/socket/lib/client/cdp-browser.ts`): For Chromium,
   uses `window[cypressSocket-${namespace}]` and `window[cypressSendToServer-${namespace}]`
   to communicate via Chrome DevTools Protocol instead of WebSocket.

**Key socket events (browser → server):**

- `backend:request` — RPC to server (see §1)
- `automation:request` — RPC to browser automation (see §2)
- `automation:client:connected` — Automation client registration
- `runner:connected` — Runner registration
- `automation:push:request` — Push automation events (cookie changes, downloads)

**Key socket events (server → browser):**

- `automation:push:message` — Push automation events to driver
- `request:event` — Proxy request lifecycle events
- `net:stubbing:event` — Net-stubbing events from server to driver
- `watched:file:changed` — File watcher events
- `change:to:url` — Force URL change

### Replacement:

For a pure browser context, the socket.io connection is **the primary dependency**.
Everything in §1 and §2 flows through it. Options:

1. **Replace with in-process calls**: If driver and "server" logic run in the same
   browser context, replace socket events with direct function calls.
2. **Replace with Service Worker**: Service Worker acts as the "server" for intercepting
   requests and managing state.
3. **Replace with parent/child postMessage**: If using iframe architecture.

**Difficulty: Hard** — This is the central nervous system of the driver.

---

## 5. `cy.visit()` Implementation Deep Dive

**File:** `packages/driver/src/cy/commands/navigation.ts` (~1200 lines)

### Flow:

```
cy.visit(url)
    │
    ├─ 1. Validate options (method, qs, headers, auth, body)
    ├─ 2. Normalize URL (prepend baseUrl, qualify with existing origin)
    ├─ 3. Strip hash and auth from URL
    │
    ├─ 4. Cypress.backend('resolve:url', url, options)
    │      │
    │      └─ Server: _onResolveUrl()
    │           ├─ Make HTTP request (with auth, cookie jar)
    │           ├─ Follow redirects (recording chain)
    │           ├─ Check isOkStatusCode, isHtml, contentType
    │           ├─ Buffer the response body (for proxy to serve later)
    │           └─ Return { url, originalUrl, cookies, redirects, filePath,
    │                       isOkStatusCode, isHtml, contentType, status, statusText }
    │
    ├─ 5. Check if same-origin as current
    │      ├─ YES: $utils.iframeSrc($autIframe, url)  ← set iframe src
    │      │       Wait for 'window:load' event
    │      │
    │      └─ NO (cross-origin):
    │           ├─ Cypress.preserveRunState(testId)  ← save mocha state
    │           ├─ $utils.locHref(newUri, window)    ← navigate top window
    │           └─ Return Promise that never resolves (page is reloading)
    │
    ├─ 6. In cross-origin spec bridge:
    │      └─ Cypress.specBridgeCommunicator.toPrimary('visit:url', { url })
    │
    ├─ 7. onLoad callback:
    │      ├─ Call options.onBeforeLoad(contentWindow)
    │      ├─ Call options.onLoad(contentWindow)
    │      └─ Set consoleProps (Resolved Url, Redirects, Cookies Set)
    │
    └─ 8. Error handling:
           ├─ gotResponse errors → loading_http_failed / loading_file_failed
           ├─ invalidContentType → loading_invalid_content_type
           ├─ Network errors → loading_network_failed
           └─ onBeforeLoad/onLoad errors → re-throw
```

### Why `resolve:url` can't trivially be replaced:

The server's `_onResolveUrl` does much more than `fetch()`:

1. Uses Node.js `request` library with a **cookie jar** that tracks cookies across
   redirects, setting cookies on the browser via automation after each redirect.
2. **Buffers the response** so the proxy can serve it from cache when the iframe
   actually loads (preventing a double-fetch).
3. Determines if the URL points to a **local file** (returns `filePath`) vs HTTP.
4. Returns structured metadata needed for error messages.
5. Handles **auth options** (basic auth in headers).

### For your CLI:

Since `cypress-cli` uses Cypress's Module API and real browser + proxy, `cy.visit()`
works as-is. The dependency on `resolve:url` is only relevant if you tried to run
the driver without the Cypress server.

---

## 6. Mocha / Runner Dependency

### How deeply is Mocha integrated?

**Very deeply.** The driver doesn't just "use" Mocha — it fundamentally **is** a
Mocha runner with a modified execution model.

**`src/cypress/mocha.ts`** (>700 lines):

- Imports Mocha library: `import * as mocha from 'mocha'`
- Saves original prototypes: `Runner.prototype.run`, `Runner.prototype.fail`,
  `Runnable.prototype.run`, `Suite.prototype.addTest`, `Test.prototype.clone`, etc.
- **Patches Runner.prototype.run**: Replaces it to return `this` (the runner instance)
  instead of actually running — Cypress controls execution timing.
- **Patches Runnable.prototype.run**: Intercepts with `Cypress.action('mocha:runnable:run', …)`
  so Cypress can wrap each runnable in its command queue + promise chain.
- **Patches Runner.prototype.runTests**: Hacks `suite.tests.slice()` to maintain a
  mutable test queue (for dynamic test addition in Studio).
- Creates `describe()`, `it()`, `before()`, `beforeEach()`, etc. on the spec window.
- Handles test retries via `Test.prototype.retries` override.

**`src/cypress/runner.ts`** (>1900 lines):

- Wraps Mocha runner with Cypress lifecycle events.
- Manages: `_tests`, `_testsById`, `_testsQueue`, `_emissions`, `_startTime`.
- Fires events: `runner:start`, `runner:end`, `runner:suite:start`, `runner:test:start`,
  `runner:test:end`, `runner:pass`, `runner:fail`, `runner:pending`, `runner:retry`.
- `onRunnableRun()`: The critical integration point — intercepts Mocha's execution
  of each runnable, wraps it in Cypress's promise chain, manages `cy.state()`.
- `run()`: Calls `_runner.run()` and handles cleanup on completion.

**`$Cypress.action()`** (~200+ lines of switch cases):

- Maps ~30 runner events to Cypress events + mocha reporter events.
- Controls the entire test lifecycle from the driver.

### Can the driver work without Mocha?

**Not without major surgery.** The command queue, retries, hooks, and test lifecycle
are all wired through Mocha's runner. However, for a non-test-runner use case
(like `cypress-cli`), you could:

1. **Create a minimal single-test wrapper**: A single `it()` block that never ends,
   allowing commands to be enqueued and executed continuously.
2. **Replace Mocha with a command-queue-only executor**: Strip out suite/test/hook
   management and just keep the command queue + retries.

**Difficulty: Hard** — Would require rewriting the core execution model.

---

## 7. "Pure Browser" Estimate

### By source directory:

| Directory                       | LOC (approx) | Server Dependency                             | Notes                                                                                                                           |
| ------------------------------- | ------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `src/dom/`                      | ~3000        | **None**                                      | DOM utilities, visibility, coordinates, jQuery wrappers                                                                         |
| `src/cy/commands/querying.ts`   | ~400         | **None**                                      | `cy.get()`, `cy.contains()`                                                                                                     |
| `src/cy/commands/traversal.ts`  | ~300         | **None**                                      | `.find()`, `.filter()`, `.children()`, etc.                                                                                     |
| `src/cy/commands/actions/`      | ~3000        | **None**                                      | `.click()`, `.type()`, `.check()`, `.select()`, `.trigger()`, `.scrollTo()`                                                     |
| `src/cy/commands/connectors.ts` | ~500         | **None**                                      | `.then()`, `.each()`, `.spread()`, `.invoke()`, `.its()`                                                                        |
| `src/cy/commands/asserting.ts`  | ~200         | **None**                                      | `.should()`, `.and()`                                                                                                           |
| `src/cy/commands/window.ts`     | ~100         | **None** (for `cy.window()`, `cy.document()`) | `cy.title()` uses automation for cross-origin                                                                                   |
| `src/cy/commands/waiting.ts`    | ~300         | **Indirect**                                  | `cy.wait()` for aliases is pure; `cy.wait(@intercept)` needs net-stubbing                                                       |
| `src/cy/commands/misc.ts`       | ~100         | **None**                                      | `.log()`, `.end()`, `.noop()`, `.wrap()`                                                                                        |
| `src/cy/` (core)                | ~2000        | **None**                                      | keyboard, mouse, focused, aliases, retries, timeouts, stability, snapshots, jquery, chai, timers, location                      |
| `src/cypress/` (core)           | ~3000        | **None**                                      | command.ts, command_queue.ts, chainer.ts, error_utils.ts, log.ts, location.ts, setter_getter.ts, events.ts, ensure.ts, utils.ts |
| **Subtotal: Pure browser**      | **~13,000**  |                                               |                                                                                                                                 |
| `src/cy/commands/navigation.ts` | ~1200        | **Heavy**                                     | `cy.visit()`, `cy.go()`, `cy.reload()` — requires `resolve:url`, `reset:server:state`, automation                               |
| `src/cy/commands/cookies.ts`    | ~400         | **Heavy**                                     | All cookie commands → automation                                                                                                |
| `src/cy/commands/request.ts`    | ~500         | **Heavy**                                     | `cy.request()` → `http:request`                                                                                                 |
| `src/cy/commands/screenshot.ts` | ~400         | **Heavy**                                     | → `take:screenshot` automation                                                                                                  |
| `src/cy/commands/files.ts`      | ~300         | **Heavy**                                     | `cy.fixture()`, `cy.readFile()`, `cy.writeFile()`                                                                               |
| `src/cy/commands/exec.ts`       | ~100         | **Heavy**                                     | `cy.exec()` → Node.js subprocess                                                                                                |
| `src/cy/commands/task.ts`       | ~100         | **Heavy**                                     | `cy.task()` → Node.js plugin                                                                                                    |
| `src/cy/commands/session/`      | ~800         | **Heavy**                                     | `cy.session()` → server persistence                                                                                             |
| `src/cy/commands/location.ts`   | ~100         | **Moderate**                                  | `cy.url()`, `cy.location()` → automation for cross-origin                                                                       |
| `src/cy/net-stubbing/`          | ~1500        | **Heavy**                                     | `cy.intercept()` → proxy integration                                                                                            |
| `src/cypress/runner.ts`         | ~1900        | **Structural**                                | Mocha integration (no server I/O, but deeply coupled to test runner model)                                                      |
| `src/cypress/mocha.ts`          | ~700         | **Structural**                                | Mocha patching                                                                                                                  |
| `src/cypress/proxy-logging.ts`  | ~500         | **Heavy**                                     | Proxy request tracking                                                                                                          |
| `src/cypress/cookies.ts`        | ~200         | **Moderate**                                  | Imports from `@packages/server`                                                                                                 |
| `src/cross-origin/`             | ~2000        | **Heavy**                                     | Cross-origin spec bridge → socket.io for backend/automation                                                                     |
| **Subtotal: Server-dependent**  | **~10,700**  |                                               |                                                                                                                                 |

### Estimate:

**~55% of driver code is pure browser** (no server dependency).
**~45% requires server/automation/proxy**.

However, the 55% that's "pure" includes the most used code paths:

- All DOM querying commands
- All DOM action commands (click, type, check, etc.)
- All assertion commands
- Command queue execution
- Retry & timeout logic
- Keyboard & mouse simulation

The 45% that requires the server includes:

- Navigation (`cy.visit()`)
- Cookies (all operations)
- HTTP requests (`cy.request()`)
- Screenshots
- File I/O
- Network interception
- Cross-origin support
- Test lifecycle (Mocha/Runner)

---

## Summary: Replacement Strategy for Pure Browser

### Tier 1: Drop-in replacements (Easy)

- `get:fixture` → `fetch('/fixtures/...')`
- `save/get/clear:session` → `sessionStorage` / `IndexedDB`
- `get:aut:url` / `get:aut:title` → `contentWindow.location.href` / `document.title` (same-origin only)
- `reload:aut:frame` → `contentWindow.location.reload()` (same-origin only)
- `focus:browser:window` → `window.focus()`

### Tier 2: Feasible alternatives (Moderate)

- Cookie automation → `document.cookie` + `cookieStore` API (loses httpOnly)
- `preserve:run:state` → `sessionStorage` + `postMessage`
- Cross-origin communication → `postMessage` (already partially implemented)
- Proxy header stripping → Service Worker response header manipulation

### Tier 3: Major rewrites (Hard)

- `resolve:url` → Would need a fetch-based URL resolver + response caching strategy
- `http:request` → fetch() with CORS proxy or Service Worker
- Net-stubbing → Service Worker-based interception (MSW-style)
- Proxy script injection → Pre-bundled scripts or Service Worker HTML rewriting
- Screenshot → `html2canvas` or similar (lossy)
- Mocha/Runner → Custom command-queue-only executor

### Tier 4: Not possible in pure browser (Impossible)

- `cy.exec()` — Needs Node.js process spawning
- `cy.task()` — Needs Node.js plugin system
- `close:extra:targets` — Needs CDP
- `reset:browser:state` / `reset:browser:tabs` — Needs CDP/Extension
- Cross-origin automation (cookies, URL, title) — Needs CDP to bypass same-origin
- httpOnly cookie access — Needs CDP or Extension
