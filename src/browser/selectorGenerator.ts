/**
 * Generate stable CSS selectors from DOM elements.
 *
 * Uses `@cypress/unique-selector` — the same library Cypress uses
 * internally in its Selector Playground — with the default priority
 * order matching Cypress's defaults.
 */

import unique from '@cypress/unique-selector';

/**
 * Maps standard DOM key names to Cypress special-key names for codegen.
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
 * Default selector priority order matching Cypress's Selector Playground.
 *
 * @see https://github.com/cypress-io/cypress/blob/develop/packages/driver/src/cypress/element_selector.ts
 */
export const DEFAULT_SELECTOR_PRIORITY: string[] = [
	'data-cy',
	'data-test',
	'data-testid',
	'data-qa',
	'name',
	'id',
	'class',
	'tag',
	'attributes',
	'nth-child',
];

/**
 * Generates a unique CSS selector for a DOM element using
 * `@cypress/unique-selector` with the Cypress default priority order.
 * Falls back to a deterministic selector when the library cannot produce
 * a usable selector in the live page.
 *
 * This function must run in browser context (needs `document`).
 *
 * @param element - The DOM element to generate a selector for
 * @returns A CSS selector string that uniquely identifies the element
 */
export function generateSelector(element: Element): string {
	try {
		const selector = unique(element, {
			selectorTypes: DEFAULT_SELECTOR_PRIORITY,
		});
		if (selector && isUsableSelector(selector, element)) {
			return selector;
		}
	} catch {
		// Fall through to the deterministic fallback selector builder.
	}

	return buildFallbackSelector(element);
}

/**
 * Builds a deterministic CSS selector without relying on Cypress internals.
 *
 * The strategy prefers short, stable selectors first, then falls back to a
 * structural selector so codegen remains available on real-world pages.
 */
export function buildFallbackSelector(element: Element): string {
	const document = element.ownerDocument;

	for (const attr of ['data-cy', 'data-test', 'data-testid', 'data-qa']) {
		const value = element.getAttribute(attr);
		if (value) {
			const selector = `[${attr}="${escapeAttribute(value)}"]`;
			if (isUniqueSelector(document, selector, element)) {
				return selector;
			}
		}
	}

	if (element.id) {
		const idSelector = `#${escapeIdentifier(element.id)}`;
		if (isUniqueSelector(document, idSelector, element)) {
			return idSelector;
		}
	}

	const name = element.getAttribute('name');
	if (name) {
		const selector = `${element.tagName.toLowerCase()}[name="${escapeAttribute(name)}"]`;
		if (isUniqueSelector(document, selector, element)) {
			return selector;
		}
	}

	const classSelector = buildClassSelector(element);
	if (classSelector && isUniqueSelector(document, classSelector, element)) {
		return classSelector;
	}

	return buildStructuralSelector(element);
}

/**
 * Builds the Cypress command string for codegen purposes.
 *
 * When a selector is provided, produces element commands like
 * `cy.get('[data-cy="submit"]').click()`. When selector is undefined,
 * produces non-element commands like `cy.visit('https://example.com')`.
 *
 * @param selector - CSS selector string, or undefined for non-ref commands
 * @param action - The Cypress action (e.g. 'click', 'type', 'navigate')
 * @param text - Optional text argument for commands like type/select/navigate
 * @param chainer - Optional Chai chainer for assert commands (e.g. 'have.text')
 * @param options - Optional command options (e.g. status, body for intercept)
 * @returns A Cypress command string for codegen
 */
