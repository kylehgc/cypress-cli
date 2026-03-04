# Aria Snapshot Port Plan

> Detailed plan for porting Playwright's aria snapshot code to work inside
> Cypress browser context, injected as an IIFE via `cy.window().then(win => eval(...))`.

## Source Files in Playwright

All paths relative to `playwright/packages/`:

| File                                                   | Lines     | Role                                                           |
| ------------------------------------------------------ | --------- | -------------------------------------------------------------- |
| `injected/src/ariaSnapshot.ts`                         | 748       | DOM walker, tree builder, YAML renderer, incremental diffs     |
| `playwright-core/src/utils/isomorphic/ariaSnapshot.ts` | 580       | Types (AriaNode, AriaRole, etc.), template parsing, comparison |
| `injected/src/roleUtils.ts`                            | 1,235     | ARIA role computation, accessible name calculation             |
| `injected/src/domUtils.ts`                             | 175       | Visibility, geometry, computed styles                          |
| `playwright-core/src/utils/isomorphic/cssTokenizer.ts` | 966       | CSS tokenizer for `content:` property parsing                  |
| `playwright-core/src/utils/isomorphic/stringUtils.ts`  | 195       | String normalization, regex escaping                           |
| `playwright-core/src/utils/isomorphic/yaml.ts`         | 94        | YAML key/value escaping                                        |
| **Total**                                              | **3,993** |                                                                |

## What We Keep vs Cut

### ariaSnapshot.ts (injected) — 748 → ~588 lines

#### KEEP: Core tree generation (lines 1–340)

Everything from imports through `normalizeGenericRoles()`. This is the DOM
walker that builds the `AriaNode` tree. Functions:

- `generateAriaTree()` — Entry point. Takes root element + options, returns
  `AriaSnapshot` with tree, element map, and ref map.
- `visit()` / `processElement()` — Recursive DOM walker. For each element:
  computes ARIA role, accessible name, builds `AriaNode`, assigns refs.
- `computeAriaRef()` — Assigns `[ref=eN]` to interactable elements (links,
  buttons, inputs, etc.) in AI mode.
- `normalizeStringChildren()` — Collapses adjacent text nodes.
- `normalizeGenericRoles()` — Removes trivial generic wrappers that add no
  semantic value.
- `toInternalOptions()` — Converts public `AriaTreeOptions` to internal config.

**Port note**: We only need the `'ai'` mode branch of `toInternalOptions()`.
The `'expect'`, `'codegen'`, and `'autoexpect'` branches can be removed, but
keeping them is harmless (~20 lines) and may be useful for future features.

#### KEEP: Incremental diff system (lines 471–558)

- `buildByRefMap()` — Builds ref → AriaNode lookup from a previous snapshot.
- `compareSnapshots()` — Walks both trees, marks nodes as `'same'`, `'skip'`,
  or `'changed'` by comparing via `ariaNodesEqual()`.
- `filterSnapshotDiff()` — Filters the tree to only include changed subtrees.
  Changed roots get a `<changed>` marker. Unchanged subtrees with refs get
  collapsed to `ref=eN [unchanged]`.

This is critical for keeping LLM token usage low. After "click the login
button", instead of re-sending the entire 500-line page tree, we send only the
10 lines that changed.

#### KEEP: YAML renderer (lines 570–680)

- `renderAriaTree()` — Walks the `AriaNode` tree and produces YAML lines.
  Handles inline text children, props, attributes (`[checked]`, `[disabled]`,
  `[expanded]`, `[active]`, `[selected]`, `[level=N]`, `[pressed]`), and ref
  annotations. This is what the LLM actually reads.

Sample output:

```yaml
- navigation "Main":
    - list:
        - listitem:
            - link "Home" [ref=e1]
        - listitem:
            - link "About" [ref=e2] [cursor=pointer]
        - listitem:
            - link "Contact" [ref=e3]
- main:
    - heading "Welcome" [level=1]
    - textbox "Email" [ref=e4]
    - textbox "Password" [ref=e5]
    - button "Sign In" [ref=e6]
```

#### KEEP: Element resolution (lines 731–748)

- `findNewElement()` — Given a before/after snapshot pair, finds elements that
  are new in the "after" tree. Used for detecting what appeared after a command.
- `ariaNodeElement()` / `setAriaNodeElement()` — Symbol-based element↔node
  mapping. Allows resolving `ref=e5` back to the actual DOM element.

#### CUT: Template matching (lines 341–470) — ~130 lines

- `matchesExpectAriaTemplate()` — Matches an `AriaNode` tree against an
  `AriaTemplateNode` (parsed from a YAML assertion string).
- `matchesNode()` — Recursive node-by-node comparison for assertion matching.
- `matchesNodeDeep()` — Deep search variant: find any subtree matching a
  template.

**Why cut**: These implement Playwright's `expect(locator).toMatchAriaSnapshot()`
assertion. We generate snapshots; we never match them against templates. The
assertion system is Playwright-specific.

#### CUT: Codegen regex heuristics (lines 681–730) — ~50 lines

