# Test Plan

> Testing strategy, framework setup, and specific test cases for every component.

## Framework

- **Vitest** for all unit and integration tests
- **Cypress** (dogfooding) for e2e tests
- ESM-native, TypeScript, no extra config needed

## Test Structure

```
tests/
├── unit/
│   ├── injected/           ← Aria snapshot rendering, tree building
│   │   ├── ariaSnapshot.test.ts
│   │   ├── roleUtils.test.ts
│   │   ├── renderTree.test.ts
│   │   └── comparison.test.ts
│   ├── daemon/             ← Command queue, session management
│   │   ├── commandQueue.test.ts
│   │   └── session.test.ts
│   ├── client/             ← Argument parsing, command validation
│   │   ├── parseArgs.test.ts
│   │   └── commands.test.ts
│   ├── codegen/            ← Test file generation, selector resolution
│   │   ├── selectorGen.test.ts
│   │   └── exportTest.test.ts
│   └── protocol/           ← Socket message format, serialization
│       └── protocol.test.ts
├── integration/
│   ├── daemon-plugin.test.ts     ← Daemon ↔ cy.task bridge
│   ├── polling-loop.test.ts      ← Long-poll timeout + re-poll behavior
│   └── snapshot-inject.test.ts   ← IIFE injection + snapshot generation
└── e2e/
    ├── fixtures/
    │   ├── simple.html      ← Basic page with buttons, inputs, links
    │   ├── dynamic.html     ← Page with async-loaded content
    │   ├── form.html        ← Complex form with all input types
    │   └── navigation.html  ← Multi-page app for nav testing
    ├── cli-roundtrip.test.ts     ← Full CLI → daemon → Cypress → result
    ├── commands.test.ts          ← Each command type against fixtures
    └── codegen-export.test.ts    ← Execute commands → export → verify output
```

## Unit Tests

### Injected: Aria Snapshot

These tests run in a **jsdom** or **happy-dom** environment (Vitest provides
both). They test the ported Playwright aria snapshot code against HTML strings.

#### ariaSnapshot.test.ts

```
Test: "generates correct snapshot for simple page"
  Input: <main><h1>Hello</h1><button>Click me</button></main>
  Expected output:
    - main:
      - heading "Hello" [level=1]
      - button "Click me" [ref=e1]

Test: "assigns refs only to interactable elements"
  Input: <div><p>Text</p><a href="#">Link</a><button>Btn</button><span>Span</span></div>
  Assert: refs on <a> and <button> only, not on <div>, <p>, or <span>

Test: "includes generic roles in AI mode"
  Input: <div><span>inside</span></div>
  Assert: output includes "generic" role for div and span

Test: "marks cursor:pointer elements"
  Input: <div style="cursor:pointer" onclick="">Clickable div</div>
  Assert: output includes [cursor=pointer]

Test: "renders active state"
  Input: <div role="tab" aria-selected="true">Tab 1</div>
  Assert: output includes [active] or [selected]

Test: "handles nested lists"
  Input: <nav><ul><li><a href="/a">A</a></li><li><a href="/b">B</a></li></ul></nav>
  Expected output:
    - navigation:
      - list:
        - listitem:
          - link "A" [ref=e1]
        - listitem:
          - link "B" [ref=e2]

Test: "escapes YAML special characters in names"
  Input: <button>Say "hello": world</button>
  Assert: name is properly YAML-escaped

Test: "handles empty elements"
  Input: <div role="alert"></div>
  Expected: - alert

Test: "computes accessible name from aria-label"
  Input: <button aria-label="Close dialog">X</button>
  Assert: name is "Close dialog", not "X"

Test: "computes accessible name from aria-labelledby"
  Input: <div id="lbl">Email</div><input aria-labelledby="lbl" type="email">
  Assert: textbox name is "Email"

Test: "handles form elements"
  Input: <label for="pw">Password</label><input id="pw" type="password">
  Assert: password textbox with name "Password"

Test: "handles select elements"
  Input: <select><option>Red</option><option selected>Blue</option></select>
  Assert: combobox with appropriate children

Test: "handles checkbox/radio states"
  Input: <input type="checkbox" checked>
  Assert: [checked] attribute in output

Test: "handles disabled state"
  Input: <button disabled>Can't click</button>
  Assert: [disabled] attribute in output

Test: "handles expanded state"
  Input: <button aria-expanded="true">Menu</button>
  Assert: [expanded] attribute in output

Test: "handles heading levels"
  Input: <h1>One</h1><h2>Two</h2><h3>Three</h3>
  Assert: [level=1], [level=2], [level=3]
```

