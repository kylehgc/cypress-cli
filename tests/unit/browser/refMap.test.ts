import { describe, it, expect, beforeEach } from 'vitest';

import {
	ELEMENT_MAP_KEY,
	getElementMap,
	setElementMap,
	resolveRefFromMap,
} from '../../../src/browser/refMap.js';

describe('refMap', () => {
	describe('ELEMENT_MAP_KEY', () => {
		it('equals __cypressCliElementMap', () => {
			expect(ELEMENT_MAP_KEY).toBe('__cypressCliElementMap');
		});
	});

	describe('getElementMap', () => {
		it('returns undefined when no element map is set', () => {
			expect(getElementMap(window)).toBeUndefined();
		});

		it('returns the element map after setElementMap', () => {
			const elements = new Map<string, Element>();
			elements.set('e1', document.createElement('div'));
			setElementMap(window, elements);
			expect(getElementMap(window)).toBe(elements);
		});
	});

	describe('setElementMap', () => {
		it('stores the element map on the window object', () => {
			const elements = new Map<string, Element>();
			elements.set('e1', document.createElement('button'));
			setElementMap(window, elements);
			expect(
				(window as Record<string, unknown>)[ELEMENT_MAP_KEY],
			).toBe(elements);
		});

		it('overwrites a previously stored element map', () => {
			const first = new Map<string, Element>();
			first.set('e1', document.createElement('div'));
			setElementMap(window, first);

			const second = new Map<string, Element>();
			second.set('e2', document.createElement('span'));
			setElementMap(window, second);

			expect(getElementMap(window)).toBe(second);
		});
	});

	describe('resolveRefFromMap', () => {
		beforeEach(() => {
			const elements = new Map<string, Element>();
			elements.set('e1', document.createElement('div'));
			elements.set('e5', document.createElement('button'));
			elements.set('e10', document.createElement('input'));
			setElementMap(window, elements);
		});

		it('returns the element for a valid ref', () => {
			const element = resolveRefFromMap(window, 'e5');
			expect(element.tagName).toBe('BUTTON');
		});

		it('returns the correct element for different refs', () => {
			expect(resolveRefFromMap(window, 'e1').tagName).toBe('DIV');
			expect(resolveRefFromMap(window, 'e10').tagName).toBe('INPUT');
		});

		it('throws an error for a ref not in the map', () => {
			expect(() => resolveRefFromMap(window, 'e99')).toThrow(
				'Ref "e99" not found in current snapshot',
			);
		});

		it('throws an error when no element map is set', () => {
			// Clear the element map
			delete (window as Record<string, unknown>)[ELEMENT_MAP_KEY];
			expect(() => resolveRefFromMap(window, 'e1')).toThrow(
				'Ref "e1" not found in current snapshot',
			);
		});

		it('error message suggests running snapshot', () => {
			expect(() => resolveRefFromMap(window, 'e99')).toThrow(
				'Run `snapshot` to refresh the element map.',
			);
		});
	});
});
