/**
 * Task handlers for the Cypress plugin side of the cy.task() polling loop.
 *
 * These handlers bridge the daemon's command queue and the Cypress driver spec:
 * - `getCommand`: long-polls for the next command (returns poll sentinel on timeout)
 * - `commandResult`: receives execution results from the driver spec
 *
 * The handlers are registered via Cypress's `on('task', ...)` in setupNodeEvents.
 */

import {
	CommandQueue,
	type QueuedCommand,
	type CommandResult,
} from './commandQueue.js';

/**
 * Default timeout (in ms) for the getCommand long-poll.
 * Must be shorter than Cypress's taskTimeout to avoid Cypress failing the test.
 * Cypress taskTimeout is 300000ms (5 min); we use 110s to leave comfortable margin.
 */
const DEFAULT_POLL_TIMEOUT = 110_000;

/**
 * Sentinel returned by getCommand when no command arrives within the timeout.
 * The driver spec sees this and immediately re-polls.
 */
export interface PollSentinel {
	type: 'poll';
}

/**
 * Sentinel returned by getCommand to tell the driver spec to stop.
 * The driver spec exits its polling loop.
 */
export interface StopSentinel {
	type: 'stop';
}

/**
 * The value returned by the getCommand task handler.
 * Either a real command, a poll sentinel, or a stop sentinel.
 */
export type GetCommandResult = QueuedCommand | PollSentinel | StopSentinel;

/**
 * Creates the `getCommand` task handler.
 *
 * This handler is called by the Cypress driver spec via `cy.task('getCommand')`.
 * It long-polls the command queue: if a command is available, it returns immediately.
 * If no command arrives within the timeout, it returns a `{ type: 'poll' }` sentinel
 * so the driver spec can re-poll without hitting Cypress's task timeout.
 *
 * @param queue - The daemon's command queue
 * @param pollTimeout - Timeout in ms before returning the poll sentinel
 * @returns A Cypress task handler function
 */
export function createGetCommandHandler(
	queue: CommandQueue,
	pollTimeout: number = DEFAULT_POLL_TIMEOUT,
): () => Promise<GetCommandResult> {
	return (): Promise<GetCommandResult> => {
		if (queue.isDisposed) {
			return Promise.resolve({ type: 'stop' } as StopSentinel);
		}

		// Race: command arrival vs timeout
		return new Promise<GetCommandResult>((resolve) => {
			let isResolved = false;

			const timer = setTimeout(() => {
				if (!isResolved) {
					isResolved = true;
					// No command arrived in time — return poll sentinel
					resolve({ type: 'poll' });
				}
			}, pollTimeout);

			queue
				.dequeue()
				.then((command) => {
					if (!isResolved) {
						isResolved = true;
						clearTimeout(timer);
						resolve(command);
					}
				})
				.catch(() => {
					// Queue disposed or error — tell driver to stop
					if (!isResolved) {
						isResolved = true;
						clearTimeout(timer);
						resolve({ type: 'stop' });
					}
				});
		});
	};
}

/**
 * Creates the `commandResult` task handler.
 *
 * This handler is called by the Cypress driver spec via `cy.task('commandResult', result)`.
 * It forwards the result to the command queue, which resolves the pending enqueue Promise,
 * which in turn sends the result back to the CLI client.
 *
 * @param queue - The daemon's command queue
 * @returns A Cypress task handler function
 */
export function createCommandResultHandler(
	queue: CommandQueue,
): (result: CommandResult) => boolean {
	return (result: CommandResult): boolean => {
		queue.reportResult(result);
		// Cypress tasks must return non-undefined, so we return true as acknowledgment
		return true;
	};
}

/**
 * All task handlers to register with Cypress.
 * Used by the plugin's setupNodeEvents.
 */
export interface TaskHandlers {
	getCommand: () => Promise<GetCommandResult>;
	commandResult: (result: CommandResult) => boolean;
}

/**
 * Creates all task handlers for a given command queue.
 *
 * @param queue - The daemon's command queue
 * @param pollTimeout - Timeout for getCommand long-poll (default: 110s)
 * @returns Object with getCommand and commandResult handlers
 */
export function createTaskHandlers(
	queue: CommandQueue,
	pollTimeout?: number,
): TaskHandlers {
	return {
		getCommand: createGetCommandHandler(queue, pollTimeout),
		commandResult: createCommandResultHandler(queue),
	};
}