#### renderTree.test.ts

Tests that the YAML renderer produces correct and parseable output.

```
Test: "inline text children are rendered after colon"
  Node: { role: 'button', name: 'Submit', children: ['Click here'] }
  Expected: - button "Submit" [ref=e1]: Click here

Test: "nodes with multiple children use indented format"
  Node: heading with two text children
  Expected: multi-line indented YAML

Test: "props are rendered with / prefix"
  Node: { role: 'link', name: 'Home', props: { url: 'https://example.com' } }
  Expected: includes - /url: https://example.com

Test: "empty nodes render without colon"
  Node: { role: 'separator', name: '', children: [] }
  Expected: - separator

Test: "refs appear in key brackets"
  Node with ref: e5
  Expected: [ref=e5] in output
```

#### comparison.test.ts

Tests the incremental diff system.

```
Test: "identical snapshots produce empty diff"
  Two identical AriaNode trees
  Assert: all nodes marked 'same', filtered output is empty

Test: "added node appears as changed"
  Before: heading only
  After: heading + button
  Assert: button subtree appears in diff

Test: "modified text triggers changed marker"
  Before: heading "Hello"
  After: heading "Goodbye"
  Assert: heading appears with <changed> marker

Test: "unchanged subtrees with refs collapse to [unchanged]"
  Before/After: large tree, only one leaf changed
  Assert: unchanged ref'd nodes show as ref=eN [unchanged]

Test: "reordered children trigger diff"
  Before: [A, B, C]
  After: [C, A, B]
  Assert: parent marked as changed
```

### Injected: Role Utils

```
Test: "implicit role for button element"
  Input: <button>Click</button>
  Assert: role is 'button'

Test: "explicit role overrides implicit"
  Input: <div role="button">Click</div>
  Assert: role is 'button'

Test: "presentation role"
  Input: <table role="presentation"><tr><td>Cell</td></tr></table>
  Assert: role is 'none' or 'presentation'

Test: "accessible name from text content"
  Input: <button>Submit Form</button>
  Assert: name is "Submit Form"

Test: "accessible name from title attribute"
  Input: <button title="Close"><svg>...</svg></button>
  Assert: name is "Close"

Test: "accessible name from placeholder"
  Input: <input placeholder="Enter email">
  Assert: name is "Enter email"

Test: "link with href gets role 'link'"
  Input: <a href="/about">About</a>
  Assert: role is 'link'

Test: "anchor without href gets no special role"
  Input: <a>Not a link</a>
  Assert: role is not 'link'
```

### Daemon: Command Queue

```
Test: "enqueue and dequeue single command"
  Enqueue { action: 'click', ref: 'e5' }
  Dequeue returns the same command

Test: "dequeue blocks until command is enqueued"
  Start dequeue (returns Promise)
  Assert: Promise is pending
  Enqueue command
  Assert: Promise resolves with command

Test: "commands are FIFO"
  Enqueue A, B, C
  Dequeue returns A, then B, then C

Test: "concurrent dequeues throw error"
  Two simultaneous dequeue calls
  Assert: second one errors (one consumer at a time)

Test: "result callback resolves client response"
  Enqueue command with response callback
  Execute and call result callback
  Assert: original enqueue caller receives result
```

