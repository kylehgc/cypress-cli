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
import { injectSnapshotLib, takeSnapshot, takeFullSnapshot } from './support';
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
	evalResult?: string;
	url?: string;
	title?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Timeout for cy.task('getCommand') — must be less than Cypress taskTimeout. */
const GET_COMMAND_TIMEOUT = 120_000;

// ---------------------------------------------------------------------------
// Network monitoring state
// ---------------------------------------------------------------------------

/**
 * A captured network request entry populated by the passive network monitor.
 * Stored in `_networkLog` and returned by the `network` command.
 */
interface NetworkEntry {
	url: string;
	method: string;
	status: number;
	contentType: string;
	size: number;
	timestamp: string;
}

/**
 * Maximum number of network entries to retain in `_networkLog`.
 * Older entries are evicted FIFO when this limit is exceeded.
 */
const MAX_NETWORK_LOG_SIZE = 1000;

/**
 * Buffer of network requests captured by the passive intercept.
 * Capped at `MAX_NETWORK_LOG_SIZE` entries — oldest entries are
 * evicted when the cap is reached.
 */
const _networkLog: NetworkEntry[] = [];

/**
 * Map of active intercept route patterns to their static response config.
 * Used by `unintercept` to know which patterns to replace with passthrough,
 * and by error recovery to replay intercepts in the new test context.
 */
const _activeRoutes = new Map<string, Record<string, unknown>>();

/**
 * Map of intercept patterns to their Cypress aliases.
 * Used by `waitforresponse` to resolve patterns to `@alias` names.
 */
const _interceptAliases = new Map<string, string>();

/** Counter for generating unique intercept alias names. */
let _interceptAliasCounter = 0;

/** Commands that return structured data only and should not capture snapshots. */
const STRUCTURED_DATA_ONLY_COMMANDS = new Set([
	'cookie-list',
	'cookie-get',
	'cookie-set',
	'cookie-delete',
	'cookie-clear',
	'state-save',
	'state-load',
]);

/**
 * Generates a unique, Cypress-safe alias name from a URL pattern.
 * Strips glob characters and path separators, converts to camelCase.
 */
function _generateAlias(pattern: string): string {
	_interceptAliasCounter++;
	// Strip glob chars, keep alphanumeric and slashes, then extract words
	const words = pattern
		.replace(/[*?{}[\]]/g, '')
		.replace(/[^a-zA-Z0-9]/g, ' ')
		.trim()
		.split(/\s+/)
		.filter(Boolean);
	const camel =
		words.length > 0
			? words[0].toLowerCase() +
				words
					.slice(1)
					.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
					.join('')
			: 'intercept';
	return `${camel}${_interceptAliasCounter}`;
}

/**
 * Compares cookie domains while normalizing the leading-dot form used by
 * browsers (e.g. `.example.com`) and the plain host form often used by CLI
 * filters (`example.com`).
 */
function domainsMatch(actualDomain: string, expectedDomain: string): boolean {
	return actualDomain.replace(/^\./, '') === expectedDomain.replace(/^\./, '');
}

/**
 * Registers a passive `cy.intercept('**')` to capture all network requests.
 * Called once at session start, before the first cy.visit().
 */
function registerPassiveNetworkMonitor(): void {
	cy.intercept('**', (req) => {
		req.on('response', (res) => {
			_networkLog.push({
				url: req.url,
				method: req.method,
				status: res.statusCode,
				contentType: (res.headers['content-type'] as string | undefined) ?? '',
				size: res.body ? String(res.body).length : 0,
				timestamp: new Date().toISOString(),
			});
			// Evict oldest entries when cap is exceeded
			if (_networkLog.length > MAX_NETWORK_LOG_SIZE) {
				_networkLog.splice(0, _networkLog.length - MAX_NETWORK_LOG_SIZE);
			}
		});
		req.continue();
	});
}

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
	'fill',
	'clear',
	'check',
	'uncheck',
	'select',
	'focus',
	'blur',
	'hover',
	'assert',
	'waitfor',
	'drag',
	'upload',
]);

