import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ariaNodesEqual, hasPointerCursor, findNewNode } from '../../../src/injected/comparison.js';
import { generateAriaTree, renderAriaTree } from '../../../src/injected/ariaSnapshot.js';
import type { AriaNode } from '../../../src/injected/types.js';

function makeNode(overrides: Partial<AriaNode> = {}): AriaNode {
  return {
    role: 'button',
    name: 'Click',
    children: [],
    box: { visible: true, inline: false },
    receivesPointerEvents: true,
    props: {},
    ...overrides,
  };
}

describe('ariaNodesEqual', () => {
  it('returns true for identical nodes', () => {
    const a = makeNode();
    const b = makeNode();
    expect(ariaNodesEqual(a, b)).toBe(true);
  });

  it('returns false when roles differ', () => {
    const a = makeNode({ role: 'button' });
    const b = makeNode({ role: 'link' });
    expect(ariaNodesEqual(a, b)).toBe(false);
  });

  it('returns false when names differ', () => {
    const a = makeNode({ name: 'Hello' });
    const b = makeNode({ name: 'World' });
    expect(ariaNodesEqual(a, b)).toBe(false);
  });

  it('returns false when checked state differs', () => {
    const a = makeNode({ checked: true });
    const b = makeNode({ checked: false });
    expect(ariaNodesEqual(a, b)).toBe(false);
  });

  it('returns false when cursor differs', () => {
    const a = makeNode({ box: { visible: true, inline: false, cursor: 'pointer' } });
    const b = makeNode({ box: { visible: true, inline: false, cursor: 'default' } });
    expect(ariaNodesEqual(a, b)).toBe(false);
  });

  it('returns false when props differ', () => {
    const a = makeNode({ props: { url: 'http://a.com' } });
    const b = makeNode({ props: { url: 'http://b.com' } });
    expect(ariaNodesEqual(a, b)).toBe(false);
  });

  it('returns true when both have matching props', () => {
    const a = makeNode({ props: { url: 'http://same.com' } });
    const b = makeNode({ props: { url: 'http://same.com' } });
    expect(ariaNodesEqual(a, b)).toBe(true);
  });

  it('returns false when props keys differ', () => {
    const a = makeNode({ props: { url: 'x' } });
    const b = makeNode({ props: { placeholder: 'x' } });
    expect(ariaNodesEqual(a, b)).toBe(false);
  });

  it('returns false when disabled state differs', () => {
    const a = makeNode({ disabled: true });
    const b = makeNode({ disabled: false });
    expect(ariaNodesEqual(a, b)).toBe(false);
  });

  it('returns false when expanded state differs', () => {
    const a = makeNode({ expanded: true });
    const b = makeNode({ expanded: false });
    expect(ariaNodesEqual(a, b)).toBe(false);
  });

  it('returns false when selected state differs', () => {
    const a = makeNode({ selected: true });
    const b = makeNode({ selected: false });
    expect(ariaNodesEqual(a, b)).toBe(false);
  });

  it('returns false when level differs', () => {
    const a = makeNode({ level: 1 });
    const b = makeNode({ level: 2 });
    expect(ariaNodesEqual(a, b)).toBe(false);
  });

  it('returns false when pressed state differs', () => {
    const a = makeNode({ pressed: true });
    const b = makeNode({ pressed: false });
    expect(ariaNodesEqual(a, b)).toBe(false);
  });
});

describe('hasPointerCursor', () => {
  it('returns true for pointer cursor', () => {
    const node = makeNode({ box: { visible: true, inline: false, cursor: 'pointer' } });
    expect(hasPointerCursor(node)).toBe(true);
  });

  it('returns false for default cursor', () => {
    const node = makeNode({ box: { visible: true, inline: false, cursor: 'default' } });
    expect(hasPointerCursor(node)).toBe(false);
  });

  it('returns false when cursor is undefined', () => {
    const node = makeNode();
    expect(hasPointerCursor(node)).toBe(false);
  });

  it('returns false for text cursor', () => {
    const node = makeNode({ box: { visible: true, inline: false, cursor: 'text' } });
    expect(hasPointerCursor(node)).toBe(false);
  });
});