### Daemon: Session

```
Test: "creates socket file on start"
  Start daemon
  Assert: socket file exists at expected path

Test: "cleans up socket file on stop"
  Start daemon, then stop
  Assert: socket file removed

Test: "rejects connection when no session running"
  Try to connect to non-existent socket
  Assert: connection error

Test: "handles multiple sequential commands"
  Open session
  Send click, then type, then snapshot
  Assert: all three succeed in order

Test: "stop command shuts down Cypress"
  Open session
  Send stop
  Assert: Cypress process exits, daemon shuts down
```

### Client: Argument Parsing

```
Test: "parses 'click e5' correctly"
  Input: ['click', 'e5']
  Output: { command: 'click', args: { ref: 'e5' } }

Test: "parses 'type e3 hello world' correctly"
  Input: ['type', 'e3', 'hello', 'world']
  Output: { command: 'type', args: { ref: 'e3', text: 'hello world' } }

Test: "parses 'navigate https://example.com' correctly"
  Input: ['navigate', 'https://example.com']
  Output: { command: 'navigate', args: { url: 'https://example.com' } }

Test: "parses options with --flag syntax"
  Input: ['click', 'e5', '--force']
  Output: { command: 'click', args: { ref: 'e5' }, options: { force: true } }

Test: "rejects unknown command"
  Input: ['unknowncommand']
  Assert: throws validation error

Test: "rejects missing required args"
  Input: ['click']  (missing ref)
  Assert: throws validation error with helpful message

Test: "parses 'assert e5 have.text Hello' correctly"
  Input: ['assert', 'e5', 'have.text', 'Hello']
  Output: { command: 'assert', args: { ref: 'e5', chainer: 'have.text', value: 'Hello' } }
```

### Codegen: Selector Generation

```
Test: "prefers data-cy attribute"
  Element: <button data-cy="submit">Submit</button>
  Output: '[data-cy="submit"]'

Test: "falls back to data-test"
  Element: <button data-test="submit">Submit</button>
  Output: '[data-test="submit"]'

Test: "falls back to id"
  Element: <button id="submit-btn">Submit</button>
  Output: '#submit-btn'

Test: "falls back to tag + attributes"
  Element: <button type="submit">Submit</button>
  Output: 'button[type="submit"]'

Test: "generates nth-child for ambiguous elements"
  Multiple: <div><button>A</button><button>B</button></div>
  For second button: 'button:nth-child(2)' or similar

Test: "handles special characters in attribute values"
  Element: <button data-cy="submit-form['main']">Submit</button>
  Assert: properly escaped selector
```

### Codegen: Test Export

```
Test: "exports single click as valid Cypress test"
  History: [{ command: 'click', selector: '[data-cy="login"]' }]
  Output: valid .cy.ts with cy.get('[data-cy="login"]').click()

Test: "exports navigate + interactions as ordered test"
  History: [navigate, click, type, assert]
  Assert: commands appear in order inside it() block

Test: "exports with describe/it structure"
  Assert: output has describe('cypress-cli generated', () => { it('test', () => { ... }) })

Test: "exports assertions as .should() calls"
  History: [{ command: 'assert', ref: 'e5', chainer: 'have.text', value: 'Hello' }]
  Output: cy.get(selector).should('have.text', 'Hello')

Test: "handles URL navigation in export"
  History: [navigate to /login, fill form, submit]
  Output: starts with cy.visit('/login')
```

### Protocol

```
Test: "serializes command to newline-delimited JSON"
  Input: { id: 1, method: 'run', params: { args: { _: ['click', 'e5'] } } }
  Output: '{"id":1,"method":"run","params":{"args":{"_":["click","e5"]}}}\n'

Test: "deserializes response"
  Input: '{"id":1,"result":{"success":true,"snapshot":"..."}}\n'
  Output: parsed object

Test: "handles multiple messages in one buffer"
  Input: two JSON messages concatenated with newlines
  Assert: both parsed correctly

Test: "handles split buffers"
  Input: one message split across two data events
  Assert: reassembled and parsed correctly
```

