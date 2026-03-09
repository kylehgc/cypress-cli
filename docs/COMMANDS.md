# Commands

> Every command the CLI supports, its schema, how it maps to Cypress APIs, and
> what it returns.

## Protocol

Commands flow over the Unix socket as newline-delimited JSON:

```
Client → Daemon:  { "id": 1, "method": "run", "params": { "args": { "_": ["click", "e5"] } } }
Daemon → Client:  { "id": 1, "result": { "success": true, "url": "https://example.com", "title": "Example", "snapshotFilePath": ".cypress-cli/page-2026-03-07T19-22-42-679Z.yml", "cypressCommand": "cy.get('#btn').click()" } }
```

Protocol / daemon errors:

```
Daemon → Client:  { "id": 1, "error": "No session \"default\" found. Run `cypress-cli open <url>` to start a session." }
```

Command execution failures:

```
Daemon → Client:  { "id": 1, "result": { "success": false, "error": "Ref \"e5\" not found in current snapshot", "snapshot": "- main:\n  ..." } }
```

The `method` is always `"run"` for command execution or `"stop"` for shutdown.
The `args._` array contains the command name followed by positional arguments,
matching minimist's parsing convention.

`install --skills` is a client-local command. It does not connect to the daemon
or require a running Cypress session.

## Command Categories

### Core

| Command    | Syntax                                            | Description                                                   |
| ---------- | ------------------------------------------------- | ------------------------------------------------------------- |
| `open`     | `cypress-cli open [url] [options]`                | Start or reuse a session, launch Cypress, and navigate to URL |
| `stop`     | `cypress-cli stop`                                | Stop the current session                                      |
| `status`   | `cypress-cli status`                              | Check if a session is running and return session metadata     |
| `install`  | `cypress-cli install --skills`                    | Install bundled AI agent skills into `.github/skills/`        |
| `snapshot` | `cypress-cli snapshot [--filename path]` | Get current aria snapshot                                     |

### Navigation

| Command    | Syntax                       | Description                      |
| ---------- | ---------------------------- | -------------------------------- |
| `navigate` | `cypress-cli navigate <url>` | Navigate to a URL (`cy.visit()`) |
| `back`     | `cypress-cli back`           | Go back (`cy.go('back')`)        |
| `forward`  | `cypress-cli forward`        | Go forward (`cy.go('forward')`)  |
| `reload`   | `cypress-cli reload`         | Reload page (`cy.reload()`)      |

### Interaction

| Command      | Syntax                                 | Description                                                |
| ------------ | -------------------------------------- | ---------------------------------------------------------- |
| `click`      | `cypress-cli click <ref>`              | Click element (`cy.get(sel).click()`)                      |
| `dblclick`   | `cypress-cli dblclick <ref>`           | Double-click (`cy.get(sel).dblclick()`)                    |
| `rightclick` | `cypress-cli rightclick <ref>`         | Right-click (`cy.get(sel).rightclick()`)                   |
| `type`       | `cypress-cli type <ref> <text>`        | Type text (`cy.get(sel).type(text)`)                       |
| `clear`      | `cypress-cli clear <ref>`              | Clear input (`cy.get(sel).clear()`)                        |
| `check`      | `cypress-cli check <ref>`              | Check checkbox/radio (`cy.get(sel).check()`)               |
| `uncheck`    | `cypress-cli uncheck <ref>`            | Uncheck checkbox (`cy.get(sel).uncheck()`)                 |
| `select`     | `cypress-cli select <ref> <value>`     | Select option (`cy.get(sel).select(value)`)                |
| `focus`      | `cypress-cli focus <ref>`              | Focus element (`cy.get(sel).focus()`)                      |
| `blur`       | `cypress-cli blur <ref>`               | Blur element (`cy.get(sel).blur()`)                        |
| `scrollto`   | `cypress-cli scrollto <ref\|position>` | Scroll (`cy.get(sel).scrollIntoView()` or `cy.scrollTo()`) |
| `hover`      | `cypress-cli hover <ref>`              | Trigger hover (`cy.get(sel).trigger('mouseover')`)         |

