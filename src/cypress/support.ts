/**
 * Cypress support utilities for loading the aria snapshot IIFE and
 * interacting with it from tests.
 *
 * This module is imported directly by the Cypress driver spec (the generated
 * config sets `supportFile: false`), and its helpers run in the browser
 * context when invoked from tests.
 *
 * Responsibilities:
 * - Inject the aria snapshot IIFE into the page context
 * - Take aria snapshots and persist the ref→Element map on window
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
 * `injectSnapshotLib()`. Stores the snapshot's element map on
 * `window.__cypressCliElementMap` so that `resolveRef()` in the driver
 * spec can look up DOM elements by ref.
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
					) => { root: unknown; elements: Map<string, Element> };
					renderAriaTree: (
						snapshot: unknown,
						options: { mode: string },
					) => string;
			  }
			| undefined;

		if (!api) {
			return '- [aria snapshot not available]';
		}

		const snapshot = api.generateAriaTree(win.document.documentElement, {
			mode: 'ai',
		});

		// Store element map on window so resolveRef() can look up elements
		(win as Record<string, unknown>)['__cypressCliElementMap'] =
			snapshot.elements;

		return api.renderAriaTree(snapshot, { mode: 'ai' });
	});
}