/**
 * Commands that require a text field to be present.
 */
const COMMANDS_REQUIRING_TEXT = new Set([
	'type',
	'fill',
	'select',
	'navigate',
	'press',
	'run-code',
	'eval',
	'intercept',
	'upload',
	'drag',
	'waitforresponse',
]);

/**
 * Shared mutable state for capturing errors from async Cypress chains.
 * This is set by executeCommand's assertion handlers (inside cy.then callbacks)
 * and read by the polling loop when building the result.
 */
let _asyncCommandError: string | undefined;

/**
 * Maps standard DOM key names to Cypress special-key names.
 * Keys not in this map are passed through as-is (e.g. 'Enter' → 'enter' already works).
 * @see https://docs.cypress.io/api/commands/type#Arguments
 */
const KEY_MAP: Record<string, string> = {
	Escape: 'esc',
	ArrowUp: 'upArrow',
	ArrowDown: 'downArrow',
	ArrowLeft: 'leftArrow',
	ArrowRight: 'rightArrow',
	Delete: 'del',
	' ': 'space',
	PageUp: 'pageUp',
	PageDown: 'pageDown',
};

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
 * Safely serialize a value to JSON. Handles circular references,
 * BigInt, DOM nodes, functions, symbols, and undefined.
 */
function safeJsonSerialize(value: unknown): string {
	if (value === undefined) return 'undefined';
	if (value === null) return 'null';
	if (typeof value === 'function')
		return `[Function: ${value.name || 'anonymous'}]`;
	if (typeof value === 'symbol') return value.toString();
	if (typeof value === 'bigint') return `${value.toString()}n`;
	try {
		return JSON.stringify(value, (_key, v) => {
			if (typeof v === 'bigint') return `${v.toString()}n`;
			if (typeof v === 'function')
				return `[Function: ${v.name || 'anonymous'}]`;
			if (typeof v === 'symbol') return v.toString();
			if (v instanceof HTMLElement)
				return `[HTMLElement: <${v.tagName.toLowerCase()}>]`;
			if (v instanceof Node) return `[Node: ${v.nodeName}]`;
			return v;
		});
	} catch {
		return String(value);
	}
}

/**
 * Captures the return value of run-code's eval() call.
 * Set inside executeCommand and read when building the result.
 */