## Integration Tests

### daemon-plugin.test.ts

Tests the full daemon ↔ cy.task bridge without a real browser.

```
Test: "daemon enqueues command, plugin handler resolves it"
  Setup: create daemon command queue + simulated plugin handler
  Action: daemon.enqueueCommand({ action: 'click', ref: 'e5' })
  Assert: plugin's getCommand handler resolves with the command

Test: "plugin reportResult flows back to daemon caller"
  Setup: enqueue command, get response Promise
  Action: simulate driver calling reportResult({ success: true, snapshot: '...' })
  Assert: daemon's response Promise resolves with the result

Test: "timeout sentinel when no command arrives"
  Setup: create plugin handler with 100ms timeout (test override)
  Action: wait for getCommand to resolve
  Assert: resolves with { type: 'poll' }
```

### polling-loop.test.ts

Tests the re-poll behavior without a real Cypress test runner.

```
Test: "driver re-polls after timeout sentinel"
  Simulate: getCommand returns { type: 'poll' } three times, then a real command
  Assert: loop continues, command eventually executes

Test: "driver exits loop on stop command"
  Simulate: getCommand returns { type: 'stop' }
  Assert: loop terminates cleanly

Test: "driver handles command execution error gracefully"
  Simulate: command that throws during execution
  Assert: error reported via reportResult, loop continues
```

### snapshot-inject.test.ts

Tests IIFE injection using happy-dom or jsdom.

```
Test: "IIFE string evaluates without errors"
  Load built IIFE string
  Evaluate in jsdom window
  Assert: window.cypressCliAriaSnapshot exists

Test: "snapshot generation works after injection"
  Set up jsdom with HTML: <button>Hello</button>
  Evaluate IIFE
  Call generateAriaTree + renderAriaTree
  Assert: output contains button "Hello"

Test: "re-injection after simulated navigation"
  Inject IIFE, generate snapshot
  Create new jsdom window (simulating navigation)
  Re-inject IIFE, generate snapshot
  Assert: both snapshots are valid, refs reset

Test: "refs map to correct DOM elements"
  Set up jsdom with: <a href="#">Link</a><button>Btn</button>
  Generate snapshot
  Assert: snapshot.elements.get('e1') === the <a> element
  Assert: snapshot.elements.get('e2') === the <button> element
```

## E2E Tests

These require a running Cypress instance. They use the full CLI → daemon →
Cypress → browser → result pipeline.

### Fixtures

#### simple.html

```html
<!DOCTYPE html>
<html>
	<head>
		<title>Simple</title>
	</head>
	<body>
		<nav>
			<a href="/about" data-cy="about-link">About</a>
			<a href="/contact" data-cy="contact-link">Contact</a>
		</nav>
		<main>
			<h1>Welcome</h1>
			<p>Hello world</p>
			<button data-cy="action-btn">Click Me</button>
		</main>
	</body>
</html>
```

#### form.html

```html
<!DOCTYPE html>
<html>
	<head>
		<title>Form</title>
	</head>
	<body>
		<form data-cy="login-form">
			<label for="email">Email</label>
			<input
				id="email"
				type="email"
				data-cy="email-input"
				placeholder="you@example.com"
			/>

			<label for="password">Password</label>
			<input id="password" type="password" data-cy="password-input" />

			<label>
				<input type="checkbox" data-cy="remember-checkbox" /> Remember me
			</label>

			<select data-cy="role-select">
				<option value="user">User</option>
				<option value="admin">Admin</option>
			</select>

			<button type="submit" data-cy="submit-btn">Sign In</button>
		</form>
	</body>
</html>
```

### cli-roundtrip.test.ts

