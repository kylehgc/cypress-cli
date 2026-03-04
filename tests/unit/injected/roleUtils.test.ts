import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getAriaRole,
  getElementAccessibleName,
  beginAriaCaches,
  endAriaCaches,
} from '../../../src/injected/roleUtils.js';

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

describe('getAriaRole', () => {
  beforeEach(() => {
    patchDom();
  });

  afterEach(() => {
    restoreDom();
    document.body.innerHTML = '';
  });

  it('implicit role for button element', () => {
    document.body.innerHTML = '<button>Click</button>';
    const el = document.querySelector('button')!;
    beginAriaCaches();
    try {
      expect(getAriaRole(el)).toBe('button');
    } finally {
      endAriaCaches();
    }
  });

  it('explicit role overrides implicit', () => {
    document.body.innerHTML = '<div role="button">Click</div>';
    const el = document.querySelector('div')!;
    beginAriaCaches();
    try {
      expect(getAriaRole(el)).toBe('button');
    } finally {
      endAriaCaches();
    }
  });

  it('presentation role', () => {
    document.body.innerHTML = '<table role="presentation"><tr><td>Cell</td></tr></table>';
    const el = document.querySelector('table')!;
    beginAriaCaches();
    try {
      expect(getAriaRole(el)).toBe('presentation');
    } finally {
      endAriaCaches();
    }
  });

  it('link with href gets role link', () => {
    document.body.innerHTML = '<a href="/about">About</a>';
    const el = document.querySelector('a')!;
    beginAriaCaches();
    try {
      expect(getAriaRole(el)).toBe('link');
    } finally {
      endAriaCaches();
    }
  });

  it('anchor without href gets no special role', () => {
    document.body.innerHTML = '<a>Not a link</a>';
    const el = document.querySelector('a')!;
    beginAriaCaches();
    try {
      expect(getAriaRole(el)).toBeNull();
    } finally {
      endAriaCaches();
    }
  });

  it('implicit role for heading elements', () => {
    document.body.innerHTML = '<h1>Title</h1>';
    const el = document.querySelector('h1')!;
    beginAriaCaches();
    try {
      expect(getAriaRole(el)).toBe('heading');
    } finally {
      endAriaCaches();
    }
  });

  it('implicit role for nav element', () => {
    document.body.innerHTML = '<nav>Content</nav>';
    const el = document.querySelector('nav')!;
    beginAriaCaches();
    try {
      expect(getAriaRole(el)).toBe('navigation');
    } finally {
      endAriaCaches();
    }
  });

  it('implicit role for input text', () => {
    document.body.innerHTML = '<input type="text">';
    const el = document.querySelector('input')!;
    beginAriaCaches();
    try {
      expect(getAriaRole(el)).toBe('textbox');
    } finally {
      endAriaCaches();
    }
  });

  it('implicit role for input checkbox', () => {
    document.body.innerHTML = '<input type="checkbox">';
    const el = document.querySelector('input')!;
    beginAriaCaches();
    try {
      expect(getAriaRole(el)).toBe('checkbox');
    } finally {
      endAriaCaches();
    }
  });

  it('implicit role for select', () => {
    document.body.innerHTML = '<select><option>A</option></select>';
    const el = document.querySelector('select')!;
    beginAriaCaches();
    try {
      expect(getAriaRole(el)).toBe('combobox');
    } finally {
      endAriaCaches();
    }
  });
});

describe('getElementAccessibleName', () => {
  beforeEach(() => {
    patchDom();
  });

  afterEach(() => {
    restoreDom();
    document.body.innerHTML = '';
  });

  it('accessible name from text content', () => {
    document.body.innerHTML = '<button>Submit Form</button>';
    const el = document.querySelector('button')!;
    beginAriaCaches();
    try {
      expect(getElementAccessibleName(el, false)).toBe('Submit Form');
    } finally {
      endAriaCaches();
    }
  });

  it('accessible name from title attribute', () => {
    document.body.innerHTML = '<button title="Close"><span></span></button>';
    const el = document.querySelector('button')!;
    beginAriaCaches();
    try {
      expect(getElementAccessibleName(el, false)).toBe('Close');
    } finally {
      endAriaCaches();
    }
  });

  it('accessible name from placeholder', () => {
    document.body.innerHTML = '<input type="text" placeholder="Enter email">';
    const el = document.querySelector('input')!;
    beginAriaCaches();
    try {
      expect(getElementAccessibleName(el, false)).toBe('Enter email');
    } finally {
      endAriaCaches();
    }
  });

  it('accessible name from aria-label', () => {
    document.body.innerHTML = '<button aria-label="Close dialog">X</button>';
    const el = document.querySelector('button')!;
    beginAriaCaches();
    try {
      expect(getElementAccessibleName(el, false)).toBe('Close dialog');
    } finally {
      endAriaCaches();
    }
  });

  it('accessible name from aria-labelledby', () => {
    document.body.innerHTML = '<div id="lbl">Email</div><input aria-labelledby="lbl" type="email">';
    const el = document.querySelector('input')!;
    beginAriaCaches();
    try {
      expect(getElementAccessibleName(el, false)).toBe('Email');
    } finally {
      endAriaCaches();
    }
  });

  it('accessible name from label for attribute', () => {
    document.body.innerHTML = '<label for="pw">Password</label><input id="pw" type="password">';
    const el = document.querySelector('input')!;
    beginAriaCaches();
    try {
      expect(getElementAccessibleName(el, false)).toBe('Password');
    } finally {
      endAriaCaches();
    }
  });
});
