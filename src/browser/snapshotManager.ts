/**
 * Snapshot management: IIFE injection and aria snapshot capture.
 *
 * Encapsulates the logic for injecting the aria snapshot IIFE into the
 * page context and taking snapshots that produce both a YAML string
 * and a ref→Element map.
 */

import { setElementMap } from './refMap.js';

/** Key used to store the aria snapshot API on the window object. */
export const SNAPSHOT_API_KEY = '__cypressCliAriaSnapshot';

/** The Cypress.env() key containing the IIFE string. */
export const IIFE_ENV_KEY = 'CYPRESS_CLI_IIFE';

/** Shape of the injected aria snapshot API on window. */
export interface AriaSnapshotApi {
	generateAriaTree: (
		root: Element,
		options: { mode: string },
	) => { root: unknown; elements: Map<string, Element> };
	renderAriaTree: (
		snapshot: unknown,
		options: { mode: string },
	) => string;
}

/**
 * Retrieves the aria snapshot API from the given window object.
 *
 * @param win - The window object to read the API from
 * @returns The API object, or undefined if not yet injected
 */
export function getSnapshotApi(win: Window): AriaSnapshotApi | undefined {
	return (win as unknown as Record<string, unknown>)[SNAPSHOT_API_KEY] as
		| AriaSnapshotApi
		| undefined;
}

/**
 * Injects the aria snapshot IIFE into the given window context.
 *
 * Must be called after `cy.visit()` and re-called after any full-page
 * navigation since that creates a new window context.
 *
 * @param win - The window object to inject the IIFE into
 * @param iife - The IIFE string to evaluate
 */
export function injectSnapshotIife(win: Window, iife: string): void {
	const existing = getSnapshotApi(win);
	if (!existing) {
		// The IIFE built by esbuild starts with "use strict" and uses a `var`
		// declaration for the global name. In strict-mode eval, `var` does not
		// create a property on the global object. Wrap the IIFE in a function
		// so we can capture the declared variable and assign it explicitly.
		const wrapped =
			`(function(){${iife}\n;return typeof __cypressCliAriaSnapshot!=='undefined'?__cypressCliAriaSnapshot:undefined})()`;
		const evalFn = (win as Window & { eval: (code: string) => unknown }).eval;
		const result = evalFn.call(win, wrapped);
		if (result) {
			(win as unknown as Record<string, unknown>)[SNAPSHOT_API_KEY] = result;
		}
	}
}

/**
 * Takes an aria snapshot of the given window and returns the YAML string.
 *
 * Stores the snapshot's element map on the window via `setElementMap()`
 * so that `resolveRefFromMap()` can look up DOM elements by ref.
 *
 * @param win - The window object to snapshot
 * @returns The YAML snapshot string, or a fallback if the API is not available
 */
export function takeSnapshotFromWindow(win: Window): string {
	const api = getSnapshotApi(win);

	if (!api) {
		return '- [aria snapshot not available]';
	}

	const snapshot = api.generateAriaTree(win.document.documentElement, {
		mode: 'ai',
	});

	// Store element map on window so resolveRefFromMap() can look up elements
	setElementMap(win, snapshot.elements);

	return api.renderAriaTree(snapshot, { mode: 'ai' });
}
