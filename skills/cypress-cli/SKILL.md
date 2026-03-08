---
name: cypress-cli
description: Automates live browser interactions through Cypress for test generation. Use this when you need to navigate a page, inspect an aria snapshot, interact with elements by ref, assert behavior, and export a Cypress test file.
allowed-tools: Bash(cypress-cli:*)
---

# Browser Automation with cypress-cli

Use `cypress-cli` when you need to drive a real browser through Cypress and turn
the interaction history into Cypress test code.

## Quick start

```bash
# Start a session and open a page
cypress-cli open https://example.cypress.io/commands/actions

# Capture the current aria snapshot and inspect refs
cypress-cli snapshot

# Interact using refs from the snapshot
cypress-cli type e40 "hello@example.com"
cypress-cli click e45

# Export the recorded interaction history as a Cypress test
cypress-cli export --file generated/actions.cy.ts

# Stop the session when finished
cypress-cli stop
```

## How to read snapshots

After `open`, `snapshot`, and most interaction commands, the CLI returns a YAML
aria snapshot. Elements may include handles like `[ref=e40]`.

```yaml
- main:
  - heading "Actions" [level=1] [ref=e1]
  - textbox "Email" [ref=e40]
  - button "Submit" [ref=e45]
```

- `ref=eN` is the handle to pass to commands like `click`, `type`, `assert`, or
  `waitfor`.
- Refs come from the current snapshot only. When the page changes, take a new
  snapshot before reusing a ref.
- Snapshot YAML is the primary agent-facing DOM representation. Prefer it over
  screenshots for navigation and element targeting.

## Command reference

### Available now

#### Core

```bash
cypress-cli open [url]
cypress-cli stop
cypress-cli status
cypress-cli install --skills
cypress-cli snapshot [--diff] [--filename path]
```

#### Navigation

```bash
cypress-cli navigate <url>
cypress-cli back
cypress-cli forward
cypress-cli reload
```

#### Interaction

```bash
cypress-cli click <ref> [--force] [--multiple]
cypress-cli dblclick <ref> [--force]
cypress-cli rightclick <ref> [--force]
cypress-cli type <ref> <text> [--delay ms] [--force]
cypress-cli clear <ref> [--force]
cypress-cli check <ref> [--force]
cypress-cli uncheck <ref> [--force]
cypress-cli select <ref> <value> [--force]
cypress-cli focus <ref>
cypress-cli blur <ref>
cypress-cli scrollto <ref|position> [--duration ms]
cypress-cli hover <ref> [--force]
```

#### Keyboard

```bash
cypress-cli press <key>
```

#### Assertions

```bash
cypress-cli assert <ref> <chainer> [value]
cypress-cli asserturl <chainer> <value>
cypress-cli asserttitle <chainer> <value>
```

#### Wait and export

```bash
cypress-cli wait <ms>
cypress-cli waitfor <ref> [--timeout ms]
cypress-cli export [--file path] [--format ts|js] [--describe name] [--it name] [--baseUrl url]
cypress-cli history
cypress-cli undo
```

### Planned commands (roadmap only — do not invoke until implemented)

These commands are planned for parity with `playwright-cli`, but are not part of
the current release. If you need them, explain that support is planned rather
than pretending they exist.

```bash
# Additional interaction and utility commands
eval, fill, drag, upload, screenshot, resize, dialog-accept, dialog-dismiss

# Aliases
close, goto, go-back, go-forward

# Storage
state-save, state-load
cookie-list, cookie-get, cookie-set, cookie-delete, cookie-clear
localstorage-list, localstorage-get, localstorage-set, localstorage-delete, localstorage-clear
sessionstorage-list, sessionstorage-get, sessionstorage-set, sessionstorage-delete, sessionstorage-clear

# Network and DevTools
console, network, route, route-list, unroute, run-code

# Low-level / future Cypress-specific primitives
keydown, keyup, mousemove, mousedown, mouseup, mousewheel, delete-data, run
```

## Cypress-specific patterns

### `cy.task()` bridge

- The CLI talks to a persistent daemon over a Unix socket.
- The daemon hands commands to Cypress through a `cy.task()` polling loop.
- This means command results are real Cypress executions, not simulated DOM
  actions.

### Retry and wait behavior

- Assertions and waits rely on Cypress retry semantics, so prefer `assert`,
  `asserturl`, `asserttitle`, and `waitfor` over custom sleep loops.
- Use `wait <ms>` only when an explicit time delay is the best available option.
- For actionability problems (covered elements, hidden elements), retry with
  `--force` only when you have evidence the action should still occur.

### Export workflow

- Every successful action can contribute Cypress code to the session history.
- `history` shows recorded steps.
- `undo` removes the most recent recorded step from export history.
- `export` writes a `.cy.ts` or `.cy.js` file using the recorded command list.

## Example: form submission

```bash
cypress-cli open https://example.cypress.io/commands/actions
cypress-cli snapshot
cypress-cli type e40 "user@example.com"
cypress-cli type e41 "secret-password"
cypress-cli click e45
cypress-cli asserturl include "/commands/actions"
```

## Example: navigation and assertion

```bash
cypress-cli open https://example.cypress.io
cypress-cli navigate https://example.cypress.io/commands/navigation
cypress-cli snapshot
cypress-cli click e12
cypress-cli back
cypress-cli forward
cypress-cli asserttitle include "Cypress"
```

## Example: export a generated Cypress test

```bash
cypress-cli open https://example.cypress.io/commands/actions
cypress-cli snapshot
cypress-cli click e5
cypress-cli type e8 "generated by cypress-cli"
cypress-cli export --file generated/actions.cy.ts --describe "Actions page" --it "replays the recorded workflow"
```

## Installing this skill into a project

```bash
cypress-cli install --skills
```

This copies the packaged skill directory into `.github/skills/cypress-cli` in
the current project so repository-scoped coding agents can discover it.

## Task-specific guides

- [Test generation](references/test-generation.md)
- [Storage state](references/storage-state.md)
- [Network mocking](references/network-mocking.md)
