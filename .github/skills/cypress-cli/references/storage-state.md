# Storage state

All storage-state commands are **implemented** in the current `cypress-cli` release.

## Available commands

### State persistence
- `state-save` — Save all cookies, localStorage, and sessionStorage to a JSON file
- `state-load` — Restore state from a previously saved JSON file

### Cookie commands
- `cookie-list` — List all cookies for the current domain
- `cookie-get <name>` — Get a specific cookie by name
- `cookie-set <name> <value>` — Set a cookie
- `cookie-delete <name>` — Delete a specific cookie
- `cookie-clear` — Clear all cookies

### localStorage commands
- `localstorage-list` — List all localStorage key/value pairs
- `localstorage-get <key>` — Get a localStorage value by key
- `localstorage-set <key> <value>` — Set a localStorage key/value pair
- `localstorage-delete <key>` — Delete a localStorage entry
- `localstorage-clear` — Clear all localStorage

### sessionStorage commands
- `sessionstorage-list` — List all sessionStorage key/value pairs
- `sessionstorage-get <key>` — Get a sessionStorage value by key
- `sessionstorage-set <key> <value>` — Set a sessionStorage key/value pair
- `sessionstorage-delete <key>` — Delete a sessionStorage entry
- `sessionstorage-clear` — Clear all sessionStorage

## Guidance

- Prefer these commands over ad hoc script injection so that session history and
  exported tests stay consistent with the CLI model.
- Use `state-save` / `state-load` for persisting browser state across sessions.
- Cookie commands use Cypress `cy.getCookie()`, `cy.setCookie()`, `cy.clearCookies()`.
- localStorage/sessionStorage commands use `cy.window()` to access the storage APIs.
