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

| Command           | Example                                        |
| ----------------- | ---------------------------------------------- |
| `open`            | `cypress-cli open https://example.com`         |
| `snapshot`        | `cypress-cli snapshot`                         |
| `click`           | `cypress-cli click e5`                         |
| `type`            | `cypress-cli type e12 'hello'`                 |
| `fill`            | `cypress-cli fill e12 'full replacement text'` |
| `clear`           | `cypress-cli clear e12`                        |
| `check`           | `cypress-cli check e8`                         |
| `uncheck`         | `cypress-cli uncheck e8`                       |
| `select`          | `cypress-cli select e15 'Option A'`            |
| `scrollto`        | `cypress-cli scrollto e3`                      |
| `hover`           | `cypress-cli hover e7`                         |
| `focus`           | `cypress-cli focus e12`                        |
| `blur`            | `cypress-cli blur e12`                         |
| `press`           | `cypress-cli press Enter`                      |
| `dblclick`        | `cypress-cli dblclick e5`                      |
| `rightclick`      | `cypress-cli rightclick e5`                    |
| `navigate`        | `cypress-cli navigate https://other.com`       |
| `back`            | `cypress-cli back`                             |
| `forward`         | `cypress-cli forward`                          |
| `reload`          | `cypress-cli reload`                           |
| `assert`          | `cypress-cli assert e5 have.text 'Submit'`     |
| `asserturl`       | `cypress-cli asserturl include '/dashboard'`   |
| `asserttitle`     | `cypress-cli asserttitle eq 'Home'`            |
| `wait`            | `cypress-cli wait 1000`                        |
| `waitfor`         | `cypress-cli waitfor e12`                      |
| `intercept`       | `cypress-cli intercept '**/api/users'`         |
| `waitforresponse` | `cypress-cli waitforresponse '**/api/users'`   |
| `unintercept`     | `cypress-cli unintercept '**/api/users'`       |
| `intercept-list`  | `cypress-cli intercept-list`                   |
| `network`         | `cypress-cli network`                          |
| `screenshot`      | `cypress-cli screenshot`                       |
| `drag`            | `cypress-cli drag e3 e7`                       |
| `upload`          | `cypress-cli upload e10 ./file.pdf`            |
| `dialog-accept`   | `cypress-cli dialog-accept`                    |
| `dialog-dismiss`  | `cypress-cli dialog-dismiss`                   |
| `resize`          | `cypress-cli resize 1280 720`                  |
| `run-code`        | `cypress-cli run-code "document.title"`        |
| `export`          | `cypress-cli export`                           |
| `history`         | `cypress-cli history`                          |
| `undo`            | `cypress-cli undo`                             |
| `stop`            | `cypress-cli stop`                             |

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
- The `run-code` command accepts any valid JavaScript expression
- If a command fails, the response includes an error message and a recovery snapshot

## Waiting after SPA navigation

Single-page apps (SPAs) use client-side routing — clicking a link changes the
URL and renders new content **without a full page load**. Cypress does not
automatically wait for SPA route transitions to finish.

After clicking a SPA navigation link, you must explicitly wait before taking a
snapshot. There are two strategies:

### Strategy 1: Wait for an element (simple)

Use `waitfor` to wait for an element you expect on the new page:

```bash
cypress-cli click e5                  # Click a SPA nav link
cypress-cli waitfor e12               # Wait for a known element on the new route
cypress-cli snapshot                  # Now the snapshot shows the new page
```

Use this when you know a specific element ref that should appear after the
navigation. If the new page has not been snapshotted yet, use `asserturl`
to confirm the route changed, then take a full snapshot:

```bash
cypress-cli click e5                              # Click SPA nav link
cypress-cli asserturl include '/dashboard'        # Confirm route changed
cypress-cli snapshot                              # Full snapshot of new page
```

### Strategy 2: Wait for a network response (API-driven SPAs)

Many SPAs fetch data from an API when navigating. Use `intercept` +
`waitforresponse` to wait for that API call to complete:

```bash
cypress-cli intercept '**/api/articles*'          # Set up intercept BEFORE the click
cypress-cli click e5                              # Click triggers API call
cypress-cli waitforresponse '**/api/articles*'    # Wait for API response
cypress-cli snapshot                              # Page is now fully loaded
```

This is the idiomatic Cypress pattern: `cy.intercept().as()` + `cy.wait('@alias')`.
The exported test will contain real Cypress commands.

**Important:** Always register the `intercept` **before** the action that
triggers the request. Intercepts set up after the request starts will not
catch it.

## Network mocking

Use `intercept` to mock API responses for testing:

```bash
# Mock a 200 response with JSON body
cypress-cli intercept '**/api/users' --status 200 --body '{"users":[]}'

# List active intercepts
cypress-cli intercept-list

# Remove a specific intercept
cypress-cli unintercept '**/api/users'

# Remove all intercepts
cypress-cli unintercept

# View all captured network requests
cypress-cli network
```