let _evalResult: string | undefined;

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
		case 'fill':
			resolveRef(cmd.ref!).clear(options).type(cmd.text!, options);
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
			resolveRef(cmd.ref!).then(($el) => {
				if ($el.is('select')) {
					cy.wrap($el).select(cmd.text!, options);
				} else {
					const $childSelect = $el.find('select');
					if ($childSelect.length > 0) {
						cy.wrap($childSelect.first()).select(cmd.text!, options);
					} else {
						cy.wrap($el).select(cmd.text!, options);
					}
				}
			});
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
		case 'press': {
			const cypressKey = KEY_MAP[cmd.text!] ?? cmd.text;
			cy.get('body').type(`{${cypressKey}}`, { log: false });
			break;
		}
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
		case 'run-code':
			cy.window({ log: false }).then((win: Window) => {
				const evalFn = (win as Window & { eval: (code: string) => unknown })
					.eval;
				const result = evalFn.call(win, cmd.text!);
				if (result !== undefined) {
					_evalResult = String(result);
				}
			});
			break;
		case 'eval':
			if (cmd.ref) {
				resolveRef(cmd.ref).then(($el) => {
					cy.window({ log: false }).then((win: Window) => {
						try {
							const evalFn = (
								win as Window & { eval: (code: string) => unknown }
							).eval;
							const element = $el[0];
							const fn = evalFn.call(win, `(${cmd.text!})`);
							const result = typeof fn === 'function' ? fn(element) : fn;
							_evalResult = safeJsonSerialize(result);
						} catch (e) {
							_asyncCommandError = e instanceof Error ? e.message : String(e);
						}
					});
				});
			} else {
				cy.window({ log: false }).then((win: Window) => {
					try {
						const evalFn = (win as Window & { eval: (code: string) => unknown })
							.eval;
						const result = evalFn.call(win, cmd.text!);
						_evalResult = safeJsonSerialize(result);
					} catch (e) {
						_asyncCommandError = e instanceof Error ? e.message : String(e);
					}
				});
			}
			break;
		case 'snapshot':
			// No-op: snapshot is always taken after command execution
			break;
		case 'network': {
			// Handle --clear option: empty the log and return confirmation
			if (cmd.options?.['clear']) {
				const count = _networkLog.length;
				_networkLog.length = 0;
				_evalResult = JSON.stringify({
					cleared: count,
					activeRouteCount: _activeRoutes.size,
				});
			} else {
				// Return captured network requests as JSON with metadata
				_evalResult = JSON.stringify({
					entries: _networkLog,
					activeRouteCount: _activeRoutes.size,
				});
			}
			break;
		}
		case 'cookie-list': {
			const domain = cmd.options?.['domain'] as string | undefined;
			cy.getCookies().then((cookies) => {
				const filtered = domain
					? cookies.filter((cookie) => domainsMatch(cookie.domain, domain))
					: cookies;
				_evalResult = JSON.stringify(filtered);
			});
			break;
		}
		case 'cookie-get': {
			const name = cmd.text!;
			cy.getCookie(name).then((cookie) => {
				if (!cookie) {
					_asyncCommandError = `Cookie "${name}" not found.`;
					return;
				}
				_evalResult = JSON.stringify(cookie);
			});
			break;
		}
		case 'cookie-set': {
			const name = cmd.text!;
			const value = cmd.options?.['value'];
			const cookieOptions: Partial<Cypress.SetCookieOptions> = {};
			if (typeof cmd.options?.['domain'] === 'string') {
				cookieOptions.domain = cmd.options['domain'];
			}
			if (typeof cmd.options?.['path'] === 'string') {
				cookieOptions.path = cmd.options['path'];
			}
			if (typeof cmd.options?.['httpOnly'] === 'boolean') {
				cookieOptions.httpOnly = cmd.options['httpOnly'];
			}
			if (typeof cmd.options?.['secure'] === 'boolean') {
				cookieOptions.secure = cmd.options['secure'];
			}

			const hasOptions = Object.keys(cookieOptions).length > 0;
			const setCookie = hasOptions
				? cy.setCookie(name, String(value ?? ''), cookieOptions)
				: cy.setCookie(name, String(value ?? ''));

			setCookie.then((cookie) => {
				_evalResult = JSON.stringify(cookie);
			});
			break;
		}
		case 'cookie-delete': {
			const name = cmd.text!;
			cy.getCookie(name).then((cookie) => {
				if (!cookie) {
					_asyncCommandError = `Cookie "${name}" not found.`;
					return;
				}
				cy.clearCookie(name).then(() => {
					_evalResult = JSON.stringify({
						name,
						cleared: true,
					});
				});
			});
			break;
		}
		case 'cookie-clear': {
			cy.getCookies().then((cookies) => {
				cy.clearCookies().then(() => {
					_evalResult = JSON.stringify({
						cleared: cookies.length,
					});
				});
			});
			break;
		}
		case 'state-save': {
			cy.getCookies().then((cookies) => {
				cy.url().then((currentUrl: string) => {
					cy.window({ log: false }).then((win: Window) => {
						const localStorageEntries: [string, string][] = [];
						for (let i = 0; i < win.localStorage.length; i++) {
							const key = win.localStorage.key(i);
							if (key !== null) {
								localStorageEntries.push([
									key,
									win.localStorage.getItem(key) ?? '',
								]);
							}
						}

						const sessionStorageEntries: [string, string][] = [];
						for (let i = 0; i < win.sessionStorage.length; i++) {
							const key = win.sessionStorage.key(i);
							if (key !== null) {
								sessionStorageEntries.push([
									key,
									win.sessionStorage.getItem(key) ?? '',
								]);
							}
						}

						_evalResult = JSON.stringify(
							{
								url: currentUrl,
								cookies,
								localStorage: localStorageEntries,
								sessionStorage: sessionStorageEntries,
							},
							null,
							2,
						);
					});
				});
			});
			break;
		}
		case 'state-load': {
			const stateData = cmd.options?.['stateData'] as string | undefined;
			if (!stateData) {
				_asyncCommandError = 'No state data provided for state-load.';
				break;
			}

			let state: {
				url?: string;
				cookies?: Array<{
					name: string;
					value: string;
					domain?: string;
					path?: string;
					httpOnly?: boolean;
					secure?: boolean;
				}>;
				localStorage?: [string, string][];
				sessionStorage?: [string, string][];
			};
			try {
				state = JSON.parse(stateData);
			} catch {
				_asyncCommandError = 'Invalid state data JSON.';
				break;
			}

			// Clear existing cookies first
			cy.clearCookies();

			// Restore cookies
			if (Array.isArray(state.cookies)) {
				for (const cookie of state.cookies) {
					const cookieOpts: Partial<Cypress.SetCookieOptions> = {};
					if (cookie.domain) cookieOpts.domain = cookie.domain;
					if (cookie.path) cookieOpts.path = cookie.path;
					if (cookie.httpOnly !== undefined)
						cookieOpts.httpOnly = cookie.httpOnly;
					if (cookie.secure !== undefined) cookieOpts.secure = cookie.secure;
					const hasOpts = Object.keys(cookieOpts).length > 0;
					if (hasOpts) {
						cy.setCookie(cookie.name, cookie.value, cookieOpts);
					} else {
						cy.setCookie(cookie.name, cookie.value);
					}
				}
			}

			// Navigate to saved URL before restoring storage (storage is origin-scoped)
			if (state.url) {
				cy.visit(state.url, { log: false });
			}

			// Restore localStorage and sessionStorage
			cy.window({ log: false }).then((win: Window) => {
				if (Array.isArray(state.localStorage)) {
					for (const [key, value] of state.localStorage) {
						win.localStorage.setItem(key, value);
					}
				}
				if (Array.isArray(state.sessionStorage)) {
					for (const [key, value] of state.sessionStorage) {
						win.sessionStorage.setItem(key, value);
					}
				}

				const restored = {
					cookies: Array.isArray(state.cookies) ? state.cookies.length : 0,
					localStorage: Array.isArray(state.localStorage)
						? state.localStorage.length
						: 0,
					sessionStorage: Array.isArray(state.sessionStorage)
						? state.sessionStorage.length
						: 0,
					...(state.url !== undefined && { url: state.url }),
				};
				_evalResult = JSON.stringify(restored);
			});
			break;
		}
		case 'intercept': {
			const pattern = cmd.text!;
			const statusCode =
				cmd.options?.['status'] !== undefined
					? Number(cmd.options['status'])
					: undefined;
			const body = cmd.options?.['body'] as string | undefined;
			const contentType = cmd.options?.['content-type'] as string | undefined;

			const staticResponse: Record<string, unknown> = {};
			if (statusCode !== undefined) {
				staticResponse['statusCode'] = statusCode;
			}
			if (body !== undefined) {
				try {
					staticResponse['body'] = JSON.parse(body);
				} catch {
					// Not valid JSON — use the raw string as the response body
					staticResponse['body'] = body;
				}
			}
			if (contentType !== undefined) {
				staticResponse['headers'] = { 'content-type': contentType };
			}

			// Alias is pre-generated in the codegen section before executeCommand
			const alias = _interceptAliases.get(pattern) ?? _generateAlias(pattern);
			_interceptAliases.set(pattern, alias);

			if (Object.keys(staticResponse).length > 0) {
				cy.intercept(pattern, staticResponse).as(alias);
			} else {
				// Intercept without mock response — just monitor
				cy.intercept(pattern).as(alias);
			}
			_activeRoutes.set(pattern, staticResponse);
			_evalResult = JSON.stringify({
				message: `Intercept registered for "${pattern}" as @${alias}`,
				activeRouteCount: _activeRoutes.size,
			});
			break;
		}
		case 'waitforresponse': {
			const pattern = cmd.text!;
			const alias = _interceptAliases.get(pattern);
			if (!alias) {
				throw new Error(
					`No intercept registered for "${pattern}". Run "intercept ${pattern}" first.`,
				);
			}
			const timeout =
				cmd.options?.['timeout'] !== undefined
					? Number(cmd.options['timeout'])
					: undefined;
			if (timeout !== undefined) {
				cy.wait(`@${alias}`, { timeout });
			} else {
				cy.wait(`@${alias}`);
			}
			break;
		}
		case 'unintercept': {
			const pattern = cmd.text;
			if (pattern) {
				// Replace specific intercept with passthrough
				cy.intercept(pattern, (req) => {
					req.continue();
				});
				_activeRoutes.delete(pattern);
				_interceptAliases.delete(pattern);
				_evalResult = JSON.stringify({
					message: `Intercept removed for "${pattern}"`,
					activeRouteCount: _activeRoutes.size,
				});
			} else {
				// Remove all intercepts by replacing with passthrough
				for (const p of _activeRoutes.keys()) {
					cy.intercept(p, (req) => {
						req.continue();
					});
				}
				const count = _activeRoutes.size;
				_activeRoutes.clear();
				_interceptAliases.clear();
				_evalResult = JSON.stringify({
					message: `All ${count} intercept(s) removed`,
					activeRouteCount: 0,
				});
			}
			break;
		}
		case 'dialog-accept': {
			const promptText = cmd.text;
			Cypress.once('window:confirm', () => true);
			Cypress.once('window:alert', () => true);
			if (promptText !== undefined) {
				cy.window({ log: false }).then((win: Window) => {
					const origPrompt = win.prompt;
					win.prompt = () => {
						win.prompt = origPrompt;
						return promptText;
					};
				});
			}
			_evalResult = promptText
				? `Dialog will be accepted with text: "${promptText}"`
				: 'Dialog will be accepted';
			break;
		}
		case 'dialog-dismiss':
			Cypress.once('window:confirm', () => false);
			Cypress.once('window:alert', () => false);
			_evalResult = 'Dialog will be dismissed';
			break;
		case 'resize': {
			const width = Number(cmd.options?.['width']);
			const height = Number(cmd.options?.['height']);
			cy.viewport(width, height);
			break;
		}
		case 'screenshot': {
			const filename =
				(cmd.options?.['filename'] as string | undefined) ??
				`screenshot-${new Date().toISOString().replace(/[:.]/g, '-')}`;
			if (cmd.ref) {
				resolveRef(cmd.ref).screenshot(filename);
			} else {
				cy.screenshot(filename);
			}
			_evalResult = `Screenshot saved: ${filename}`;
			break;
		}
		case 'drag': {
			const endRef = cmd.text!;
			const force = Boolean(options['force']);
			resolveRef(cmd.ref!).then(($source) => {
				cy.window({ log: false }).then((win: Window) => {
					const endElement = validateRef(win, endRef);
					if (!endElement) return;
					const targetRect = endElement.getBoundingClientRect();
					cy.wrap($source)
						.trigger('pointerdown', { which: 1, force })
						.trigger('dragstart', { force })
						.trigger('mousemove', {
							clientX: targetRect.left + targetRect.width / 2,
							clientY: targetRect.top + targetRect.height / 2,
							force,
						});
					cy.wrap(endElement)
						.trigger('dragover', { force })
						.trigger('drop', { force });
					cy.wrap($source)
						.trigger('dragend', { force })
						.trigger('pointerup', { force });
				});
			});
			break;
		}
		case 'upload':
			resolveRef(cmd.ref!).selectFile(cmd.text!, options);
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
			_evalResult = undefined;

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
						const codegenOptions = { ...cmd.options };

						// For drag, resolve the target element selector too
						if (cmd.action === 'drag' && cmd.text) {
							try {
								const targetEl = resolveRefFromMap(win, cmd.text);
								if (targetEl?.isConnected) {
									codegenOptions['_targetSelector'] =
										generateSelector(targetEl);
								}
							} catch {
								// Best-effort: target selector for codegen only
							}
						}

						cypressCommand = buildCypressCommand(
							selector,
							cmd.action,
							cmd.text,
							chainer,
							codegenOptions,
						);
					} catch {
						// Codegen metadata is best-effort; command execution can continue.
					}
				});
			} else if (cmd.action && cmd.ref) {
				// Commands with an optional ref (e.g. screenshot): resolve the
				// element for codegen but don't validate as strictly.
				cy.window({ log: false }).then((win: Window) => {
					const element = validateRef(win, cmd.ref!);
					if (!element) return;
					try {
						selector = generateSelector(element);
						cypressCommand = buildCypressCommand(
							selector,
							cmd.action!,
							cmd.text,
							undefined,
							cmd.options,
						);
					} catch {
						// Codegen metadata is best-effort
					}
				});
			} else if (cmd.action) {
				const chainer = cmd.options?.['chainer'] as string | undefined;
				// For intercept/waitforresponse, inject alias metadata for codegen
				let codegenOpts = cmd.options;
				if (cmd.action === 'intercept' && cmd.text) {
					// Pre-generate the alias. executeCommand will use _interceptAliases
					// to look it up rather than generating again.
					const alias = _generateAlias(cmd.text);
					_interceptAliases.set(cmd.text, alias);
					codegenOpts = { ...cmd.options, _alias: alias };
				} else if (cmd.action === 'waitforresponse' && cmd.text) {
					const alias = _interceptAliases.get(cmd.text);
					if (alias) {
						codegenOpts = { ...cmd.options, _alias: alias };
					}
				}
				cypressCommand = buildCypressCommand(
					undefined,
					cmd.action,
					cmd.text,
					chainer,
					codegenOpts,
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

			// Take post-command snapshot and report result.
			// Snapshot, navigation commands (navigate, back, forward, reload)
			// return a full tree because the page content may have changed
			// entirely. Other action commands return an incremental diff
			// showing what the action changed.
			const FULL_TREE_COMMANDS = new Set([
				'snapshot',
				'navigate',
				'back',
				'forward',
				'reload',
				'resize',
			]);
			const reportResult = (snapshotYaml?: string) => {
				// Pick up any async error from assertion commands or ref validation
				const error = _asyncCommandError;

				// Capture current page URL and title for the result metadata
				cy.url({ log: false }).then((pageUrl: string) => {
					cy.title({ log: false }).then((pageTitle: string) => {
						const result: DriverResult = error
							? {
									success: false,
									error,
									...(snapshotYaml !== undefined && { snapshot: snapshotYaml }),
									url: pageUrl,
									title: pageTitle,
								}
							: {
									success: true,
									...(snapshotYaml !== undefined && { snapshot: snapshotYaml }),
									selector,
									cypressCommand,
									url: pageUrl,
									title: pageTitle,
									...(_evalResult !== undefined && {
										evalResult: _evalResult,
									}),
								};

						cy.task('commandResult', result, { log: false }).then(() => {
							pollForCommands();
						});
					});
				});
			};

			if (STRUCTURED_DATA_ONLY_COMMANDS.has(cmd.action!)) {
				cy.then(() => {
					reportResult();
				});
				return;
			}

			const snap = FULL_TREE_COMMANDS.has(cmd.action!)
				? takeFullSnapshot()
				: takeSnapshot();
			snap.then((snapshotYaml: string) => {
				reportResult(snapshotYaml);
			});
		},
	);
}

