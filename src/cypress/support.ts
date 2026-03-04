/**
 * Cypress support file: injected into Cypress to load the aria snapshot IIFE
 * and register custom commands.
 *
 * This file is referenced by the generated Cypress config's `supportFile`
 * option. It runs before the driver spec in the browser context.
 *
 * Responsibilities:
 * - Inject the aria snapshot IIFE into the page context
 * - Register `cy.takeAriaSnapshot()` custom command
 */

/**
 * The IIFE string for the aria snapshot library.
 * Set by the launcher before Cypress starts via `Cypress.env()`.
 */
const IIFE_ENV_KEY = 'CYPRESS_CLI_IIFE';

/**
 * Injects the aria snapshot IIFE into the current page's window context.
 *
 * Must be called after `cy.visit()` and re-called after any full-page
 * navigation since that creates a new window context.
 */
export function injectSnapshotLib(): void {
	cy.window({ log: false }).then((win: Window) => {
		const existing = (win as Record<string, unknown>)[
			'__cypressCliAriaSnapshot'
		];
		if (!existing) {
			const iife = Cypress.env(IIFE_ENV_KEY) as string | undefined;
			if (iife) {
				(win as Window & { eval: (code: string) => unknown }).eval(iife);
			}
		}
	});
}

/**
 * Takes an aria snapshot of the current page and returns the YAML string.
 *
 * Wraps the injected aria snapshot API. Must be called after
 * `injectSnapshotLib()`.
 *
 * @returns A Cypress chainable that yields the YAML snapshot string
 */
export function takeSnapshot(): Cypress.Chainable<string> {
	return cy.window({ log: false }).then((win: Window) => {
		const api = (win as Record<string, unknown>)[
			'__cypressCliAriaSnapshot'
		] as
			| {
					generateAriaTree: (
						root: Element,
						options: { mode: string },
					) => { yaml: string };
					renderAriaTree: (
						tree: unknown,
						options: { mode: string },
					) => string;
			  }
			| undefined;

		if (!api) {
			return '- [aria snapshot not available]';
		}

		const tree = api.generateAriaTree(win.document.documentElement, {
			mode: 'ai',
		});
		return api.renderAriaTree(tree, { mode: 'ai' });
	});
}
