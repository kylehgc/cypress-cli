# Architecture

> A CLI tool that gives LLMs (and humans) REPL-like access to a live web page
> through real Cypress commands, using Playwright's aria snapshot for DOM
> representation.

## Problem Statement

Writing Cypress tests today is a tight loop: write code → run test → read error
→ write code. LLMs can accelerate this, but they lack two things:

1. A **digestible representation of the page** (raw HTML is too noisy and too large)
2. A way to **execute commands against a live browser** and see what happens

Cypress's own `cy.prompt()` solves this but is cloud-locked, rate-limited,
Chromium-only, and closed-source. No open-source alternative exists — nobody has
built a Cypress REPL (Bahmutov explicitly documented that "Cypress Cannot Add
Out-Of-Band Commands").

This project is that open alternative.

## What This Is

A tool-use interface for LLMs. The LLM does NOT run inside this tool. Instead:

1. LLM calls the CLI (or an MCP server wrapping it) with a command like `click e5`
2. The CLI sends that command to a persistent daemon over a Unix socket
3. The daemon forwards it to a running Cypress test via `cy.task()` polling
4. The Cypress test executes the command as a **real Cypress command** (`cy.get(...).click()`)
5. The result (new aria snapshot, success/error) flows back up to the LLM

The LLM never touches the browser directly. Every action is a genuine Cypress
command that would appear in a real test file.

## System Overview

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐     ┌─────────────┐
│  LLM / User │────▶│  CLI Client  │────▶│    Daemon     │────▶│   Cypress   │
│             │◀────│  (one-shot)  │◀────│ (persistent)  │◀────│  (browser)  │
└─────────────┘     └──────────────┘     └───────────────┘     └─────────────┘
                     Unix socket IPC      cy.task() bridge
```

### Data Flow (one command round-trip)

```
1. CLI client connects to daemon Unix socket
2. Client sends: { id: 1, method: "run", params: { args: { _: ["click", "e5"] } } }
3. Daemon parses command, enqueues it in the command queue
4. Meanwhile, inside Cypress:
   a. Driver spec is blocked on cy.task('getCommand')
   b. Plugin handler holds an unresolved Promise
   c. Daemon's enqueue resolves that Promise with { action: "click", ref: "e5" }
   d. cy.task returns the command to the driver spec
5. Driver spec resolves ref "e5" to a Cypress selector via the element map
6. Driver spec executes: cy.get('[data-cy="login"]').click()
7. Driver spec takes a new aria snapshot via cy.window().then(win => ...)
8. Driver spec captures page URL and title via cy.url() and cy.title()
9. Driver spec calls cy.task('commandResult', { snapshot, url, title, success: true })
10. Plugin handler forwards result to daemon
11. Daemon writes snapshot YAML to .cypress-cli/*.yml file on disk
12. Daemon sends response over socket: { id: 1, result: { url, title, snapshotFilePath, success: true } }
13. Client formats output as page metadata + snapshot file link and prints it
```

## Component Architecture

### 1. CLI Client (`src/client/`)

One-shot process. Connects to daemon, sends one command, prints result, exits.
Modeled after Playwright's `Session.run()` → `SocketConnectionClient.sendAndClose()`.

Responsibilities:

- Parse CLI arguments (minimist)
- Validate against command schema (zod)
- Find/verify daemon socket
- Send command, wait for response, print, exit

**Does NOT** manage browser state, hold connections open, or run Cypress.

### 2. Daemon (`src/daemon/`)

Persistent Node.js process. Listens on a Unix socket. One daemon per session.
Modeled after Playwright's `startMcpDaemonServer()`.

Responsibilities:

- Listen on `~/.cypress-cli/<hash>/<session>.sock`
- Manage command queue (one command at a time, FIFO)
- Start Cypress via Module API (`cypress.run()`) with the driver spec
- Bridge CLI commands → `cy.task()` queue → results back to CLI
- Session lifecycle (open, status, stop)

The daemon does NOT interpret commands — it's a pass-through. Command resolution
(ref → selector, action → Cypress API) happens inside the driver spec.

### 3. Cypress Plugin (`src/cypress/`)

A Cypress plugin installed via `setupNodeEvents`. This is the Node-side half of
the `cy.task()` bridge.

Responsibilities:

- Register task handlers: `getCommand`, `commandResult`
- `getCommand`: returns a Promise that resolves when the daemon enqueues a command.
  This is the **long-poll** mechanism. Cypress tasks must complete (default 60s
  timeout), so on timeout we return a `{ type: 'poll' }` sentinel and the driver
  spec re-polls.
- `commandResult`: receives execution result from the driver spec, resolves the
  daemon's pending response Promise.
- Manage the element map: `ref → Element` (lives in browser, but the plugin
  tracks ref → selector mappings for codegen).
- Selector generation uses
  [`@cypress/unique-selector`](https://github.com/cypress-io/unique-selector)
  — the same library that powers Cypress's Selector Playground.

### 4. Driver Spec (`src/cypress/driver.cy.ts`)

A Cypress test file that runs in the browser. This is the "REPL loop."

```
it('cypress-cli driver', () => {
  // Initial navigation provided by daemon config
  cy.visit(Cypress.env('CYPRESS_CLI_URL') || '/');

  // Take initial snapshot
  takeSnapshot();

  // REPL loop
  pollForCommands();
});

function pollForCommands() {
  cy.task('getCommand', null, { timeout: 120000 }).then((command) => {
    if (command.type === 'poll') {
      // Timeout sentinel — re-poll
      return pollForCommands();
    }
    if (command.type === 'stop') {
      return; // Exit the loop, test ends
    }

    // Execute the command
    executeCommand(command);

    // Take post-command snapshot (full tree for snapshot/navigate/back/forward/reload,
    // incremental diff for action commands)
    const snap = FULL_TREE_COMMANDS.has(command.action)
      ? takeFullSnapshot()
      : takeSnapshot();

    snap.then((snapshotYaml) => {
      // Capture page metadata
      cy.url().then((url) => {
        cy.title().then((title) => {
          cy.task('commandResult', { snapshot: snapshotYaml, url, title, ... }).then(() => {
            pollForCommands();
          });
        });
      });
    });
  });
}
```

Each command maps to real Cypress APIs:

- `click e5` → resolve `e5` to selector → `cy.get(selector).click()`
- `type e3 "hello"` → `cy.get(selector).type("hello")`
- `navigate https://example.com` → `cy.visit("https://example.com")`
- `run-code "document.title"` → `cy.window().then(win => win.eval("document.title"))`
- `snapshot` → take aria snapshot without executing an action

### 5. Browser Module (`src/browser/`)

Browser-context helpers that run inside the Cypress test.

Responsibilities:

- Element ref map (`refMap.ts`): maps `eN` ref strings to live DOM elements
- Selector generation (`selectorGenerator.ts`): wraps `@cypress/unique-selector`
  with Cypress's default priority order for codegen
- Snapshot manager (`snapshotManager.ts`): coordinates IIFE injection and
  snapshot capture

### 6. Injected Bundle (`src/injected/`)

Playwright's aria snapshot code, ported and bundled as an IIFE string. Injected
into the browser page via `cy.window().then(win => win.eval(iife))`.

This runs in the **page context**, not the Cypress command queue. It walks the
DOM and produces a YAML string with `[ref=eN]` handles on interactable elements.

Responsibilities:

- Walk DOM, compute ARIA roles and accessible names
- Generate YAML tree in "ai" mode (refs, generic roles, cursor pointer, active state)
- Compute incremental diffs between snapshots (`compareSnapshots`)
- Map refs back to DOM elements for subsequent commands

Cypress patches Content Security Policy, so `eval()` works even on strict pages.

### 7. Codegen (`src/codegen/`)

Builds up a Cypress test file from the sequence of executed commands.

Responsibilities:

- Maintain ordered list of commands and their resolved selectors
- Convert ref-based commands to selector-based Cypress code
- Consume `selector` and `cypressCommand` fields from command results
  (generated in `src/browser/` via `@cypress/unique-selector`)
- Export as `.cy.ts` file with proper `describe`/`it` structure
- Handle assertions (the LLM can issue `assert` commands that become
  `cy.get(selector).should(...)`)
- Filter meta-commands (history, undo, export) from generated output

#### Selector Generation Strategy

Selector generation reuses the same approach as Cypress's built-in Selector
Playground. The upstream implementation lives in two places:

- **[`@cypress/unique-selector`](https://github.com/cypress-io/unique-selector)**
  (npm package, v2.1.3) — the core engine. Given a DOM element, returns a
  unique CSS selector. Supports priority ordering via `selectorTypes`, `data-*`
  attribute selectors, shadow DOM, and caching.
- **[`packages/driver/src/cypress/element_selector.ts`](https://github.com/cypress-io/cypress/blob/develop/packages/driver/src/cypress/element_selector.ts)**
  in the cypress-io/cypress repo — Cypress's orchestrator (~95 lines) that
  wraps `@cypress/unique-selector` with the default priority list and config
  validation.

We use `@cypress/unique-selector` directly as a dependency. It runs in
**browser context** (needs `document`), so it is called from within the driver
spec / support file (or bundled into the IIFE), not from Node.

Default priority order (matching Cypress's `ElementSelector` defaults):

```
data-cy > data-test > data-testid > data-qa > name > id > class > tag > attributes > nth-child
```

## The cy.task() Polling Loop — Why and How

### Why This Is the Only Viable Approach

Cypress has a fundamental architectural constraint: **commands cannot be injected
into a running test from outside**. The command queue is synchronous and sealed
at test definition time. There is no WebSocket API, no CDP bridge, no way to
push commands into the queue externally.

`cy.task()` is the **only** built-in mechanism for browser ↔ Node.js
communication during a test run. By having the driver spec call
`cy.task('getCommand')` in a loop, we create a pull-based REPL: the test pulls
the next command from a queue that the daemon pushes into.

### The Timeout Problem

`cy.task()` must resolve. The default `taskTimeout` is 60 seconds. If no command
arrives within the timeout window, Cypress fails the test.

**Solution**: generous timeout + re-poll on sentinel.

```
cy.task('getCommand', null, { timeout: 120000 })
```

On the plugin side, if no command arrives within ~110 seconds (leaving buffer
for Cypress overhead), resolve with `{ type: 'poll' }`. The driver spec sees
this sentinel and immediately re-polls. This creates an indefinite wait without
ever hitting Cypress's timeout.

The `taskTimeout` in `cypress.config.ts` should be set to a high value (e.g.,
300000ms / 5 minutes) to avoid interference.

### Concurrency

One command at a time. While a command is executing (click → snapshot → result),
the daemon holds the CLI client connection open. If a second CLI command arrives,
it queues behind the first. This is simple and avoids race conditions in
Cypress's command queue.

### Error Handling in the REPL Loop

Cypress commands are chainables, not Promises — errors thrown during command
execution fail the entire `it()` block with no recovery path. This is
fundamentally different from Playwright, where every command is an `async`
function whose errors can be caught with try/catch.

The driver spec uses a **three-layer defense** to keep the session alive:

1. **Pre-flight validation** (primary). Before calling a Cypress command,
   validate the element in a `.then()` callback. If the element is wrong type
   (e.g., `type` on a `<h1>`), store the error in `_asyncCommandError` and skip
   the command entirely. This is the same pattern used for assertions
   (`applyChainer`).

2. **`Cypress.once('fail')` safety net**. Registered before each command
   execution. Catches unexpected Cypress command failures and stores the error
   in `_asyncCommandError`. The test does not die, but Cypress's internal queue
   may be in an indeterminate state afterward.

3. **Multi-`it()` with `testIsolation: false`** (catastrophic recovery). The
   driver spec can use multiple pre-allocated `it()` blocks. If a command fails
   so badly that layers 1-2 cannot save the queue, Cypress moves to the next
   `it()` block. With `testIsolation: false`, the browser state (page, cookies,
   localStorage, DOM, injected IIFE) persists across blocks. The `afterEach`
   hook reports the error back to the daemon.

All three layers funnel errors through `_asyncCommandError`, which is checked
after `takeSnapshot()` to build the `DriverResult`.

### Cross-Origin Navigation

Cypress enforces same-origin policy by default. The generated config sets
`chromeWebSecurity: false` to disable this for Chromium browsers (Chrome,
Electron), matching Playwright's behavior where no same-origin restrictions
apply. Firefox does not respect this setting — cross-origin navigation in Firefox
is a known limitation.

`cy.origin()` is **not** used because `cy.task()` cannot reliably be called
inside `cy.origin()` blocks (restricted browser context), which would break the
polling loop.

## Session Lifecycle

```
cypress-cli open [url] [--browser chrome|firefox|webkit] [--config path]
  → Daemon starts
  → Cypress launches via Module API (cypress.run)
  → Driver spec visits URL
  → Initial aria snapshot taken
  → Daemon socket is ready

cypress-cli snapshot
  → Returns current page aria snapshot

cypress-cli click e5
  → Clicks element with ref e5
  → Returns new aria snapshot

cypress-cli type e3 "hello world"
  → Types into element with ref e3
  → Returns new aria snapshot

cypress-cli export [--file test.cy.ts]
  → Exports accumulated commands as a Cypress test file

cypress-cli stop
  → Gracefully stops Cypress and daemon
```

## Why Not [Alternative]?

| Alternative                                   | Why Not                                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CDP directly**                              | Cypress wraps CDP internally. Using it directly bypasses Cypress's command queue, retry logic, and assertions. Commands wouldn't be "real" Cypress commands. |
| **Puppeteer alongside Cypress**               | Two tools fighting over the same browser. Cypress manages the browser lifecycle.                                                                             |
| **WebSocket from browser**                    | Would need a custom server + injection. `cy.task()` already provides this bridge. Also, Cypress Studio uses WebSocket — that code is proprietary.            |
| **Custom Cypress command queue manipulation** | The queue is internal, undocumented, and changes between versions.                                                                                           |
| **cy.prompt()**                               | Cloud-locked, rate-limited, Chromium-only, closed-source.                                                                                                    |

## Tech Stack Decisions

| Choice             | What                          | Why                                                                                                                 |
| ------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **TypeScript**     | Strict, ESM, ESNext target    | Type safety. ESM because it's 2026. ESNext because we control the runtime.                                          |
| **minimist + zod** | CLI parsing + validation      | Matches Playwright's CLI pattern. minimist is tiny (no deps). zod gives typed validation on command schemas.        |
| **esbuild**        | Bundler for injected IIFE     | Playwright uses esbuild for their IIFE injection bundles. Fast, zero native deps, simple API for one-shot bundling. |
| **Vitest**         | Test framework                | ESM-native, fast, good TS support, familiar API.                                                                    |
| **Unix socket**    | IPC between client and daemon | Same as Playwright. Fast, session-scoped, no port conflicts. Newline-delimited JSON protocol.                       |

## Directory Structure

```
cypress-cli/
├── ARCHITECTURE.md          ← You are here
├── CONVENTIONS.md           ← Code style, naming, patterns
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── esbuild.config.js        ← Builds the injected IIFE bundle
├── eslint.config.js         ← ESLint 9 flat config with TypeScript support
├── bin/
│   └── cypress-cli          ← CLI entry point shim
├── docs/
│   ├── ARIA_SNAPSHOT_PORT.md  ← Line-by-line port plan from Playwright
│   ├── COMMANDS.md            ← Command definitions and schemas
│   ├── PACKAGE_SPEC.md        ← package.json, tsconfig.json, build pipeline
│   ├── PHASE1_REVIEW.md       ← Phase 1 implementation review
│   ├── READINESS_ASSESSMENT.md ← User testing readiness check
│   ├── ROADMAP.md             ← Feature parity roadmap and issue tracking
│   ├── TEST_PLAN.md           ← Test strategy and specific test cases
│   └── TIME_TRAVEL.md         ← Future feature: snapshot-based debugging
├── src/
│   ├── client/               ← CLI client (one-shot commands)
│   │   └── README.md
│   ├── daemon/               ← Persistent daemon server
│   │   └── README.md
│   ├── cypress/              ← Cypress plugin + driver spec + launcher
│   │   └── README.md
│   ├── injected/             ← Aria snapshot IIFE (ported from Playwright)
│   │   └── README.md
│   ├── shared/               ← Error handling + logging infrastructure
│   │   └── README.md
│   ├── codegen/              ← Test file generation from session history
│   │   └── README.md
│   ├── browser/              ← Ref map, selector generation, snapshot manager
│       └── README.md
└── tests/
    ├── unit/                 ← Pure function tests (snapshot, codegen, etc.)
    ├── integration/          ← Component interaction tests (Phase 2)
    └── e2e/                  ← Full stack tests with real Cypress (Phase 3)
```

## Build Pipeline

```
src/injected/*.ts  ──esbuild──▶  dist/injected.iife.js   (IIFE string, embedded in driver)
src/**/*.ts        ──tsc────▶  dist/**/*.js               (ESM modules)
```

The injected bundle is special: it must be a self-contained IIFE string that can
be `eval()`'d in a browser page context. Everything else is standard ESM compiled
by `tsc` for Node.js.

## Phases

### Phase 1–3: Core Implementation ✅ Complete

All planned functionality is implemented and tested (634 unit/integration + 29 E2E = 663 tests):

- **Aria snapshot port**: Complete port from Playwright (tree generation, YAML rendering,
  incremental diffs, role/accessible name computation).
- **Daemon**: Socket server, session management, command queue with Promise-based
  blocking, graceful shutdown, idle timeout, session persistence to `$XDG_STATE_HOME`.
- **CLI client**: Argument parsing (minimist + zod), 28 command schemas, socket
  connection with retry logic, REPL mode, help text, JSON output.
- **Cypress layer**: Plugin with getCommand/commandResult task handlers, driver spec
  with full REPL loop (28 commands), support file for IIFE injection and snapshot
  taking, launcher with cross-process IPC via QueueBridge.
- **Browser module** (`src/browser/`): Element ref map, selector generation via
  `@cypress/unique-selector` with Cypress priority order, IIFE snapshot injection.
- **Codegen module** (`src/codegen/`): Export to `.cy.ts`, template engine with
  describe/it structure, meta-command filtering, TypeScript output.
- **Integration tests**: Client↔daemon, daemon↔plugin, command queue flow,
  session lifecycle, error propagation (real sockets, mock Cypress).
- **E2E tests**: 29 tests with real Cypress + Electron against fixture HTML pages.
- **Build pipeline**: esbuild IIFE bundling, TypeScript compilation, ESLint with
  TypeScript support.

### Phase 4: Feature Parity & AI Agent Integration (Current)

See `docs/ROADMAP.md` for the full issue list. Key areas:

- **SKILL file + install command** — primary integration surface for coding agents
- **Snapshot-to-file output** — token-efficient output model for AI agents
- **Inline codegen per command** — return generated Cypress code with each response
- **New commands** — `eval`, `fill`, `drag`, `upload`, `screenshot`, `dialog-accept/dismiss`,
  `resize`, cookie/storage management, console/network access, network mocking
- **Command naming alignment** — add `goto` alias, `close` alias
- **Feasibility audit** — determine which playwright-cli features are achievable in Cypress

### Future

- Time-travel debugging (see docs/TIME_TRAVEL.md)
- MCP server wrapper
