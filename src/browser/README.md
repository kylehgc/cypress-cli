# src/browser/

> Browser-side utilities shared between the driver spec and injected code.

## Responsibility

This directory holds code that runs in the context of a Cypress test (browser
environment) but is not part of the injected IIFE. It provides:

1. **Ref resolution** — mapping aria snapshot refs to DOM elements and CSS selectors
2. **Snapshot management** — tracking current/previous snapshots for diffs
3. **IIFE lifecycle** — injecting and re-injecting the aria snapshot bundle

## Key Files (planned)

```
browser/
├── index.ts          ← Re-exports for the driver spec
├── refMap.ts         ← Current ref → Element map, ref → selector resolution
├── snapshotManager.ts ← Track current/previous snapshots, trigger IIFE, manage diffs
└── inject.ts         ← IIFE injection and re-injection logic
```

## Why Separate from src/cypress/?

The `src/cypress/` directory contains the driver spec and plugin — files that
are specifically structured for Cypress's test runner and setupNodeEvents.

`src/browser/` contains pure browser-side utilities that could theoretically
be used outside of Cypress (e.g., in a future Playwright integration, or in
browser-based tests). This separation keeps the Cypress-specific wiring
separate from the reusable browser logic.

## Relationship to src/injected/

- `src/injected/` → ported Playwright code, bundled as IIFE, knows nothing
  about Cypress. Runs in page context via `eval()`.
- `src/browser/` → Cypress-aware browser code. Calls the injected API, manages
  the Cypress ↔ snapshot integration. Runs in Cypress's command queue context.

The driver spec (`src/cypress/driver.cy.ts`) imports from `src/browser/` and
uses it to interact with the injected snapshot library.

## Snapshot Lifecycle

```
1. cy.visit(url)
   → New page context, any previous IIFE injection is lost

2. inject.ts: injectSnapshotLib()
   → Checks window.__cypressCliAriaSnapshot
   → If missing, eval(IIFE_STRING) into window

3. snapshotManager.ts: takeSnapshot()
   → Calls window.__cypressCliAriaSnapshot.generateAriaTree()
   → Calls window.__cypressCliAriaSnapshot.renderAriaTree() with previous snapshot
   → Updates current/previous snapshot state
   → Returns YAML string

4. refMap.ts: resolveRef('e5')
   → Looks up 'e5' in current snapshot.elements Map
   → Returns the DOM Element (for cy.wrap)
   → Also computes CSS selector (for codegen)

5. Command executes (e.g., cy.wrap(element).click())

6. Repeat from step 2 (re-inject if navigated, take new snapshot)
```
