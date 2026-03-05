import { describe, it, expect, beforeEach } from 'vitest';

import {
	SNAPSHOT_API_KEY,
	IIFE_ENV_KEY,
	getSnapshotApi,
	injectSnapshotIife,
	takeSnapshotFromWindow,
} from '../../../src/browser/snapshotManager.js';
import { ELEMENT_MAP_KEY, getElementMap } from '../../../src/browser/refMap.js';

describe('snapshotManager', () => {
	beforeEach(() => {
		// Clean up window globals between tests
		delete (window as Record<string, unknown>)[SNAPSHOT_API_KEY];
		delete (window as Record<string, unknown>)[ELEMENT_MAP_KEY];
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
			const original = { generateAriaTree: () => ({ root: null, elements: new Map() }), renderAriaTree: () => '' };
			(window as Record<string, unknown>)[SNAPSHOT_API_KEY] = original;

			// This IIFE would overwrite the API if evaluated
			const iife = `(function() { window['${SNAPSHOT_API_KEY}'] = { replaced: true }; })()`;
			injectSnapshotIife(window, iife);

			// Should still be the original
			expect(
				(window as Record<string, unknown>)[SNAPSHOT_API_KEY],
			).toBe(original);
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
			const calls: { method: string; mode: string }[] = [];
			const mockApi = {
				generateAriaTree: (_root: Element, opts: { mode: string }) => {
					calls.push({ method: 'generateAriaTree', mode: opts.mode });
					return { root: {}, elements: new Map() };
				},
				renderAriaTree: (_snapshot: unknown, opts: { mode: string }) => {
					calls.push({ method: 'renderAriaTree', mode: opts.mode });
					return '';
				},
			};
			(window as Record<string, unknown>)[SNAPSHOT_API_KEY] = mockApi;

			takeSnapshotFromWindow(window);

			expect(calls).toHaveLength(2);
			expect(calls[0]).toEqual({ method: 'generateAriaTree', mode: 'ai' });
			expect(calls[1]).toEqual({ method: 'renderAriaTree', mode: 'ai' });
		});
	});
});
