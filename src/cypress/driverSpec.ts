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

// MODIFIED: Use extensionless imports for the Cypress driver bundling pipeline
// (this spec is excluded from tsc and bundled by esbuild into dist/cypress/driverSpec.js)
import { injectSnapshotLib, takeSnapshot } from './support';
import { resolveRefFromMap } from '../browser/refMap';
import {
	generateSelector,
	buildCypressCommand,
} from '../browser/selectorGenerator';
import { validateElementForCommand } from '../browser/commandValidation';

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

/**
 * Validates that a ref exists in the element map and is connected to the DOM.
 * If not, stores the error in `_asyncCommandError` so the polling loop
 * reports it as a command failure.
 *
 * Must be called from within a cy.window().then() chain so the element map
 * is accessible.
 *
 * @returns The resolved Element if valid, or undefined if invalid (error stored)
 */
function validateRef(win: Window, ref: string): Element | undefined {
	try {
		const element = resolveRefFromMap(win, ref);
		if (!element.isConnected) {
			_asyncCommandError =
				`Ref "${ref}" points to a detached DOM element. ` +
				'Run `snapshot` to refresh the element map.';
			return undefined;
		}
		return element;
	} catch (err) {
		_asyncCommandError = err instanceof Error ? err.message : String(err);
		return undefined;
	}
}

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

/**
 * Commands that require a ref field to be present.
 */
const COMMANDS_REQUIRING_REF = new Set([
	'click',
	'dblclick',
	'rightclick',
	'type',
	'clear',
	'check',
	'uncheck',
	'select',
	'focus',
	'blur',
	'hover',
	'assert',
	'waitfor',
]);

/**
 * Commands that require a text field to be present.
 */
const COMMANDS_REQUIRING_TEXT = new Set([
	'type',
	'select',
	'navigate',
	'press',
]);

/**
 * Shared mutable state for capturing errors from async Cypress chains.
 * This is set by executeCommand's assertion handlers (inside cy.then callbacks)
 * and read by the polling loop when building the result.
 */
let _asyncCommandError: string | undefined;

/**
 * Reference to the currently registered Cypress.once('fail') handler, if any.
 * Used to clean up the handler when no error occurs, preventing it from
 * leaking into subsequent commands or snapshot-taking.
 */
let _pendingFailHandler: ((err: Error) => false) | undefined;

/**
 * Error captured by the fail handler that killed the current it() block's
 * command queue. Read by the dynamically-injected recovery test to report
 * the error and resume the polling loop.
 */
let _pendingRecoveryError: string | undefined;

/**
 * Counter for generating unique recovery test names.
 */
let _recoveryCount = 0;

/**
 * Apply a chai-style chainer assertion manually.
 *
 * Instead of using Cypress's `.should()` (which retries and eventually fails
 * the entire test), this performs a one-shot comparison and stores any failure
 * in `_asyncCommandError` so the polling loop can report it as a command
 * error without crashing the Cypress runner.
 *
 * @param chainer - The chai assertion chainer (e.g. 'equal', 'include', 'have.text')
 * @param actual - The actual value retrieved from the DOM/URL/title
 * @param expected - The expected value to compare against
 */
function applyChainer(
	chainer: string,
	actual: string,
	expected?: string,
): void {
	let error: string | undefined;

	switch (chainer) {
		case 'equal':
		case 'eq':
			if (actual !== expected) {
				error = `Expected "${expected}" but got "${actual}"`;
			}
			break;
		case 'not.equal':
			if (actual === expected) {
				error = `Expected value to not equal "${expected}"`;
			}
			break;
		case 'include':
		case 'contain':
		case 'contain.text':
		case 'contains':
			if (expected && !actual.includes(expected)) {
				error = `Expected "${actual}" to include "${expected}"`;
			}
			break;
		case 'not.include':
		case 'not.contain':
			if (expected && actual.includes(expected)) {
				error = `Expected "${actual}" to not include "${expected}"`;
			}
			break;
		case 'have.text':
			if (actual.trim() !== (expected ?? '').trim()) {
				error = `Expected text to be "${expected}" but got "${actual}"`;
			}
			break;
		case 'match':
			if (expected && !new RegExp(expected).test(actual)) {
				error = `Expected "${actual}" to match /${expected}/`;
			}
			break;
		default:
			error = `Unsupported chainer: "${chainer}"`;
			break;
	}

	if (error) {
		_asyncCommandError = error;
	}
}

