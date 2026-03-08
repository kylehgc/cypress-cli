/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


/**
 * Ported from Playwright (https://github.com/microsoft/playwright)
 * Modified for cypress-cli. See git history for contributors.
 */

// MODIFIED: imports rewritten from Playwright path aliases to relative imports
import type { AriaNode } from './types.js';
import { ariaNodesEqual, hasPointerCursor, findNewNode } from './comparison.js';
import { normalizeWhiteSpace } from './stringUtils.js';
import { yamlEscapeKeyIfNeeded, yamlEscapeValueIfNeeded } from './yaml.js';

import { computeBox, getElementComputedStyle, isElementVisible } from './domUtils.js';
import * as roleUtils from './roleUtils.js';

export type AriaSnapshot = {
  root: AriaNode;
  elements: Map<string, Element>;
  refs: Map<Element, string>;
  iframeRefs: string[];
};

// REMOVED: AriaRef — ref caching on DOM elements removed; refs are now assigned fresh per snapshot.
type _AriaRef = {
  role: string;
  name: string;
  ref: string;
};

let lastRef = 0;

export type AriaTreeOptions = {
  mode: 'ai' | 'expect' | 'codegen' | 'autoexpect';
  refPrefix?: string;
  doNotRenderActive?: boolean;
};

type InternalOptions = {
  visibility: 'aria' | 'ariaOrVisible' | 'ariaAndVisible',
  refs: 'all' | 'interactable' | 'none',
  refPrefix?: string,
  includeGenericRole?: boolean,
  renderCursorPointer?: boolean,
  renderActive?: boolean,
  renderStringsAsRegex?: boolean,
};

function toInternalOptions(options: AriaTreeOptions): InternalOptions {
  if (options.mode === 'ai') {
    // For AI consumption.
    return {
      visibility: 'ariaOrVisible',
      refs: 'interactable',
      refPrefix: options.refPrefix,
      includeGenericRole: true,
      renderActive: !options.doNotRenderActive,
      renderCursorPointer: true,
    };
  }
  if (options.mode === 'autoexpect') {
    // To auto-generate assertions on visible elements.
    return { visibility: 'ariaAndVisible', refs: 'none' };
  }
  if (options.mode === 'codegen') {
    // To generate aria assertion with regex heurisitcs.
    return { visibility: 'aria', refs: 'none', renderStringsAsRegex: true };
  }
  // To match aria snapshot.
  return { visibility: 'aria', refs: 'none' };
}

