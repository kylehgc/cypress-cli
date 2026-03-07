/**
 * happy-dom does not implement getComputedStyle or getBoundingClientRect
 * accurately enough for the aria snapshot code. We patch them so elements
 * are treated as visible and sized, which is the precondition for the
 * snapshot logic to produce meaningful output.
 */
import { vi } from 'vitest';

const origGetComputedStyle = window.getComputedStyle;
const origGetBoundingClientRect = Element.prototype.getBoundingClientRect;

export function patchDom() {
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const style = origGetComputedStyle(element, pseudo);
    return new Proxy(style, {
      get(target, prop) {
        if (prop === 'visibility') return target.visibility || 'visible';
        if (prop === 'display') return target.display || 'block';
        const val = (target as unknown as Record<string | symbol, unknown>)[prop];
        return typeof val === 'function' ? val.bind(target) : val;
      },
    });
  });
  Element.prototype.getBoundingClientRect = function () {
    return { x: 0, y: 0, width: 100, height: 20, top: 0, right: 100, bottom: 20, left: 0, toJSON: () => ({}) } as DOMRect;
  };
}

export function restoreDom() {
  vi.restoreAllMocks();
  Element.prototype.getBoundingClientRect = origGetBoundingClientRect;
}