/**
 * Apply a chai-style chainer assertion on a jQuery element.
 *
 * Handles element-based assertions (value, visibility, state, attributes)
 * that require direct access to the DOM element rather than just its text
 * content. Falls back to `applyChainer` with `$el.text()` for text-based
 * chainers.
 *
 * @param chainer - The chai assertion chainer (e.g. 'have.value', 'be.visible')
 * @param $el - The jQuery-wrapped DOM element
 * @param expected - The expected value to compare against (optional for boolean chainers)
 */
function applyElementChainer(
	chainer: string,
	$el: JQuery<HTMLElement>,
	expected?: string,
): void {
	let error: string | undefined;

	switch (chainer) {
		case 'have.value': {
			if (expected === undefined) {
				error = 'The "have.value" chainer requires an expected value.';
				break;
			}
			const actual = String($el.val() ?? '');
			if (actual !== expected) {
				error = `Expected value "${expected}" but got "${actual}"`;
			}
			break;
		}
		case 'be.visible':
			if (!$el.is(':visible')) {
				error = 'Expected element to be visible';
			}
			break;
		case 'not.be.visible':
			if ($el.is(':visible')) {
				error = 'Expected element to not be visible';
			}
			break;
		case 'be.checked':
			if (!$el.is(':checked')) {
				error = 'Expected element to be checked';
			}
			break;
		case 'not.be.checked':
			if ($el.is(':checked')) {
				error = 'Expected element to not be checked';
			}
			break;
		case 'be.disabled':
			if (!$el.is(':disabled')) {
				error = 'Expected element to be disabled';
			}
			break;
		case 'be.enabled':
			if ($el.is(':disabled')) {
				error = 'Expected element to be enabled';
			}
			break;
		case 'be.empty': {
			const val = $el.val();
			const hasValue = val !== undefined && val !== '';
			const hasText = $el.text() !== '';
			if (hasValue || hasText) {
				error = 'Expected element to be empty';
			}
			break;
		}
		case 'have.attr': {
			if (!expected) {
				error = 'have.attr requires an attribute name';
				break;
			}
			// Support "name=value" encoding (preferred) and "name value" (fallback)
			const eqIdx = expected.indexOf('=');
			const spaceIdx = expected.indexOf(' ');
			const sepIdx =
				eqIdx > 0 && eqIdx < expected.length - 1 ? eqIdx : spaceIdx;
			if (sepIdx === -1) {
				if ($el.attr(expected) === undefined) {
					error = `Expected element to have attribute "${expected}"`;
				}
			} else {
				const attrName = expected.substring(0, sepIdx);
				const attrValue = expected.substring(sepIdx + 1);
				const actual = $el.attr(attrName);
				if (actual === undefined) {
					error = `Expected element to have attribute "${attrName}"`;
				} else if (actual !== attrValue) {
					error = `Expected attribute "${attrName}" to be "${attrValue}" but got "${actual}"`;
				}
			}
			break;
		}
		case 'have.class':
			if (!expected) {
				error = 'have.class requires a class name';
			} else if (!$el.hasClass(expected)) {
				error = `Expected element to have class "${expected}" but it has "${$el.attr('class') ?? ''}"`;
			}
			break;
		case 'have.length': {
			const actual = $el.length;
			if (expected === undefined) {
				error = 'have.length requires an expected length value';
			} else {
				const exp = Number(expected);
				if (isNaN(exp)) {
					error = `have.length requires a numeric value, got "${expected}"`;
				} else if (actual !== exp) {
					error = `Expected length ${expected} but got ${actual}`;
				}
			}
			break;
		}
		default:
			// Fall back to text-based assertion
			applyChainer(chainer, $el.text(), expected);
			return;
	}

	if (error) {
		_asyncCommandError = error;
	}
}

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
		throw new Error(`Command "${cmd.action}" requires a text argument.`);
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
				throw new Error(
					'`scrollto` command requires either `ref` (for scrollIntoView) or `text` (for position/coords).',
				);
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
		case 'assert': {
			const chainer = cmd.options?.['chainer'] as string;
			resolveRef(cmd.ref!).then(($el) => {
				applyElementChainer(chainer, $el, cmd.text);
			});
			break;
		}
		case 'asserturl': {
			const chainer = cmd.options?.['chainer'] as string;
			cy.url().then((url: string) => {
				applyChainer(chainer, url, cmd.text);
			});
			break;
		}
		case 'asserttitle': {
			const chainer = cmd.options?.['chainer'] as string;
			cy.title().then((title: string) => {
				applyChainer(chainer, title, cmd.text);
			});
			break;
		}
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
			let selector: string | undefined;
			let cypressCommand: string | undefined;

			// Poll sentinel: re-poll
			if (cmd.type === 'poll') {
				return pollForCommands();
			}

			// Stop sentinel: exit loop
			if (cmd.type === 'stop') {
				return;
			}

			// Reset async error state before each command
			_asyncCommandError = undefined;

			// Pre-validate ref if the command requires one. This check runs
			// inside a cy.window() chain so we can access the element map.
			// If the ref is invalid, we skip executeCommand entirely and
			// report the error (avoiding Cypress chain crashes from detached elements).
			if (COMMANDS_REQUIRING_REF.has(cmd.action!) && cmd.ref) {
				cy.window({ log: false }).then((win: Window) => {
					const element = validateRef(win, cmd.ref!);
					if (!element) {
						// Ref is invalid — skip to result reporting
						return;
					}

					if (!cmd.action) {
						return;
					}

					// Pre-flight validation: check element type is appropriate
					// for the command (e.g., type requires an input/textarea).
					const validationError = validateElementForCommand(
						element,
						cmd.action,
					);
					if (validationError) {
						_asyncCommandError = validationError;
						return;
					}

					try {
						selector = generateSelector(element);
						const chainer = cmd.options?.['chainer'] as string | undefined;
						cypressCommand = buildCypressCommand(
							selector,
							cmd.action,
							cmd.text,
							chainer,
						);
					} catch {
						// Codegen metadata is best-effort; command execution can continue.
					}
				});
			} else if (cmd.action) {
				const chainer = cmd.options?.['chainer'] as string | undefined;
				cypressCommand = buildCypressCommand(
					undefined,
					cmd.action,
					cmd.text,
					chainer,
				);
			}

			// Execute the command, handling errors gracefully.
			// Synchronous errors (e.g. missing ref/text, unknown action) are
			// caught by try/catch. Assertion failures are captured in
			// _asyncCommandError by applyChainer (runs inside cy.then).
			// Invalid ref errors are captured by validateRef above.
			// Unexpected Cypress errors are caught by the Cypress.once('fail')
			// safety net to prevent the session from crashing.
			cy.then(() => {
				// Skip execution if ref or element validation already failed
				if (_asyncCommandError) {
					return;
				}

				// Layer 2: Register a fail handler as a safety net for
				// unexpected Cypress errors that pre-flight validation
				// cannot anticipate. When triggered, the current it() block's
				// command queue is killed by Cypress ("subsequent commands will
				// not be executed"). To recover, we save the error and inject
				// a new it() block into the runner's live test queue. The
				// recovery test reports the error and resumes polling.
				_pendingFailHandler = (err: Error): false => {
					_pendingRecoveryError = err.message;

					// Access the current test object. We clone it (not the
					// suite) to produce a recovery test with all internal
					// properties Cypress expects.
					const currentTest = (
						Cypress as unknown as { state: (key: string) => unknown }
					).state('test');
					if (currentTest) {
						enqueueRecoveryTest(currentTest);
					}

					return false;
				};
				Cypress.once('fail', _pendingFailHandler);

				try {
					executeCommand(cmd);
				} catch (err) {
					_asyncCommandError = err instanceof Error ? err.message : String(err);
				}
			});

			// Remove any pending fail handler before snapshot-taking.
			// If the handler fired (error occurred), Cypress.once already
			// removed it. If not, we remove it to prevent it from catching
			// errors during injectSnapshotLib or takeSnapshot.
			cy.then(() => {
				if (_pendingFailHandler) {
					Cypress.removeListener('fail', _pendingFailHandler);
					_pendingFailHandler = undefined;
				}
			});

			// Re-inject snapshot lib (in case of navigation)
			injectSnapshotLib();

			// Take post-command snapshot and report result
			takeSnapshot().then((snapshotYaml: string) => {
				// Pick up any async error from assertion commands or ref validation
				const error = _asyncCommandError;

				const result: DriverResult = error
					? {
							success: false,
							error,
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
		},
	);
}