export function generateAriaTree(rootElement: Element, publicOptions: AriaTreeOptions): AriaSnapshot {
  // MODIFIED: Reset ref counter so each snapshot gets clean e1-eN refs,
  // preventing unbounded growth in long sessions.
  lastRef = 0;
  const options = toInternalOptions(publicOptions);
  const visited = new Set<Node>();

  // MODIFIED: Pre-collect all aria-owns targets so they are skipped during normal
  // DOM traversal and only rendered under their owning element.
  const ariaOwnsTargets = new Set<Element>();
  for (const ownerEl of rootElement.querySelectorAll('[aria-owns]')) {
    const ids = ownerEl.getAttribute('aria-owns')!.split(/\s+/);
    for (const id of ids) {
      const ownedElement = rootElement.ownerDocument.getElementById(id);
      if (ownedElement)
        ariaOwnsTargets.add(ownedElement);
    }
  }

  const snapshot: AriaSnapshot = {
    root: { role: 'fragment', name: '', children: [], props: {}, box: computeBox(rootElement), receivesPointerEvents: true },
    elements: new Map<string, Element>(),
    refs: new Map<Element, string>(),
    iframeRefs: [],
  };
  setAriaNodeElement(snapshot.root, rootElement);

  const visit = (ariaNode: AriaNode, node: Node, parentElementVisible: boolean, isAriaOwned?: boolean) => {
    if (visited.has(node))
      return;
    // MODIFIED: Skip aria-owns targets during normal traversal; they will be
    // visited when their owning element processes its ariaChildren.
    if (!isAriaOwned && node.nodeType === Node.ELEMENT_NODE && ariaOwnsTargets.has(node as Element))
      return;
    visited.add(node);

    if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
      if (!parentElementVisible)
        return;

      const text = node.nodeValue;
      // <textarea>AAA</textarea> should not report AAA as a child of the textarea.
      if (ariaNode.role !== 'textbox' && text)
        ariaNode.children.push(node.nodeValue || '');
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE)
      return;

    const element = node as Element;
    const isElementVisibleForAria = !roleUtils.isElementHiddenForAria(element);
    let visible = isElementVisibleForAria;
    if (options.visibility === 'ariaOrVisible')
      visible = isElementVisibleForAria || isElementVisible(element);
    if (options.visibility === 'ariaAndVisible')
      visible = isElementVisibleForAria && isElementVisible(element);

    // Optimization: if we only consider aria visibility, we can skip child elements because
    // they will not be visible for aria as well.
    if (options.visibility === 'aria' && !visible)
      return;

    const ariaChildren: Element[] = [];
    if (element.hasAttribute('aria-owns')) {
      const ids = element.getAttribute('aria-owns')!.split(/\s+/);
      for (const id of ids) {
        const ownedElement = rootElement.ownerDocument.getElementById(id);
        if (ownedElement)
          ariaChildren.push(ownedElement);
      }
    }

    const childAriaNode = visible ? toAriaNode(element, options) : null;
    if (childAriaNode) {
      if (childAriaNode.ref) {
        snapshot.elements.set(childAriaNode.ref, element);
        snapshot.refs.set(element, childAriaNode.ref);
        if (childAriaNode.role === 'iframe')
          snapshot.iframeRefs.push(childAriaNode.ref);
      }
      ariaNode.children.push(childAriaNode);
    }
    processElement(childAriaNode || ariaNode, element, ariaChildren, visible);
  };

  function processElement(ariaNode: AriaNode, element: Element, ariaChildren: Element[], parentElementVisible: boolean) {
    // Surround every element with spaces for the sake of concatenated text nodes.
    const display = getElementComputedStyle(element)?.display || 'inline';
    const treatAsBlock = (display !== 'inline' || element.nodeName === 'BR') ? ' ' : '';
    if (treatAsBlock)
      ariaNode.children.push(treatAsBlock);

    ariaNode.children.push(roleUtils.getCSSContent(element, '::before') || '');
    const assignedNodes = element.nodeName === 'SLOT' ? (element as HTMLSlotElement).assignedNodes() : [];
    if (assignedNodes.length) {
      for (const child of assignedNodes)
        visit(ariaNode, child, parentElementVisible);
    } else {
      for (let child = element.firstChild; child; child = child.nextSibling) {
        if (!(child as Element | Text).assignedSlot)
          visit(ariaNode, child, parentElementVisible);
      }
      if (element.shadowRoot) {
        for (let child = element.shadowRoot.firstChild; child; child = child.nextSibling)
          visit(ariaNode, child, parentElementVisible);
      }
    }

    for (const child of ariaChildren)
      visit(ariaNode, child, parentElementVisible, true);

    ariaNode.children.push(roleUtils.getCSSContent(element, '::after') || '');

    if (treatAsBlock)
      ariaNode.children.push(treatAsBlock);

    if (ariaNode.children.length === 1 && ariaNode.name === ariaNode.children[0])
      ariaNode.children = [];

    if (ariaNode.role === 'link' && element.hasAttribute('href')) {
      const href = element.getAttribute('href')!;
      ariaNode.props['url'] = href;
    }

    if (ariaNode.role === 'textbox' && element.hasAttribute('placeholder') && element.getAttribute('placeholder') !== ariaNode.name) {
      const placeholder = element.getAttribute('placeholder')!;
      ariaNode.props['placeholder'] = placeholder;
    }
  }

  roleUtils.beginAriaCaches();
  try {
    visit(snapshot.root, rootElement, true);
  } finally {
    roleUtils.endAriaCaches();
  }

  normalizeStringChildren(snapshot.root);
  normalizeGenericRoles(snapshot.root);
  return snapshot;
}

function computeAriaRef(ariaNode: AriaNode, options: InternalOptions) {
  if (options.refs === 'none')
    return;
  if (options.refs === 'interactable' && (!ariaNode.box.visible || !ariaNode.receivesPointerEvents))
    return;

  // MODIFIED: Always assign a fresh ref since the counter resets per snapshot.
  ariaNode.ref = (options.refPrefix ?? '') + 'e' + (++lastRef);
}

