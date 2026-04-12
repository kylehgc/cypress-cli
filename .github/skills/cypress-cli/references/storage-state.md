# Storage state

Storage-state commands are planned but are **not implemented yet** in the
current `cypress-cli` release.

## Planned scope

The roadmap includes:

- `state-save` / `state-load`
- cookie commands (`cookie-list`, `cookie-get`, `cookie-set`, `cookie-delete`, `cookie-clear`)
- localStorage commands
- sessionStorage commands

These features are expected to use Cypress APIs such as `cy.getCookies()`,
`cy.setCookie()`, and `cy.window().then(win => win.localStorage.*)`.

## Guidance today

- Do not invoke storage-state commands unless the repository version explicitly
  documents that they are implemented.
- If a task needs browser state persistence right now, explain that storage
  management is planned but not yet available through the CLI.
- When these commands land, prefer them over ad hoc script injection so the
  session history and exported tests stay consistent with the CLI model.
