# Browser Demo Runbook — Step-by-Step Build Plan

> **Audience:** An LLM agent (or developer) building the Tier 1 browser-based
> demo site that embeds a toy app in an iframe with the cypress-cli command
> engine running entirely in-browser.
>
> **Goal:** A single-page web app where users type cypress-cli commands into a
> REPL panel, see them execute against a same-origin toy site in an iframe,
> view live aria snapshots, and see generated Cypress test code — all with
> zero Node.js backend.
>
> **Validation:** After each step, run the real CLI against the toy site to
> confirm parity between the browser demo and the real tool.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Demo Page (your-site.com/demo)                         │
│  ┌──────────────────┐  ┌─────────────────────────────┐  │
│  │  REPL Panel       │  │  AUT Iframe                 │  │
│  │  ┌──────────────┐ │  │  (same-origin toy app)      │  │
│  │  │ Command input│ │  │                             │  │
│  │  │ Output log   │ │  │  Injected:                  │  │
│  │  │ Snapshot view│ │  │  ├─ ariaSnapshot IIFE       │  │
│  │  │ Test codegen │ │  │  └─ refMap (element map)    │  │
│  │  └──────────────┘ │  │                             │  │
│  └──────────────────┘  └─────────────────────────────┘  │
│                                                         │
│  In-Memory:                                             │
│  ├─ CommandQueue (async queue, replaces daemon)         │
│  ├─ CommandExecutor (replaces driverSpec switch)        │
│  ├─ SessionHistory (command/result log for codegen)     │
│  └─ CodegenEngine (existing src/codegen, unmodified)    │
└─────────────────────────────────────────────────────────┘
```

### What We Reuse Verbatim (zero changes)

| Module | Purpose |
|--------|---------|
| `src/injected/*` | Aria tree generation, YAML rendering, diffs |
| `src/browser/refMap.ts` | Ref → Element map (`eN` resolution) |
| `src/browser/snapshotManager.ts` | IIFE injection, snapshot capture |
| `src/browser/commandValidation.ts` | Element type validation before commands |
| `src/browser/selectorGenerator.ts` | CSS selector generation + codegen strings |
| `src/codegen/codegen.ts` | History → test file generation |
| `src/codegen/templateEngine.ts` | `describe`/`it` wrapper for test files |
| `src/shared/errors.ts` | Error types (portable, no I/O) |

### What We Build New

| Component | Replaces | ~LOC |
|-----------|----------|------|
| `CommandExecutor` | `driverSpec.ts` `executeCommand` switch | ~300 |
| `CommandQueue` | `daemon/commandQueue.ts` | ~50 |
| `DemoUI` (HTML/CSS/JS) | CLI client + REPL | ~200 |
| `ToyApp` (HTML) | The target site | ~100 |
| esbuild demo config | Build pipeline | ~30 |

---

## Before You Start

### 0.1 Read required documentation

Read these files to understand the existing command model:

1. `AGENTS.md` — project overview, repo layout
2. `docs/COMMANDS.md` — all commands, schemas, Cypress API mappings
3. `src/browser/README.md` — browser module purpose
4. `src/injected/README.md` — injected module purpose
5. `src/codegen/README.md` — codegen module purpose

### 0.2 Confirm baseline

```bash
npm run build
npx tsc --noEmit
npx vitest run
```

All must pass. The build produces `dist/injected.iife.js` (the aria snapshot
IIFE) which the demo will embed.

### 0.3 Decide on directory structure

```
demo/
├── index.html          ← Demo page: REPL + iframe + codegen panel
├── toy-app/
│   ├── index.html      ← Toy app landing page
│   ├── form.html       ← Login form (type, check, select, submit)
│   ├── todo.html       ← Todo list (add, complete, delete, filter)
│   └── style.css       ← Shared toy app styles
├── src/
│   ├── commandExecutor.ts  ← DOM API command dispatch (replaces driverSpec)
│   ├── commandQueue.ts     ← Simple async FIFO queue
│   ├── sessionHistory.ts   ← Track commands for codegen
│   ├── replController.ts   ← Wire UI inputs to command executor
│   └── main.ts             ← Entry point: boot iframe, inject IIFE, bind UI
├── esbuild.demo.js     ← Build config for the demo bundle
└── README.md            ← Demo-specific docs
```

---

## Step 1: Build the Toy App

The toy app is a same-origin HTML site served from a subdirectory. It must
exercise enough UI patterns to demonstrate the full command range.

### 1.1 Create `demo/toy-app/style.css`

Minimal styling. Keep it clean and readable — the demo should look polished.
Include styles for: nav bar, forms, todo list, buttons, status messages.

### 1.2 Create `demo/toy-app/index.html`

Landing page with:

- Navigation links to Form and Todo pages
- A heading, a paragraph with `id="status"`, a "Say Hello" button
- A counter button that tracks clicks
- A section with test data attributes (`data-cy`, `data-testid`)

This tests: `click`, `assert`, `asserttitle`, `snapshot`, `navigate`.

### 1.3 Create `demo/toy-app/form.html`

Login form with:

- Email text input (with label)
- Password input (with label)
- "Remember me" checkbox
- Role dropdown (`<select>` with Admin/User/Guest options)
- Submit button
- Result `<p>` that shows "Submitted: {email} as {role}" on submit

This tests: `type`, `fill`, `clear`, `check`, `uncheck`, `select`, `assert`.

### 1.4 Create `demo/toy-app/todo.html`

Todo list with:

- Text input for new todo
- "Add" button
- Todo list (`<ul>`) with checkboxes and delete buttons
- Filter buttons: All / Active / Completed
- Item count display
- localStorage persistence (todos survive reload)

This tests: `type`, `click`, `check`, `assert`, `localstorage-get`,
`localstorage-list`, `waitfor`, `eval`, `run-code`.

### 1.5 Validate toy app with real CLI

Serve the toy app locally and run the real CLI against it to establish the
**ground truth** that the demo must match:

```bash
# Serve toy app (use any static server)
npx serve demo/toy-app -l 4444 &

# Open CLI session against it
node bin/cypress-cli open http://localhost:4444

# Capture baseline snapshot
node bin/cypress-cli snapshot

# Save the snapshot output — this is your reference for what the
# browser demo must produce for the same page
```

Record the snapshot YAML. Save it as `demo/expected/index-snapshot.yml`.

### 1.6 Run interaction commands against the toy app

```bash
# Landing page interactions
node bin/cypress-cli click e3          # "Say Hello" button (ref from snapshot)
node bin/cypress-cli snapshot          # Verify status changed
node bin/cypress-cli assert e2 have.text Hello!  # Status text check

# Navigate to form
node bin/cypress-cli navigate http://localhost:4444/form.html
node bin/cypress-cli snapshot

# Form interactions
node bin/cypress-cli type e4 test@example.com     # Email input
node bin/cypress-cli type e6 secret123            # Password input
node bin/cypress-cli check e7                     # Remember me
node bin/cypress-cli select e8 admin              # Role dropdown
node bin/cypress-cli click e9                     # Submit
node bin/cypress-cli snapshot                     # Verify result text

# Navigate to todo
node bin/cypress-cli navigate http://localhost:4444/todo.html
node bin/cypress-cli snapshot

# Todo interactions
node bin/cypress-cli type e3 Buy milk             # Todo input
node bin/cypress-cli click e4                     # Add button
node bin/cypress-cli snapshot                     # Verify item appears

# Export the session
node bin/cypress-cli export --format ts
```

**Save all command outputs.** These are the expected results the browser demo
must reproduce. The ref numbers will differ when the demo injects its own
snapshot engine, but the structure and content must match.

### 1.7 Stop the CLI session

```bash
node bin/cypress-cli stop
# Kill the serve process
kill %1
```

---

## Step 2: Build the Command Executor

This is the core of the browser demo — a function that takes a command object
and executes it against the iframe's DOM using vanilla browser APIs.

### 2.1 Create `demo/src/commandExecutor.ts`

The executor must:

1. Accept command objects: `{ action: string, ref?: string, text?: string, options?: object }`
2. Resolve refs using `resolveRefFromMap()` from `src/browser/refMap.ts`
3. Execute the command using DOM APIs (not Cypress APIs)
4. Return a result object: `{ success: boolean, snapshot?: string, error?: string, cypressCommand?: string }`

**Command mapping table** (implement these for the demo):

| Command | Browser Implementation |
|---------|----------------------|
| `snapshot` | Call `takeSnapshotFromWindow(iframeWin)`, return YAML |
| `click` | `resolveRef(ref).click()` or `el.dispatchEvent(new MouseEvent('click', {bubbles:true}))` |
| `dblclick` | `el.dispatchEvent(new MouseEvent('dblclick', {bubbles:true}))` |
| `type` | `el.focus(); for (ch of text) { dispatchKeyEvents(el, ch); el.value += ch; dispatchInputEvent(el) }` |
| `fill` | `el.value = ''; dispatchInputEvent(el);` then `type` logic |
| `clear` | `el.value = ''; el.dispatchEvent(new Event('input', {bubbles:true}))` |
| `check` | `if (!el.checked) { el.checked = true; el.dispatchEvent(new Event('change', {bubbles:true})) }` |
| `uncheck` | `if (el.checked) { el.checked = false; el.dispatchEvent(new Event('change', {bubbles:true})) }` |
| `select` | `el.value = text; el.dispatchEvent(new Event('change', {bubbles:true}))` |
| `focus` | `el.focus()` |
| `blur` | `el.blur()` |
| `navigate` | `iframe.contentWindow.location.href = url` |
| `back` | `iframe.contentWindow.history.back()` |
| `forward` | `iframe.contentWindow.history.forward()` |
| `reload` | `iframe.contentWindow.location.reload()` |
| `assert` | Read element property/attribute, compare with expected value |
| `asserturl` | `iframe.contentWindow.location.href` comparison |
| `asserttitle` | `iframe.contentDocument.title` comparison |
| `eval` | `iframe.contentWindow.eval(expr)` |
| `run-code` | `iframe.contentWindow.eval(code)` (same as eval for demo) |
| `wait` | `await new Promise(r => setTimeout(r, ms))` |
| `waitfor` | Poll for element existence via ref resolution |
| `localstorage-get` | `iframe.contentWindow.localStorage.getItem(key)` |
| `localstorage-set` | `iframe.contentWindow.localStorage.setItem(key, value)` |
| `localstorage-list` | `Object.entries(iframe.contentWindow.localStorage)` |
| `localstorage-delete` | `iframe.contentWindow.localStorage.removeItem(key)` |
| `localstorage-clear` | `iframe.contentWindow.localStorage.clear()` |
| `sessionstorage-*` | Same as localStorage but `sessionStorage` |
| `cookie-list` | Parse `iframe.contentDocument.cookie` |
| `cookie-set` | `iframe.contentDocument.cookie = '...'` |
| `cookie-get` | Parse `iframe.contentDocument.cookie` for specific name |
| `cookie-delete` | Set cookie with `max-age=0` |
| `cookie-clear` | Delete all parsed cookies |
| `hover` | `el.dispatchEvent(new MouseEvent('mouseover', {bubbles:true}))` |
| `press` | `dispatchEvent(new KeyboardEvent('keydown', {key, bubbles:true}))` |
| `scrollto` | `el.scrollIntoView()` or `iframe.contentWindow.scrollTo(x, y)` |
| `screenshot` | `html2canvas(iframe.contentDocument.body)` or skip for demo |
| `resize` | Set `iframe.style.width` and `iframe.style.height` |

**Not implemented for Tier 1** (note in UI as "available in full CLI"):
`intercept`, `waitforresponse`, `unintercept`, `network`, `upload`,
`drag`, `cyrun`, `dialog-accept`, `dialog-dismiss`, `state-save`,
`state-load`.

### 2.2 Implement event dispatch helpers

Create helper functions for realistic user event simulation:

```typescript
function dispatchKeyEvents(el: HTMLElement, char: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
}

function dispatchInputEvent(el: HTMLInputElement): void {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
```

This ensures the toy app's event handlers fire correctly, matching what
Cypress does behind `cy.type()`.

### 2.3 Wire codegen into every command

For each command execution, also compute the Cypress command string using
`buildCypressCommand()` from `src/browser/selectorGenerator.ts`. Store it
alongside the result so the codegen panel can display it.

### 2.4 Validate command executor against real CLI

After implementing `click`, `type`, `assert`, and `snapshot`, validate parity:

```bash
# Start toy app server
npx serve demo/toy-app -l 4444 &

# Real CLI
node bin/cypress-cli open http://localhost:4444
node bin/cypress-cli snapshot
# Copy the YAML output

# Compare with: in the demo, call commandExecutor.execute({ action: 'snapshot' })
# The YAML structure should match (same elements, same roles, same tree)

node bin/cypress-cli stop
kill %1
```

The ref numbers may differ (the real CLI uses Cypress's injection timing vs
the demo's direct injection), but the **tree structure, roles, and accessible
names** must be identical.

---

## Step 3: Build the Session History Tracker

### 3.1 Create `demo/src/sessionHistory.ts`

Simple array that records every command and its result:

```typescript
interface HistoryEntry {
  command: { action: string; ref?: string; text?: string };
  result: { success: boolean; cypressCommand?: string; snapshot?: string };
  timestamp: number;
}

const history: HistoryEntry[] = [];

export function recordCommand(command, result): void { ... }
export function getHistory(): HistoryEntry[] { ... }
export function undo(): HistoryEntry | undefined { ... }
export function clearHistory(): void { ... }
```

### 3.2 Wire codegen export

Use the existing `generateTestFile()` from `src/codegen/codegen.ts` to convert
the history into a valid Cypress test file. The function accepts an array of
`{ command, result }` pairs — exactly what the session history stores.

This means the "Export Test" button calls:
```typescript
import { generateTestFile } from '../../src/codegen/codegen.js';
const testCode = generateTestFile(history, { format: 'ts' });
```

### 3.3 Validate codegen output matches real CLI export

```bash
# Run a session with the real CLI
node bin/cypress-cli open http://localhost:4444
node bin/cypress-cli type e4 test@example.com
node bin/cypress-cli click e9
node bin/cypress-cli export --format ts
# Save the output as real-export.cy.ts

# Run the same sequence in the demo, click Export
# Save as demo-export.cy.ts

# Diff the two files
diff real-export.cy.ts demo-export.cy.ts
```

The test structure, command syntax, and selectors should be equivalent
(selectors may differ if the real CLI picks different priorities, but the
command names and argument order must match).

---

## Step 4: Build the Demo UI

### 4.1 Create `demo/index.html`

Three-panel layout:

```
┌──────────────────────────────────────────────────────┐
│  cypress-cli Demo                          [Export]   │
├──────────────────┬───────────────────────────────────┤
│                  │                                   │
│  Command output  │   iframe: toy-app                 │
│  (scrollable)    │   (same origin)                   │
│                  │                                   │
│                  │                                   │
├──────────────────┤                                   │
│  Snapshot panel  │                                   │
│  (YAML, mono)    │                                   │
├──────────────────┤                                   │
│  Codegen panel   │                                   │
│  (test code)     │                                   │
├──────────────────┴───────────────────────────────────┤
│  > [command input]                          [Run]     │
└──────────────────────────────────────────────────────┘
```

**UI requirements:**

- **Command input:** Text field at the bottom. Supports `click e5`,
  `type e3 hello`, `assert e2 have.text Hello!`, etc. Same syntax as the
  real CLI.
- **Output panel:** Shows command results, errors, status messages. Scrolls
  to bottom on new output. Color-code errors red.
- **Snapshot panel:** Shows latest aria snapshot YAML with ref highlighting.
  Clicking a ref in the snapshot should highlight the element in the iframe.
- **Codegen panel:** Shows the running Cypress test code generated from the
  session so far. Updates in real time as commands execute.
- **Export button:** Downloads the generated test as a `.cy.ts` file.
- **iframe:** Loads `toy-app/index.html`. Full width right panel.

### 4.2 Implement command parsing

Parse the text input using the same syntax as the real CLI:

```
<action> [ref] [text] [--option value]
```

Rules:
- First token is the action
- If second token matches `e\d+`, it's a ref
- Remaining tokens are text (unless prefixed with `--`)
- Quoted strings are supported: `type e3 "hello world"`

### 4.3 Wire up the main entry point (`demo/src/main.ts`)

On page load:

1. Get iframe reference
2. Wait for iframe load event
3. Inject the aria snapshot IIFE into the iframe using
   `injectSnapshotIife(iframe.contentWindow, iifeString)`
4. Take initial snapshot and display in snapshot panel
5. Bind command input to the executor
6. On iframe navigation (detect via `MutationObserver` on iframe `src` or
   polling `contentWindow.location`), re-inject the IIFE

### 4.4 Handle iframe navigation

When the user runs `navigate form.html`, the iframe loads a new page. The
demo must:

1. Detect the load event (`iframe.onload`)
2. Re-inject the aria snapshot IIFE
3. Auto-take a fresh snapshot
4. Update the URL display

### 4.5 Add command history (up/down arrows)

Store previous commands in an array. Up arrow cycles through history.
Same UX as the real CLI's REPL mode.

---

## Step 5: Build the esbuild Demo Config

### 5.1 Create `demo/esbuild.demo.js`

```javascript
import { build } from 'esbuild';

await build({
  entryPoints: ['demo/src/main.ts'],
  bundle: true,
  format: 'esm',
  outfile: 'demo/dist/demo.js',
  platform: 'browser',
  target: 'es2022',
  minify: false,
  sourcemap: true,
  // Bundle the existing src/ modules in
  // They are all browser-safe
});
```

### 5.2 Embed the IIFE string

The demo needs the injected IIFE as a string constant. Two options:

**Option A:** Import from the existing build output:
```typescript
import { INJECTED_IIFE } from '../../dist/injected.string.js';
```

**Option B:** Use esbuild's `define` to inline it at build time.

Option A is simpler. Ensure `npm run build` runs before the demo build.

### 5.3 Add npm scripts

```json
{
  "scripts": {
    "build:demo": "npm run build && node demo/esbuild.demo.js",
    "serve:demo": "npx serve demo -l 3000"
  }
}
```

### 5.4 Validate the build

```bash
npm run build:demo
npx serve demo -l 3000 &

# Open http://localhost:3000 in a browser
# Type: snapshot
# Verify YAML output appears with refs

# Type: click e3 (or whatever ref maps to "Say Hello")
# Verify the button click fires in the iframe

kill %1
```

---

## Step 6: Validate Full Round-Trip Against Real CLI

This is the critical validation step. Run the **exact same command sequence**
in both the real CLI and the browser demo, and compare outputs.

### 6.1 Scenario A: Landing page interactions

**Real CLI:**
```bash
npx serve demo/toy-app -l 4444 &
node bin/cypress-cli open http://localhost:4444
node bin/cypress-cli snapshot > /tmp/real-snap-1.yml
node bin/cypress-cli click e3
node bin/cypress-cli snapshot > /tmp/real-snap-2.yml
node bin/cypress-cli assert e2 have.text Hello!
node bin/cypress-cli export --format ts > /tmp/real-export-a.cy.ts
node bin/cypress-cli stop
kill %1
```

**Browser demo:**
Open `http://localhost:3000`, execute the same commands in the REPL input.

**Compare:**
- Snapshot YAML structure (roles, names, hierarchy) should match
- Assertion result (pass/fail) should match
- Exported test code should be equivalent

### 6.2 Scenario B: Form interactions

**Real CLI:**
```bash
npx serve demo/toy-app -l 4444 &
node bin/cypress-cli open http://localhost:4444/form.html
node bin/cypress-cli snapshot
node bin/cypress-cli type e4 test@example.com
node bin/cypress-cli type e6 secret123
node bin/cypress-cli check e7
node bin/cypress-cli select e8 admin
node bin/cypress-cli click e9
node bin/cypress-cli snapshot
node bin/cypress-cli assert e10 contain Submitted
node bin/cypress-cli export --format ts > /tmp/real-export-b.cy.ts
node bin/cypress-cli stop
kill %1
```

**Browser demo:** Same commands. Compare snapshot diffs, assertion results,
and exported test file.

### 6.3 Scenario C: Todo list with localStorage

**Real CLI:**
```bash
npx serve demo/toy-app -l 4444 &
node bin/cypress-cli open http://localhost:4444/todo.html
node bin/cypress-cli type e3 Buy milk
node bin/cypress-cli click e4
node bin/cypress-cli snapshot
node bin/cypress-cli localstorage-list
node bin/cypress-cli check e6
node bin/cypress-cli eval "document.querySelectorAll('.todo-item').length"
node bin/cypress-cli export --format ts > /tmp/real-export-c.cy.ts
node bin/cypress-cli stop
kill %1
```

**Browser demo:** Same commands. Verify localStorage commands return the
same data. Verify eval returns the same count.

### 6.4 Record results

For each scenario, log:

| Metric | Real CLI | Browser Demo | Match? |
|--------|----------|--------------|--------|
| Snapshot tree structure | ✓ | ✓ | Y/N |
| Ref count | N | M | ≈ |
| Assertion pass/fail | pass | pass | Y/N |
| Exported test syntax | valid | valid | Y/N |
| Exported test runnable | `npx cypress run` passes | N/A | — |

---

## Step 7: Polish and Edge Cases

### 7.1 Error handling

Test these in the browser demo and verify they produce clear messages:

```
click e99999          → "Ref e99999 not found. Run snapshot to refresh."
type                  → "Missing required argument: ref"
assert e5             → "Missing required argument: chainer"
navigate              → "Missing required argument: url"
```

Compare error message quality to the real CLI:
```bash
node bin/cypress-cli click e99999
# Note the error message format
```

### 7.2 Snapshot diff (incremental updates)

The real CLI shows incremental snapshot diffs after the first full snapshot.
Verify the browser demo does too:

1. Run `snapshot` → full YAML tree
2. Run `click e3` (button that changes text)
3. Run `snapshot` → should show only the changed subtree

This works because `takeSnapshotFromWindow()` already handles diffing
internally via `renderAriaTree`'s `previousSnapshot` parameter.

### 7.3 iframe reload / navigation edge cases

Test:
- `navigate` to a different toy page → IIFE re-injection works
- `back` / `forward` → snapshot updates correctly
- `reload` → state resets, snapshot refreshes

### 7.4 Command history (undo)

Test `undo` command: should remove last command from history and codegen
panel. Compare behavior to `node bin/cypress-cli undo` in the real CLI.

---

## Step 8: Final Validation Checklist

Run through this checklist before considering the demo complete.

### Functional parity

- [ ] `snapshot` produces valid YAML with accessible roles and names
- [ ] `click` fires click events and triggers DOM updates
- [ ] `type` enters text character-by-character with proper events
- [ ] `fill` clears then types
- [ ] `clear` empties input value
- [ ] `check` / `uncheck` toggles checkboxes
- [ ] `select` changes dropdown value
- [ ] `navigate` loads new page in iframe, re-injects IIFE
- [ ] `back` / `forward` / `reload` work
- [ ] `assert` passes/fails with correct chainer logic
- [ ] `asserturl` / `asserttitle` work
- [ ] `eval` / `run-code` execute JS in iframe context
- [ ] `wait` pauses for specified milliseconds
- [ ] `waitfor` polls for element existence
- [ ] `localstorage-*` (5 commands) read/write iframe localStorage
- [ ] `sessionstorage-*` (5 commands) read/write iframe sessionStorage
- [ ] `cookie-*` (5 commands) manage iframe cookies
- [ ] `hover` dispatches mouseover event
- [ ] `press` dispatches keyboard event
- [ ] `scrollto` scrolls element or viewport
- [ ] `resize` changes iframe dimensions
- [ ] `export` generates valid `.cy.ts` file
- [ ] `history` shows command log
- [ ] `undo` removes last command from history

### Snapshot accuracy

- [ ] Tree structure matches real CLI output for same page
- [ ] Accessible roles computed correctly (button, link, textbox, etc.)
- [ ] Accessible names match real CLI output
- [ ] Refs are assigned and resolvable
- [ ] Incremental diffs work after DOM mutations

### Codegen accuracy

- [ ] Exported test has valid `describe`/`it` structure
- [ ] Cypress commands use correct API (`cy.get().click()`, `cy.type()`, etc.)
- [ ] Meta-commands (`snapshot`, `history`) are excluded from export
- [ ] Selectors are reasonable (prefer `data-cy`, `id`, `class`)

### UI quality

- [ ] Command input accepts all supported command formats
- [ ] Output panel shows success/error with appropriate styling
- [ ] Snapshot panel renders YAML in monospace with syntax highlighting
- [ ] Codegen panel updates in real time
- [ ] Export button downloads a valid `.cy.ts` file
- [ ] Command history (up/down arrows) works
- [ ] Unsupported commands show "available in full CLI" message
- [ ] Error messages are actionable (mention what to do next)

### Cross-validation with real CLI

- [ ] Ran Scenario A (landing page) in both — snapshots structurally match
- [ ] Ran Scenario B (form) in both — assertions match
- [ ] Ran Scenario C (todo/localStorage) in both — storage values match
- [ ] Exported test from real CLI runs with `npx cypress run` and passes
- [ ] Exported test from demo has equivalent Cypress commands

---

## Appendix A: Commands NOT Included in Tier 1

These commands require capabilities unavailable in a pure browser context.
Show them in the REPL as disabled with a message:

| Command | Reason | Workaround |
|---------|--------|------------|
| `intercept` | Needs Service Worker or Cypress `cy.intercept()` | Future: register SW |
| `waitforresponse` | Depends on `intercept` aliasing | — |
| `unintercept` | Depends on `intercept` | — |
| `network` | Needs request capture at proxy level | Future: `PerformanceObserver` |
| `upload` | `cy.selectFile()` creates synthetic files | Future: `DataTransfer` API |
| `drag` | Complex pointer event sequence | Future: implement drag protocol |
| `cyrun` | Executes Cypress chains in spec context | N/A (no Cypress runtime) |
| `dialog-accept` | Requires `window.confirm`/`alert` override | Future: `beforeunload` stubbing |
| `dialog-dismiss` | Same as above | — |
| `state-save` | Aggregates cookies + storage + URL | Future: implement in JS |
| `state-load` | Restores saved state | — |
| `screenshot` | Needs `html2canvas` or similar | Future: add library |
| `open` | Starts persistent daemon session | N/A (always "open" in demo) |
| `stop` | Stops daemon | N/A |
| `repl` | Interactive readline REPL | N/A (demo IS a REPL) |
| `install` | Writes skill files to disk | N/A |
| `run` / `runTest` | Runs exported test via Cypress | N/A (no Cypress runtime) |

---

## Appendix B: Future Tier 2 — WebContainer Upgrade Path

If the Tier 1 demo proves the concept, the next step is running the real CLI
inside a WebContainer:

1. Bundle the full `src/daemon/` + `src/client/` into a WebContainer filesystem
2. `npm install cypress` inside the WebContainer
3. Patch `src/cypress/launcher.ts` to target an iframe instead of spawning a browser
4. The daemon runs as a Node.js process inside WebContainer
5. CLI commands go through the real socket protocol
6. Full command set available, including `intercept`, `network`, `cyrun`

This preserves exact behavioral parity with the real CLI while running
entirely in the user's browser tab.