function toAriaNode(element: Element, options: InternalOptions): AriaNode | null {
  const active = element.ownerDocument.activeElement === element;
  if (element.nodeName === 'IFRAME') {
    const ariaNode: AriaNode = {
      role: 'iframe',
      name: '',
      children: [],
      props: {},
      box: computeBox(element),
      receivesPointerEvents: true,
      active
    };
    setAriaNodeElement(ariaNode, element);
    computeAriaRef(ariaNode, options);
    return ariaNode;
  }

  const defaultRole = options.includeGenericRole ? 'generic' : null;
  const role = roleUtils.getAriaRole(element) ?? defaultRole;
  if (!role || role === 'presentation' || role === 'none')
    return null;

  const name = normalizeWhiteSpace(roleUtils.getElementAccessibleName(element, false) || '');
  const receivesPointerEvents = roleUtils.receivesPointerEvents(element);

  const box = computeBox(element);
  if (role === 'generic' && box.inline && element.childNodes.length === 1 && element.childNodes[0].nodeType === Node.TEXT_NODE)
    return null;

  const result: AriaNode = {
    role,
    name,
    children: [],
    props: {},
    box,
    receivesPointerEvents,
    active
  };
  setAriaNodeElement(result, element);
  computeAriaRef(result, options);

  if (roleUtils.kAriaCheckedRoles.includes(role))
    result.checked = roleUtils.getAriaChecked(element);

  if (roleUtils.kAriaDisabledRoles.includes(role))
    result.disabled = roleUtils.getAriaDisabled(element);

  if (roleUtils.kAriaExpandedRoles.includes(role))
    result.expanded = roleUtils.getAriaExpanded(element);

  if (roleUtils.kAriaLevelRoles.includes(role))
    result.level = roleUtils.getAriaLevel(element);

  if (roleUtils.kAriaPressedRoles.includes(role))
    result.pressed = roleUtils.getAriaPressed(element);

  if (roleUtils.kAriaSelectedRoles.includes(role))
    result.selected = roleUtils.getAriaSelected(element);

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element.type !== 'checkbox' && element.type !== 'radio' && element.type !== 'file')
      result.children = [element.value];
  }

  return result;
}

function normalizeGenericRoles(node: AriaNode) {
  const normalizeChildren = (node: AriaNode) => {
    const result: (AriaNode | string)[] = [];
    for (const child of node.children || []) {
      if (typeof child === 'string') {
        result.push(child);
        continue;
      }
      const normalized = normalizeChildren(child);
      result.push(...normalized);
    }

    // Only remove generic that encloses one element, logical grouping still makes sense, even if it is not ref-able.
    const removeSelf = node.role === 'generic' && !node.name && result.length <= 1 && result.every(c => typeof c !== 'string' && !!c.ref);
    if (removeSelf)
      return result;
    node.children = result;
    return [node];
  };

  normalizeChildren(node);
}

function normalizeStringChildren(rootA11yNode: AriaNode) {
  const flushChildren = (buffer: string[], normalizedChildren: (AriaNode | string)[]) => {
    if (!buffer.length)
      return;
    const text = normalizeWhiteSpace(buffer.join(''));
    if (text)
      normalizedChildren.push(text);
    buffer.length = 0;
  };

  const visit = (ariaNode: AriaNode) => {
    const normalizedChildren: (AriaNode | string)[] = [];
    const buffer: string[] = [];
    for (const child of ariaNode.children || []) {
      if (typeof child === 'string') {
        buffer.push(child);
      } else {
        flushChildren(buffer, normalizedChildren);
        visit(child);
        normalizedChildren.push(child);
      }
    }
    flushChildren(buffer, normalizedChildren);
    ariaNode.children = normalizedChildren.length ? normalizedChildren : [];
    if (ariaNode.children.length === 1 && ariaNode.children[0] === ariaNode.name)
      ariaNode.children = [];
  };
  visit(rootA11yNode);
}

// REMOVED: matchesStringOrRegex — template matching (which is cut)
// REMOVED: matchesTextValue — template matching (which is cut)
// REMOVED: cachedRegex — template matching (which is cut)
// REMOVED: MatcherReceived — template matching (which is cut)
// REMOVED: matchesExpectAriaTemplate — template matching (which is cut)
// REMOVED: getAllElementsMatchingExpectAriaTemplate — template matching (which is cut)
// REMOVED: matchesNode — template matching (which is cut)
// REMOVED: listEqual — template matching (which is cut)
// REMOVED: containsList — template matching (which is cut)
// REMOVED: matchesNodeDeep — template matching (which is cut)

