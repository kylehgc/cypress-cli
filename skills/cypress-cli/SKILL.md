---
name: cypress-cli
description: Interact with live web pages through Cypress commands via the cypress-cli tool
user-invocable: true
---

# cypress-cli Skill

## What this skill does

This skill teaches you how to use the `cypress-cli` tool to interact with live
web pages through real Cypress commands. Use it to open pages, inspect aria
snapshots, interact with elements, inspect browser state, export Cypress tests,
and run targeted browser or Cypress code.

## When to use this skill

- When you need to open a web page and inspect its DOM
- When you need to interact with elements (click, type, check, select, etc.)
- When you need to assert element state
- When you need cookies, localStorage, sessionStorage, or saved browser state
- When you need network inspection or request mocking
- When you need browser console output or screenshots
- When you need to generate Cypress test code from a session
- When you need to execute browser-side JavaScript or Cypress chain code

## Output format

Most page-oriented commands return output like this:

```text
### Page
- Page URL: https://example.com
- Page Title: Example
### Snapshot
[Snapshot](.cypress-cli/page-2026-04-10T19-22-42-679Z.yml)
```

Structured-data commands such as `console`, `network`, `history`, storage
commands, and `run` return JSON-like data or summaries instead of a snapshot.

## Commands

### Core

| Command    | Example                                | Purpose                                                     |
| ---------- | -------------------------------------- | ----------------------------------------------------------- |
| `open`     | `cypress-cli open https://example.com` | Start or reuse a session and navigate to a URL              |
| `repl`     | `cypress-cli repl`                     | Start interactive REPL mode for an existing session         |
| `snapshot` | `cypress-cli snapshot`                 | Capture the current aria snapshot                           |
| `status`   | `cypress-cli status`                   | Show session status and metadata                            |
| `install`  | `cypress-cli install --skills`         | Install the bundled skill into `.github/skills/cypress-cli` |
| `stop`     | `cypress-cli stop`                     | Stop the active session                                     |

### Navigation

| Command    | Example                                              | Purpose                                |
| ---------- | ---------------------------------------------------- | -------------------------------------- |
| `navigate` | `cypress-cli navigate https://example.com/dashboard` | Visit a new URL in the current session |
| `back`     | `cypress-cli back`                                   | Go back in browser history             |
| `forward`  | `cypress-cli forward`                                | Go forward in browser history          |
| `reload`   | `cypress-cli reload`                                 | Reload the current page                |

### Interaction

| Command          | Example                                        | Purpose                                             |
| ---------------- | ---------------------------------------------- | --------------------------------------------------- |
| `click`          | `cypress-cli click e5`                         | Click an element by ref                             |
| `dblclick`       | `cypress-cli dblclick e5`                      | Double-click an element by ref                      |
| `rightclick`     | `cypress-cli rightclick e5`                    | Right-click an element by ref                       |
| `type`           | `cypress-cli type e12 'hello'`                 | Type text into an element                           |
| `fill`           | `cypress-cli fill e12 'full replacement text'` | Clear and replace text in an element                |
| `clear`          | `cypress-cli clear e12`                        | Clear an input element                              |
| `check`          | `cypress-cli check e8`                         | Check a checkbox or radio input                     |
| `uncheck`        | `cypress-cli uncheck e8`                       | Uncheck a checkbox                                  |
| `select`         | `cypress-cli select e15 'Option A'`            | Select an option from a `<select>`                  |
| `focus`          | `cypress-cli focus e12`                        | Focus an element                                    |
| `blur`           | `cypress-cli blur e12`                         | Blur an element                                     |
| `scrollto`       | `cypress-cli scrollto e3`                      | Scroll an element into view or scroll to a position |
| `hover`          | `cypress-cli hover e7`                         | Trigger hover on an element                         |
| `drag`           | `cypress-cli drag e3 e7`                       | Drag one element onto another                       |
| `upload`         | `cypress-cli upload e10 ./file.pdf`            | Upload a file through a file input                  |
| `dialog-accept`  | `cypress-cli dialog-accept`                    | Accept the next browser dialog                      |
| `dialog-dismiss` | `cypress-cli dialog-dismiss`                   | Dismiss the next browser dialog                     |
| `resize`         | `cypress-cli resize 1280 720`                  | Change the browser viewport size                    |

### Keyboard

| Command | Example                   | Purpose                         |
| ------- | ------------------------- | ------------------------------- |
| `press` | `cypress-cli press Enter` | Send a keyboard key to the page |

### Assertion

| Command       | Example                                      | Purpose                   |
| ------------- | -------------------------------------------- | ------------------------- |
| `assert`      | `cypress-cli assert e5 have.text 'Submit'`   | Assert on an element      |
| `asserturl`   | `cypress-cli asserturl include '/dashboard'` | Assert on the current URL |
| `asserttitle` | `cypress-cli asserttitle eq 'Home'`          | Assert on the page title  |

### Wait

| Command   | Example                   | Purpose                             |
| --------- | ------------------------- | ----------------------------------- |
| `wait`    | `cypress-cli wait 1000`   | Wait a fixed number of milliseconds |
| `waitfor` | `cypress-cli waitfor e12` | Wait for an element to exist        |

### Execution

