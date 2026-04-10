# Tier 3: Fork Cypress Driver — Plan

> **Goal:** A browser-hosted live Cypress session where users (or LLMs)
> execute real Cypress commands with full retry/actionability/auto-wait
> semantics — running entirely in the browser, no Node.js backend required.
> This is a live, editable Cypress test session without the restart-on-edit
> cycle.
>
> **Phasing:** Start with same-origin content (like our Tier 1 demo), then
> upgrade to arbitrary sites via a lightweight proxy or Service Worker.
>
> **License:** Cypress is MIT-licensed. Forking `packages/driver` is
> permitted for any use including commercial.
>
> **Key insight:** The Cypress driver is already browser code. Cypress's
> server exists only to bootstrap it, proxy the AUT into a same-origin
> iframe, and handle Node.js-only operations. We replicate the bootstrap,
> skip the proxy (same-origin content doesn't need it), and shim the
> server-dependent calls.

---

## Related Documents

- **[DRIVER_EXTRACTION.md](DRIVER_EXTRACTION.md)** — Full architecture
  and analysis of the extraction approach. Covers what the driver is,
  what's browser-safe vs. server-dependent, Mocha coupling analysis,
  extraction strategy, bundle dependencies, and alternatives considered.

- **[DRIVER_BOOTSTRAP_SEQUENCE.md](DRIVER_BOOTSTRAP_SEQUENCE.md)** — Step-by-step
  documentation of how Cypress boots the driver in the browser (4 phases,
  every function call traced). This is the sequence we replicate in simplified
  form.

- **[DRIVER_SHIM_SPEC.md](DRIVER_SHIM_SPEC.md)** — Specification for each
  shim that replaces a server dependency: backend, automation, navigation,
  config, runnable, and event forwarding. Includes implementation code and
  known limitations.

- **[DRIVER_BUILD_STRATEGY.md](DRIVER_BUILD_STRATEGY.md)** — How to vendor,
  build, and bundle the extracted driver. Covers the copy process, dependency
  resolution, esbuild config, import path rewriting, bundle size budget, and
  upgrade process.

- **[DRIVER_SERVER_DEPENDENCY_MAP.md](DRIVER_SERVER_DEPENDENCY_MAP.md)** —
  Complete map of every `Cypress.backend()` and `Cypress.automation()` call
  in the driver, what the server does for each, and the difficulty of
  browser-only replacement.

---

## Table of Contents

1. [Why Fork the Driver](#why-fork-the-driver)
2. [What We Get from the Fork](#what-we-get-from-the-fork)
3. [What We Must Replace](#what-we-must-replace)
4. [Runtime Target: Pros & Cons](#runtime-target-pros--cons)
5. [Architecture](#architecture)
6. [Phased Implementation](#phased-implementation)
7. [Risk Assessment](#risk-assessment)
8. [File Inventory](#file-inventory)

---

## Why Fork the Driver

The Tier 1 demo proved that ~35 commands work with vanilla DOM APIs. But
the demo has **no retry, no actionability, no auto-wait**. When `.click()`
fails because an element is animating, covered by an overlay, or not yet
in the DOM — the demo just throws immediately.

The Cypress driver's value is its **command queue + retry loop +
actionability engine**:

```
Command enqueued → actionability checks (visible? enabled? not covered?
not animating?) → retry on failure → timeout → execute action → verify
upcoming assertions → retry if assertion fails
```

This is ~20,000 lines of battle-tested code that handles edge cases
(sticky headers covering elements, CSS transitions, disabled fieldsets,
detached DOM nodes, etc.). Reimplementing this from scratch would take
months and produce an inferior result.

The driver is ~55% browser-safe code (command queue, retry logic,
actionability, DOM queries, assertions, keyboard/mouse simulation) and
~45% server-dependent code (navigation via proxy, cy.task IPC, cookies
via automation protocol, file I/O, network interception). We fork the
55% and replace or stub the 45%.

---

## What We Get from the Fork

### Keep (browser-safe, zero changes needed)

| Module                               | LOC         | Purpose                                                         |
| ------------------------------------ | ----------- | --------------------------------------------------------------- |
| `src/cy/actionability.ts`            | ~635        | Visibility, scroll, animation, covered-element, disabled checks |
| `src/cy/retries.ts`                  | ~100        | `retry()` with timeout, stability wait, interval                |
| `src/cy/assertions.ts`               | ~400        | `verifyUpcomingAssertions()`, `.should()` retry integration     |
| `src/cy/commands/actions/click.ts`   | ~300        | click/dblclick/rightclick with full actionability               |
| `src/cy/commands/actions/type.ts`    | ~800        | Character-by-character typing, special keys, selection          |
| `src/cy/commands/actions/check.ts`   | ~150        | check/uncheck with actionability                                |
| `src/cy/commands/actions/focus.ts`   | ~100        | focus/blur                                                      |
| `src/cy/commands/actions/scroll.ts`  | ~200        | scrollTo, scrollIntoView                                        |
| `src/cy/commands/actions/select.ts`  | ~150        | select with option matching                                     |
| `src/cy/commands/actions/trigger.ts` | ~100        | Generic event dispatch                                          |
| `src/cy/commands/querying/`          | ~500        | cy.get, cy.contains, cy.within, cy.focused                      |
| `src/cy/commands/traversals.ts`      | ~300        | .find, .children, .parent, .siblings, .eq, etc.                 |
| `src/cy/commands/connectors.ts`      | ~200        | .then, .invoke, .its, .each, .spread                            |
| `src/cy/commands/asserting.ts`       | ~200        | .should, .and                                                   |
| `src/cy/commands/aliasing.ts`        | ~100        | .as                                                             |
| `src/cy/commands/window.ts`          | ~100        | cy.window, cy.document, cy.title                                |
| `src/cy/commands/misc.ts`            | ~100        | cy.wrap, cy.log, cy.end                                         |
| `src/cy/commands/waiting.ts`         | ~100        | cy.wait (timeout variant)                                       |
| `src/cy/commands/storage.ts`         | ~200        | localStorage/sessionStorage                                     |
| `src/cypress/command_queue.ts`       | ~400        | Command queue with enqueue/run/next/stop                        |
| `src/cypress/command.ts`             | ~300        | $Command class                                                  |
| `src/cypress/chainer.ts`             | ~200        | Chainer for `.should().and()`                                   |
| `src/cypress/cy.ts`                  | ~1500       | The $Cy class (core orchestrator)                               |
| `src/cypress/error_utils.ts`         | ~600        | Error formatting and messages                                   |
| `src/dom/`                           | ~2000       | DOM utilities (visibility, coordinates, elements)               |
| `src/cy/keyboard/`                   | ~1500       | Keyboard simulation (key maps, modifiers, selection)            |
| `src/cy/mouse.ts`                    | ~500        | Mouse simulation (coords, buttons, moves)                       |
| **Total**                            | **~11,000** |                                                                 |

### Replace (server-dependent → browser alternative)

| Module                             | Current Implementation                               | Replacement                                                                                  |
| ---------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `cy.visit()`                       | `Cypress.backend('resolve:url')` → proxy serves page | `iframe.contentWindow.location.href = url` (same-origin); Service Worker injection (phase 2) |
| `cy.task()`                        | WebSocket to Node.js server                          | `postMessage` to parent frame or direct async function calls                                 |
| `cy.go()` / `cy.reload()`          | Via proxy                                            | `history.back()` / `history.forward()` / `location.reload()`                                 |
| Cookie commands                    | `Cypress.automation('get:cookies')` etc.             | `document.cookie` API (no httpOnly access)                                                   |
| `cy.intercept()`                   | Server-side proxy interception                       | Service Worker `fetch` handler (phase 2)                                                     |
| `cy.exec()` / `cy.task()`          | Node.js process execution                            | Stub with error "not available in browser"                                                   |
| `cy.readFile()` / `cy.writeFile()` | Node.js fs                                           | Stub or use virtual filesystem                                                               |
| `cy.screenshot()`                  | CDP `Page.captureScreenshot`                         | `html2canvas` or stub                                                                        |
| `cy.selectFile()`                  | Synthetic File + DataTransfer                        | Keep — this is browser-side                                                                  |
| Error recovery                     | Mocha test-queue injection                           | Simpler: catch + retry at command level                                                      |
| Mocha integration                  | $Runner wrapping Mocha                               | Remove entirely — we don't run "tests", we run commands                                      |

### Remove (not needed)

| Module                              | Reason                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------- |
| `src/cypress/runner.ts` (~2600 LOC) | We don't run test suites; remove or replace with ~50 LOC fake runnable        |
| `src/cypress/mocha.ts` (~500 LOC)   | Not needed for REPL mode; see Mocha coupling analysis in DRIVER_EXTRACTION.md |
| `src/cross-origin/` (~1000 LOC)     | Phase 1 is same-origin                                                        |
| `src/cy/net-stubbing/` (~800 LOC)   | Phase 2 via Service Worker                                                    |
| `src/cy/commands/sessions/`         | Complex session management                                                    |
| `src/cy/commands/origin/`           | Cross-origin support                                                          |

> **On Mocha:** See [DRIVER_EXTRACTION.md §Mocha Coupling](DRIVER_EXTRACTION.md)
> for the 5 specific coupling points. The Cypress driver uses Mocha's
> `Runnable` for timeout management, its `Runner` for queue startup, and
> `state('runnable')` as a guard in the retry loop. We replace these with
> a ~50 LOC fake runnable object — not a full Mocha removal, just enough
> to make the driver boot without it.

---

## Runtime Target: Pros & Cons

### Option A: Pure Browser (no backend)

```
┌──────────────────────────────────────┐
│  Browser Tab                         │
│  ┌────────────┐  ┌────────────────┐  │
│  │ Studio UI  │  │ AUT iframe     │  │
│  │ (REPL,     │  │ (same-origin)  │  │
│  │  snapshot,  │  │                │  │
│  │  codegen)  │  │ Forked driver  │  │
│  │            │  │ running here   │  │
│  └────────────┘  └────────────────┘  │
│                                      │
│  Service Worker (phase 2):           │
│  intercepts fetch, injects scripts   │
└──────────────────────────────────────┘
```

**Pros:**

- Zero infrastructure. Deploy as a static site (GitHub Pages, Netlify, Vercel)
- No server costs, no scaling concerns
- Instant startup — no process to launch
- Works offline after initial load
- Simplest deployment story for a demo/marketing site
- Matches Tier 1 demo architecture — natural upgrade path

**Cons:**

- Same-origin only in phase 1 (Service Worker unlocks partial cross-origin in phase 2)
- No httpOnly cookie access (browser security prevents it)
- No CDP trusted events (synthetic only)
- `cy.intercept()` replacement via Service Worker has limitations (can't intercept initial navigation)
- No `cy.exec()`, `cy.task()`, file system access

**Best for:** Demo site, documentation, LLM playground, teaching tool

### Option B: Lightweight Edge Proxy (Cloudflare Worker / small Node.js)

```
┌──────────────────────────────────────┐
│  Browser Tab                         │
│  ┌────────────┐  ┌────────────────┐  │
│  │ Studio UI  │  │ AUT iframe     │  │
│  │            │  │ (proxied)      │  │
│  └────────────┘  └────────────────┘  │
└──────────────┬───────────────────────┘
               │ fetch (proxied URLs)
┌──────────────▼───────────────────────┐
│  Edge Proxy (Cloudflare Worker)      │
│  - Fetches target URL               │
│  - Strips X-Frame-Options / CSP     │
│  - Injects driver + snapshot IIFE   │
│  - Rewrites relative URLs           │
└──────────────────────────────────────┘
```

**Pros:**

- Works with ANY website (the proxy fetches it and strips frame-busting headers)
- Script injection at the proxy level (reliable, no Service Worker timing issues)
- Edge deployment = low latency, global availability
- Minimal server code (~200 lines for a CF Worker)
- Can add httpOnly cookie forwarding later
- The existing Cypress proxy is essentially this — we'd be building a simpler version

**Cons:**

- Requires a deployed service (cost, maintenance)
- The proxy sees all traffic (security/privacy consideration for users' sites)
- CORS and cookie jar management gets complex for real-world sites
- Some sites detect and block proxies
- Can't proxy WebSocket traffic easily

**Best for:** Production studio product, testing arbitrary sites

### Option C: WebContainer (StackBlitz-style)

**Pros:** Full Node.js in browser, could run unmodified Cypress

**Cons:** WebContainers can't spawn a real browser (Cypress needs Electron/Chrome). Would still need the driver fork approach. Adds massive complexity (WASM Node runtime) for marginal benefit. Not recommended.

### Recommendation

**Start with Option A (pure browser).** It's the natural continuation of the
Tier 1 demo, requires zero infrastructure, and proves the forked driver
works. Then upgrade to Option B when you want to target arbitrary sites —
the driver code is the same, you just swap the navigation/injection layer.

---

## Architecture

### Phase 1: Same-Origin Studio (Pure Browser)

```
┌─────────────────────────────────────────────────────────┐
│  Studio Page                                            │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  CypressLite (forked driver, no Mocha)          │    │
│  │  ┌──────────────┐  ┌─────────────────────────┐  │    │
│  │  │ CommandQueue  │  │ ActionabilityEngine     │  │    │
│  │  │ enqueue()     │  │ visible? enabled?       │  │    │
│  │  │ run()         │  │ not covered? stable?    │  │    │
│  │  │ next()        │  │ retry(fn, {timeout})    │  │    │
│  │  └──────┬───────┘  └──────────┬──────────────┘  │    │
│  │         │                      │                 │    │
│  │  ┌──────▼──────────────────────▼──────────────┐  │    │
│  │  │ Commands (click, type, get, should, etc.)  │  │    │
│  │  │ - Action commands use ActionabilityEngine  │  │    │
│  │  │ - Query commands use retry + assertions    │  │    │
│  │  │ - Navigation uses iframe.location          │  │    │
│  │  └──────┬─────────────────────────────────────┘  │    │
│  │         │                                        │    │
│  │  ┌──────▼──────────────┐  ┌──────────────────┐  │    │
│  │  │ DOM Utils           │  │ Keyboard / Mouse │  │    │
│  │  │ visibility, coords, │  │ Event simulation │  │    │
│  │  │ elements, jQuery    │  │ Modifier state   │  │    │
│  │  └─────────────────────┘  └──────────────────┘  │    │
│  └──────────────────────────────┬──────────────────┘    │
│                                 │                       │
│  ┌──────────────────────────────▼──────────────────┐    │
│  │  AUT iframe (same-origin toy app / your site)   │    │
│  │  - Injected: ariaSnapshot IIFE + refMap         │    │
│  │  - CypressLite accesses via contentWindow       │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Studio UI                                      │    │
│  │  - REPL input (same as Tier 1)                  │    │
│  │  - Snapshot panel (aria YAML + ref highlight)   │    │
│  │  - Codegen panel (live Cypress test output)     │    │
│  │  - Command log (like Cypress's left panel)      │    │
│  │  - Export button (.cy.ts download)              │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Mocha replaced with fake runnable.** The driver doesn't run tests
   — it's a REPL command executor. But removing Mocha entirely requires
   patching 5 coupling points (see [DRIVER_EXTRACTION.md](DRIVER_EXTRACTION.md)
   §Mocha Coupling). Instead, we provide a ~50 LOC fake runnable that
   satisfies `state('runnable')`, `runnableObj.timeout()`, and the other
   touch-points. This keeps driver modifications minimal.

2. **No `cy.task()`.** Replace with direct async function calls. Instead of
   `cy.task('getCommand')` polling a daemon, the studio UI calls
   `cypressLite.execute({ action: 'click', ref: 'e5' })` directly.

3. **No proxy.** Phase 1 uses same-origin content. The iframe loads from the
   same origin as the studio page. No header stripping needed because you
   control the target site.

4. **Keep jQuery.** The driver uses jQuery extensively for DOM queries and
   element checks. Removing it would require rewriting hundreds of callsites.
   jQuery is ~85KB gzipped — acceptable for a dev tool.

5. **Keep Bluebird.** The driver uses Bluebird promises throughout (for
   `.delay()`, `.timeout()`, cancellation). Swapping to native Promises
   would touch every file. Keep it.

6. **Navigation = iframe src change.** `cy.visit(url)` becomes
   `iframe.contentWindow.location.href = url` + wait for load event +
   re-inject IIFE. The retry/timeout wrapper from the driver still applies.

---

## Phased Implementation

### Phase 1: Extract & Shim (the core work)

**Goal:** Get the Cypress command queue, actionability engine, and core
commands running in a browser against an iframe. No Node.js.

#### Step 1.1: Vendored Copy

Copy the driver source from `cypress-io/cypress` at a pinned tag
(e.g., `v14.3.2`) into our repo. See [DRIVER_BUILD_STRATEGY.md](DRIVER_BUILD_STRATEGY.md)
for the vendoring process, import path rewriting, and esbuild config.

Source layout under `src/driver/`:

```
src/driver/
├── cy/
│   ├── actionability.ts
│   ├── assertions.ts
│   ├── retries.ts
│   ├── ensures.ts
│   ├── focused.ts
│   ├── keyboard/
│   ├── mouse.ts
│   ├── commands/
│   │   ├── actions/        (click, type, check, focus, scroll, select, trigger)
│   │   ├── querying/       (get, contains)
│   │   ├── traversals.ts
│   │   ├── connectors.ts
│   │   ├── asserting.ts
│   │   ├── aliasing.ts
│   │   ├── waiting.ts
│   │   ├── window.ts
│   │   ├── misc.ts
│   │   └── storage.ts
│   └── index.ts
├── cypress/
│   ├── cy.ts              (heavily modified — remove Mocha refs)
│   ├── command_queue.ts
│   ├── command.ts
│   ├── chainer.ts
│   ├── error_utils.ts
│   ├── log.ts
│   └── state.ts
├── dom/                   (copy entire directory)
├── config/
│   ├── jquery.ts
│   └── lodash.ts
└── index.ts               (new entry point, no Mocha/Runner)
```

**Estimated: ~11,000 LOC copied, ~2,000 LOC modified/removed.**

#### Step 1.2: Create Shim Layer

Build shims that replace server-dependent APIs with browser alternatives.
See [DRIVER_SHIM_SPEC.md](DRIVER_SHIM_SPEC.md) for the complete shim
specification with code examples and known limitations. Summary:

```typescript
// src/driver/shims/backend.ts
// Replaces Cypress.backend() — the server RPC channel

export function createBackendShim(iframe: HTMLIFrameElement) {
	return async function backend(event: string, ...args: unknown[]) {
		switch (event) {
			case 'resolve:url':
				// For same-origin: just return the URL as-is
				return { url: args[0], isOkStatusCode: true, isHtml: true };

			case 'get:cookies':
				return parseCookies(iframe.contentDocument!.cookie);

			case 'set:cookie':
				iframe.contentDocument!.cookie = serializeCookie(args[0]);
				return args[0];

			case 'clear:cookie':
				clearCookie(iframe.contentDocument!, args[0]);
				return null;

			default:
				throw new Error(`backend('${event}') is not available in browser mode`);
		}
	};
}
```

```typescript
// src/driver/shims/automation.ts
// Replaces Cypress.automation() — the browser automation channel

export function createAutomationShim(iframe: HTMLIFrameElement) {
	return async function automation(event: string, ...args: unknown[]) {
		switch (event) {
			case 'get:cookies':
				return parseCookies(iframe.contentDocument!.cookie);

			case 'take:screenshot':
				// Optional: html2canvas integration
				throw new Error('Screenshots not available in browser mode');

			default:
				throw new Error(`automation('${event}') not available in browser mode`);
		}
	};
}
```

```typescript
// src/driver/shims/navigation.ts
// Replaces cy.visit() proxy-based navigation

export function createNavigationHandler(iframe: HTMLIFrameElement) {
	return {
		visit(url: string): Promise<Window> {
			return new Promise((resolve, reject) => {
				const timeout = setTimeout(
					() => reject(new Error('Navigation timeout')),
					30000,
				);
				iframe.addEventListener(
					'load',
					() => {
						clearTimeout(timeout);
						resolve(iframe.contentWindow!);
					},
					{ once: true },
				);
				iframe.contentWindow!.location.href = url;
			});
		},
		go(direction: 'back' | 'forward'): Promise<Window> {
			/* ... */
		},
		reload(): Promise<Window> {
			/* ... */
		},
	};
}
```

#### Step 1.3: Replace Mocha with Fake Runnable

Rather than gutting all Mocha references (which touches ~30 callsites
in `cy.ts` alone), we create a fake runnable that satisfies the 5
coupling points identified in [DRIVER_EXTRACTION.md](DRIVER_EXTRACTION.md):

1. `state('runnable')` guard in retry loop → fake runnable always present
2. Queue startup tied to Mocha Runner → call `queue.run()` directly
3. Timeout via `Runnable.prototype.timeout()` → implement on fake
4. Error propagation via Mocha callback → catch + emit error event
5. `~30 callsites` in cy.ts → fake satisfies the interface

See [DRIVER_SHIM_SPEC.md §Runnable](DRIVER_SHIM_SPEC.md) for the exact
implementation (~50 LOC). The fake implements `.timeout()`, `.slow()`,
`.fullTitle()`, and `.clearTimeout()` — enough for the driver to boot
and run commands without Mocha.

#### Step 1.4: Create CypressLite Entry Point

```typescript
// src/driver/index.ts — The browser-compatible Cypress runtime

export class CypressLite {
	private cy: $Cy;
	private queue: CommandQueue;
	private state: StateFunction;

	constructor(iframe: HTMLIFrameElement) {
		this.state = createState();
		this.cy = new $Cy({
			state: this.state,
			backend: createBackendShim(iframe),
			automation: createAutomationShim(iframe),
			config: createDefaultConfig(),
		});
		registerAllCommands(this.cy);
	}

	/** Execute a single command with full actionability/retry. */
	async execute(command: Command): Promise<CommandResult> {
		// Enqueue into Cypress command queue
		// Returns when the command (and any chained assertions) complete
	}

	/** Get the cy object for direct chaining: lite.cy.get('button').click() */
	get chain() {
		return this.cy;
	}
}
```

#### Step 1.5: Wire to Studio UI

Replace the Tier 1 demo's `CommandExecutor` (vanilla DOM) with
`CypressLite`:

```typescript
// demo/src/main.ts (updated)
import { CypressLite } from '../../src/driver/index.js';

const lite = new CypressLite(iframe);
// Now every command has full Cypress semantics:
await lite.execute({ action: 'click', ref: 'e5' });
// → actionability checks → retry → click → verify assertions
```

### Phase 2: Service Worker Injection (arbitrary same-origin)

**Goal:** Use a Service Worker to inject the aria snapshot IIFE and driver
shims into any page loaded in the iframe, even if it's not your toy app.

- Register a Service Worker that intercepts `fetch` events
- For HTML responses: inject `<script>` tags for the IIFE and refMap
- For navigation: the SW can't intercept the initial page load, but can
  intercept subsequent navigations via `clients.claim()` + `FetchEvent`
- Strip `X-Frame-Options` and `Content-Security-Policy` headers from
  responses (the SW can modify response headers)

**Limitation:** The SW must be registered from the same origin as the
studio page. The target site must also be same-origin (or the SW uses
a fetch-and-rewrite strategy to proxy it).

### Phase 3: Edge Proxy (arbitrary cross-origin)

**Goal:** A Cloudflare Worker (or equivalent) that proxies any URL,
strips frame-busting headers, injects scripts, and rewrites resource
URLs so arbitrary sites load correctly in the iframe.

This is the "any website" upgrade path. The driver code doesn't change —
only the infrastructure around how pages get loaded into the iframe.

---

## Risk Assessment

### High Risk

| Risk                                       | Impact                                                     | Mitigation                                                                    |
| ------------------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Bluebird Promise coupling                  | Every file uses `Bluebird.delay`, `.timeout`, cancellation | Don't replace it. Bundle it (~15KB gzipped).                                  |
| `state('runnable')` in retry loop          | Retry checks for active Mocha runnable; throws if none     | Create a permanent fake runnable object                                       |
| jQuery coupling throughout DOM utils       | `$el.is(':visible')`, `.offset()`, `.closest()`            | Keep jQuery. Not worth removing.                                              |
| Hidden `Cypress.backend()` calls           | Some commands make backend calls we might miss             | Grep all `backend(` and `automation(` in vendored code, build a complete shim |
| Command registration assumes Mocha context | `Commands.addAll` references `prevSubject` chain context   | Keep the `$Cy` class structure that provides these                            |

### Medium Risk

| Risk                                       | Impact                                              | Mitigation                                               |
| ------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------- |
| Lodash dependency                          | Driver uses `_.chain`, `_.defaults`, `_.isElement`  | Bundle lodash (~70KB gzipped) or replace with es-toolkit |
| `cy.get()` subject resolution              | Complex subject chain (parent → child → assertions) | This is in the browser-safe portion; should work         |
| Error messages reference Cypress docs URLs | Not harmful but confusing                           | Search-and-replace doc URLs to our own                   |
| Driver version drift                       | Cypress updates break our fork                      | Pin to a specific Cypress release; update quarterly      |

### Low Risk

| Risk                         | Impact                                             | Mitigation                         |
| ---------------------------- | -------------------------------------------------- | ---------------------------------- |
| Event simulation differences | Our synthetic events vs Cypress's synthetic events | Using the same code, same behavior |
| Snapshot integration         | Already works in Tier 1                            | No change needed                   |
| Codegen integration          | Already works in Tier 1                            | No change needed                   |

---

## File Inventory

### What We Copy (from cypress-io/cypress@develop packages/driver/src/)

```
cy/actionability.ts          ~635 LOC   ← Core actionability engine
cy/assertions.ts             ~400 LOC   ← Assertion retry integration
cy/retries.ts                ~100 LOC   ← Retry loop primitive
cy/ensures.ts                ~300 LOC   ← ensure.isVisible, isAttached, etc.
cy/focused.ts                ~100 LOC   ← Focus management
cy/keyboard/                 ~1500 LOC  ← Full keyboard simulation
cy/mouse.ts                  ~500 LOC   ← Mouse simulation
cy/commands/actions/click.ts ~300 LOC   ← click/dblclick/rightclick
cy/commands/actions/type.ts  ~800 LOC   ← type with special keys
cy/commands/actions/check.ts ~150 LOC   ← check/uncheck
cy/commands/actions/focus.ts ~100 LOC   ← focus/blur
cy/commands/actions/scroll.ts ~200 LOC  ← scrollTo
cy/commands/actions/select.ts ~150 LOC  ← select
cy/commands/actions/trigger.ts ~100 LOC ← trigger
cy/commands/querying/        ~500 LOC   ← get, contains, within, focused
cy/commands/traversals.ts    ~300 LOC   ← DOM traversal commands
cy/commands/connectors.ts    ~200 LOC   ← .then, .invoke, .its
cy/commands/asserting.ts     ~200 LOC   ← .should, .and
cy/commands/aliasing.ts      ~100 LOC   ← .as
cy/commands/waiting.ts       ~100 LOC   ← cy.wait (timeout)
cy/commands/window.ts        ~100 LOC   ← cy.window, cy.document, cy.title
cy/commands/misc.ts          ~100 LOC   ← cy.wrap, cy.log
cy/commands/storage.ts       ~200 LOC   ← localStorage/sessionStorage
cypress/cy.ts                ~1500 LOC  ← Core $Cy class (needs modification)
cypress/command_queue.ts     ~400 LOC   ← Command queue
cypress/command.ts           ~300 LOC   ← $Command class
cypress/chainer.ts           ~200 LOC   ← Chainer
cypress/error_utils.ts       ~600 LOC   ← Error formatting
cypress/log.ts               ~400 LOC   ← Command logging
cypress/state.ts             ~100 LOC   ← State management
dom/                         ~2000 LOC  ← All DOM utilities
config/jquery.ts             ~50 LOC    ← jQuery config
config/lodash.ts             ~50 LOC    ← Lodash config
───────────────────────────────────────
Total:                       ~11,500 LOC
```

### What We Write New

> See [DRIVER_SHIM_SPEC.md](DRIVER_SHIM_SPEC.md) for full implementation
> details of each shim, and [DRIVER_BUILD_STRATEGY.md](DRIVER_BUILD_STRATEGY.md)
> for esbuild config and bundling.

```
driver/shims/backend.ts       ~100 LOC  ← Replaces Cypress.backend()
driver/shims/automation.ts    ~80 LOC   ← Replaces Cypress.automation()
driver/shims/navigation.ts    ~120 LOC  ← cy.visit via iframe.location
driver/shims/config.ts        ~50 LOC   ← Default config values
driver/shims/state.ts         ~80 LOC   ← Simplified state (no Mocha)
driver/shims/runnable.ts      ~40 LOC   ← Fake Mocha runnable
driver/index.ts               ~200 LOC  ← CypressLite entry point
driver/commands/cookies.ts    ~100 LOC  ← Browser-only cookie commands
driver/commands/navigation.ts ~150 LOC  ← visit/go/reload via iframe
───────────────────────────────────────
Total new code:               ~920 LOC
```

### What We Modify (in the vendored copy)

> See [DRIVER_EXTRACTION.md §Mocha Coupling](DRIVER_EXTRACTION.md) for the
> specific code changes needed to decouple from Mocha.

```
cypress/cy.ts                 Remove Mocha refs, Runner refs, simplify
cypress/command_queue.ts      Remove Mocha runnable checks
cy/retries.ts                 Remove isStable server check, use rAF instead
cy/commands/actions/*.ts      Remove any Cypress.backend() calls
cy/commands/querying/get.ts   Remove alias resolution server deps
───────────────────────────────────────
Total modifications:          ~500 LOC changed across files
```

---

## Comparable Success Stories

No one has forked Cypress's driver before. But similar extraction projects
have succeeded:

- **Playwright's injected utilities** — Playwright extracts browser-context
  utilities (actionability checks, selector engines) into an `injectedScript`
  that runs inside the page. We already ported their aria snapshot code
  (`src/injected/`). This is the same pattern: extract the pure-browser
  portion.

- **Testing Library / user-event** — Built a complete event simulation
  library (click, type, select, keyboard) without any browser protocol.
  Validates that synthetic events are sufficient for most apps.

- **Our own Tier 1 demo** — We already proved that the aria snapshot engine,
  refMap, selectorGenerator, commandValidation, and codegen all work in a
  pure browser context. The driver fork extends this to include retry and
  actionability.

---

## Open Questions

1. **Which Cypress version to fork?** The `develop` branch moves fast.
   Pinning to a release tag (e.g., `v14.3.0`) gives stability.

2. **Bluebird vs native Promises?** Keeping Bluebird is pragmatic short-term
   but adds bundle size. Could migrate to native Promises as a post-launch
   optimization.

3. **jQuery version?** The driver bundles jQuery 3.x. Our demo currently
   has no jQuery. Adding it increases bundle size by ~85KB gzipped.

4. **sinon/lolex dependency?** The driver exposes `cy.clock()` and
   `cy.tick()` via `@sinonjs/fake-timers`. Do we want these commands?
   If not, we can skip sinon entirely.

5. **Command log UI?** Cypress's left panel shows a real-time command log
   with retry counts, assertion results, and DOM snapshots. Building an
   equivalent would add significant value but is a separate UI effort.

6. **Name:** "CypressLite"? "cypress-driver-browser"? "cypress-cli-studio"?