- `convertToBestGuessRegex()` — Replaces dynamic content (UUIDs, numbers, dates)
  with regex patterns. Used by `codegen` mode to generate snapshot assertions
  that tolerate dynamic values.
- `textContributesInfo()` — Decides if a text node adds information beyond the
  accessible name. Only used when `renderStringsAsRegex` is true.

**Why cut**: We render plain text for LLM consumption, not regex patterns for
assertion code. If we later want codegen-mode snapshots, we can add these back.

### ariaSnapshot.ts (isomorphic) — 580 → ~95 lines

#### KEEP: Types and comparison (lines 1–80)

- `AriaRole` type — Union of all WAI-ARIA 1.2 roles.
- `AriaProps` type — `checked`, `disabled`, `expanded`, `active`, `level`,
  `pressed`, `selected`.
- `AriaBox` type — `visible`, `inline`, `cursor`.
- `AriaNode` type — Full node type combining role, name, ref, children, box,
  props.
- `ariaNodesEqual()` — Structural equality check (role, name, props, cursor).
  Used by `compareSnapshots()`.
- `hasPointerCursor()` — Checks `box.cursor === 'pointer'`.
- `ariaPropsEqual()` — Property-level equality.

#### KEEP: findNewNode (lines 531–580)

- `findNewNode()` — Heuristic to find elements in `to` snapshot that don't
  exist in `from` snapshot, prioritizing large elements near the top of the
  page. Used by `findNewElement()`.

#### CUT: Template types (lines 81–115) — ~35 lines

- `AriaRegex`, `AriaTextValue`, `AriaTemplateTextNode`, `AriaTemplateRoleNode`,
  `AriaTemplateNode` — Types for parsed assertion templates.

**Why cut**: Only used by `parseAriaSnapshot()` and `matchesExpectAriaTemplate()`,
both of which are cut.

#### CUT: Template parsing (lines 116–530) — ~415 lines

- `parseAriaSnapshotUnsafe()` / `parseAriaSnapshot()` — Parses YAML aria
  snapshot strings into `AriaTemplateNode` trees. Uses the `yaml` npm package
  for YAML parsing.
- `KeyParser` class (~180 lines) — Hand-written parser for YAML map keys like
  `button "Submit" [checked] [disabled]`. Supports quoted strings, regex
  literals, attribute brackets.
- `convertSeq()`, `convertMap()` — YAML document → template tree conversion.
- `textValue()`, `normalizeWhitespace()` — Template-specific text handling.

**Why cut**: This is the assertion-matching input parser. We generate YAML
output; we never parse YAML input back into a tree. Cutting this also eliminates
the `yaml` npm package as a dependency.

### roleUtils.ts — 1,235 lines — KEEP ALL

This is the ARIA specification implementation. Every function contributes to
computing the correct role and accessible name for a DOM element.

Key functions:

- `getAriaRole()` — Resolves element → ARIA role, considering explicit
  `role` attribute, implicit roles (e.g., `<button>` → `button`), and
  presentation/none handling.
