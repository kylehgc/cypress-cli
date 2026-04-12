# Roadmap: Feature Parity with playwright-cli

> Tracking issue list for reaching feature parity with
> [`playwright-cli`](https://github.com/microsoft/playwright-cli) while
> targeting Cypress test generation.

## Context

Playwright has split its AI tooling into two projects:

- **`@playwright/mcp`** — MCP server for persistent agentic loops
- **`@playwright/cli`** — CLI + SKILLS for coding agents (recommended for test
  generation)

This project (`cypress-cli`) targets the same CLI + SKILLS model but for
**Cypress test generation**. Command naming follows Cypress conventions since the
goal is producing idiomatic Cypress tests.

This roadmap tracks issues #43–#81 (see tiers below).

## Priority Tiers

| Tier   | Description                 | Focus                                                            |
| ------ | --------------------------- | ---------------------------------------------------------------- |
| **P0** | Foundation — do these first | Feasibility research, AI agent integration surface, output model |
| **P1** | Core command parity         | Commands an AI agent commonly needs for test generation          |
| **P2** | DevTools & storage          | Debugging, state management, network mocking                     |
| **P3** | Advanced / nice-to-have     | Low-level primitives, session config, test infrastructure        |

## P0 — Foundation

| #   | Issue                                                                                                                       | Labels       | Summary                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------- |
| #43 | [Feasibility audit: Cypress capability matrix vs playwright-cli commands](https://github.com/kylehgc/cypress-cli/issues/43) | P0, research | ✅ Document which playwright-cli commands are feasible in Cypress |
| #44 | [Implement SKILL file and install --skills command](https://github.com/kylehgc/cypress-cli/issues/44)                       | P0, infra    | ✅ Primary AI agent integration surface (PR #92)                  |
| #45 | [Snapshot-to-file output model](https://github.com/kylehgc/cypress-cli/issues/45)                                           | P0, infra    | ✅ Write snapshots to `.cypress-cli/*.yml` files, return paths    |
| #46 | [Inline codegen output per command](https://github.com/kylehgc/cypress-cli/issues/46)                                       | P0, infra    | ✅ Return generated Cypress code with each command response       |
| #47 | [Operational readiness](https://github.com/kylehgc/cypress-cli/issues/47)                                                   | P0, infra    | ✅ .nvmrc, pretest build, ESLint cleanup, README, npm link        |
| #66 | [Validate cypress-cli with real LLM-driven test generation](https://github.com/kylehgc/cypress-cli/issues/66)               | P0, testing  | Have an actual LLM drive the tool end-to-end, file issues found   |
| #68 | [Cross-origin redirects break active sessions](https://github.com/kylehgc/cypress-cli/issues/68)                            | P0, bug      | ✅ `chromeWebSecurity: false` fix (#79)                           |
| #72 | [Assert command cannot check form input values](https://github.com/kylehgc/cypress-cli/issues/72)                           | P0, bug      | ✅ **FIXED** (PR #74)                                             |
| #76 | [Cypress command errors crash session](https://github.com/kylehgc/cypress-cli/issues/76)                                    | P0, bug      | ✅ Three-layer error recovery (PR #84)                            |
| #78 | [Wire up snapshot diff infrastructure](https://github.com/kylehgc/cypress-cli/issues/78)                                    | P0, infra    | ✅ Diff code wired up — action commands return diffs              |
| #79 | [Add testIsolation: false and chromeWebSecurity: false to config](https://github.com/kylehgc/cypress-cli/issues/79)         | P0, infra    | ✅ Prerequisite for #76 error recovery and #68 cross-origin fix   |

### Suggested order

All P0 items are complete except #66 (LLM validation), which is an ongoing
validation activity rather than a code change.

## P1 — Core Command Parity

| #   | Issue                                                                                                 | Labels      | Cypress API                                 |
| --- | ----------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------- |
| #48 | [eval command](https://github.com/kylehgc/cypress-cli/issues/48)                                      | P1, command | ✅ `cy.window().then(win => win.eval(...))` |
| #49 | [fill command](https://github.com/kylehgc/cypress-cli/issues/49)                                      | P1, command | ✅ `cy.get(sel).clear().type(text)`         |
| #50 | [dialog-accept / dialog-dismiss](https://github.com/kylehgc/cypress-cli/issues/50)                    | P1, command | ✅ `cy.on('window:confirm', ...)`           |
| #51 | [resize command](https://github.com/kylehgc/cypress-cli/issues/51)                                    | P1, command | ✅ `cy.viewport(w, h)`                      |
| #52 | [screenshot command](https://github.com/kylehgc/cypress-cli/issues/52)                                | P1, command | ✅ `cy.screenshot()`                        |
| #53 | [drag command](https://github.com/kylehgc/cypress-cli/issues/53)                                      | P1, command | ✅ trigger chain or plugin                  |
| #54 | [upload command](https://github.com/kylehgc/cypress-cli/issues/54)                                    | P1, command | ✅ `cy.get(sel).selectFile(path)`           |
| #55 | [Command aliases: close, goto, go-back, go-forward](https://github.com/kylehgc/cypress-cli/issues/55) | P1, command | ✅ Aliases for existing commands            |

| #73 | [Long-running real-world validation](https://github.com/kylehgc/cypress-cli/issues/73) | P1, testing | Side-by-side comparison with playwright-cli |
| #80 | [Ref counter grows unboundedly in long sessions](https://github.com/kylehgc/cypress-cli/issues/80) | P1, bug | ✅ Reset ref counter per snapshot (PR #87) |

P1 issues are all complete except #73 (long-running validation).

## P2 — DevTools & Storage

| #   | Issue                                                                                      | Labels      | Cypress API                                          |
| --- | ------------------------------------------------------------------------------------------ | ----------- | ---------------------------------------------------- |
| #56 | [Cookie management commands](https://github.com/kylehgc/cypress-cli/issues/56)             | P2, command | ✅ `cy.getCookie()`, `cy.setCookie()`, etc.          |
| #57 | [localStorage / sessionStorage commands](https://github.com/kylehgc/cypress-cli/issues/57) | P2, command | ✅ `cy.window().then(win => win.localStorage.*)`     |
| #58 | [console command](https://github.com/kylehgc/cypress-cli/issues/58)                        | P2, command | ✅ `Cypress.on('window:before:load', ...)`           |
| #59 | [Network monitoring and route mocking](https://github.com/kylehgc/cypress-cli/issues/59)   | P2, command | ✅ `cy.intercept()`                                  |
| #60 | [state-save / state-load commands](https://github.com/kylehgc/cypress-cli/issues/60)       | P2, command | ✅ Cookies + localStorage serialization              |
| #61 | [run-code command](https://github.com/kylehgc/cypress-cli/issues/61)                       | P2, command | ✅ `cy.window().then(win => win.eval(...))` (PR #93) |
| #77 | [cyrun command](https://github.com/kylehgc/cypress-cli/issues/77)                          | P2, command | ✅ Execute arbitrary Cypress chains                  |
| #81 | [run command](https://github.com/kylehgc/cypress-cli/issues/81)                            | P2, command | ✅ Execute generated test files and report results   |

## P3 — Advanced

| #   | Issue                                                                                      | Labels      | Notes                                               |
| --- | ------------------------------------------------------------------------------------------ | ----------- | --------------------------------------------------- |
| #62 | [Keyboard/mouse primitives](https://github.com/kylehgc/cypress-cli/issues/62)              | P3, command | `cy.trigger()` — synthetic events, limited fidelity |
| #63 | [delete-data and browser config on open](https://github.com/kylehgc/cypress-cli/issues/63) | P3, command | Session cleanup, --browser, --config verification   |
| #64 | [AI agent end-to-end test harness](https://github.com/kylehgc/cypress-cli/issues/64)       | P3, testing | Simulate full AI agent workflow                     |

## Known Limitations vs playwright-cli

These are architectural constraints of Cypress that cannot be worked around:

| Feature                   | playwright-cli                                   | cypress-cli             | Reason                                                          |
| ------------------------- | ------------------------------------------------ | ----------------------- | --------------------------------------------------------------- |
| Multi-tab                 | `tab-list`, `tab-new`, `tab-select`, `tab-close` | Not feasible            | Cypress cannot control multiple tabs                            |
| Named sessions            | `-s=name` concurrent sessions                    | Single session          | Each session needs separate Cypress+Electron process            |
| PDF generation            | `pdf` command                                    | Not feasible            | Cypress has no PDF API                                          |
| Mid-session tracing       | `tracing-start`, `tracing-stop`                  | Config-level only       | Cypress video/tracing is config, not runtime                    |
| Mid-session video         | `video-start`, `video-stop`                      | Config-level only       | Same as tracing                                                 |
| Native input events       | Direct CDP keyboard/mouse                        | Synthetic DOM events    | Cypress uses `cy.trigger()`, not CDP                            |
| Session dashboard         | `show` command with live preview                 | Not planned             | Would require significant UI infrastructure                     |
| Browser extension connect | `open --extension`                               | Not applicable          | Cypress manages its own browser lifecycle                       |
| Cross-origin (Firefox)    | Transparent                                      | Chromium only           | `chromeWebSecurity: false` is Chromium-only; Firefox ignores it |
| Error recovery            | try/catch on any command                         | Pre-flight + safety net | Cypress commands can't be caught; requires validation layer     |

## Comparison: Current Command Set

### Implemented (65 commands, 69 registry entries with aliases)

| Category       | Commands                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Core           | `open`, `repl`, `stop`, `status`, `install`, `snapshot`                                                                        |
| Navigation     | `navigate`, `back`, `forward`, `reload`                                                                                        |
| Interaction    | `click`, `dblclick`, `rightclick`, `type`, `clear`, `check`, `uncheck`, `select`, `focus`, `blur`, `scrollto`, `hover`, `fill` |
| Keyboard       | `press`                                                                                                                        |
| Assertion      | `assert`, `asserturl`, `asserttitle`                                                                                           |
| Execution      | `run-code`, `eval`, `cyrun`, `run`                                                                                             |
| Export         | `export`, `history`, `undo`                                                                                                    |
| Wait           | `wait`, `waitfor`                                                                                                              |
| Network        | `intercept`, `waitforresponse`, `unintercept`, `intercept-list`, `network`                                                     |
| Cookies        | `cookie-list`, `cookie-get`, `cookie-set`, `cookie-delete`, `cookie-clear`                                                     |
| State          | `state-save`, `state-load`                                                                                                     |
| localStorage   | `localstorage-list`, `localstorage-get`, `localstorage-set`, `localstorage-delete`, `localstorage-clear`                       |
| sessionStorage | `sessionstorage-list`, `sessionstorage-get`, `sessionstorage-set`, `sessionstorage-delete`, `sessionstorage-clear`             |
| DevTools       | `console`, `screenshot`                                                                                                        |
| Page           | `drag`, `upload`, `dialog-accept`, `dialog-dismiss`, `resize`                                                                  |
| Aliases        | `close` → `stop`, `goto` → `navigate`, `go-back` → `back`, `go-forward` → `forward`                                            |

### Not Planned (P3 / Infeasible)

The following are tracked in open issues but not prioritized for initial release:

- `keydown`, `keyup`, `mousemove`, `mousedown`, `mouseup`, `mousewheel` — P3, synthetic events only (#62)
- `delete-data`, browser config on open — P3 (#63)
