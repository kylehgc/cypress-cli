/**
 * Driver spec: the Cypress test file that implements the REPL polling loop.
 *
 * This file is passed as the `spec` to `cypress.run()` by the launcher.
 * It runs in the browser and continuously polls for commands from the daemon
 * via `cy.task('getCommand')`, executes them, and reports results back via
 * `cy.task('commandResult')`.
 *
 * This file is excluded from tsc compilation (see tsconfig.json) because it
 * uses Cypress globals (`cy`, `Cypress`, `describe`, `it`). It is bundled
 * or copied as-is for Cypress to consume.
 */

// MODIFIED: Use extensionless imports for Cypress's webpack preprocessor
// (these files are excluded from tsc and bundled by Cypress's webpack)
import { injectSnapshotLib, takeSnapshot } from './support';
import { resolveRefFromMap } from '../browser/refMap';
import { generateSelector, buildCypressCommand } from '../browser/selectorGenerator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A command received from the daemon via cy.task('getCommand'). */
interface DriverCommand {
	type?: 'poll' | 'stop';
	id?: number;
	action?: string;
	ref?: string;
	text?: string;
	options?: Record<string, unknown>;
}

/** Result reported back to the daemon via cy.task('commandResult'). */
interface DriverResult {
	success: boolean;
	snapshot?: string;
	error?: string;
	selector?: string;
	cypressCommand?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Timeout for cy.task('getCommand') — must be less than Cypress taskTimeout. */
const GET_COMMAND_TIMEOUT = 120_000;

// ---------------------------------------------------------------------------
// Ref resolution
// ---------------------------------------------------------------------------

/**
 * Resolves a ref string (e.g. "e5") to a Cypress chainable wrapping the
 * corresponding DOM element.
 *
 * Looks up the element from the window-level element map that is populated
 * by `takeSnapshot()` after each snapshot.
 */
function resolveRef(ref: string): Cypress.Chainable {
	return cy.window({ log: false }).then((win: Window) => {
		const element = resolveRefFromMap(win, ref);
		return cy.wrap(element, { log: false });
	});
}

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

/**
 * Commands that require a ref field to be present.
 */
const COMMANDS_REQUIRING_REF = new Set([
	'click', 'dblclick', 'rightclick', 'type', 'clear', 'check',
	'uncheck', 'select', 'focus', 'blur', 'hover', 'assert', 'waitfor',
]);

/**
 * Commands that require a text field to be present.
 */
const COMMANDS_REQUIRING_TEXT = new Set([
	'type', 'select', 'navigate', 'press',
]);

/**
 * Executes a single command received from the daemon.
 *
 * Maps command action strings to real Cypress API calls. Each command
 * resolves element refs to live DOM elements via `resolveRef()`.
 *
 * Note: Cypress commands are asynchronous chainables, not Promises.
 * If a Cypress command fails (e.g., element not found), the error
 * propagates through Cypress's own error handling rather than being
 * caught by a try-catch block. The test framework reports these errors.
 */
function executeCommand(cmd: DriverCommand): void {
	if (COMMANDS_REQUIRING_REF.has(cmd.action!) && !cmd.ref) {
		throw new Error(
			`Command "${cmd.action}" requires a ref. Provide an element ref from the aria snapshot (e.g., "e5").`,
		);
	}
	if (COMMANDS_REQUIRING_TEXT.has(cmd.action!) && !cmd.text) {
		throw new Error(
			`Command "${cmd.action}" requires a text argument.`,
		);
	}

	const options = cmd.options ?? {};

	switch (cmd.action) {
		case 'click':
			resolveRef(cmd.ref!).click(options);
			break;
		case 'dblclick':
			resolveRef(cmd.ref!).dblclick(options);
			break;
		case 'rightclick':
			resolveRef(cmd.ref!).rightclick(options);
			break;
		case 'type':
			resolveRef(cmd.ref!).type(cmd.text!, options);
			break;
		case 'clear':
			resolveRef(cmd.ref!).clear(options);
			break;
		case 'check':
			resolveRef(cmd.ref!).check(options);
			break;
		case 'uncheck':
			resolveRef(cmd.ref!).uncheck(options);
			break;
		case 'select':
			resolveRef(cmd.ref!).select(cmd.text!, options);
			break;
		case 'focus':
			resolveRef(cmd.ref!).focus();
			break;
		case 'blur':
			resolveRef(cmd.ref!).blur();
			break;
		case 'scrollto':
			if (cmd.ref) {
				resolveRef(cmd.ref).scrollIntoView(options);
			} else if (cmd.text) {
				cy.scrollTo(cmd.text as Cypress.PositionType, options);
			} else {
				throw new Error('`scrollto` command requires either `ref` (for scrollIntoView) or `text` (for position/coords).');
			}
			break;
		case 'hover':
			resolveRef(cmd.ref!).trigger('mouseover', options);
			break;
		case 'navigate':
			cy.visit(cmd.text!, options);
			break;
		case 'back':
			cy.go('back');
			break;
		case 'forward':
			cy.go('forward');
			break;
		case 'reload':
			cy.reload();
			break;
		case 'press':
			cy.get('body').type(`{${cmd.text}}`, { log: false });
			break;
		case 'assert':
			if (cmd.text) {
				resolveRef(cmd.ref!).should(cmd.options?.['chainer'] as string, cmd.text);
			} else {
				resolveRef(cmd.ref!).should(cmd.options?.['chainer'] as string);
			}
			break;
		case 'asserturl':
			if (cmd.text) {
				cy.url().should(cmd.options?.['chainer'] as string, cmd.text);
			} else {
				cy.url().should(cmd.options?.['chainer'] as string);
			}
			break;
		case 'asserttitle':
			if (cmd.text) {
				cy.title().should(cmd.options?.['chainer'] as string, cmd.text);
			} else {
				cy.title().should(cmd.options?.['chainer'] as string);
			}
			break;
		case 'wait':
			cy.wait(Number(cmd.text) || 0);
			break;
		case 'waitfor':
			resolveRef(cmd.ref!).should('exist');
			break;
		case 'snapshot':
			// No-op: snapshot is always taken after command execution
			break;
		default:
			throw new Error(`Unknown command action: ${cmd.action}`);
	}
}

// ---------------------------------------------------------------------------
// Polling loop
// ---------------------------------------------------------------------------

/**
 * The REPL polling loop. Continuously polls for commands via
 * `cy.task('getCommand')`, executes them, takes a snapshot,
 * and reports the result back.
 *
 * Handles three sentinel types:
 * - `{ type: 'poll' }` — timeout, re-poll immediately
 * - `{ type: 'stop' }` — exit the loop, end the test
 * - anything else — a real command to execute
 */
function pollForCommands(): void {
	cy.task('getCommand', null, { timeout: GET_COMMAND_TIMEOUT }).then(
		(raw: unknown) => {
			const cmd = raw as DriverCommand;

			// Poll sentinel: re-poll
			if (cmd.type === 'poll') {
				return pollForCommands();
			}

			// Stop sentinel: exit loop
			if (cmd.type === 'stop') {
				return;
			}

			// Execute the command, handling errors gracefully
			let commandError: string | undefined;
			try {
				executeCommand(cmd);
			} catch (err) {
				commandError =
					err instanceof Error ? err.message : String(err);
			}

			// Re-inject snapshot lib (in case of navigation)
			injectSnapshotLib();

			// Take post-command snapshot and report result
			takeSnapshot().then((snapshotYaml: string) => {
				/**
				 * Build the result and resolve selector/cypressCommand info.
				 * For commands with a ref, we generate a CSS selector and
				 * Cypress command string. For non-ref commands, we still
				 * generate the cypressCommand string for codegen.
				 * This always goes through cy.window() to stay in the
				 * Cypress command chain.
				 */
				cy.window({ log: false }).then((win: Window) => {
					let selector: string | undefined;
					let cypressCommand: string | undefined;

					if (cmd.ref && cmd.action) {
						try {
							const element = resolveRefFromMap(win, cmd.ref);
							selector = generateSelector(element);
							const chainer = cmd.options?.['chainer'] as string | undefined;
							cypressCommand = buildCypressCommand(selector, cmd.action, cmd.text, chainer);
						} catch {
							// Ref may no longer exist after command; ignore
						}
					} else if (cmd.action) {
						// Non-ref commands: still generate cypressCommand for codegen
						const chainer = cmd.options?.['chainer'] as string | undefined;
						cypressCommand = buildCypressCommand(undefined, cmd.action, cmd.text, chainer);
					}

					const result: DriverResult = commandError
						? {
								success: false,
								error: commandError,
								snapshot: snapshotYaml,
							}
						: {
								success: true,
								snapshot: snapshotYaml,
								selector,
								cypressCommand,
							};

					cy.task('commandResult', result, { log: false }).then(() => {
						pollForCommands();
					});
				});
			});
		},
	);
}

// ---------------------------------------------------------------------------
// Test entry point
// ---------------------------------------------------------------------------

describe('cypress-cli', () => {
	it('driver', () => {
		const url =
			(Cypress.env('CYPRESS_CLI_URL') as string | undefined) || '/';
		cy.visit(url);

		// Inject aria snapshot IIFE
		injectSnapshotLib();

		// Take initial snapshot and report it, then enter REPL loop
		takeSnapshot().then((snapshotYaml: string) => {
			const initialResult: DriverResult = {
				success: true,
				snapshot: snapshotYaml,
			};
			return cy
				.task('commandResult', initialResult, { log: false })
				.then(() => {
					pollForCommands();
				});
		});
	});
});
