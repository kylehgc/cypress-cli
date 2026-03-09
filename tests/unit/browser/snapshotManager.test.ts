import { describe, it, expect, beforeEach } from 'vitest';

import {
	SNAPSHOT_API_KEY,
	IIFE_ENV_KEY,
	getSnapshotApi,
	injectSnapshotIife,
	takeSnapshotFromWindow,
	resetPreviousSnapshot,
} from '../../../src/browser/snapshotManager.js';
import { ELEMENT_MAP_KEY, getElementMap } from '../../../src/browser/refMap.js';

describe('snapshotManager', () => {
	beforeEach(() => {
		// Clean up window globals between tests
		delete (window as Record<string, unknown>)[SNAPSHOT_API_KEY];
		delete (window as Record<string, unknown>)[ELEMENT_MAP_KEY];
		// Reset diff state so tests don't leak into each other
		resetPreviousSnapshot();
	});

	describe('constants', () => {
		it('SNAPSHOT_API_KEY equals __cypressCliAriaSnapshot', () => {
			expect(SNAPSHOT_API_KEY).toBe('__cypressCliAriaSnapshot');
		});

		it('IIFE_ENV_KEY equals CYPRESS_CLI_IIFE', () => {
			expect(IIFE_ENV_KEY).toBe('CYPRESS_CLI_IIFE');
		});
	});

	describe('getSnapshotApi', () => {
		it('returns undefined when no API is set', () => {
			expect(getSnapshotApi(window)).toBeUndefined();
		});

		it('returns the API when set on window', () => {
			const mockApi = {
				generateAriaTree: () => ({ root: null, elements: new Map() }),
				renderAriaTree: () => '- mock snapshot',
			};
			(window as Record<string, unknown>)[SNAPSHOT_API_KEY] = mockApi;
			expect(getSnapshotApi(window)).toBe(mockApi);
		});
	});

	describe('injectSnapshotIife', () => {
		it('evaluates the IIFE string when API is not yet present', () => {
			const iife = `(function() { window['${SNAPSHOT_API_KEY}'] = { injected: true }; })()`;
			injectSnapshotIife(window, iife);
			expect(
				(window as Record<string, unknown>)[SNAPSHOT_API_KEY],
			).toBeTruthy();
		});

		it('does not re-evaluate if API is already present', () => {
			const original = {
				generateAriaTree: () => ({ root: null, elements: new Map() }),
				renderAriaTree: () => '',
			};
			(window as Record<string, unknown>)[SNAPSHOT_API_KEY] = original;

			// This IIFE would overwrite the API if evaluated
			const iife = `(function() { window['${SNAPSHOT_API_KEY}'] = { replaced: true }; })()`;
			injectSnapshotIife(window, iife);

			// Should still be the original
			expect((window as Record<string, unknown>)[SNAPSHOT_API_KEY]).toBe(
				original,
			);
		});
	});

	describe('takeSnapshotFromWindow', () => {
		it('returns fallback string when API is not available', () => {
			const result = takeSnapshotFromWindow(window);
			expect(result).toBe('- [aria snapshot not available]');
		});

		it('returns YAML string from the snapshot API', () => {
			const elements = new Map<string, Element>();
			elements.set('e1', document.createElement('button'));

			const mockApi = {
				generateAriaTree: () => ({ root: { role: 'document' }, elements }),
				renderAriaTree: () => '- button "Submit"',
			};
			(window as Record<string, unknown>)[SNAPSHOT_API_KEY] = mockApi;

			const result = takeSnapshotFromWindow(window);
			expect(result).toBe('- button "Submit"');
		});

		it('stores element map on window for ref resolution', () => {
			const elements = new Map<string, Element>();
			elements.set('e1', document.createElement('div'));
			elements.set('e2', document.createElement('span'));

			const mockApi = {
				generateAriaTree: () => ({ root: {}, elements }),
				renderAriaTree: () => '- div\n  - span',
			};
			(window as Record<string, unknown>)[SNAPSHOT_API_KEY] = mockApi;

			takeSnapshotFromWindow(window);

			const storedMap = getElementMap(window);
			expect(storedMap).toBe(elements);
			expect(storedMap?.size).toBe(2);
			expect(storedMap?.get('e1')?.tagName).toBe('DIV');
		});

		it('passes mode "ai" to generateAriaTree and renderAriaTree', () => {
			const calls: { method: string; mode: string; hasPrevious: boolean }[] =
				[];
			const mockApi = {
				generateAriaTree: (_root: Element, opts: { mode: string }) => {
					calls.push({
						method: 'generateAriaTree',
						mode: opts.mode,
						hasPrevious: false,
					});
					return { root: {}, elements: new Map() };
				},
				renderAriaTree: (
					_snapshot: unknown,
					opts: { mode: string },
					prev?: unknown,
				) => {
					calls.push({
						method: 'renderAriaTree',
						mode: opts.mode,
						hasPrevious: prev !== undefined,
					});
					return '';
				},
			};
			(window as Record<string, unknown>)[SNAPSHOT_API_KEY] = mockApi;

			takeSnapshotFromWindow(window);

			expect(calls).toHaveLength(2);
			expect(calls[0]).toEqual({
				method: 'generateAriaTree',
				mode: 'ai',
				hasPrevious: false,
			});
			expect(calls[1]).toEqual({
				method: 'renderAriaTree',
				mode: 'ai',
				hasPrevious: false,
			});
		});

		it('passes undefined as previousSnapshot on the first call', () => {
			let receivedPrevious: unknown = 'NOT_CALLED';
			const mockApi = {
				generateAriaTree: () => ({ root: {}, elements: new Map() }),
				renderAriaTree: (_snap: unknown, _opts: unknown, prev?: unknown) => {
					receivedPrevious = prev;
					return '- full tree';
				},
			};
			(window as Record<string, unknown>)[SNAPSHOT_API_KEY] = mockApi;

			const result = takeSnapshotFromWindow(window);
			expect(result).toBe('- full tree');
			expect(receivedPrevious).toBeUndefined();
		});

		it('passes previous snapshot on the second call', () => {
			const previousArgs: unknown[] = [];
			const snapshot1 = { root: { role: 'document' }, elements: new Map() };
			const snapshot2 = {
				root: { role: 'document', changed: true },
				elements: new Map(),
			};
			let callCount = 0;

			const mockApi = {
				generateAriaTree: () => {
					callCount++;
					return callCount === 1 ? snapshot1 : snapshot2;
				},
				renderAriaTree: (_snap: unknown, _opts: unknown, prev?: unknown) => {
					previousArgs.push(prev);
					return prev ? '- diff output' : '- full tree';
				},
			};
			(window as Record<string, unknown>)[SNAPSHOT_API_KEY] = mockApi;

			// First call: no previous
			const first = takeSnapshotFromWindow(window);
			expect(first).toBe('- full tree');
			expect(previousArgs[0]).toBeUndefined();

			// Second call: gets first snapshot as previous
			const second = takeSnapshotFromWindow(window);
			expect(second).toBe('- diff output');
			expect(previousArgs[1]).toBe(snapshot1);
		});

		it('resetPreviousSnapshot clears stored state', () => {
			const previousArgs: unknown[] = [];
			const mockApi = {
				generateAriaTree: () => ({ root: {}, elements: new Map() }),
				renderAriaTree: (_snap: unknown, _opts: unknown, prev?: unknown) => {
					previousArgs.push(prev);
					return prev ? '- diff' : '- full';
				},
			};
			(window as Record<string, unknown>)[SNAPSHOT_API_KEY] = mockApi;

			// First call stores snapshot
			takeSnapshotFromWindow(window);
			expect(previousArgs[0]).toBeUndefined();

			// Second call gets previous
			takeSnapshotFromWindow(window);
			expect(previousArgs[1]).toBeDefined();

			// Reset and verify next call has no previous
			resetPreviousSnapshot();
			takeSnapshotFromWindow(window);
			expect(previousArgs[2]).toBeUndefined();
		});

		it('discards previous snapshot when window changes', () => {
			const previousArgs: unknown[] = [];
			const mockApi = {
				generateAriaTree: () => ({ root: {}, elements: new Map() }),
				renderAriaTree: (_snap: unknown, _opts: unknown, prev?: unknown) => {
					previousArgs.push(prev);
					return prev ? '- diff' : '- full';
				},
			};
			(window as Record<string, unknown>)[SNAPSHOT_API_KEY] = mockApi;

			// First call on window A
			takeSnapshotFromWindow(window);
			expect(previousArgs[0]).toBeUndefined();

			// Second call on same window — gets diff
			takeSnapshotFromWindow(window);
			expect(previousArgs[1]).toBeDefined();

			// Create a different window object to simulate navigation
			const newWin = {
				...window,
				document: window.document,
			} as unknown as Window;
			(newWin as Record<string, unknown>)[SNAPSHOT_API_KEY] = mockApi;

			// Call on new window — previous snapshot discarded (full tree)
			takeSnapshotFromWindow(newWin);
			expect(previousArgs[2]).toBeUndefined();
		});

		it('returns no-changes sentinel when diff renders empty', () => {
			const snapshot1 = { root: { role: 'document' }, elements: new Map() };
			const snapshot2 = { root: { role: 'document' }, elements: new Map() };
			let callCount = 0;

			const mockApi = {
				generateAriaTree: () => {
					callCount++;
					return callCount === 1 ? snapshot1 : snapshot2;
				},
				renderAriaTree: (_snap: unknown, _opts: unknown, prev?: unknown) => {
					// Simulate nothing changed: diff returns empty string
					return prev ? '' : '- document';
				},
			};
			(window as Record<string, unknown>)[SNAPSHOT_API_KEY] = mockApi;

			// First call: full tree
			const first = takeSnapshotFromWindow(window);
			expect(first).toBe('- document');

			// Second call: diff is empty → short sentinel instead of full tree
			const second = takeSnapshotFromWindow(window);
			expect(second).toBe('- [no changes]');
		});

		it('returns full tree when fullTree=true even after previous snapshot', () => {
			const previousArgs: unknown[] = [];
			const mockApi = {
				generateAriaTree: () => ({ root: {}, elements: new Map() }),
				renderAriaTree: (_snap: unknown, _opts: unknown, prev?: unknown) => {
					previousArgs.push(prev);
					return prev ? '- diff' : '- full';
				},
			};
			(window as Record<string, unknown>)[SNAPSHOT_API_KEY] = mockApi;

			// First call stores snapshot
			takeSnapshotFromWindow(window);
			expect(previousArgs[0]).toBeUndefined();

			// Second call with fullTree=true: ignores previous snapshot
			const result = takeSnapshotFromWindow(window, true);
			expect(result).toBe('- full');
			expect(previousArgs[1]).toBeUndefined();
		});

		it('stores previous snapshot after fullTree=true so next diff works', () => {
			const previousArgs: unknown[] = [];
			const snapshot1 = { root: { a: 1 }, elements: new Map() };
			const snapshot2 = { root: { b: 2 }, elements: new Map() };
			const snapshot3 = { root: { c: 3 }, elements: new Map() };
			let callCount = 0;

			const mockApi = {
				generateAriaTree: () => {
					callCount++;
					if (callCount === 1) return snapshot1;
					if (callCount === 2) return snapshot2;
					return snapshot3;
				},
				renderAriaTree: (_snap: unknown, _opts: unknown, prev?: unknown) => {
					previousArgs.push(prev);
					return prev ? '- diff' : '- full';
				},
			};
			(window as Record<string, unknown>)[SNAPSHOT_API_KEY] = mockApi;

			// First call: normal (full tree, sets _previousSnapshot = snapshot1)
			takeSnapshotFromWindow(window);
			expect(previousArgs[0]).toBeUndefined();

			// Second call: fullTree=true (full tree, sets _previousSnapshot = snapshot2)
			takeSnapshotFromWindow(window, true);
			expect(previousArgs[1]).toBeUndefined();

			// Third call: normal diff against snapshot2 (not snapshot1)
			takeSnapshotFromWindow(window);
			expect(previousArgs[2]).toBe(snapshot2);
		});
	});
});
