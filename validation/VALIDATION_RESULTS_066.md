# Issue #66 — LLM Validation Results

**Date**: 2026-04-04  
**Test target**: https://example.cypress.io/commands/actions + /querying + /traversal  
**Agent**: Claude (via cypress-cli direct CLI invocation)  
**Branch**: main (c67bb10)

---

## Summary

The tool is **usable for realistic LLM-driven test generation**. All major
workflows succeeded end-to-end: open → snapshot → interact → assert → export.
The previous blocking issues (#72 assertion chainers, #45 snapshot-to-file,
#46 inline codegen, #49 fill command) are **all fixed**.

Two new bugs were found, both related to `formatResult()` dropping data from
daemon-local commands.

---

## Commands Tested

| #   | Command                                            | Result         | Notes                                          |
| --- | -------------------------------------------------- | -------------- | ---------------------------------------------- |
| 1   | `open https://example.cypress.io/commands/actions` | ✅ Pass        | Full snapshot returned with file path          |
| 2   | `snapshot`                                         | ✅ Pass        | All elements identifiable by role + name + ref |
| 3   | `type e40 'hello@example.com'`                     | ✅ Pass        | Generated `cy.get('#email1').type(...)`        |
| 4   | `assert e40 have.value 'hello@example.com'`        | ✅ Pass        | **Previously broken (#72), now fixed**         |
| 5   | `focus e59`                                        | ✅ Pass        |                                                |
| 6   | `type e75 'John Doe'`                              | ✅ Pass        |                                                |
| 7   | `blur e75`                                         | ✅ Pass        |                                                |
| 8   | `clear e91`                                        | ✅ Pass        |                                                |
| 9   | `type e91 'Hello from cypress-cli'`                | ✅ Pass        |                                                |
| 10  | `check e176`                                       | ✅ Pass        | Checkbox checked                               |
| 11  | `assert e176 be.checked`                           | ✅ Pass        | **Previously unsupported, now works**          |
| 12  | `uncheck e220`                                     | ✅ Pass        | Pre-checked checkbox unchecked                 |
| 13  | `assert e220 not.be.checked`                       | ✅ Pass        | Negated assertion works                        |
| 14  | `select e241 apples`                               | ✅ Pass        |                                                |
| 15  | `assert e241 have.value fr-apples`                 | ✅ Pass        |                                                |
| 16  | `type e107 'HALFOFF'`                              | ✅ Pass        |                                                |
| 17  | `click e108` (Submit button)                       | ✅ Pass        |                                                |
| 18  | `click e121` (Popover toggle)                      | ✅ Pass        |                                                |
| 19  | `dblclick e145`                                    | ✅ Pass        |                                                |
| 20  | `rightclick e160`                                  | ✅ Pass        |                                                |
| 21  | `scrollto bottom`                                  | ✅ Pass        |                                                |
| 22  | `asserturl include 'commands/actions'`             | ✅ Pass        |                                                |
| 23  | `asserttitle include 'Kitchen Sink'`               | ✅ Pass        |                                                |
| 24  | `history`                                          | ❌ Bug         | Returns "OK" — data lost                       |
| 25  | `history --json`                                   | ✅ Data exists | JSON shows all 24 entries with correct state   |
| 26  | `undo`                                             | ❌ Bug         | Returns "OK" — message lost                    |
| 27  | `navigate .../querying`                            | ✅ Pass        |                                                |
| 28  | `click e38` (on new page)                          | ✅ Pass        |                                                |
| 29  | `asserturl eq '<full URL>'`                        | ✅ Pass        |                                                |
| 30  | `navigate .../traversal`                           | ✅ Pass        |                                                |
| 31  | `asserttitle eq 'Cypress.io: Kitchen Sink'`        | ✅ Pass        |                                                |
| 32  | `export --file cypress/e2e/validation.cy.ts`       | ✅ Pass        | Valid .cy.ts file                              |
| 33  | `export --file cypress/e2e/full-validation.cy.ts`  | ✅ Pass        | Multi-page export                              |
| 34  | `stop`                                             | ✅ Pass        | Clean shutdown                                 |

## Error Recovery Tests

| #   | Scenario                                   | Result  | Notes                                                            |
| --- | ------------------------------------------ | ------- | ---------------------------------------------------------------- |
| E1  | `click e999` (nonexistent ref)             | ✅ Good | `Ref "e999" not found... Run snapshot to refresh`                |
| E2  | `assert e40 have.value 'wrong-value'`      | ✅ Good | `Expected "wrong-value" but got "hello@example.com"`             |
| E3  | `type 'not-a-ref' 'text'` (malformed ref)  | ✅ Good | Same clear error message                                         |
| E4  | `check e38` (wrong element type after nav) | ✅ Good | `Cannot check <a> — cy.check() can only be called on checkboxes` |
| E5  | `navigate not-a-url` (invalid URL)         | ✅ Good | Cypress error with path details                                  |
| E6  | `assert e1 have.nonexistentprop 'x'`       | ✅ Good | `Unsupported chainer`                                            |
| E7  | Session recovery after errors              | ✅ Good | All subsequent commands worked after error                       |

---

## Issues Found

### Bug: `history` and `undo` output is lost in human-readable mode

**Severity**: Friction (not blocking — `--json` workaround exists)

Both `history` and `undo` put their response data in the `snapshot` field of
`ResponseMessage`. The `formatResult()` function in `cli.ts` (line 253) strips
the `snapshot` field before rendering key-value output. With no other fields
remaining, it falls through to returning `"OK"`.

**Impact**: An LLM using the CLI gets no feedback from `history` or `undo`. It
cannot inspect the command log or confirm what was undone without using
`--json` mode.

**Root cause**: `handlers.ts` reuses the `snapshot` field for non-snapshot data.
The CLI formatter assumes `snapshot` always contains YAML and strips it.

**Fix**: Either:

- Use a dedicated field (e.g., `entries` for history, `undoneAction` for undo)
- Or add special handling in `formatResult()` for these commands

### Polish: Fragile CSS selectors for elements without IDs

Elements without IDs get long structural selectors:

```
cy.get('#actions > div > div:nth-of-type(26) > div > div:nth-of-type(1) > div:nth-of-type(1) > label > input')
```

This was noted in the previous validation and remains. Not blocking since the
selectors work, but they break on any DOM restructuring.

### Polish: `asserturl` syntax non-obvious

First attempt was `asserturl '**/commands/actions'` which failed with a
validation error. The correct syntax requires a chainer: `asserturl include
'commands/actions'`. An LLM would likely need one failed attempt to learn
this.

### Observation: Stale refs after navigation

After navigating from `/querying` to `/traversal`, ref `e38` (which was a
button on the querying page) silently resolved to a different `<a>` element on
the traversal page. Cypress gave a clear type-mismatch error, but there was no
warning about using a stale ref.

---

## Comparison with Previous Validation

| Previous Finding                                      | Current Status                                      |
| ----------------------------------------------------- | --------------------------------------------------- |
| `assert` can't check input values (#72)               | ✅ **Fixed**                                        |
| Missing `be.visible`, `be.checked`, `have.attr` (#72) | ✅ **Fixed**                                        |
| Fragile structural selectors                          | ⚠️ Still present                                    |
| Snapshot-to-file (#45)                                | ✅ **Fixed** — snapshots written to `.cypress-cli/` |
| Inline codegen (#46)                                  | ✅ **Fixed** — `# Ran Cypress code:` line shown     |
| `fill` command (#49)                                  | ✅ **Implemented**                                  |

---

## Export Quality Assessment

The exported test files are:

- ✅ Valid TypeScript with `/// <reference types="cypress" />` header
- ✅ Proper `describe`/`it` structure
- ✅ Multi-page navigation handled with `cy.visit()` transitions
- ✅ Failed commands correctly excluded from export
- ✅ Assertions preserved (have.value, be.checked, include, eq)
- ⚠️ Some selectors are fragile (nth-of-type chains)
- ✅ IDs used when available (email1, password1, description, query-btn)

---

## Usability Assessment for LLMs

| Criteria                | Rating       | Notes                                        |
| ----------------------- | ------------ | -------------------------------------------- |
| Snapshot readability    | ✅ Excellent | YAML with refs, roles, names, states         |
| Ref stability           | ✅ Good      | Stable within a page; reset on navigation    |
| Command discoverability | ✅ Good      | `--help`, clear arg validation errors        |
| Error recovery          | ✅ Excellent | Clear errors + snapshot in all failure cases |
| Interaction commands    | ✅ Complete  | type, click, check, select, scroll, etc.     |
| Assertion commands      | ✅ Fixed     | All major chainers now supported             |
| Export quality          | ✅ Good      | Valid, runnable Cypress code                 |
| Token efficiency        | ✅ Fixed     | Snapshots written to files                   |
| `history`/`undo` output | ❌ Bug       | Returns "OK" in human-readable mode          |
| Selector quality        | ⚠️ Mixed     | Great with IDs, fragile without              |

**Overall: Ready for LLM use in typical workflows.** The blocking issues from
the first validation are all resolved. The remaining issues are friction/polish
level.
