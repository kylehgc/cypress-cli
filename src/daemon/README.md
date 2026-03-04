# src/daemon/

> Persistent server process — bridges CLI commands to a running Cypress session.

## Responsibility

The daemon is a long-lived Node.js process. One daemon per session. It:

1. Listens on a Unix socket (`~/.cypress-cli/<hash>/<name>.sock`)
2. Starts Cypress via the Module API (`cypress.run()`) with the driver spec
3. Maintains a command queue (FIFO, one-at-a-time)
4. On each CLI command: enqueue → wait for driver spec to pick it up via
   `cy.task('getCommand')` → wait for result via `cy.task('reportResult')` →
   send result back to client
5. Manages session lifecycle (start, status, shutdown)

The daemon does **not** interpret commands or interact with the browser. It's a
pass-through between the CLI client and the Cypress test runner.

## Key Files (planned)

```
daemon/
├── index.ts          ← startDaemon(): creates socket server, starts Cypress
├── commandQueue.ts   ← FIFO queue with Promise-based blocking dequeue
├── session.ts        ← Session config management (create, read, delete)
├── cypress.ts        ← Cypress Module API wrapper (cypress.run with driver spec)
└── protocol.ts       ← Message types shared between daemon and client
```

## Modeled After

Playwright's `packages/playwright-core/src/cli/daemon/`:

- `daemon.ts` → `startMcpDaemonServer()` creates `net.createServer`, handles
  `connection.onmessage`, dispatches to backend
- `program.ts` → `decorateCLICommand()` sets up CLI options, resolves config

Key difference: Playwright's daemon calls MCP tools directly (it owns the
browser). Our daemon doesn't own the browser — Cypress does. We queue commands
and wait for Cypress to pull and execute them.

## Command Queue Design

The command queue is the critical piece. It connects two asynchronous worlds:

1. **CLI side** (push): daemon receives a command from the socket, enqueues it,
   and holds the socket connection open waiting for a result.
2. **Cypress side** (pull): the plugin's `getCommand` task handler calls
   `queue.dequeue()`, which returns a Promise that resolves when a command
   is available.

```typescript
class CommandQueue {
	private pending: Array<{
		command: Command;
		resolve: (result: CommandResult) => void;
	}> = [];

	private waiter: ((command: Command) => void) | null = null;

	// Called by daemon when CLI sends a command
	enqueue(command: Command): Promise<CommandResult> {
		return new Promise((resolve) => {
			if (this.waiter) {
				// Cypress is already waiting — deliver immediately
				const deliver = this.waiter;
				this.waiter = null;
				deliver(command);
				// Store resolve for when result comes back
				this.pendingResult = resolve;
			} else {
				this.pending.push({ command, resolve });
			}
		});
	}

	// Called by Cypress plugin when driver spec calls cy.task('getCommand')
	dequeue(): Promise<Command> {
		const next = this.pending.shift();
		if (next) {
			this.pendingResult = next.resolve;
			return Promise.resolve(next.command);
		}
		return new Promise((resolve) => {
			this.waiter = resolve;
		});
	}

	// Called by Cypress plugin when driver spec calls cy.task('reportResult')
	reportResult(result: CommandResult): void {
		this.pendingResult?.(result);
		this.pendingResult = null;
	}
}
```

**Important**: the `dequeue()` Promise must resolve within Cypress's task
timeout. If no command arrives, the plugin handler should resolve with a
`{ type: 'poll' }` sentinel after a generous timeout (e.g., 110 seconds).

## Starting Cypress

The daemon starts Cypress using the Module API:

```typescript
import cypress from 'cypress';

const result = await cypress.run({
	spec: path.resolve(__dirname, '../cypress/driver.cy.ts'),
	config: {
		e2e: {
			setupNodeEvents(on, config) {
				// Register cy.task handlers that connect to our command queue
				registerTasks(on, commandQueue);
				return config;
			},
		},
		taskTimeout: 300000, // 5 minutes — generous for long-poll
	},
	env: {
		CYPRESS_CLI_URL: targetUrl,
	},
	browser: options.browser || 'chrome',
	headed: false, // headless by default
});
```

The `setupNodeEvents` function wires the Cypress task handlers to the daemon's
command queue. This is how the two worlds connect.

## Socket Protocol

Same as client side — newline-delimited JSON:

```
← {"id":1,"method":"run","params":{"args":{"_":["click","e5"]}}}\n
→ {"id":1,"result":{"success":true,"snapshot":"..."}}\n
```

Special methods:

- `"run"` — execute a command
- `"stop"` — shutdown daemon + Cypress

## Lifecycle

```
cypress-cli open [url]
  → Client sends { method: "run", params: { args: { _: ["open", url] } } }
  → But "open" is special: if no daemon exists, client starts one
  → Daemon forks itself as a background process (detached)
  → Daemon starts Cypress, driver spec visits URL
  → Daemon writes session file and starts listening on socket

cypress-cli stop
  → Client sends { method: "stop" }
  → Daemon tells driver spec to exit (via { type: 'stop' } command)
  → Cypress exits, daemon cleans up socket + session file, exits

Crash recovery:
  → Client tries to connect, socket file exists but connection refused
  → Client removes stale socket file, tells user to run "open" again
```

## Configuration

The daemon reads config from (in order of priority):

1. CLI flags (`--browser`, `--config`)
2. Config file (`.cypress-cli.config.json` in workspace root)
3. Environment variables (`CYPRESS_CLI_BROWSER`, etc.)
4. Defaults (Chrome, headless, no isolation)
