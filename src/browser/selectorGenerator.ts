/**
 * Generate stable CSS selectors from DOM elements.
 *
 * Uses `@cypress/unique-selector` — the same library Cypress uses
 * internally in its Selector Playground — with the default priority
 * order matching Cypress's defaults.
 */

import unique from '@cypress/unique-selector';

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
 *
 * This function must run in browser context (needs `document`).
 *
 * @param element - The DOM element to generate a selector for
 * @returns A CSS selector string that uniquely identifies the element
 */
export function generateSelector(element: Element): string {
	return unique(element, {
		selectorTypes: DEFAULT_SELECTOR_PRIORITY,
	});
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
 * @returns A Cypress command string for codegen
 */
export function buildCypressCommand(
	selector: string | undefined,
	action: string,
	text?: string,
	chainer?: string,
): string {
	// Non-ref commands: no selector needed
	if (selector === undefined) {
		return _buildNonRefCommand(action, text, chainer);
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
			const escapedText = (text ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
			return `${getExpr}.type('${escapedText}')`;
		}
		case 'select': {
			const escapedText = (text ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
			return `${getExpr}.select('${escapedText}')`;
		}
		case 'hover':
			return `${getExpr}.trigger('mouseover')`;
		case 'scrollto':
			return `${getExpr}.scrollIntoView()`;
		case 'assert': {
			if (chainer) {
				const escapedChainer = chainer.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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
): string {
	switch (action) {
		case 'navigate': {
			const escapedUrl = (text ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
			return `cy.visit('${escapedUrl}')`;
		}
		case 'back':
			return "cy.go('back')";
		case 'forward':
			return "cy.go('forward')";
		case 'reload':
			return 'cy.reload()';
		case 'press': {
			const escapedKey = (text ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
			return `cy.get('body').type('{${escapedKey}}')`;
		}
		case 'asserturl': {
			if (chainer) {
				const escapedChainer = chainer.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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
				const escapedChainer = chainer.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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
			const escapedPos = (text ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
			return `cy.scrollTo('${escapedPos}')`;
		}
		case 'snapshot':
			return '// snapshot (read-only)';
		default:
			return `cy.${action}()`;
	}
}
