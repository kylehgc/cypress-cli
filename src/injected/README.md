# src/injected/

> Playwright's aria snapshot code, ported and bundled as a self-contained IIFE
> for injection into the browser page via `cy.window().then(win => eval(...))`.

## Responsibility

This code runs in the **browser page context** (not Node.js, not Cypress
command queue). It:

1. Walks the entire DOM tree
2. Computes ARIA roles and accessible names for every element
3. Builds a structured `AriaNode` tree
4. Assigns `[ref=eN]` identifiers to interactable elements
5. Renders the tree as YAML text
6. Computes incremental diffs between consecutive snapshots

The output is what the LLM reads to understand the page.

## Key Files (planned)

```
injected/
├── index.ts          ← Public API exported by the IIFE
├── ariaSnapshot.ts   ← DOM walker, tree builder, YAML renderer, diffs
├── roleUtils.ts      ← ARIA role computation, accessible name algorithm
├── domUtils.ts       ← Visibility, geometry, computed styles
├── types.ts          ← AriaNode, AriaRole, AriaProps, AriaBox
├── comparison.ts     ← ariaNodesEqual, hasPointerCursor, findNewNode
├── cssTokenizer.ts   ← CSS tokenizer for content: property parsing
├── stringUtils.ts    ← normalizeWhiteSpace
└── yaml.ts           ← YAML key/value escaping
```

## Origin

All files are ported from Playwright (Apache 2.0 licensed):

| Our File        | Playwright Source                                                                |
| --------------- | -------------------------------------------------------------------------------- |
| ariaSnapshot.ts | `packages/injected/src/ariaSnapshot.ts`                                          |
| roleUtils.ts    | `packages/injected/src/roleUtils.ts`                                             |
| domUtils.ts     | `packages/injected/src/domUtils.ts`                                              |
| types.ts        | `packages/playwright-core/src/utils/isomorphic/ariaSnapshot.ts` (types only)     |
| comparison.ts   | `packages/playwright-core/src/utils/isomorphic/ariaSnapshot.ts` (functions only) |
| cssTokenizer.ts | `packages/playwright-core/src/utils/isomorphic/cssTokenizer.ts`                  |
| stringUtils.ts  | `packages/playwright-core/src/utils/isomorphic/stringUtils.ts`                   |
| yaml.ts         | `packages/playwright-core/src/utils/isomorphic/yaml.ts`                          |

See `docs/ARIA_SNAPSHOT_PORT.md` for the detailed line-by-line keep/cut analysis.

## Build

esbuild bundles this directory into a single IIFE:

```bash
esbuild src/injected/index.ts \
  --bundle \
  --format=iife \
  --global-name=__cypressCliAriaSnapshot \
  --outfile=dist/injected.iife.js \
  --platform=browser \
  --target=es2022
```

The output is a single JavaScript string that, when `eval()`'d in a browser
window, creates `window.__cypressCliAriaSnapshot` with the public API.

## Public API (exposed on window)

```typescript
window.__cypressCliAriaSnapshot = {
  generateAriaTree(
    rootElement: Element,
    options: { mode: 'ai'; refPrefix?: string; doNotRenderActive?: boolean }
  ): AriaSnapshot,

  renderAriaTree(
    snapshot: AriaSnapshot,
    options: { mode: 'ai' },
    previousSnapshot?: AriaSnapshot
  ): string,
};
```

- `generateAriaTree` — walks DOM, returns structured snapshot with element map
- `renderAriaTree` — converts snapshot to YAML string. If `previousSnapshot` is
  provided, renders only the diff.

## Browser Compatibility

This code uses standard DOM APIs:

- `getComputedStyle()`
- `getBoundingClientRect()`
- `getAttribute()`, `querySelector()`
- `TreeWalker`
- `Element.matches()`

No browser-specific APIs. No CDP. No Chrome DevTools Protocol.

Works in all browsers Cypress supports (Chrome, Firefox, Edge, Electron).

## CSP Considerations

Cypress patches Content Security Policy headers to allow `eval()` and inline
scripts. This means our IIFE injection via `win.eval()` works even on pages
with strict CSP. This is a Cypress feature, not something we need to handle.

## Why Not Use MutationObserver / Live Updates?

We take snapshots on-demand (before and after each command) rather than
watching for DOM changes continuously. Reasons:

1. **Simplicity**: snapshot-on-demand is stateless. No observer lifecycle to
   manage, no event deduplication, no debouncing.
2. **Determinism**: the snapshot is taken at a known point in time (after
   Cypress has finished executing the command and its retry/wait logic).
3. **Token efficiency**: continuous updates would flood the LLM with irrelevant
   intermediate states. We only care about the state before and after commands.
