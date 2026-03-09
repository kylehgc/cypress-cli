# Live Validation Guide

**If your change affects command execution, assertion logic, snapshot output,
error messages, CLI output formatting, or anything an LLM interacts with during
a session, you must validate it by actually using the application.**

Automated tests alone are not sufficient — they mock boundaries that hide
real-world issues. Run the CLI against a real web page and confirm your change
works end-to-end.

## When to Do Live Validation

Always validate live if the issue touches:

- `src/cypress/driverSpec.ts` (command execution, assertions)
- `src/client/` (CLI output, arg parsing, result formatting)
- `src/daemon/` (command routing, session lifecycle, response structure)
- `src/browser/` (selectors, snapshots, ref tracking)
- `src/codegen/` (export quality)
- Any issue labeled `P0`, `P1`, `command`, or `testing`

## How to Validate

1. **Build first** — `npm run build` (generates the IIFE bundles the CLI needs)

2. **Open a session against a real page:**

   ```bash
   node bin/cypress-cli open https://example.cypress.io/commands/actions
   ```

   Wait for the output showing `### Page` and `### Snapshot` — this confirms
   the session started and Cypress connected.

3. **Exercise the feature you changed.** For example, if you fixed assertions:

   ```bash
   # Type into a field
   node bin/cypress-cli type e40 'hello@example.com'

   # Verify the value with an assertion
   node bin/cypress-cli assert e40 have.value 'hello@example.com'

   # Take a snapshot to confirm state
   node bin/cypress-cli snapshot
   ```

4. **Test error paths too** — send bad refs, missing args, wrong chainers.
   Confirm error messages are actionable (an LLM reading the error should know
   what to do differently).

5. **Export and review** — if codegen is affected:

   ```bash
   node bin/cypress-cli export --file /tmp/test-output.cy.ts
   cat /tmp/test-output.cy.ts
   ```

6. **Clean up:**
   ```bash
   node bin/cypress-cli stop
   ```

## Expected Output Format

Every command that produces a snapshot returns output like this:

```
### Page
- Page URL: https://example.cypress.io/commands/actions
- Page Title: Cypress.io: Kitchen Sink
# Ran Cypress code:
#   cy.get('[data-cy="action-email"]').type('hello@example.com')
### Snapshot
[Snapshot](.cypress-cli/page-2026-03-07T19-22-42-679Z.yml)
```

- The `### Page` section shows URL and title metadata.
- The `# Ran Cypress code:` line shows the generated Cypress command.
- The `### Snapshot` link points to the YAML file on disk. Read this file to
  see the aria tree with `[ref=eN]` handles.
- The CLI never prints inline YAML — always check the file.

Error responses include the same structure with an `Error:` prefix.

## What to Check During Live Validation

- Commands succeed and return `### Page` + `### Snapshot` output
- Snapshot file exists on disk at the path shown and contains valid YAML
- Aria snapshot refs are stable across commands
- Error messages include enough context to self-correct
- Exported code is valid Cypress syntax
- Session starts and stops cleanly without orphaned processes

## Validation Test Page

Use `https://example.cypress.io/commands/actions` as the default validation
target. It has forms, buttons, checkboxes, and interactive elements that
exercise most command types. For navigation-specific changes, use
`https://example.cypress.io/commands/navigation`.

## Include Results in PR

When opening a PR for a usability change, include a brief summary of your live
validation in the PR body:

```markdown
## Live Validation

Tested against `https://example.cypress.io/commands/actions`:

- ✅ `open` — session started, page metadata + snapshot file returned
- ✅ `type e40 'test@test.com'` — value reflected in snapshot
- ✅ `assert e40 have.value 'test@test.com'` — passed
- ✅ `export` — valid .cy.ts output
- ✅ `stop` — clean shutdown
```
