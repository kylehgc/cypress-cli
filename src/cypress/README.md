# src/cypress/

> Cypress plugin (setupNodeEvents) and driver spec — the bridge between the
> daemon and the browser.

## Responsibility

This directory contains two things that work together:

1. **Plugin** (`plugin.ts`): Node.js code that runs in Cypress's Node process.
   Registers `cy.task()` handlers that connect to the daemon's command queue.

2. **Driver spec** (`driver.cy.ts`): A Cypress test file that runs in the
   browser. Implements the REPL loop: poll for commands → execute → snapshot →
   report.

## Key Files (planned)

```
cypress/
├── plugin.ts         ← setupNodeEvents: registers getCommand, reportResult tasks
├── driver.cy.ts      ← The REPL loop test file
├── executor.ts       ← Maps command objects to Cypress API calls
├── snapshot.ts       ← Injects IIFE, calls generateAriaTree, returns YAML
└── refs.ts           ← Manages ref → Element map, ref → selector resolution
```

## Plugin (plugin.ts)

The plugin is a function that the daemon passes to `cypress.run()` via
`setupNodeEvents`. It doesn't know about the CLI or the socket — it only knows
about the `CommandQueue` instance.

```typescript
export function registerTasks(
	on: Cypress.PluginEvents,
	queue: CommandQueue,
): void {
	on('task', {
		getCommand(): Promise<Command | { type: 'poll' }> {
			// Race between queue.dequeue() and a timeout
			return Promise.race([
				queue.dequeue(),
				timeout(110_000).then(() => ({ type: 'poll' as const })),
			]);
		},

		reportResult(result: CommandResult): true {
			queue.reportResult(result);
			return true; // cy.task must return a non-undefined value
		},
	});
}
```

### Why the timeout?

`cy.task()` must resolve. Cypress's `taskTimeout` (set to 5 minutes in our
config) will kill the test if a task never resolves. Our plugin-side timeout
(110 seconds) fires well before that, returning a `{ type: 'poll' }` sentinel.
The driver spec sees this and re-polls.

This creates an indefinite wait without ever hitting Cypress's hard timeout.

## Driver Spec (driver.cy.ts)

This is the heart of the system. It's a Cypress test that:

1. Visits the target URL
2. Injects the aria snapshot IIFE
3. Takes an initial snapshot
4. Enters the REPL loop

```typescript
describe('cypress-cli', () => {
	it('driver', () => {
		const url = Cypress.env('CYPRESS_CLI_URL') || '/';
		cy.visit(url);

		// Inject aria snapshot IIFE
		injectSnapshotLib();

		// Take initial snapshot and report it
		takeAndReportSnapshot();

		// Enter REPL loop
		pollForCommands();
	});
});
```

### The REPL Loop

```typescript
function pollForCommands(): void {
	cy.task('getCommand', null, { timeout: 120_000 }).then((cmd) => {
		if (cmd.type === 'poll') return pollForCommands();
		if (cmd.type === 'stop') return; // Test ends naturally

		// Execute the command
		executeCommand(cmd);

		// Re-inject snapshot lib (in case of navigation)
		injectSnapshotLib();

		// Take snapshot and report result
		takeAndReportSnapshot();

		// Continue loop
		pollForCommands();
	});
}
```

### Command Execution (executor.ts)

Maps command objects to Cypress API calls:

```typescript
function executeCommand(cmd: Command): void {
	switch (cmd.action) {
		case 'click':
			resolveRef(cmd.ref).click(cmd.options);
			break;
		case 'type':
			resolveRef(cmd.ref).type(cmd.text, cmd.options);
			break;
		case 'navigate':
			cy.visit(cmd.url, cmd.options);
			break;
		case 'select':
			resolveRef(cmd.ref).select(cmd.value);
			break;
		case 'assert':
			resolveRef(cmd.ref).should(cmd.chainer, cmd.value);
			break;
		// ... etc
	}
}
```

### Ref Resolution (refs.ts)

After each snapshot, we have a `Map<string, Element>` mapping ref strings to
DOM elements. For Cypress commands, we use `cy.wrap(element)` to get a
Cypress chainable from a raw DOM element.

For codegen, we also compute a stable CSS selector using the element's
attributes, following Cypress.ElementSelector priority.

```typescript
function resolveRef(ref: string): Cypress.Chainable {
	return cy.window().then((win) => {
		const element = currentElements.get(ref);
		if (!element) throw new Error(`Ref "${ref}" not found`);
		return cy.wrap(element);
	});
}
```

### Snapshot Injection (snapshot.ts)

The aria snapshot IIFE must be injected into the page context. It needs
re-injection after full-page navigation (`cy.visit()`) since that creates a
new window context.

```typescript
let injected = false;

function injectSnapshotLib(): void {
	cy.window().then((win) => {
		if (!win.__cypressCliAriaSnapshot) {
			win.eval(IIFE_STRING);
			injected = true;
		}
	});
}

function takeSnapshot(): Cypress.Chainable<string> {
	return cy.window().then((win) => {
		const api = win.__cypressCliAriaSnapshot;
		const snapshot = api.generateAriaTree(win.document.documentElement, {
			mode: 'ai',
		});
		const yaml = api.renderAriaTree(snapshot, { mode: 'ai' }, previousSnapshot);

		// Store for next diff
		previousSnapshot = snapshot;

		// Store element map for ref resolution
		currentElements = snapshot.elements;

		return yaml;
	});
}
```

## Important: cy.task Return Values

`cy.task()` handlers in Cypress must return a value (not `undefined`) or a
Promise that resolves to a value. Returning `undefined` causes Cypress to
fail the task.

- `getCommand` → returns the command object or `{ type: 'poll' }`
- `reportResult` → returns `true` (acknowledgment)

All values must be JSON-serializable (no DOM elements, no class instances,
no circular references). The aria snapshot YAML string and command objects
are plain JSON.

## Directory Placement

This directory is **not** a Cypress project itself. The files here are:

- `plugin.ts` — imported by the daemon when constructing the Cypress config
- `driver.cy.ts` — passed as the `spec` to `cypress.run()`

The consumer's project has its own `cypress.config.ts`. We augment it (or
create a temporary one) to add our plugin and spec.