### Keyboard

| Command | Syntax                    | Description                                |
| ------- | ------------------------- | ------------------------------------------ |
| `press` | `cypress-cli press <key>` | Press key (`cy.get('body').type('{key}')`) |

### Assertion

| Command       | Syntax                                       | Description                                        |
| ------------- | -------------------------------------------- | -------------------------------------------------- |
| `assert`      | `cypress-cli assert <ref> <chainer> [value]` | Assert (`cy.get(sel).should(chainer, value)`)      |
| `asserturl`   | `cypress-cli asserturl <chainer> <value>`    | Assert URL (`cy.url().should(chainer, value)`)     |
| `asserttitle` | `cypress-cli asserttitle <chainer> <value>`  | Assert title (`cy.title().should(chainer, value)`) |

### Export

| Command   | Syntax                                                                                             | Description                                |
| --------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `export`  | `cypress-cli export [--file path] [--format ts\|js] [--describe name] [--it name] [--baseUrl url]` | Export commands as a Cypress test file     |
| `history` | `cypress-cli history`                                                                              | List all commands executed in this session |
| `undo`    | `cypress-cli undo`                                                                                 | Remove last command from export history    |

### Execution

| Command    | Syntax                        | Description                                                        |
| ---------- | ----------------------------- | ------------------------------------------------------------------ |
| `run-code` | `cypress-cli run-code <code>` | Execute JS in browser (`cy.window().then(win => win.eval(code))`)  |

### Wait

| Command   | Syntax                                     | Description               |
| --------- | ------------------------------------------ | ------------------------- |
| `wait`    | `cypress-cli wait <ms>`                    | Wait (`cy.wait(ms)`)      |
| `waitfor` | `cypress-cli waitfor <ref> [--timeout ms]` | Wait for element to exist |

## Command Schemas (zod)

Each command is defined with a zod schema for validation. Example:

```typescript
import { z } from 'zod';
import { declareCommand } from './command.js';

export const click = declareCommand({
	name: 'click',
	category: 'interaction',
	description: 'Click an element by ref',
	args: z.object({
		ref: z.string().describe('Element ref from aria snapshot (e.g., "e5")'),
	}),
	options: z.object({
		force: z
			.boolean()
			.optional()
			.describe('Force click, disabling actionability checks'),
		multiple: z.boolean().optional().describe('Click multiple elements'),
	}),
});

export const type_ = declareCommand({
	name: 'type',
	category: 'interaction',
	description: 'Type text into an element',
	args: z.object({
		ref: z.string().describe('Element ref from aria snapshot'),
		text: z.string().describe('Text to type'),
	}),
	options: z.object({
		delay: z.number().optional().describe('Delay between keystrokes in ms'),
		force: z
			.boolean()
			.optional()
			.describe('Force type, disabling actionability checks'),
	}),
});

export const navigate = declareCommand({
	name: 'navigate',
	category: 'navigation',
	description: 'Navigate to a URL',
	args: z.object({
		url: z.string().describe('URL to navigate to'),
	}),
	options: z.object({
		timeout: z.number().optional().describe('Navigation timeout in ms'),
	}),
});

export const assert_ = declareCommand({
	name: 'assert',
	category: 'assertion',
	description: 'Assert on an element',
	args: z.object({
		ref: z.string().describe('Element ref from aria snapshot'),
		chainer: z
			.string()
			.describe('Chai chainer (e.g., "be.visible", "have.text", "contain")'),
		value: z.string().optional().describe('Expected value'),
	}),
	options: z.object({}),
});

export const snapshot = declareCommand({
	name: 'snapshot',
	category: 'core',
	description: 'Get current aria snapshot of the page',
	args: z.object({}),
	options: z.object({
		filename: z
			.string()
			.optional()
			.describe('Save snapshot to a specific file path'),
	}),
});

export const install = declareCommand({
	name: 'install',
	category: 'core',
	description: 'Install bundled AI agent skills into the current project',
	args: z.object({}),
	options: z.object({
		skills: z.literal(true).describe('Copy the packaged SKILL files'),
	}),
});
```

