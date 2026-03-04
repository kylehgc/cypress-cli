# src/

> Source code for all components.

## Directory Map

| Directory              | Runtime           | Role                                                                                             |
| ---------------------- | ----------------- | ------------------------------------------------------------------------------------------------ |
| [client/](client/)     | Node.js           | CLI entry point. Parses args, connects to daemon socket, sends commands, prints results.         |
| [daemon/](daemon/)     | Node.js           | Persistent server. Listens on Unix socket, manages command queue, starts Cypress via Module API. |
| [cypress/](cypress/)   | Node.js + Browser | Cypress plugin (task handlers) and driver spec (REPL loop in browser).                           |
| [injected/](injected/) | Browser (IIFE)    | Ported Playwright aria snapshot. Bundled by esbuild, eval'd into page context.                   |
| [browser/](browser/)   | Browser (Cypress) | Browser-side utilities: ref resolution, snapshot management, IIFE injection lifecycle.           |
| [codegen/](codegen/)   | Node.js           | Records commands, resolves selectors, exports `.cy.ts` test files.                               |

## Data Flow

```
CLI args → client/ → Unix socket → daemon/ → command queue → cypress/plugin
                                                                    ↕ cy.task
                                                              cypress/driver
                                                                    ↕ cy.window
                                                              browser/ → injected/
```

## Build Targets

- `src/injected/` → esbuild → `dist/injected.iife.js` (browser IIFE)
- Everything else → tsc → `dist/**/*.js` (Node.js ESM)
- `src/cypress/driver.cy.ts` → NOT compiled by tsc (Cypress handles it)
