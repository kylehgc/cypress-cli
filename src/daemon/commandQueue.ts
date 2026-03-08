/**
 * FIFO command queue with Promise-based blocking dequeue.
 *
 * Connects two asynchronous worlds:
 * 1. CLI side (push): daemon receives a command from the socket, enqueues it,
 *    and holds the socket connection open waiting for a result.
 * 2. Cypress side (pull): the plugin's getCommand task handler calls dequeue(),
 *    which returns a Promise that resolves when a command is available.
 *
 * Only one consumer (Cypress plugin) can dequeue at a time.
 */

/**
 * A command to be executed by the Cypress driver spec.
 */
export interface QueuedCommand {
	/** Unique command identifier, matches the protocol message id */
	id: number;
	/** The action to perform (e.g., "click", "type", "navigate") */
	action: string;
	/** Element ref from the aria snapshot (e.g., "e5") */
	ref?: string;
	/** Additional text payload (e.g., text to type, URL to navigate to) */
	text?: string;
	/** Additional options passed to the Cypress command */
	options?: Record<string, unknown>;
}

/**
 * Result returned by the Cypress driver spec after executing a command.
 */
export interface CommandResult {
	/** Whether the command succeeded */
	success: boolean;
	/** Updated aria snapshot after the command executed */
	snapshot?: string;
	/** CSS selector resolved from the ref */
	selector?: string;
	/** The Cypress command that was generated (for codegen) */
	cypressCommand?: string;
	/** Error message if success is false */
	error?: string;
	/** Return value from run-code eval (stringified) */
	evalResult?: string;
}

/**
 * Internal entry pairing a queued command with its result resolver.
 * When the command completes, the resolver is called with the result,
 * which in turn resolves the Promise returned by enqueue().
 */
interface PendingEntry {
	command: QueuedCommand;
	resolve: (result: CommandResult) => void;
	reject: (error: Error) => void;
}

/**
 * FIFO command queue that bridges the daemon (push) and Cypress plugin (pull).
 *
 * - `enqueue()` is called by the daemon when a CLI command arrives over the socket.
 *   It returns a Promise that resolves when the command's result comes back.
 * - `dequeue()` is called by the Cypress plugin's getCommand task handler.
 *   It returns a Promise that resolves when a command is available.
 * - `reportResult()` is called by the Cypress plugin's commandResult task handler.
 *   It resolves the pending enqueue Promise with the result.
 *
 * Invariants:
 * - Only one dequeue() can be pending at a time (one Cypress consumer).
 * - Commands are delivered in FIFO order.
 * - Each command gets exactly one result.
 */
export class CommandQueue {
	private _pending: PendingEntry[] = [];
	private _waiter: ((entry: PendingEntry) => void) | null = null;
	private _waiterReject: ((error: Error) => void) | null = null;
	private _inflight: PendingEntry | null = null;
	private _isDisposed = false;

	/**
	 * Enqueue a command for the Cypress driver spec to pick up.
	 *
	 * @param command - The command to enqueue
	 * @returns A Promise that resolves with the command's result
	 * @throws {QueueError} If the queue has been disposed
	 */
	enqueue(command: QueuedCommand): Promise<CommandResult> {
		if (this._isDisposed) {
			throw new QueueError(
				'Cannot enqueue command: queue has been disposed. Start a new session.',
			);
		}

		return new Promise<CommandResult>((resolve, reject) => {
			const entry: PendingEntry = { command, resolve, reject };

			if (this._waiter) {
				// Cypress plugin is already waiting for a command — deliver immediately
				const deliver = this._waiter;
				this._waiter = null;
				this._waiterReject = null;
				this._inflight = entry;
				deliver(entry);
			} else {
				// No consumer waiting — add to queue
				this._pending.push(entry);
			}
		});
	}

	/**
	 * Dequeue the next command. Called by the Cypress plugin's getCommand handler.
	 *
	 * If no command is queued, returns a Promise that resolves when one arrives.
	 * Only one dequeue() call can be pending at a time.
	 *
	 * @returns A Promise resolving with the next command
	 * @throws {QueueError} If another dequeue is already pending, or queue is disposed
	 */
	dequeue(): Promise<QueuedCommand> {
		if (this._isDisposed) {
			throw new QueueError(
				'Cannot dequeue: queue has been disposed. Start a new session.',
			);
		}

		if (this._waiter !== null) {
			throw new QueueError(
				'Cannot dequeue: another dequeue is already pending. Only one consumer at a time.',
			);
		}

		if (this._inflight !== null) {
			throw new QueueError(
				'Cannot dequeue: a command is already in-flight. Call reportResult() first.',
			);
		}

		const next = this._pending.shift();
		if (next) {
			this._inflight = next;
			return Promise.resolve(next.command);
		}

		// No command available — wait for one
		return new Promise<QueuedCommand>((resolve, reject) => {
			this._waiter = (entry: PendingEntry) => {
				resolve(entry.command);
			};
			this._waiterReject = reject;
		});
	}