## Command ↔ Cypress API Mapping

When the driver spec receives a command, it resolves the ref to a DOM element
and executes the corresponding Cypress command.

### Ref Resolution

The injected aria snapshot produces a `Map<string, Element>` mapping ref strings
(`"e5"`) to DOM elements. The driver spec maintains this map.

To convert a ref to a Cypress-compatible selector for the command:

1. Look up the DOM element from the ref map
2. Use `Cypress.ElementSelector` to generate a selector from the element
3. Execute `cy.get(selector).action()`

```typescript
function resolveRef(ref: string): Cypress.Chainable {
	const element = currentSnapshot.elements.get(ref);
	if (!element) throw new Error(`Ref "${ref}" not found in current snapshot`);

	// Wrap the raw DOM element for Cypress
	return cy.wrap(element);
}
```

Alternatively, for codegen purposes, we also compute a stable selector:

```typescript
function refToSelector(ref: string): string {
	const element = currentSnapshot.elements.get(ref);
	// Use @cypress/unique-selector with Cypress's default priority order
	return generateSelector(element);
}
```

### Selector Priority

Uses [`@cypress/unique-selector`](https://github.com/cypress-io/unique-selector)
(the same library that powers Cypress's Selector Playground) with the default
priority from [`element_selector.ts`](https://github.com/cypress-io/cypress/blob/develop/packages/driver/src/cypress/element_selector.ts):

1. `[data-cy="value"]`
2. `[data-test="value"]`
3. `[data-testid="value"]`
4. `[data-qa="value"]`
5. `[name="value"]`
6. `#id`
7. `.className`
8. `tag[attr="value"]`
9. `tag:nth-child(n)`

The selector is used for two purposes:

- **Execution**: `cy.wrap(element)` for immediate execution (uses the live DOM ref)
- **Codegen**: `cy.get('[data-cy="login"]')` for the exported test file (uses a
  stable selector string)

## Response Format

Every command response includes:

```typescript
type CommandResponse = {
	success: boolean;
	snapshot?: string; // YAML aria snapshot (included in JSON mode; file path returned in CLI output)
	error?: string; // Error message if command failed
	selector?: string; // Resolved selector (for codegen tracking)
	cypressCommand?: string; // The Cypress command that was executed (for inline codegen)
	evalResult?: string; // Return value from run-code eval (stringified)
	snapshotFilePath?: string; // Relative path to snapshot YAML file on disk
	filePath?: string; // Relative path to generated test file on disk (export command only)
	installedPath?: string; // Relative path to installed skill directory (install command only)
	url?: string; // Current page URL after command execution
	title?: string; // Current page title after command execution
	status?: string; // Session status for status command
	sessionId?: string;
	browser?: string;
	headed?: boolean;
};
```

### Inline Codegen (`cypressCommand`)

Every action command response includes a `cypressCommand` field containing the
generated Cypress code for that command. This lets agents build test files
incrementally and understand exactly which Cypress command was executed.

Examples:

| CLI command                    | `cypressCommand` value                            |
| ------------------------------ | ------------------------------------------------- |
| `click e5`                     | `cy.get('[data-cy="submit"]').click()`            |
| `type e3 "hello"`              | `cy.get('#search').type('hello')`                 |
| `navigate https://example.com` | `cy.visit('https://example.com')`                 |
| `assert e5 have.text "Hello"`  | `cy.get('.heading').should('have.text', 'Hello')` |
| `run-code "document.title"`   | `cy.window().then((win) => win.eval('document.title'))` |
| `snapshot`                     | _(not included — meta-command)_                   |

The selector in `cypressCommand` comes from `@cypress/unique-selector` (the
stable selector, not the ephemeral ref). The CLI and REPL display the generated
code after each command result:

```
# Ran Cypress code:
#   cy.get('[data-cy="submit"]').click()
```

### Snapshot File Output

After every command that produces a snapshot, the daemon writes the YAML to a
file in the snapshot directory (default: `.cypress-cli/` in the working
directory). The CLI output shows the file path as a link — inline YAML is
never printed to the terminal. This matches
[`playwright-cli`](https://github.com/microsoft/playwright-cli)'s output model.

CLI output format:

```
### Page
- Page URL: https://example.com/dashboard
- Page Title: Dashboard
# Ran Cypress code:
#   cy.get('#btn').click()
### Snapshot
[Snapshot](.cypress-cli/page-2026-03-07T19-22-42-679Z.yml)
```

JSON mode (`--json`) includes the full response with inline snapshot:

```json
{
	"success": true,
	"snapshot": "- main:\n  ...",
	"url": "https://example.com/dashboard",
	"title": "Dashboard",
	"cypressCommand": "cy.get('#btn').click()",
	"snapshotFilePath": ".cypress-cli/page-2026-03-07T19-22-42-679Z.yml"
}
```

Options:

- `--snapshot-dir <path>` on `open` command to configure the output directory
- `--filename <path>` on `snapshot` command to save to a specific file

Example success response (JSON mode):

```json
{
	"success": true,
	"snapshot": "- main:\n  - heading \"Dashboard\" [level=1]\n  - text: Welcome back",
	"url": "https://example.com/dashboard",
	"title": "Dashboard",
	"selector": "[data-cy=\"submit-btn\"]",
	"cypressCommand": "cy.get('[data-cy=\"submit-btn\"]').click()",
	"snapshotFilePath": ".cypress-cli/page-2026-03-07T19-22-42-679Z.yml"
}
```

Example command failure response (JSON mode):

```json
{
	"success": false,
	"error": "cy.get() could not find element: [data-cy=\"nonexistent\"]",
	"snapshot": "- main:\n  - heading \"Login\" [level=1]",
	"url": "https://example.com/login",
	"title": "Login",
	"snapshotFilePath": ".cypress-cli/page-2026-03-07T19-23-05-456Z.yml"
}
```

Note: snapshot is included even on error, because the LLM needs to see the
current page state to decide what to do next.

Top-level protocol errors (`{ id, error }`) are reserved for transport / daemon
failures such as invalid commands, missing sessions, or server-side exceptions.
Normal command failures should come back in the `result` payload with
`success: false` plus the current snapshot.

## Resolved Design Questions

### 1. Should `assert` commands appear in the REPL loop?

**Decision**: Yes, execute assertions. The LLM benefits from immediate
feedback about whether the assertion passes. Assertions are executed via manual
chainer comparison in `cy.then()` callbacks (not `cy.should()`, which kills the
test on failure).

### 2. Should `wait` be explicit or implicit?

**Decision**: Support `wait` for explicit waits and `waitfor` for
element-based waits. `waitfor` is preferred. In the future, the codegen
system may flag `wait` commands as code smells.

### 3. How to handle iframes?

**Decision**: Phase 1 ignores iframes. A future issue can add iframe support
by extending the snapshot injection to traverse into iframe documents.

### 4. How to handle file uploads?

**Decision**: Will be implemented as `upload <ref> <file>` using
`cy.get(sel).selectFile(path)` (available since Cypress 9.3). See ROADMAP.md
for tracking.

### 5. How to handle cross-origin redirects during an active session?

The generated Cypress config sets `chromeWebSecurity: false`, which disables
same-origin enforcement in Chromium browsers (Chrome, Electron). This allows
the session to continue working after a cross-origin redirect — for example,
`https://www.wikipedia.org/` redirecting to `https://en.wikipedia.org/`.

**Firefox limitation**: Firefox ignores `chromeWebSecurity: false`. If a
cross-origin redirect occurs in Firefox, the session will fail with an origin
mismatch error. The error recovery mechanism will keep the session alive and
include guidance to re-open the session on the final URL. Workaround: use
Chrome or Electron, or start the session directly on the final URL.