export function buildCypressCommand(
	selector: string | undefined,
	action: string,
	text?: string,
	chainer?: string,
	options?: Record<string, unknown>,
): string {
	// Non-ref commands: no selector needed
	if (selector === undefined) {
		return _buildNonRefCommand(action, text, chainer, options);
	}

	const escapedSelector = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
	const getExpr = `cy.get('${escapedSelector}')`;

	switch (action) {
		case 'click':
		case 'dblclick':
		case 'rightclick':
		case 'clear':
		case 'check':
		case 'uncheck':
		case 'focus':
		case 'blur':
			return `${getExpr}.${action}()`;
		case 'type': {
			const escapedText = (text ?? '')
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			return `${getExpr}.type('${escapedText}')`;
		}
		case 'fill': {
			const escapedText = (text ?? '')
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			return `${getExpr}.clear().type('${escapedText}')`;
		}
		case 'select': {
			const escapedText = (text ?? '')
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			return `${getExpr}.select('${escapedText}')`;
		}
		case 'hover':
			return `${getExpr}.trigger('mouseover')`;
		case 'scrollto':
			return `${getExpr}.scrollIntoView()`;
		case 'assert': {
			if (chainer) {
				const escapedChainer = chainer
					.replace(/\\/g, '\\\\')
					.replace(/'/g, "\\'");
				if (text) {
					const escapedText = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
					return `${getExpr}.should('${escapedChainer}', '${escapedText}')`;
				}
				return `${getExpr}.should('${escapedChainer}')`;
			}
			return `${getExpr}.should(...)`;
		}
		case 'waitfor':
			return `${getExpr}.should('exist')`;
		case 'screenshot': {
			const fname = options?.['filename'] as string | undefined;
			if (fname) {
				const escapedFname = fname.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
				return `${getExpr}.screenshot('${escapedFname}')`;
			}
			return `${getExpr}.screenshot()`;
		}
		case 'upload': {
			const escapedFile = (text ?? '')
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			return `${getExpr}.selectFile('${escapedFile}')`;
		}
		case 'drag': {
			const targetSelector = options?.['_targetSelector'] as string | undefined;
			if (targetSelector) {
				const escapedTarget = targetSelector
					.replace(/\\/g, '\\\\')
					.replace(/'/g, "\\'");
				return [
					`${getExpr}.trigger('pointerdown', { which: 1 })`,
					`  .trigger('dragstart')`,
					`cy.get('${escapedTarget}').trigger('dragover').trigger('drop')`,
					`${getExpr}.trigger('dragend').trigger('pointerup')`,
				].join(';\n');
			}
			return `// drag ${selector ?? 'source'} → target (missing target selector)`;
		}
		case 'eval': {
			const escapedExpr = (text ?? '')
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			return `${getExpr}.then(($el) => { return cy.window().then((win) => { const fn = win.eval('(${escapedExpr})'); return typeof fn === 'function' ? fn($el[0]) : fn; }); })`;
		}
		default:
			return `${getExpr}.${action}()`;
	}
}

/**
 * Builds a Cypress command string for commands that don't target
 * a specific element (no ref/selector).
 */
function _buildNonRefCommand(
	action: string,
	text?: string,
	chainer?: string,
	options?: Record<string, unknown>,
): string {
	switch (action) {
		case 'navigate': {
			const escapedUrl = (text ?? '')
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			return `cy.visit('${escapedUrl}')`;
		}
		case 'back':
			return "cy.go('back')";
		case 'forward':
			return "cy.go('forward')";
		case 'reload':
			return 'cy.reload()';
		case 'press': {
			const mappedKey = KEY_MAP[text ?? ''] ?? text ?? '';
			const escapedKey = mappedKey.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
			return `cy.get('body').type('{${escapedKey}}')`;
		}
		case 'asserturl': {
			if (chainer) {
				const escapedChainer = chainer
					.replace(/\\/g, '\\\\')
					.replace(/'/g, "\\'");
				if (text) {
					const escapedText = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
					return `cy.url().should('${escapedChainer}', '${escapedText}')`;
				}
				return `cy.url().should('${escapedChainer}')`;
			}
			return 'cy.url().should(...)';
		}
		case 'asserttitle': {
			if (chainer) {
				const escapedChainer = chainer
					.replace(/\\/g, '\\\\')
					.replace(/'/g, "\\'");
				if (text) {
					const escapedText = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
					return `cy.title().should('${escapedChainer}', '${escapedText}')`;
				}
				return `cy.title().should('${escapedChainer}')`;
			}
			return 'cy.title().should(...)';
		}
		case 'wait':
			return `cy.wait(${Number(text) || 0})`;
		case 'scrollto': {
			const escapedPos = (text ?? '')
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			return `cy.scrollTo('${escapedPos}')`;
		}
		case 'snapshot':
			return '// snapshot (read-only)';
		case 'run-code': {
			const escapedCode = (text ?? '')
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			return `cy.window().then((win) => win.eval('${escapedCode}'))`;
		}
		case 'eval': {
			const escapedExpr = (text ?? '')
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			return `cy.window().then((win) => win.eval('${escapedExpr}'))`;
		}
		case 'intercept': {
			const escapedPattern = (text ?? '')
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			const alias = options?.['_alias'] as string | undefined;
			const asSuffix = alias ? `.as('${alias}')` : '';
			const staticResponse = _buildStaticResponse(options);
			if (staticResponse) {
				return `cy.intercept('${escapedPattern}', ${staticResponse})${asSuffix}`;
			}
			return `cy.intercept('${escapedPattern}')${asSuffix}`;
		}
		case 'waitforresponse': {
			const alias = options?.['_alias'] as string | undefined;
			if (alias) {
				return `cy.wait('@${alias}')`;
			}
			const escapedPattern = (text ?? '')
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			return `cy.wait('@${escapedPattern}')`;
		}
		case 'unintercept': {
			if (text) {
				const escapedPattern = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
				return `// cy.intercept('${escapedPattern}', passthrough)`;
			}
			return '// remove all intercepts';
		}
		case 'network':
			return '// network requests (read-only)';
		case 'console':
			return '// console messages (read-only)';
		case 'cookie-list': {
			const domain = options?.['domain'] as string | undefined;
			if (domain) {
				const escapedDomain = domain.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
				return `cy.getCookies().then((cookies) => cookies.filter((cookie) => cookie.domain.replace(/^\\./, '') === '${escapedDomain}'.replace(/^\\./, '')))`;
			}
			return 'cy.getCookies()';
		}
		case 'cookie-get': {
			const escapedName = (text ?? '')
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			return `cy.getCookie('${escapedName}')`;
		}
		case 'cookie-set': {
			const escapedName = (text ?? '')
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			const escapedValue = String(options?.['value'] ?? '')
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			const cookieOptions = _buildCookieOptions(options);
			if (cookieOptions) {
				return `cy.setCookie('${escapedName}', '${escapedValue}', ${cookieOptions})`;
			}
			return `cy.setCookie('${escapedName}', '${escapedValue}')`;
		}
		case 'cookie-delete': {
			const escapedName = (text ?? '')
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			return `cy.clearCookie('${escapedName}')`;
		}
		case 'cookie-clear':
			return 'cy.clearCookies()';
		case 'localstorage-list':
			return "cy.window().then((win) => Object.fromEntries(Object.entries(win.localStorage)))";
		case 'localstorage-get': {
			const escapedKey = (text ?? '')
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			return `cy.window().then((win) => win.localStorage.getItem('${escapedKey}'))`;
		}
		case 'localstorage-set': {
			const escapedKey = (text ?? '')
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			const escapedValue = String(options?.['value'] ?? '')
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			return `cy.window().then((win) => win.localStorage.setItem('${escapedKey}', '${escapedValue}'))`;
		}
		case 'localstorage-delete': {
			const escapedKey = (text ?? '')
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			return `cy.window().then((win) => win.localStorage.removeItem('${escapedKey}'))`;
		}
		case 'localstorage-clear':
			return 'cy.window().then((win) => win.localStorage.clear())';
		case 'sessionstorage-list':
			return "cy.window().then((win) => Object.fromEntries(Object.entries(win.sessionStorage)))";
		case 'sessionstorage-get': {
			const escapedKey = (text ?? '')
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			return `cy.window().then((win) => win.sessionStorage.getItem('${escapedKey}'))`;
		}
		case 'sessionstorage-set': {
			const escapedKey = (text ?? '')
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			const escapedValue = String(options?.['value'] ?? '')
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			return `cy.window().then((win) => win.sessionStorage.setItem('${escapedKey}', '${escapedValue}'))`;
		}
		case 'sessionstorage-delete': {
			const escapedKey = (text ?? '')
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			return `cy.window().then((win) => win.sessionStorage.removeItem('${escapedKey}'))`;
		}
		case 'sessionstorage-clear':
			return 'cy.window().then((win) => win.sessionStorage.clear())';
		case 'dialog-accept': {
			if (text) {
				const escapedPrompt = (text ?? '')
					.replace(/\\/g, '\\\\')
					.replace(/'/g, "\\'");
				return [
					"cy.once('window:confirm', () => true)",
					"cy.once('window:alert', () => true)",
					`cy.window().then((win) => cy.stub(win, 'prompt').returns('${escapedPrompt}'))`,
				].join(';\n');
			}
			return [
				"cy.once('window:confirm', () => true)",
				"cy.once('window:alert', () => true)",
			].join(';\n');
		}
		case 'dialog-dismiss':
			return [
				"cy.once('window:confirm', () => false)",
				"cy.once('window:alert', () => false)",
			].join(';\n');
		case 'resize': {
			const w = Number(options?.['width'] ?? 0);
			const h = Number(options?.['height'] ?? 0);
			return `cy.viewport(${w}, ${h})`;
		}
		case 'screenshot': {
			const fname = options?.['filename'] as string | undefined;
			if (fname) {
				const escapedFname = fname.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
				return `cy.screenshot('${escapedFname}')`;
			}
			return 'cy.screenshot()';
		}
		case 'drag': {
			const targetSelector = options?.['_targetSelector'] as string | undefined;
			if (targetSelector) {
				const escapedTarget = targetSelector
					.replace(/\\/g, '\\\\')
					.replace(/'/g, "\\'");
				return [
					"cy.get('source').trigger('pointerdown', { which: 1 })",
					`  .trigger('dragstart')`,
					`cy.get('${escapedTarget}').trigger('dragover').trigger('drop')`,
					"cy.get('source').trigger('dragend').trigger('pointerup')",
				].join(';\n');
			}
			return '// drag (missing target selector)';
		}
		case 'upload':
			return '// upload (requires cy.selectFile with element ref)';
		default:
			return `cy.${action}()`;
	}
}

/**
 * Builds a static response object literal string for cy.intercept() codegen.
 * Returns undefined if no response options are present.
 */
function _buildStaticResponse(
	options?: Record<string, unknown>,
): string | undefined {
	if (!options) return undefined;
	const parts: string[] = [];

	if (options['status'] !== undefined) {
		parts.push(`statusCode: ${Number(options['status'])}`);
	}
	if (typeof options['body'] === 'string') {
		try {
			// If it's valid JSON, inline the parsed object
			const parsed = JSON.parse(options['body'] as string);
			parts.push(`body: ${JSON.stringify(parsed)}`);
		} catch {
			// Plain string body
			const escaped = (options['body'] as string)
				.replace(/\\/g, '\\\\')
				.replace(/'/g, "\\'");
			parts.push(`body: '${escaped}'`);
		}
	}
	if (typeof options['content-type'] === 'string') {
		const escaped = (options['content-type'] as string)
			.replace(/\\/g, '\\\\')
			.replace(/'/g, "\\'");
		parts.push(`headers: { 'content-type': '${escaped}' }`);
	}

	if (parts.length === 0) return undefined;
	return `{ ${parts.join(', ')} }`;
}

function isUsableSelector(selector: string, element: Element): boolean {
	return isUniqueSelector(element.ownerDocument, selector, element);
}

function isUniqueSelector(
	document: Document,
	selector: string,
	element: Element,
): boolean {
	try {
		const matches = document.querySelectorAll(selector);
		return matches.length === 1 && matches[0] === element;
	} catch {
		return false;
	}
}

function buildClassSelector(element: Element): string | undefined {
	const classNames = Array.from(element.classList).filter(Boolean);
	if (classNames.length === 0) {
		return undefined;
	}

	return `${element.tagName.toLowerCase()}${classNames
		.slice(0, 3)
		.map((className) => `.${escapeIdentifier(className)}`)
		.join('')}`;
}

/**
 * Builds a JavaScript object-literal string for cookie options in generated
 * Cypress code, supporting the CLI's domain/path/httpOnly/secure flags.
 */
function _buildCookieOptions(options?: Record<string, unknown>): string | undefined {
	if (!options) {
		return undefined;
	}

	const entries: string[] = [];

	if (typeof options['domain'] === 'string') {
		const escapedDomain = options['domain']
			.replace(/\\/g, '\\\\')
			.replace(/'/g, "\\'");
		entries.push(`domain: '${escapedDomain}'`);
	}
	if (typeof options['path'] === 'string') {
		const escapedPath = options['path']
			.replace(/\\/g, '\\\\')
			.replace(/'/g, "\\'");
		entries.push(`path: '${escapedPath}'`);
	}
	if (typeof options['httpOnly'] === 'boolean') {
		entries.push(`httpOnly: ${String(options['httpOnly'])}`);
	}
	if (typeof options['secure'] === 'boolean') {
		entries.push(`secure: ${String(options['secure'])}`);
	}

	if (entries.length === 0) {
		return undefined;
	}

	return `{ ${entries.join(', ')} }`;
}

function buildStructuralSelector(element: Element): string {
	const segments: string[] = [];
	let current: Element | null = element;

	while (current) {
		if (current.id) {
			segments.unshift(`#${escapeIdentifier(current.id)}`);
			break;
		}

		const parent: Element | null = current.parentElement;
		const tagName = current.tagName.toLowerCase();
		if (!parent) {
			segments.unshift(tagName);
			break;
		}

		const currentTagName = current.tagName;
		const siblings = Array.from(parent.children).filter(
			(sibling: Element) => sibling.tagName === currentTagName,
		);
		const index = siblings.indexOf(current) + 1;
		segments.unshift(
			siblings.length > 1 ? `${tagName}:nth-of-type(${index})` : tagName,
		);
		current = parent;
	}

	return segments.join(' > ');
}

function escapeIdentifier(value: string): string {
	if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
		return CSS.escape(value);
	}

	return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

function escapeAttribute(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