// ---------------------------------------------------------------------------
// Recovery: dynamic test injection
// ---------------------------------------------------------------------------

/**
 * Detects cross-origin error patterns and appends recovery guidance.
 *
 * When `chromeWebSecurity: false` is insufficient (e.g. Firefox) or Cypress
 * raises its own origin-mismatch error, this helper enriches the message so
 * the LLM agent knows how to continue.
 */
function enhanceCrossOriginError(error: string): string {
	if (
		/origin .+ but the application is at origin/i.test(error) ||
		/Blocked a frame with origin/i.test(error)
	) {
		return (
			error +
			'\n\nCross-origin recovery: The page navigated to a different origin. ' +
			'Run "open <current-url>" to start a fresh session on the new URL. ' +
			'To avoid this in future sessions, use Chrome or Electron instead of Firefox.'
		);
	}
	return error;
}

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

		// Enhance cross-origin errors with recovery guidance so the
		// LLM agent knows how to continue after a redirect.
		const errorMessage = enhanceCrossOriginError(
			error ?? 'Unknown error (session recovered)',
		);

		// Re-register passive network monitor and replay active routes
		// (all cy.intercept() registrations are lost on test boundary).
		registerPassiveNetworkMonitor();
		for (const [pattern, staticResponse] of _activeRoutes) {
			const alias = _interceptAliases.get(pattern);
			if (Object.keys(staticResponse).length > 0) {
				const chain = cy.intercept(pattern, staticResponse);
				if (alias) {
					chain.as(alias);
				}
			} else {
				const chain = cy.intercept(pattern);
				if (alias) {
					chain.as(alias);
				}
			}
		}

		// Re-inject snapshot lib and take a fresh full snapshot so the
		// error response shows the complete page state for context.
		injectSnapshotLib();
		takeFullSnapshot().then((snapshotYaml: string) => {
			cy.url({ log: false }).then((pageUrl: string) => {
				cy.title({ log: false }).then((pageTitle: string) => {
					const result: DriverResult = {
						success: false,
						error: errorMessage,
						snapshot: snapshotYaml,
						url: pageUrl,
						title: pageTitle,
					};
					cy.task('commandResult', result, { log: false }).then(() => {
						pollForCommands();
					});
				});
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

	const queue = t.parent?.testsQueue;
	if (Array.isArray(queue)) {
		queue.push(recovery);
	} else {
		console.error(
			'[cypress-cli] Failed to enqueue recovery test: expected parent.testsQueue to be an array, but got',
			queue,
		);
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

	// Prevent uncaught application errors from crashing the REPL session.
	// SPAs frequently throw unhandled promise rejections (e.g. failed API
	// calls, analytics errors) that are irrelevant to the interactive
	// session. Returning false keeps the test alive.
	Cypress.on('uncaught:exception', () => false);

	it('driver', () => {
		const url = (Cypress.env('CYPRESS_CLI_URL') as string | undefined) || '/';

		// Register passive network monitor before visiting the page
		// so all requests (including the initial page load) are captured.
		registerPassiveNetworkMonitor();

		cy.visit(url);

		// Inject aria snapshot IIFE
		injectSnapshotLib();

		// Take initial snapshot and report it, then enter REPL loop.
		// Use the full-tree variant so the first result seen by a client
		// (if it arrives in time) contains the complete page structure.
		takeFullSnapshot().then((snapshotYaml: string) => {
			cy.url({ log: false }).then((pageUrl: string) => {
				cy.title({ log: false }).then((pageTitle: string) => {
					const initialResult: DriverResult = {
						success: true,
						snapshot: snapshotYaml,
						url: pageUrl,
						title: pageTitle,
					};
					return cy
						.task('commandResult', initialResult, { log: false })
						.then(() => {
							pollForCommands();
						});
				});
			});
		});
	});
});