- `getElementAccessibleName()` — Implements the [Accessible Name Computation
  algorithm](https://www.w3.org/TR/accname-1.2/). Walks `aria-labelledby`,
  `aria-label`, native label associations, `title`, `placeholder`, CSS
  `content:`, and text content.
- `getAriaLabelledByElements()` — Resolves `aria-labelledby` IDREF list.
- `getCSSContent()` — Extracts accessible text from `::before`/`::after`
  pseudo-elements by parsing CSS `content:` property values.
- `allowsNameFromContent()` — Determines if a role allows name computation
  from descendant text content.

**Port note**: This file imports `cssTokenizer.ts` and `domUtils.ts`. All three
files must be ported together as a unit.

### domUtils.ts — 175 lines — KEEP ALL

- `isElementVisible()` — Checks CSS visibility, display, opacity, dimensions.
- `computeBox()` — Returns bounding rect + inline/block + cursor style.
- `getElementComputedStyle()` — Wrapper for `getComputedStyle()` with caching.

### cssTokenizer.ts — 966 lines — KEEP ALL

Full CSS tokenizer implementing the CSS Syntax Module Level 3 spec. Used solely
by `roleUtils.getCSSContent()` → `parseCSSContentPropertyAsString()` to parse
`content: "text" attr(data-label) / "alt text"` property values.

This is the largest single file. It has **zero external dependencies** — it's a
self-contained tokenizer. While 966 lines feels heavy, it's needed for correct
accessible name computation on elements that derive their name from CSS
`::before`/`::after` content (more common than you'd think — icon buttons, badge
counts, decorative labels).

**Port note**: Copy verbatim. It's pure computation with no DOM/browser/Node
dependencies.

### stringUtils.ts — 195 → ~115 lines

#### KEEP:

- `normalizeWhiteSpace()` — Collapses whitespace runs. Used throughout tree
  generation.

#### CUT:

- `escapeRegExp()` — Only used by `convertToBestGuessRegex()` (which is cut).
- `longestCommonSubstring()` — Only used by `textContributesInfo()` (which is
  cut).

### yaml.ts — 94 lines — KEEP ALL

- `yamlEscapeKeyIfNeeded()` — Escapes YAML keys that would be misinterpreted
  (reserved words, special characters).
- `yamlEscapeValueIfNeeded()` — Escapes YAML values.

Used by `renderAriaTree()`. Tiny, self-contained, no dependencies.

## Summary Table

| File                         | Original  | After Port | Delta    |
| ---------------------------- | --------- | ---------- | -------- |
| ariaSnapshot.ts (injected)   | 748       | ~588       | -160     |
| ariaSnapshot.ts (isomorphic) | 580       | ~95        | -485     |
| roleUtils.ts                 | 1,235     | 1,235      | 0        |
| domUtils.ts                  | 175       | 175        | 0        |
| cssTokenizer.ts              | 966       | 966        | 0        |
| stringUtils.ts               | 195       | ~115       | -80      |
| yaml.ts                      | 94        | 94         | 0        |
| **Total**                    | **3,993** | **~3,268** | **-725** |

## Port Strategy

### Step 1: Copy and reorganize

```
src/injected/
├── ariaSnapshot.ts     ← From injected/src/ariaSnapshot.ts (trimmed)
├── roleUtils.ts        ← From injected/src/roleUtils.ts (verbatim)
├── domUtils.ts         ← From injected/src/domUtils.ts (verbatim)
├── types.ts            ← AriaNode, AriaRole, AriaProps, AriaBox from isomorphic
├── comparison.ts       ← ariaNodesEqual, hasPointerCursor, findNewNode from isomorphic
├── cssTokenizer.ts     ← From isomorphic/cssTokenizer.ts (verbatim)
├── stringUtils.ts      ← From isomorphic/stringUtils.ts (trimmed)
├── yaml.ts             ← From isomorphic/yaml.ts (verbatim)
└── index.ts            ← Public API: generateAriaTree, renderAriaTree, AriaSnapshot
```

**Why reorganize instead of keeping Playwright's `injected` vs `isomorphic`
split?** Playwright splits these because `isomorphic` code runs in both Node.js
and browser contexts (used by both the injected bundle and the test runner). We
only run this code in the browser (injected IIFE), so the split adds confusion
without benefit.

### Step 2: Fix imports

Playwright uses path aliases (`@isomorphic/ariaSnapshot`, `@isomorphic/stringUtils`).
We'll use relative imports since everything lives in one directory.

### Step 3: Add entry point

Create `src/injected/index.ts` that exports the public API:

```typescript
export { generateAriaTree, renderAriaTree } from './ariaSnapshot.js';
export type { AriaSnapshot, AriaTreeOptions } from './ariaSnapshot.js';
export type { AriaNode, AriaRole, AriaProps, AriaBox } from './types.js';
```

### Step 4: Build as IIFE

esbuild bundles `src/injected/index.ts` into a single IIFE file:

```javascript
// esbuild.config.ts
import { build } from 'esbuild';

await build({
	entryPoints: ['src/injected/index.ts'],
	bundle: true,
	format: 'iife',
	globalName: 'cypressCliAriaSnapshot',
	outfile: 'dist/injected.iife.js',
	platform: 'browser',
	target: 'es2022',
});
```

The driver spec reads this file at build time (embedded as a string constant) or
at runtime (`fs.readFileSync`), then injects it via:

```typescript
cy.window().then((win) => {
	win.eval(INJECTED_IIFE_STRING);
	const snapshot = win.cypressCliAriaSnapshot.generateAriaTree(
		win.document.documentElement,
		{ mode: 'ai' },
	);
	const yaml = win.cypressCliAriaSnapshot.renderAriaTree(snapshot, {
		mode: 'ai',
	});
	return { yaml, snapshot };
});
```

### Step 5: Adapt for Cypress context

Playwright's injected code assumes it runs in an isolated world (separate JS
context from the page). In Cypress, `cy.window()` gives access to the **page's
own** `window` object.

Changes needed:

- The IIFE must not collide with page globals. Using `globalName: 'cypressCliAriaSnapshot'`
  namespaces it. Alternatively, we can use a closure pattern that returns the API
  object without polluting `window`.
- Element references (the `Map<string, Element>` in `AriaSnapshot.elements`) are
  live DOM references. They remain valid as long as the elements are in the DOM.
  After navigation (`cy.visit()`), all refs are invalidated — the driver spec
  must regenerate the snapshot.
- The IIFE must be re-injected after any full page navigation since `cy.visit()`
  creates a new window context.

### Step 6: Verify parity

Write tests that compare our ported snapshot output against Playwright's output
for the same HTML. See `docs/TEST_PLAN.md` for specific test cases.

## Licensing

All ported code is from Playwright, which is Apache 2.0 licensed. We must:

1. Keep the original copyright header on all ported files
2. Add our own copyright header below it
3. Include Playwright's LICENSE in a `THIRD_PARTY_LICENSES` file
4. Note the derivation in our README

```typescript
/**
 * Copyright (c) Microsoft Corporation.
 * Licensed under the Apache License, Version 2.0.
 *
 * Ported from Playwright (https://github.com/microsoft/playwright)
 * Modified for cypress-cli by [contributors].
 */
```