```
Test: "open → snapshot → stop lifecycle"
  1. Start CLI: cypress-cli open fixtures/simple.html
  2. Assert: daemon socket exists
  3. Run: cypress-cli snapshot
  4. Assert: response contains YAML with "Welcome", "Click Me", refs
  5. Run: cypress-cli stop
  6. Assert: daemon socket removed

Test: "click command changes page state"
  1. Open page with a counter button (click increments displayed count)
  2. Snapshot: assert count shows "0"
  3. Click the button ref
  4. Snapshot: assert count shows "1"

Test: "type command fills input"
  1. Open form.html
  2. Get snapshot, find email-input ref
  3. Type "test@example.com" into that ref
  4. Snapshot: assert input value reflected

Test: "navigate command changes page"
  1. Open simple.html
  2. Navigate to form.html
  3. Snapshot: assert form elements present, nav elements gone

Test: "error on invalid ref"
  1. Open simple.html
  2. Click ref "e99" (doesn't exist)
  3. Assert: error response with meaningful message
  4. Assert: snapshot still returned (page didn't change)
```

### codegen-export.test.ts

```
Test: "export produces valid TypeScript"
  1. Open form.html
  2. Type email, type password, click submit
  3. Run: cypress-cli export
  4. Assert: output is valid TypeScript
  5. Assert: contains cy.get('[data-cy="email-input"]').type('test@example.com')
  6. Assert: contains cy.get('[data-cy="submit-btn"]').click()

Test: "exported test runs successfully in Cypress"
  1. Execute a sequence of commands
  2. Export to file
  3. Run the exported file with cypress.run()
  4. Assert: test passes
```

## Test Configuration

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'happy-dom', // For injected/ tests that need DOM
		environmentMatchGlobs: [
			['tests/unit/injected/**', 'happy-dom'],
			['tests/unit/daemon/**', 'node'],
			['tests/unit/client/**', 'node'],
			['tests/unit/codegen/**', 'node'],
			['tests/unit/protocol/**', 'node'],
			['tests/integration/**', 'node'],
		],
		testTimeout: 10000,
		hookTimeout: 10000,
	},
});
```

### Running Tests

```bash
# All unit tests
npm test

# Specific test file
npx vitest tests/unit/injected/ariaSnapshot.test.ts

# Integration tests
npx vitest tests/integration/

# E2E tests (requires Cypress installed)
npx vitest tests/e2e/

# Watch mode
npx vitest --watch
```

## Snapshot Parity Tests

A special category: tests that verify our ported aria snapshot produces
identical output to Playwright's original for the same HTML input.

```
Test: "parity: simple page"
  HTML: <button>Hello</button>
  Run: both Playwright's generateAriaTree and ours
  Assert: identical YAML output

Test: "parity: complex form"
  HTML: full form with labels, checkboxes, selects
  Assert: identical output

Test: "parity: nested navigation"
  HTML: nav > ul > li > a pattern
  Assert: identical output

Test: "parity: ARIA attributes"
  HTML: elements with aria-label, aria-labelledby, aria-expanded, etc.
  Assert: identical output
```

These tests import from both our `src/injected/` and (via a test helper that
loads Playwright's original code) Playwright's implementation. They serve as a
regression suite to ensure the port is faithful.

## Coverage Goals

| Component              | Target                   | Rationale                                       |
| ---------------------- | ------------------------ | ----------------------------------------------- |
| Injected (snapshot)    | 90%+                     | Core functionality, ported code must be correct |
| Daemon (command queue) | 90%+                     | Concurrency + timing sensitive                  |
| Client (arg parsing)   | 95%+                     | Pure functions, easy to test exhaustively       |
| Codegen (selectors)    | 85%+                     | Many edge cases in selector generation          |
| Protocol (socket)      | 80%+                     | Mostly testing Node.js net module behavior      |
| Integration            | Key paths covered        | Daemon↔plugin bridge, timeout handling          |
| E2E                    | Happy paths + key errors | Full round-trips, expensive to run              |
