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
   node dist/client/main.js open https://example.cypress.io/commands/actions
   ```

3. **Exercise the feature you changed.** For example, if you fixed assertions:

   ```bash
   # Type into a field
   node dist/client/main.js type e40 'hello@example.com'

   # Verify the value with an assertion
   node dist/client/main.js assert e40 have.value 'hello@example.com'

   # Take a snapshot to confirm state
   node dist/client/main.js snapshot
   ```

4. **Test error paths too** — send bad refs, missing args, wrong chainers.
   Confirm error messages are actionable (an LLM reading the error should know
   what to do differently).

5. **Export and review** — if codegen is affected:

   ```bash
   node dist/client/main.js export --file /tmp/test-output.cy.ts
   cat /tmp/test-output.cy.ts
   ```

6. **Clean up:**
   ```bash
   node dist/client/main.js stop
   ```

## What to Check During Live Validation

- Commands succeed and return expected results
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

- ✅ `open` — session started, snapshot returned
- ✅ `type e40 'test@test.com'` — value reflected in snapshot
- ✅ `assert e40 have.value 'test@test.com'` — passed
- ✅ `export` — valid .cy.ts output
- ✅ `stop` — clean shutdown
```
