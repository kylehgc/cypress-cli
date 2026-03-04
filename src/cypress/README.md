# src/cypress/

> Cypress plugin (setupNodeEvents) and driver spec — the bridge between the
> daemon and the browser.

## Responsibility

This directory contains two things that work together:

1. **Plugin** (`plugin.ts`): Node.js code that runs in Cypress's Node process.
   Registers `cy.task()` handlers that connect to the daemon's command queue.

2. **Driver spec** (`driverSpec.ts`): A Cypress test file that runs in the
   browser. Implements the REPL loop: poll for commands → execute → snapshot →
   report.

3. **Support** (`support.ts`): Browser-side helpers for IIFE injection and
   snapshot taking, imported by the driver spec.

4. **Launcher** (`launcher.ts`): Generates temporary Cypress config, wires
   plugin + support + spec, and runs Cypress via Module API.

## Files

```
cypress/
├── index.ts          ← Re-exports public API
├── plugin.ts         ← setupNodeEvents: registers getCommand, commandResult tasks
├── driverSpec.ts     ← The REPL loop test file (25+ commands implemented)
├── support.ts        ← IIFE injection, snapshot taking, element map management
└── launcher.ts       ← Generates temp config, launches cypress.run()/cypress.open()
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

		commandResult(result: CommandResult): true {
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

## Driver Spec (driverSpec.ts)

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

### Command Execution (in driverSpec.ts)

Maps command objects to Cypress API calls. The actual implementation handles
25+ commands including click, dblclick, rightclick, type, clear, check, uncheck,
select, focus, blur, scrollto, hover, navigate, back, forward, reload, press,
assert, asserturl, asserttitle, wait, waitfor, and snapshot.

```typescript
function executeCommand(cmd: DriverCommand): void {
	switch (cmd.action) {
		case 'click':
			resolveRef(cmd.ref!).click(options);
			break;
		case 'type':
			resolveRef(cmd.ref!).type(cmd.text!, options);
			break;
		case 'navigate':
			cy.visit(cmd.text!, options);
			break;
		case 'back':
			cy.go('back');
			break;
		// ... 20+ more commands
	}
}
```

### Ref Resolution (in driverSpec.ts)

After each snapshot, we have a `Map<string, Element>` mapping ref strings to
DOM elements stored on `window.__cypressCliElementMap`. For Cypress commands,
we use `cy.wrap(element)` to get a Cypress chainable from a raw DOM element.

```typescript
function resolveRef(ref: string): Cypress.Chainable {
	return cy.window({ log: false }).then((win) => {
		const elementMap = win.__cypressCliElementMap as Map<string, Element>;
		const element = elementMap?.get(ref);
		if (!element) throw new Error(`Ref "${ref}" not found in current snapshot`);
		return cy.wrap(element, { log: false });
	});
}
```

### Snapshot Injection (in support.ts)

The aria snapshot IIFE must be injected into the page context. It needs
re-injection after full-page navigation (`cy.visit()`) since that creates a
new window context. The IIFE is loaded from `Cypress.env('CYPRESS_CLI_IIFE')`.

```typescript
function injectSnapshotLib(): void {
	cy.window({ log: false }).then((win) => {
		if (!win.__cypressCliAriaSnapshot) {
			const iife = Cypress.env('CYPRESS_CLI_IIFE');
			if (iife) win.eval(iife);
		}
	});
}

function takeSnapshot(): Cypress.Chainable<string> {
	return cy.window({ log: false }).then((win) => {
		const api = win.__cypressCliAriaSnapshot;
		const snapshot = api.generateAriaTree(win.document.documentElement, {
			mode: 'ai',
		});
		// Store element map on window for ref resolution
		win.__cypressCliElementMap = snapshot.elements;
		return api.renderAriaTree(snapshot, { mode: 'ai' });
	});
}
```

## Important: cy.task Return Values

`cy.task()` handlers in Cypress must return a value (not `undefined`) or a
Promise that resolves to a value. Returning `undefined` causes Cypress to
fail the task.

- `getCommand` → returns the command object or `{ type: 'poll' }`
- `commandResult` → returns `true` (acknowledgment)

All values must be JSON-serializable (no DOM elements, no class instances,
no circular references). The aria snapshot YAML string and command objects
are plain JSON.

## Directory Placement

This directory is **not** a Cypress project itself. The files here are:

- `plugin.ts` — imported by the daemon when constructing the Cypress config
- `driverSpec.ts` — passed as the `spec` to `cypress.run()`
- `support.ts` — browser-side helpers imported by the driver spec
- `launcher.ts` — generates temporary Cypress config, launches via Module API

The consumer's project has its own `cypress.config.ts`. We augment it (or
create a temporary one) to add our plugin and spec.
