# Test generation

Use `cypress-cli` to build Cypress tests incrementally from real browser
interactions, then export the session history as a `.cy.ts` or `.cy.js` file.

## How codegen works

1. Start a session with `open`.
2. Explore the page with `snapshot`.
3. Interact using commands such as `click`, `type`, `select`, and `assert`.
4. The daemon records exportable commands in session history.
5. Run `export` to generate a Cypress test file from the recorded history.

The exported file is generated from recorded command history, not from a guess
about what happened. If you made a wrong move, use `undo` before exporting.

## Recommended workflow

```bash
cypress-cli open https://example.cypress.io/commands/actions
cypress-cli snapshot
cypress-cli type e40 "qa@example.com"
cypress-cli click e45
cypress-cli asserturl include "/commands/actions"
cypress-cli export --file generated/actions.cy.ts
```

## Useful commands for codegen

- `history` — inspect the recorded command list
- `undo` — remove the last recorded step
- `export --file path` — write the generated test to disk
- `export --format js|ts` — choose JavaScript or TypeScript output
- `export --describe name` — override the outer `describe()`
- `export --it name` — override the test case name
- `export --baseUrl url` — make generated visits relative to a shared base URL

## Best practices

- Take a fresh `snapshot` before acting on a new page state so refs are current.
- Prefer semantic flows over brittle one-off interactions.
- Add assertions while recording so the exported test includes validation.
- Use `undo` instead of manually editing command history in your head.
- Review the generated file after export and add any project-specific setup or
  cleanup that the recording flow does not know about.
