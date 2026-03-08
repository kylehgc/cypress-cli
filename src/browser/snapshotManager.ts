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
		previousSnapshot?: unknown,
	) => string;
}

/**
 * The most recent AriaSnapshot object, stored between commands so that
 * `renderAriaTree()` can produce incremental diffs.  Starts as `undefined`
 * (first snapshot in a session returns a full tree).
 *
 * Keyed to `_lastWindow` so that a full-page navigation (which gives
 * Cypress a new AUT `Window` and resets the IIFE's internal ref counter)
 * automatically discards the stale previous snapshot instead of producing
 * incorrect `[unchanged]` markers from ref collisions.
 */
let _previousSnapshot: unknown;

/** The Window that `_previousSnapshot` was captured from. */
let _lastWindow: WeakRef<Window> | undefined;

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
		const wrapped = `(function(){${iife}\n;return typeof __cypressCliAriaSnapshot!=='undefined'?__cypressCliAriaSnapshot:undefined})()`;
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
 * On the first call (or after {@link resetPreviousSnapshot}), a full tree is
 * returned.  On subsequent calls the previously captured snapshot is passed to
 * `renderAriaTree()` so that only changed subtrees are rendered (unchanged
 * subtrees collapse to `ref=eN [unchanged]`).
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

	// If the window changed (e.g. full-page navigation), discard the stale
	// previous snapshot to avoid ref-collision false matches.
	const sameWindow = _lastWindow?.deref() === win;
	const previous = sameWindow ? _previousSnapshot : undefined;

	const rendered = api.renderAriaTree(snapshot, { mode: 'ai' }, previous);

	// If the diff is empty (nothing changed since the previous snapshot),
	// return a short sentinel so the caller (and LLM) knows the page is
	// unchanged without re-sending the entire tree.
	const result =
		rendered || !previous ? rendered : '- [no changes]';

	// Store current snapshot and window for the next diff
	_previousSnapshot = snapshot;
	_lastWindow = new WeakRef(win);

	return result;
}

/**
 * Resets the stored previous snapshot so the next call to
 * {@link takeSnapshotFromWindow} returns a full tree.
 *
 * Useful for testing and for starting fresh after a session reset.
 */
export function resetPreviousSnapshot(): void {
	_previousSnapshot = undefined;
	_lastWindow = undefined;
}