function buildByRefMap(root: AriaNode | undefined, map: Map<string | undefined, AriaNode> = new Map()): Map<string | undefined, AriaNode> {
  if (root?.ref)
    map.set(root.ref, root);
  for (const child of root?.children || []) {
    if (typeof child !== 'string')
      buildByRefMap(child, map);
  }
  return map;
}

function compareSnapshots(ariaSnapshot: AriaSnapshot, previousSnapshot: AriaSnapshot | undefined): Map<AriaNode, 'skip' | 'same' | 'changed'> {
  const previousByRef = buildByRefMap(previousSnapshot?.root);
  const result = new Map<AriaNode, 'skip' | 'same' | 'changed'>();

  // Returns whether ariaNode is the same as previousNode.
  const visit = (ariaNode: AriaNode, previousNode: AriaNode | undefined): boolean => {
    let same: boolean = ariaNode.children.length === previousNode?.children.length && ariaNodesEqual(ariaNode, previousNode);
    let canBeSkipped = same;

    for (let childIndex = 0 ; childIndex < ariaNode.children.length; childIndex++) {
      const child = ariaNode.children[childIndex];
      const previousChild = previousNode?.children[childIndex];
      if (typeof child === 'string') {
        same &&= child === previousChild;
        canBeSkipped &&= child === previousChild;
      } else {
        let previous = typeof previousChild !== 'string' ? previousChild : undefined;
        if (child.ref)
          previous = previousByRef.get(child.ref);
        const sameChild = visit(child, previous);
        // New child, different order of children, or changed child with no ref -
        // we have to include this node to list children in the right order.
        if (!previous || (!sameChild && !child.ref) || (previous !== previousChild))
          canBeSkipped = false;
        same &&= (sameChild && previous === previousChild);
      }
    }

    result.set(ariaNode, same ? 'same' : (canBeSkipped ? 'skip' : 'changed'));
    return same;
  };

  visit(ariaSnapshot.root, previousSnapshot?.root);
  return result;
}

// Chooses only the changed parts of the snapshot and returns them as new roots.
function filterSnapshotDiff(nodes: (AriaNode | string)[], statusMap: Map<AriaNode, 'skip' | 'same' | 'changed'>): (AriaNode | string)[] {
  const result: (AriaNode | string)[] = [];

  const visit = (ariaNode: AriaNode) => {
    const status = statusMap.get(ariaNode);
    if (status === 'same') {
      // No need to render unchanged root at all.
    } else if (status === 'skip') {
      // Only render changed children.
      for (const child of ariaNode.children) {
        if (typeof child !== 'string')
          visit(child);
      }
    } else {
      // Render this node's subtree.
      result.push(ariaNode);
    }
  };

  for (const node of nodes) {
    if (typeof node === 'string')
      result.push(node);
    else
      visit(node);
  }
  return result;
}