describe('findNewNode', () => {
  it('finds a node present in "to" but not "from"', () => {
    const from = makeNode({
      role: 'fragment',
      name: '',
      children: [makeNode({ role: 'heading', name: 'Title' })],
    });
    const to = makeNode({
      role: 'fragment',
      name: '',
      children: [
        makeNode({ role: 'heading', name: 'Title' }),
        makeNode({ role: 'button', name: 'New Button' }),
      ],
    });
    const newNode = findNewNode(from, to);
    expect(newNode).toBeDefined();
    expect(newNode!.role).toBe('button');
    expect(newNode!.name).toBe('New Button');
  });

  it('returns undefined when trees are identical', () => {
    const from = makeNode({
      role: 'fragment',
      name: '',
      children: [makeNode({ role: 'heading', name: 'Title' })],
    });
    const to = makeNode({
      role: 'fragment',
      name: '',
      children: [makeNode({ role: 'heading', name: 'Title' })],
    });
    const newNode = findNewNode(from, to);
    expect(newNode).toBeUndefined();
  });

  it('returns new node when from is undefined', () => {
    const to = makeNode({ role: 'button', name: 'Click' });
    const newNode = findNewNode(undefined, to);
    expect(newNode).toBeDefined();
    expect(newNode!.name).toBe('Click');
  });

  it('ignores fragment roles in comparison', () => {
    const from = makeNode({ role: 'fragment', name: '', children: [] });
    const to = makeNode({
      role: 'fragment',
      name: '',
      children: [makeNode({ role: 'link', name: 'New Link' })],
    });
    const newNode = findNewNode(from, to);
    expect(newNode).toBeDefined();
    expect(newNode!.role).toBe('link');
  });

  it('prioritizes larger subtrees', () => {
    const from = makeNode({ role: 'fragment', name: '', children: [] });
    const to = makeNode({
      role: 'fragment',
      name: '',
      children: [
        makeNode({ role: 'button', name: 'Small' }),
        makeNode({
          role: 'navigation',
          name: 'Nav',
          children: [
            makeNode({ role: 'link', name: 'A' }),
            makeNode({ role: 'link', name: 'B' }),
          ],
        }),
      ],
    });
    const newNode = findNewNode(from, to);
    expect(newNode).toBeDefined();
    expect(newNode!.role).toBe('navigation');
  });
});

describe('incremental diff via renderAriaTree', () => {
  const origGetComputedStyle = window.getComputedStyle;
  const origGetBoundingClientRect = Element.prototype.getBoundingClientRect;

  function patchDom() {
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      const style = origGetComputedStyle(element, pseudo);
      return new Proxy(style, {
        get(target, prop) {
          if (prop === 'visibility') return target.visibility || 'visible';
          if (prop === 'display') return target.display || 'block';
          const val = (target as any)[prop];
          return typeof val === 'function' ? val.bind(target) : val;
        },
      });
    });
    Element.prototype.getBoundingClientRect = function () {
      return { x: 0, y: 0, width: 100, height: 20, top: 0, right: 100, bottom: 20, left: 0, toJSON: () => ({}) } as DOMRect;
    };
  }

  function restoreDom() {
    vi.restoreAllMocks();
    Element.prototype.getBoundingClientRect = origGetBoundingClientRect;
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    patchDom();
  });

  afterEach(() => {
    restoreDom();
  });

  it('identical snapshots produce empty diff', () => {
    document.body.innerHTML = '<h1>Title</h1><button>Click</button>';
    const snap1 = generateAriaTree(document.body, { mode: 'ai' });
    const snap2 = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snap2, { mode: 'ai' }, snap1);
    expect(yaml.trim()).toBe('');
  });

  it('added node appears as changed', () => {
    document.body.innerHTML = '<h1>Title</h1>';
    const prev = generateAriaTree(document.body, { mode: 'ai' });

    document.body.innerHTML = '<h1>Title</h1><button>New</button>';
    const curr = generateAriaTree(document.body, { mode: 'ai' });

    const yaml = renderAriaTree(curr, { mode: 'ai' }, prev);
    expect(yaml).toContain('button "New"');
  });

  it('modified text triggers changed marker', () => {
    document.body.innerHTML = '<h1>Hello</h1>';
    const prev = generateAriaTree(document.body, { mode: 'ai' });

    document.body.innerHTML = '<h1>Goodbye</h1>';
    const curr = generateAriaTree(document.body, { mode: 'ai' });

    const yaml = renderAriaTree(curr, { mode: 'ai' }, prev);
    expect(yaml).toContain('Goodbye');
    expect(yaml).toContain('<changed>');
  });

  it('unchanged subtrees with refs collapse to [unchanged]', () => {
    document.body.innerHTML = '<button>Stable</button><button>Will change</button>';
    const prev = generateAriaTree(document.body, { mode: 'ai' });

    // Modify in-place so DOM elements (and their cached refs) persist
    document.querySelectorAll('button')[1].textContent = 'Changed now';
    const curr = generateAriaTree(document.body, { mode: 'ai' });

    const yaml = renderAriaTree(curr, { mode: 'ai' }, prev);
    expect(yaml).toContain('[unchanged]');
  });

  it('reordered children trigger diff', () => {
    document.body.innerHTML = '<div role="list"><div role="listitem">A</div><div role="listitem">B</div><div role="listitem">C</div></div>';
    const prev = generateAriaTree(document.body, { mode: 'ai' });

    document.body.innerHTML = '<div role="list"><div role="listitem">C</div><div role="listitem">A</div><div role="listitem">B</div></div>';
    const curr = generateAriaTree(document.body, { mode: 'ai' });

    const yaml = renderAriaTree(curr, { mode: 'ai' }, prev);
    // Reordering triggers a change, so the diff should not be empty
    expect(yaml.trim()).not.toBe('');
  });
});
