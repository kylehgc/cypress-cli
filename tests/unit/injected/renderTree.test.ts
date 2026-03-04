import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateAriaTree, renderAriaTree } from '../../../src/injected/ariaSnapshot.js';
import { patchDom, restoreDom } from './domPatch.js';

describe('renderAriaTree - YAML rendering', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    patchDom();
  });

  afterEach(() => {
    restoreDom();
  });

  it('inline text children are rendered after colon', () => {
    document.body.innerHTML = '<button>Click here</button>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toMatch(/- button "Click here" \[ref=e\d+\]/);
  });

  it('nodes with multiple children use indented format', () => {
    document.body.innerHTML = '<nav><a href="/a">A</a><a href="/b">B</a></nav>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toMatch(/navigation \[ref=e\d+\]:/);
    expect(yaml).toMatch(/\n\s+- /);
  });

  it('props are rendered with / prefix', () => {
    document.body.innerHTML = '<a href="/about">About</a>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toContain('- /url: /about');
  });

  it('empty nodes render without colon', () => {
    document.body.innerHTML = '<div role="alert"></div>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toMatch(/^- alert(?: \[ref=e\d+\])?$/m);
  });

  it('refs appear in key brackets', () => {
    document.body.innerHTML = '<button>Test</button>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toMatch(/\[ref=e\d+\]/);
  });

  it('heading level attribute is rendered', () => {
    document.body.innerHTML = '<h2>Subtitle</h2>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toContain('[level=2]');
  });

  it('checked attribute is rendered for checkboxes', () => {
    document.body.innerHTML = '<input type="checkbox" checked aria-label="Accept">';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toContain('[checked]');
  });

  it('disabled attribute is rendered', () => {
    document.body.innerHTML = '<button disabled>No</button>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toContain('[disabled]');
  });

  it('expanded attribute is rendered', () => {
    document.body.innerHTML = '<button aria-expanded="true">Toggle</button>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toContain('[expanded]');
  });

  it('selected attribute is rendered for tabs', () => {
    document.body.innerHTML = '<div role="tab" aria-selected="true">Tab 1</div>';
    const snapshot = generateAriaTree(document.body, { mode: 'ai' });
    const yaml = renderAriaTree(snapshot, { mode: 'ai' });
    expect(yaml).toContain('[selected]');
  });
});