export function renderAriaTree(ariaSnapshot: AriaSnapshot, publicOptions: AriaTreeOptions, previousSnapshot?: AriaSnapshot): string {
  const options = toInternalOptions(publicOptions);
  const lines: string[] = [];
  // MODIFIED: removed textContributesInfo and convertToBestGuessRegex references — codegen mode is cut
  const includeText = (_node: AriaNode, _text: string) => true;
  const renderString = (str: string) => str;

  // Do not render the root fragment, just its children.
  let nodesToRender = ariaSnapshot.root.role === 'fragment' ? ariaSnapshot.root.children : [ariaSnapshot.root];

  const statusMap = compareSnapshots(ariaSnapshot, previousSnapshot);
  if (previousSnapshot)
    nodesToRender = filterSnapshotDiff(nodesToRender, statusMap);

  const visitText = (text: string, indent: string) => {
    const escaped = yamlEscapeValueIfNeeded(renderString(text));
    if (escaped)
      lines.push(indent + '- text: ' + escaped);
  };

  const createKey = (ariaNode: AriaNode, renderCursorPointer: boolean): string => {
    let key = ariaNode.role;
    // Yaml has a limit of 1024 characters per key, and we leave some space for role and attributes.
    if (ariaNode.name && ariaNode.name.length <= 900) {
      const name = renderString(ariaNode.name);
      if (name) {
        const stringifiedName = name.startsWith('/') && name.endsWith('/') ? name : JSON.stringify(name);
        key += ' ' + stringifiedName;
      }
    }
    if (ariaNode.checked === 'mixed')
      key += ` [checked=mixed]`;
    if (ariaNode.checked === true)
      key += ` [checked]`;
    if (ariaNode.disabled)
      key += ` [disabled]`;
    if (ariaNode.expanded)
      key += ` [expanded]`;
    if (ariaNode.active && options.renderActive)
      key += ` [active]`;
    if (ariaNode.level)
      key += ` [level=${ariaNode.level}]`;
    if (ariaNode.pressed === 'mixed')
      key += ` [pressed=mixed]`;
    if (ariaNode.pressed === true)
      key += ` [pressed]`;
    if (ariaNode.selected === true)
      key += ` [selected]`;

    if (ariaNode.ref) {
      key += ` [ref=${ariaNode.ref}]`;
      if (renderCursorPointer && hasPointerCursor(ariaNode))
        key += ' [cursor=pointer]';
    }
    return key;
  };

  const getSingleInlinedTextChild = (ariaNode: AriaNode | undefined): string | undefined => {
    return ariaNode?.children.length === 1 && typeof ariaNode.children[0] === 'string' && !Object.keys(ariaNode.props).length ? ariaNode.children[0] : undefined;
  };

  const visit = (ariaNode: AriaNode, indent: string, renderCursorPointer: boolean) => {
    // Replace the whole subtree with a single reference when possible.
    if (statusMap.get(ariaNode) === 'same' && ariaNode.ref) {
      lines.push(indent + `- ref=${ariaNode.ref} [unchanged]`);
      return;
    }

    // When producing a diff, add <changed> marker to all diff roots.
    const isDiffRoot = !!previousSnapshot && !indent;
    const escapedKey = indent + '- ' + (isDiffRoot ? '<changed> ' : '') + yamlEscapeKeyIfNeeded(createKey(ariaNode, renderCursorPointer));
    const singleInlinedTextChild = getSingleInlinedTextChild(ariaNode);

    if (!ariaNode.children.length && !Object.keys(ariaNode.props).length) {
      // Leaf node without children.
      lines.push(escapedKey);
    } else if (singleInlinedTextChild !== undefined) {
      // Leaf node with just some text inside.
      const shouldInclude = includeText(ariaNode, singleInlinedTextChild);
      if (shouldInclude)
        lines.push(escapedKey + ': ' + yamlEscapeValueIfNeeded(renderString(singleInlinedTextChild)));
      else
        lines.push(escapedKey);
    } else {
      // Node with (optional) props and some children.
      lines.push(escapedKey + ':');
      for (const [name, value] of Object.entries(ariaNode.props))
        lines.push(indent + '  - /' + name + ': ' + yamlEscapeValueIfNeeded(value));

      const childIndent = indent + '  ';
      const inCursorPointer = !!ariaNode.ref && renderCursorPointer && hasPointerCursor(ariaNode);
      for (const child of ariaNode.children) {
        if (typeof child === 'string')
          visitText(includeText(ariaNode, child) ? child : '', childIndent);
        else
          visit(child, childIndent, renderCursorPointer && !inCursorPointer);
      }
    }
  };

  for (const nodeToRender of nodesToRender) {
    if (typeof nodeToRender === 'string')
      visitText(nodeToRender, '');
    else
      visit(nodeToRender, '', !!options.renderCursorPointer);
  }
  return lines.join('\n');
}

// REMOVED: convertToBestGuessRegex — codegen mode (which is cut)
// REMOVED: textContributesInfo — codegen mode (which is cut)

const elementSymbol = Symbol('element');

function ariaNodeElement(ariaNode: AriaNode): Element {
  return (ariaNode as any)[elementSymbol];
}

function setAriaNodeElement(ariaNode: AriaNode, element: Element) {
  (ariaNode as any)[elementSymbol] = element;
}

export function findNewElement(from: AriaNode | undefined, to: AriaNode): Element | undefined {
  const node = findNewNode(from, to);
  return node ? ariaNodeElement(node) : undefined;
}
