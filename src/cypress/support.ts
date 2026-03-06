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

// MODIFIED: Use extensionless imports for Cypress's webpack preprocessor
// (this file is excluded from tsc and bundled by Cypress's webpack)
import {
	IIFE_ENV_KEY,
	injectSnapshotIife,
	takeSnapshotFromWindow,
} from '../browser/index';

/**
 * Injects the aria snapshot IIFE into the current page's window context.
 *
 * Must be called after `cy.visit()` and re-called after any full-page
 * navigation since that creates a new window context.
 */
export function injectSnapshotLib(): void {
	cy.window({ log: false }).then((win: Window) => {
		const iife = Cypress.env(IIFE_ENV_KEY) as string | undefined;
		if (iife) {
			injectSnapshotIife(win, iife);
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
		return takeSnapshotFromWindow(win);
	});
}
