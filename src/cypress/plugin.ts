/**
 * Cypress plugin: setupNodeEvents handler that registers cy.task() handlers
 * for the getCommand/commandResult polling loop.
 *
 * This is the Node-side half of the cy.task() bridge between the daemon and
 * the Cypress driver spec. It is imported by the launcher when constructing
 * the generated Cypress config.
 */

import type { CommandQueue } from '../daemon/commandQueue.js';
import {
	createTaskHandlers,
	type TaskHandlers,
} from '../daemon/taskHandler.js';

// ---------------------------------------------------------------------------
// Types — avoid importing Cypress global types so tsc can compile without
// "types": ["cypress"] in tsconfig.
// ---------------------------------------------------------------------------

/**
 * Minimal representation of Cypress's `on` function from `setupNodeEvents`.
 * Accepts the event name and a record of task handlers.
 */
export type CypressOnFn = (
	event: string,
	tasks: Record<string, (...args: unknown[]) => unknown>,
) => void;

/**
 * Minimal representation of Cypress's plugin config object.
 */
export type CypressPluginConfig = Record<string, unknown>;

/**
 * Default long-poll timeout (ms) for the getCommand handler.
 * Must be shorter than Cypress's taskTimeout (300 000 ms) to avoid
 * Cypress failing the test.
 */
const DEFAULT_POLL_TIMEOUT = 110_000;

/**
 * Options for configuring the plugin's task registration.
 */
export interface PluginOptions {
	/** Override the getCommand long-poll timeout (ms). */
	pollTimeout?: number;
}

/**
 * Registers cy.task() handlers (`getCommand`, `commandResult`) on the
 * Cypress `on` callback provided by `setupNodeEvents`.
 *
 * @param on - The Cypress `on` function from `setupNodeEvents`
 * @param queue - The daemon's command queue instance
 * @param options - Optional configuration
 * @returns The created TaskHandlers (useful for testing)
 */
export function registerTasks(
	on: CypressOnFn,
	queue: CommandQueue,
	options: PluginOptions = {},
): TaskHandlers {
	const pollTimeout = options.pollTimeout ?? DEFAULT_POLL_TIMEOUT;
	const handlers = createTaskHandlers(queue, pollTimeout);

	on('task', {
		getCommand: handlers.getCommand as (...args: unknown[]) => unknown,
		commandResult: handlers.commandResult as (...args: unknown[]) => unknown,
	});

	return handlers;
}

/**
 * Creates a `setupNodeEvents` function wired to the given command queue.
 *
 * This is the value assigned to `setupNodeEvents` in the generated
 * Cypress config produced by the launcher.
 *
 * @param queue - The daemon's command queue instance
 * @param options - Optional plugin configuration
 * @returns A function suitable for Cypress's `setupNodeEvents`
 */
export function createSetupNodeEvents(
	queue: CommandQueue,
	options: PluginOptions = {},
): (on: CypressOnFn, config: CypressPluginConfig) => void {
	return (on: CypressOnFn, _config: CypressPluginConfig): void => {
		registerTasks(on, queue, options);
	};
}