| Command    | Example                                                            | Purpose                                                           |
| ---------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `run-code` | `cypress-cli run-code "document.querySelectorAll('input').length"` | Execute browser-side JavaScript in the page context               |
| `eval`     | `cypress-cli eval "document.title"`                                | Evaluate a JavaScript expression on the page or on a specific ref |
| `cyrun`    | `cypress-cli cyrun "cy.url().then(u => u)"`                        | Execute Cypress chain code in the Cypress runner context          |
| `run`      | `cypress-cli run ./generated.cy.ts`                                | Run a Cypress spec file and report structured results             |

### Export and history

| Command   | Example                                       | Purpose                                       |
| --------- | --------------------------------------------- | --------------------------------------------- |
| `export`  | `cypress-cli export --file ./generated.cy.ts` | Export session history as a Cypress test file |
| `history` | `cypress-cli history`                         | Show commands recorded for export             |
| `undo`    | `cypress-cli undo`                            | Remove the last command from export history   |

### Network

| Command           | Example                                                                   | Purpose                                       |
| ----------------- | ------------------------------------------------------------------------- | --------------------------------------------- |
| `intercept`       | `cypress-cli intercept '**/api/users' --status 200 --body '{"users":[]}'` | Register a request intercept or mock response |
| `waitforresponse` | `cypress-cli waitforresponse '**/api/users'`                              | Wait for a previously intercepted response    |
| `unintercept`     | `cypress-cli unintercept '**/api/users'`                                  | Remove one intercept or all intercepts        |
| `intercept-list`  | `cypress-cli intercept-list`                                              | List active intercepts                        |
| `network`         | `cypress-cli network`                                                     | Show captured network requests                |

### Cookies

| Command         | Example                                | Purpose                 |
| --------------- | -------------------------------------- | ----------------------- |
| `cookie-list`   | `cypress-cli cookie-list`              | List cookies            |
| `cookie-get`    | `cypress-cli cookie-get session_id`    | Read a cookie by name   |
| `cookie-set`    | `cypress-cli cookie-set theme dark`    | Set a cookie            |
| `cookie-delete` | `cypress-cli cookie-delete session_id` | Delete a cookie by name |
| `cookie-clear`  | `cypress-cli cookie-clear`             | Clear all cookies       |

### localStorage

| Command               | Example                                     | Purpose                           |
| --------------------- | ------------------------------------------- | --------------------------------- |
| `localstorage-list`   | `cypress-cli localstorage-list`             | List all localStorage entries     |
| `localstorage-get`    | `cypress-cli localstorage-get token`        | Read a localStorage value by key  |
| `localstorage-set`    | `cypress-cli localstorage-set token abc123` | Set a localStorage key/value pair |
| `localstorage-delete` | `cypress-cli localstorage-delete token`     | Delete a localStorage key         |
| `localstorage-clear`  | `cypress-cli localstorage-clear`            | Clear all localStorage entries    |

### sessionStorage

| Command                 | Example                                      | Purpose                             |
| ----------------------- | -------------------------------------------- | ----------------------------------- |
| `sessionstorage-list`   | `cypress-cli sessionstorage-list`            | List all sessionStorage entries     |
| `sessionstorage-get`    | `cypress-cli sessionstorage-get draft`       | Read a sessionStorage value by key  |
| `sessionstorage-set`    | `cypress-cli sessionstorage-set draft hello` | Set a sessionStorage key/value pair |
| `sessionstorage-delete` | `cypress-cli sessionstorage-delete draft`    | Delete a sessionStorage key         |
| `sessionstorage-clear`  | `cypress-cli sessionstorage-clear`           | Clear all sessionStorage entries    |

### State

| Command      | Example                                          | Purpose                                                     |
| ------------ | ------------------------------------------------ | ----------------------------------------------------------- |
| `state-save` | `cypress-cli state-save .cypress-cli/state.json` | Save cookies, localStorage, and sessionStorage to disk      |
| `state-load` | `cypress-cli state-load .cypress-cli/state.json` | Restore cookies, localStorage, and sessionStorage from disk |

### Diagnostics and page capture

| Command      | Example                  | Purpose                                  |
| ------------ | ------------------------ | ---------------------------------------- |
| `console`    | `cypress-cli console`    | Return captured browser console messages |
| `screenshot` | `cypress-cli screenshot` | Capture a page or element screenshot     |

## How to read snapshots

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

# 6. Run browser-side JavaScript
cypress-cli run-code "document.querySelectorAll('input').length"

# 7. Run Cypress chain code in the runner context
cypress-cli cyrun "cy.url().then(u => u)"

# 8. Use the interactive REPL when you want a prompt
cypress-cli repl
# cypress-cli> snapshot
# cypress-cli> status
# cypress-cli> exit

# 9. Export session as a Cypress test file
cypress-cli export --file ./generated.cy.ts

# 10. Run the exported Cypress spec
cypress-cli run ./generated.cy.ts

# 11. Stop the session
cypress-cli stop
```

## Tips

- **Always read the snapshot file** after `open` to discover element refs
- **Snapshot files accumulate** in `.cypress-cli/` — each command writes a new one
- Use `--json` flag on any command for machine-readable output
- `run-code` executes browser-side JavaScript via `window.eval(...)`
- `eval` returns expression results and can optionally evaluate against a specific ref
- `cyrun` is for Cypress chain code such as `cy.get(...)`, not browser-side JavaScript
- `run` executes a Cypress spec file and does not require an active browser session
- `install --skills` copies this source skill to `.github/skills/cypress-cli/`
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
