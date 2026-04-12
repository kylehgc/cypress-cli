# Vendored Cypress Driver Source

- Source: github.com/cypress-io/cypress
- Tag: v14.3.2
- Commit: b2a2c90
- Date: 2026-04-10
- License: MIT

## Modifications from upstream

- vendor layout:
  - moved upstream `packages/driver/src/cypress.ts` to `src/driver/vendor/cypress.ts` so original relative imports continue to resolve
  - copied additional upstream browser-safe files beyond the initial runbook inventory to satisfy the real import graph

- vendored compatibility stubs added:
  - `vendor/cypress/mocha.ts`
  - `vendor/cypress/runner.ts`
  - `vendor/cypress/script_utils.ts`
  - `vendor/cypress/source_map_utils.ts`
  - `vendor/cypress/downloads.ts`
  - `vendor/cypress/server.ts`
  - `vendor/cross-origin/communicator.ts`
  - `vendor/cross-origin/events/cookies.ts`
  - `vendor/cy/net-stubbing/*`
  - `vendor/cy/commands/agents.ts`
  - `vendor/cy/commands/clock.ts`
  - `vendor/cy/commands/cookies.ts`
  - `vendor/cy/commands/debugging.ts`
  - `vendor/cy/commands/exec.ts`
  - `vendor/cy/commands/files.ts`
  - `vendor/cy/commands/fixtures.ts`
  - `vendor/cy/commands/origin.ts`
  - `vendor/cy/commands/request.ts`
  - `vendor/cy/commands/sessions.ts`
  - `vendor/cy/commands/sessions/storage.ts`
  - `vendor/cy/commands/screenshot.ts`
  - `vendor/cy/commands/task.ts`

- vendored patch-level edits:
  - `vendor/cypress/util/to_posix.ts`: export both named and default `toPosix`
  - `vendor/cypress/source_map_utils.ts`: added `getSourcePosition()` stub
  - `vendor/cross-origin/events/cookies.ts`: widened `handleCrossOriginCookies()` signature for vendored call sites
  - `vendor/cy/net-stubbing/aliasing.ts`: added `isDynamicAliasingPossible()`
  - `vendor/cy/net-stubbing/index.ts`: added `addCommand()` export
  - `vendor/cy/net-stubbing/types.ts`: added `RouteMap` type

## Notes

- Core Mocha decoupling in `vendor/cypress/cy.ts`, `vendor/cypress/command_queue.ts`, and `vendor/cy/retries.ts` has not happened yet.
- Current strategy favors thin compatibility shims first so the bundle can build and boot can be tested in-browser before larger upstream edits are made.