	/**
	 * Dequeue the next command with a timeout.
	 * If no command arrives within the timeout, returns null and cleans up
	 * the pending waiter so no orphaned dequeue remains.
	 *
	 * @param timeoutMs - Maximum time to wait for a command
	 * @returns The next command, or null if the timeout elapsed
	 * @throws {QueueError} If another dequeue is already pending, or queue is disposed
	 */
	dequeueWithTimeout(timeoutMs: number): Promise<QueuedCommand | null> {
		if (this._isDisposed) {
			throw new QueueError(
				'Cannot dequeue: queue has been disposed. Start a new session.',
			);
		}

		if (this._waiter !== null) {
			throw new QueueError(
				'Cannot dequeue: another dequeue is already pending. Only one consumer at a time.',
			);
		}

		if (this._inflight !== null) {
			throw new QueueError(
				'Cannot dequeue: a command is already in-flight. Call reportResult() first.',
			);
		}

		// Immediate return if a command is already queued
		const next = this._pending.shift();
		if (next) {
			this._inflight = next;
			return Promise.resolve(next.command);
		}

		// Wait for a command or timeout
		return new Promise<QueuedCommand | null>((resolve) => {
			const timer = setTimeout(() => {
				// Timeout fired — clear the waiter so no orphaned dequeue remains
				this._waiter = null;
				this._waiterReject = null;
				resolve(null);
			}, timeoutMs);

			this._waiter = (entry: PendingEntry) => {
				clearTimeout(timer);
				this._waiterReject = null;
				resolve(entry.command);
			};
			this._waiterReject = (error: Error) => {
				clearTimeout(timer);
				this._waiter = null;
				this._waiterReject = null;
				resolve(null);
				// We resolve null instead of rejecting so dequeueWithTimeout users
				// can check isDisposed and return a stop sentinel cleanly.
				void error; // suppress unused warning
			};
		});
	}

	/**
	 * Report the result of the currently executing command.
	 * Called by the Cypress plugin's commandResult task handler.
	 *
	 * @param result - The command execution result
	 * @throws {QueueError} If no command is currently in-flight
	 */
	reportResult(result: CommandResult): void {
		if (!this._inflight) {
			throw new QueueError(
				'Cannot report result: no command is currently in-flight.',
			);
		}

		const entry = this._inflight;
		this._inflight = null;
		entry.resolve(result);
	}

	/**
	 * The number of commands waiting in the queue (not yet picked up by Cypress).
	 */
	get size(): number {
		return this._pending.length;
	}

	/**
	 * Whether a command is currently being executed by Cypress.
	 */
	get hasInflight(): boolean {
		return this._inflight !== null;
	}

	/**
	 * Whether a Cypress consumer is waiting for the next command.
	 */
	get hasWaiter(): boolean {
		return this._waiter !== null;
	}

	/**
	 * Whether the queue has been disposed.
	 */
	get isDisposed(): boolean {
		return this._isDisposed;
	}

	/**
	 * Dispose the queue, settling all outstanding Promises.
	 *
	 * - Pending `enqueue()` Promises are rejected with a QueueError.
	 * - In-flight `enqueue()` Promise is rejected with a QueueError.
	 * - Pending `dequeue()` waiter is rejected with a QueueError.
	 * - Pending `dequeueWithTimeout()` waiter resolves with null
	 *   (so the caller can check `isDisposed` and return a stop sentinel).
	 *
	 * Called during daemon shutdown.
	 */
	dispose(): void {
		this._isDisposed = true;

		const disposalError = new QueueError(
			'Queue has been disposed. Command was not completed.',
		);

		// Reject the pending waiter (dequeue/dequeueWithTimeout Promise)
		if (this._waiterReject) {
			this._waiterReject(disposalError);
			this._waiterReject = null;
		}
		this._waiter = null;

		// Reject all pending enqueue Promises (commands not yet picked up)
		for (const entry of this._pending) {
			entry.reject(disposalError);
		}
		this._pending = [];

		// Reject the in-flight command's enqueue Promise
		if (this._inflight) {
			this._inflight.reject(disposalError);
			this._inflight = null;
		}
	}
}

/**
 * Error thrown when a queue operation is invalid.
 */
export class QueueError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'QueueError';
	}
}
