---
name: cypress-cli
description: Interact with live web pages through Cypress commands via the cypress-cli tool
user-invocable: true
---

# cypress-cli Skill

## What this skill does

This skill teaches you how to use the `cypress-cli` tool to interact with live
web pages through real Cypress commands. It is the primary way to browse,
inspect, and test web pages in this project.

## When to use this skill

- When you need to open a web page and inspect its DOM
- When you need to interact with elements (click, type, check, select, etc.)
- When you need to assert element state
- When you need to generate Cypress test code from a session
- When you need to execute arbitrary Cypress code against a live page

## Commands

| Command    | Example                                         |
| ---------- | ----------------------------------------------- |
| `open`     | `cypress-cli open https://example.com`          |
| `snapshot` | `cypress-cli snapshot`                          |
| `click`    | `cypress-cli click e5`                          |
| `type`     | `cypress-cli type e12 'hello'`                  |
| `clear`    | `cypress-cli clear e12`                         |
| `check`    | `cypress-cli check e8`                          |
| `uncheck`  | `cypress-cli uncheck e8`                        |
| `select`   | `cypress-cli select e15 'Option A'`             |
| `scroll`   | `cypress-cli scroll e3 0 500`                   |
| `hover`    | `cypress-cli hover e7`                          |
| `navigate` | `cypress-cli navigate https://other.com`        |
| `back`     | `cypress-cli back`                              |
| `forward`  | `cypress-cli forward`                           |
| `reload`   | `cypress-cli reload`                            |
| `assert`   | `cypress-cli assert e5 have.text 'Submit'`      |
| `run-code` | `cypress-cli run-code "cy.get('#foo').click()"` |
| `export`   | `cypress-cli export`                            |
| `stop`     | `cypress-cli stop`                              |

## How to read snapshots

Every command returns output in this format:

```text
### Page
- Page URL: https://example.com
- Page Title: Example Page
### Snapshot
Snapshot → .cypress-cli/page-YYYY-MM-DDTHH-MM-SS-mmmZ.yml
```

The `### Snapshot` section contains a markdown-formatted link to the YAML
snapshot file on disk (e.g., `.cypress-cli/page-<timestamp>.yml`).

The snapshot file (YAML) contains the page's aria tree with element references:

```yaml
- document [ref=e1]:
    - heading "Welcome" [level=1] [ref=e2]
    - textbox "Email" [ref=e3]
    - button "Submit" [ref=e4]
```

Use the `ref` values (e.g., `e3`, `e4`) to target elements in subsequent
commands. Read the snapshot file to see the full page structure.

**Action commands** (click, type, check, etc.) return a **diff** showing only
what changed. **Snapshot, navigation, and reload** return the **full tree**.

## Workflow

```bash
# 1. Open a page
cypress-cli open https://example.com

# 2. Read the snapshot file to see the page structure
cat .cypress-cli/page-*.yml

# 3. Interact with elements using ref values
cypress-cli type e3 'user@test.com'
cypress-cli click e4

# 4. Take a full snapshot anytime
cypress-cli snapshot

# 5. Assert element state
cypress-cli assert e3 have.value 'user@test.com'

# 6. Run arbitrary Cypress code
cypress-cli run-code "cy.get('#modal').should('be.visible')"

# 7. Export session as a Cypress test file
cypress-cli export

# 8. Stop the session
cypress-cli stop
```

## Tips

- **Always read the snapshot file** after `open` to discover element refs
- **Snapshot files accumulate** in `.cypress-cli/` — each command writes a new one
- Use `--json` flag on any command for machine-readable output
- The `run-code` command accepts any valid Cypress chain as a string
- If a command fails, the response includes an error message and a recovery snapshot
