import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateAriaTree, renderAriaTree } from '../../../src/injected/ariaSnapshot.js';

/**
 * happy-dom does not implement getComputedStyle or getBoundingClientRect
 * accurately enough for the aria snapshot code. We patch them so elements
 * are treated as visible and sized, which is the precondition for the
 * snapshot logic to produce meaningful output.
 */
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

describe('generateAriaTree + renderAriaTree', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    patchDom();
  });

  afterEach(() => {
    restoreDom();
  });

  it('generates correct snapshot for simple page', () => {
    document.body.innerHTML = '<main><h1>Hello</h1><button>Click me</button></main>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toContain('heading "Hello"');
    expect(yaml).toContain('[level=1]');
    expect(yaml).toContain('button "Click me"');
  });

  it('assigns refs to visible elements in ai mode', () => {
    document.body.innerHTML = '<div><a href="#">Link</a><button>Btn</button></div>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toMatch(/link "Link" \[ref=e\d+\]/);
    expect(yaml).toMatch(/button "Btn" \[ref=e\d+\]/);
  });

  it('does not assign refs in expect mode', () => {
    document.body.innerHTML = '<div><a href="#">Link</a><button>Btn</button></div>';
    const snapshot = generateAriaTree(document.body, { mode: 'expect' });
    const yaml = renderAriaTree(snapshot, { mode: 'expect' });
    expect(yaml).not.toMatch(/\[ref=/);
    expect(yaml).toContain('link "Link"');
    expect(yaml).toContain('button "Btn"');
  });

  it('handles nested lists', () => {
    document.body.innerHTML = '<nav><ul><li><a href="/a">A</a></li><li><a href="/b">B</a></li></ul></nav>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toContain('navigation');
    expect(yaml).toContain('list');
    expect(yaml).toContain('listitem');
    expect(yaml).toContain('link "A"');
    expect(yaml).toContain('link "B"');
  });

  it('handles empty elements with role', () => {
    document.body.innerHTML = '<div role="alert"></div>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toContain('alert');
  });

  it('computes accessible name from aria-label', () => {
    document.body.innerHTML = '<button aria-label="Close dialog">X</button>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toContain('button "Close dialog"');
  });

  it('handles checkbox checked state', () => {
    document.body.innerHTML = '<input type="checkbox" checked aria-label="Accept terms">';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toContain('checkbox "Accept terms"');
    expect(yaml).toContain('[checked]');
  });

  it('handles disabled state', () => {
    document.body.innerHTML = '<button disabled>Cannot click</button>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toContain('button "Cannot click"');
    expect(yaml).toContain('[disabled]');
  });

  it('handles expanded state', () => {
    document.body.innerHTML = '<button aria-expanded="true">Menu</button>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toContain('button "Menu"');
    expect(yaml).toContain('[expanded]');
  });

  it('handles heading levels', () => {
    document.body.innerHTML = '<h1>One</h1><h2>Two</h2><h3>Three</h3>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toContain('[level=1]');
    expect(yaml).toContain('[level=2]');
    expect(yaml).toContain('[level=3]');
  });

  it('populates elements map with refs', () => {
    document.body.innerHTML = '<a href="#">Link</a><button>Btn</button>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    expect(snapshot.elements.size).toBeGreaterThan(0);
  });

  it('includes url prop for links', () => {
    document.body.innerHTML = '<a href="/about">About</a>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toContain('/url: /about');
  });

  it('returns empty string for empty body', () => {
    document.body.innerHTML = '';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toBe('');
  });

  it('handles main landmark', () => {
    document.body.innerHTML = '<main><p>Content</p></main>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toContain('main');
  });

  it('renders textbox with value as child', () => {
    document.body.innerHTML = '<input type="text" aria-label="Name" value="Alice">';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toContain('textbox "Name"');
    expect(yaml).toContain('Alice');
  });

  it('includes generic roles in AI mode', () => {
    document.body.innerHTML = '<div><button>A</button><button>B</button></div>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toContain('generic');
  });

  it('escapes YAML special characters in names', () => {
    document.body.innerHTML = '<button>Say "hello": world</button>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    // The name should be in the output (possibly JSON-escaped)
    expect(yaml).toContain('button "Say \\"hello\\": world"');
  });

  it('computes accessible name from aria-labelledby', () => {
    document.body.innerHTML = '<div id="lbl">Email</div><input aria-labelledby="lbl" type="email">';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toContain('textbox "Email"');
  });

  it('handles form elements with label', () => {
    document.body.innerHTML = '<label for="pw">Password</label><input id="pw" type="password">';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toContain('textbox "Password"');
  });

  it('handles select elements', () => {
    document.body.innerHTML = '<select aria-label="Color"><option>Red</option><option selected>Blue</option></select>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toContain('combobox "Color"');
  });

  it('renders active state for focused elements', () => {
    document.body.innerHTML = '<button>Focus me</button>';
    const btn = document.querySelector('button')!;
    btn.focus();
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toContain('button "Focus me"');
    // Active attribute rendered when the element is the active/focused element
    expect(yaml).toContain('[active]');
  });

  it('renders selected state for tabs', () => {
    document.body.innerHTML = '<div role="tab" aria-selected="true">Tab 1</div>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toContain('[selected]');
  });

  it('renders incremental diff with changed marker', () => {
    document.body.innerHTML = '<h1>Hello</h1><button>Click</button>';
    const prev = generateAriaTree(document.body, { mode: 'ai' });

    document.body.innerHTML = '<h1>Goodbye</h1><button>Click</button>';
    const curr = generateAriaTree(document.body, { mode: 'ai' });

    const yaml = renderAriaTree(curr, { mode: 'ai' }, prev);
    expect(yaml).toContain('Goodbye');
  });

  it('renders unchanged ref nodes as [unchanged] in diff', () => {
    document.body.innerHTML = '<button>Stay</button><button>Change</button>';
    const prev = generateAriaTree(document.body, { mode: 'ai' });

    // Modify in-place so DOM elements (and their cached refs) persist
    document.querySelectorAll('button')[1].textContent = 'Changed';
    const curr = generateAriaTree(document.body, { mode: 'ai' });

    const yaml = renderAriaTree(curr, { mode: 'ai' }, prev);
    expect(yaml).toContain('[unchanged]');
  });
});