// ---------------------------------------------------------------------------
// Recovery: dynamic test injection
// ---------------------------------------------------------------------------

/**
 * Injects a new `it()` block into the Mocha runner's live test queue.
 *
 * Cypress patches Mocha's `Runner.prototype.runTests` to expose
 * `suite.testsQueue` — a live reference to the array the runner iterates.
 * Pushing a Test onto this array causes the runner to execute it after
 * the current `it()` completes.
 *
 * We clone the current test (rather than creating a fresh Mocha.Test)
 * because Cypress's patched runner, reporter, and server-side code
 * expect many internal properties (_testConfig, id, order, invocationDetails,
 * ctx.currentTest, etc.) to be present. clone() copies them all, exactly
 * the same way Cypress's own retry mechanism creates new attempts.
 *
 * The recovery test reports the captured error with a fresh snapshot,
 * then resumes the polling loop with a brand-new command queue.
 */
function enqueueRecoveryTest(currentTest: unknown): void {
	_recoveryCount++;

	const t = currentTest as {
		clone: () => Record<string, unknown>;
		parent?: { testsQueue?: unknown[] };
	};

	// clone() copies parent, ctx, _testConfig, id, order, _currentRetry,
	// timeout, slow, retries, file, etc. — everything Cypress needs.
	const recovery = t.clone();

	// Override the test function with our recovery logic
	recovery['fn'] = () => {
		const error = _pendingRecoveryError;
		_pendingRecoveryError = undefined;
		_asyncCommandError = undefined;
		_pendingFailHandler = undefined;

		// Re-inject snapshot lib and take a fresh snapshot
		injectSnapshotLib();
		takeSnapshot().then((snapshotYaml: string) => {
			const result: DriverResult = {
				success: false,
				error: error ?? 'Unknown error (session recovered)',
				snapshot: snapshotYaml,
			};
			cy.task('commandResult', result, { log: false }).then(() => {
				pollForCommands();
			});
		});
	};

	// Reset retry counter so this isn't treated as a retry attempt
	recovery['_currentRetry'] = 0;
	recovery['title'] = `recovery-${_recoveryCount}`;

	// Prevent Cypress from navigating to about:blank between tests.
	// In run mode, Cypress checks `test.final && lastTestThatWillRunInSuite()`
	// to decide whether to reset the page. Setting final=false makes this
	// short-circuit to false, preserving the AUT page state across recoveries.
	recovery['final'] = false;

	if (t.parent?.testsQueue) {
		t.parent.testsQueue.push(recovery);
	}
}

// ---------------------------------------------------------------------------
// Test entry point
// ---------------------------------------------------------------------------

describe('cypress-cli', function () {
	// Prevent about:blank navigation between dynamic recovery tests.
	// The Cypress sessions module registers a test:before:after:run:async
	// listener that always navigates to about:blank between tests in run
	// mode — regardless of testIsolation config — due to an argument
	// alignment issue in the internal fire/action/emitThen chain.
	// Since cypress-cli uses testIsolation:false and never uses sessions,
	// removing this listener preserves page state across recoveries.
	before(() => {
		Cypress.removeAllListeners('test:before:after:run:async');
	});

	it('driver', () => {
		const url = (Cypress.env('CYPRESS_CLI_URL') as string | undefined) || '/';
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
