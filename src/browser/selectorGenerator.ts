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
 * Produces a string like `cy.get('[data-cy="submit"]').click()` that
 * can be used in exported test files.
 *
 * @param selector - CSS selector string
 * @param action - The Cypress action (e.g. 'click', 'type')
 * @param text - Optional text argument for commands like type/select
 * @param chainer - Optional Chai chainer for assert commands (e.g. 'have.text')
 * @returns A Cypress command string for codegen
 */
export function buildCypressCommand(
	selector: string,
	action: string,
	text?: string,
	chainer?: string,
): string {
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
