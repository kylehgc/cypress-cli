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
import type { AriaNode, AriaProps } from './types.js';

export function ariaNodesEqual(a: AriaNode, b: AriaNode): boolean {
  if (a.role !== b.role || a.name !== b.name)
    return false;
  if (!ariaPropsEqual(a, b) || hasPointerCursor(a) !== hasPointerCursor(b))
    return false;
  const aKeys = Object.keys(a.props);
  const bKeys = Object.keys(b.props);
  return aKeys.length === bKeys.length && aKeys.every(k => a.props[k] === b.props[k]);
}

export function hasPointerCursor(ariaNode: AriaNode): boolean {
  return ariaNode.box.cursor === 'pointer';
}

function ariaPropsEqual(a: AriaProps, b: AriaProps): boolean {
  return a.active === b.active && a.checked === b.checked && a.disabled === b.disabled && a.expanded === b.expanded && a.selected === b.selected && a.level === b.level && a.pressed === b.pressed;
}

// REMOVED: parseAriaSnapshotUnsafe — template parsing (which is cut)
// REMOVED: parseAriaSnapshot — template parsing (which is cut)
// REMOVED: KeyParser — template parsing (which is cut)
// REMOVED: ParserError — template parsing (which is cut)
// REMOVED: textValue — template parsing (which is cut)
// REMOVED: normalizeWhitespace — template-specific (which is cut)

export function findNewNode(from: AriaNode | undefined, to: AriaNode): AriaNode | undefined {
  type ByRoleAndName = Map<string, Map<string, { node: AriaNode, sizeAndPosition: number }>>;

  function fillMap(root: AriaNode, map: ByRoleAndName, position: number) {
    let size = 1;
    let childPosition = position + size;
    for (const child of root.children || []) {
      if (typeof child === 'string') {
        size++;
        childPosition++;
      } else {
        const childSize = fillMap(child, map, childPosition);
        size += childSize;
        childPosition += childSize;
      }
    }
    if (!['none', 'presentation', 'fragment', 'iframe', 'generic'].includes(root.role) && root.name) {
      let byRole = map.get(root.role);
      if (!byRole) {
        byRole = new Map();
        map.set(root.role, byRole);
      }
      const existing = byRole.get(root.name);
      // This heuristic prioritizes elements at the top of the page, even if somewhat smaller.
      const sizeAndPosition = size * 100 - position;
      if (!existing || existing.sizeAndPosition < sizeAndPosition)
        byRole.set(root.name, { node: root, sizeAndPosition });
    }
    return size;
  }

  const fromMap: ByRoleAndName = new Map();
  if (from)
    fillMap(from, fromMap, 0);

  const toMap: ByRoleAndName = new Map();
  fillMap(to, toMap, 0);

  const result: { node: AriaNode, sizeAndPosition: number }[] = [];
  for (const [role, byRole] of toMap) {
    for (const [name, byName] of byRole) {
      const inFrom = fromMap.get(role)?.get(name);
      if (!inFrom)
        result.push(byName);
    }
  }
  result.sort((a, b) => b.sizeAndPosition - a.sizeAndPosition);
  return result[0]?.node;
}
