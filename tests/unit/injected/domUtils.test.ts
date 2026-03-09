import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
closestCrossShadow,
isElementVisible,
isElementStyleVisibilityVisible,
isInsideScope,
} from '../../../src/injected/domUtils.js';
import { patchDom, restoreDom } from './domPatch.js';

describe('domUtils', () => {
beforeEach(() => {
document.body.innerHTML = '';
patchDom();
});

afterEach(() => {
restoreDom();
});

	it('isElementVisible() handles visible and hidden-by-style scenarios', () => {
		const visible = document.createElement('div');
		visible.textContent = 'visible';
		document.body.appendChild(visible);
		expect(isElementVisible(visible)).toBe(true);

		const visibilityHidden = document.createElement('div');
		visibilityHidden.style.visibility = 'hidden';
		document.body.appendChild(visibilityHidden);
		expect(isElementVisible(visibilityHidden)).toBe(false);
		expect(isElementStyleVisibilityVisible(visibilityHidden)).toBe(false);

		const details = document.createElement('details');
		const insideClosedDetails = document.createElement('div');
		details.appendChild(insideClosedDetails);
		document.body.appendChild(details);
		expect(isElementVisible(insideClosedDetails)).toBe(false);
	});

it('closestCrossShadow() traverses from shadow DOM to host ancestors', () => {
const container = document.createElement('section');
container.id = 'scope';
const host = document.createElement('div');
host.id = 'host';
container.appendChild(host);
document.body.appendChild(container);

const shadow = host.attachShadow({ mode: 'open' });
const inner = document.createElement('span');
inner.className = 'target';
shadow.appendChild(inner);

expect(closestCrossShadow(inner, '#host')).toBe(host);
expect(closestCrossShadow(inner, '#scope')).toBe(container);
});

it('isInsideScope() works with regular DOM and shadow boundary traversal', () => {
const scope = document.createElement('div');
scope.id = 'scope';
document.body.appendChild(scope);

const host = document.createElement('div');
scope.appendChild(host);
const shadowRoot = host.attachShadow({ mode: 'open' });
const inside = document.createElement('button');
const outside = document.createElement('button');
shadowRoot.appendChild(inside);
document.body.appendChild(outside);

expect(isInsideScope(scope, inside)).toBe(true);
expect(isInsideScope(scope, outside)).toBe(false);
expect(isInsideScope(scope, undefined)).toBe(false);
});
});
