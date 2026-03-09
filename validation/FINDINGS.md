# LLM Validation Findings — Issue #66

**Date**: 2026-03-09
**Agent**: Claude (GitHub Copilot)
**Scenarios**: 4 completed (TodoMVC, SauceDemo, The Internet, RealWorld Conduit)

## Executive Summary

The tool is **functional and usable for LLM-driven browser automation** across a
range of real websites. All 4 scenarios completed end-to-end with workarounds.
The core command loop (snapshot → identify ref → execute command → verify) works
well. However, several friction points significantly slow down agent workflows.

**Verdict**: Usable today, but 3 high-priority bugs would dramatically improve
the LLM experience.

---

## Bugs Found

### BUG-1: Numeric string coercion (HIGH — blocks common workflows) — RESOLVED

**Commands affected**: `assert`, `fill`, `type`
**Symptom**: Values like `'2'` or `'90210'` are parsed as numbers by the CLI arg
parser, then rejected by Zod schemas expecting strings.

```
$ cypress-cli assert e28 have.text '2'
Error: Invalid arguments for "assert":
  value: Expected string, received number

$ cypress-cli fill e27 '90210'
Error: Invalid arguments for "fill":
  text: Expected string, received number
```

**Workaround**: Prepend a space (`' 2'`, `' 90210'`) — the value gets trimmed
before being passed to Cypress but stays a string through Zod validation.

**Impact**: Very common in real-world testing. Zip codes, counts, prices, dates
as strings all trigger this. An LLM encountering this for the first time would
likely waste 2-3 attempts before finding a workaround.

**Fix**: Coerce all `assert` value and `fill`/`type` text args to strings in the
CLI arg parser, regardless of whether they parse as numbers.

---

### BUG-2: `select` fails on custom dropdowns (MEDIUM)

**Commands affected**: `select`
**Symptom**: When the ARIA snapshot shows a `combobox` element, the ref may
resolve to a `<div>` wrapper rather than the actual `<select>`. Cypress's
`.select()` only works on `<select>` elements.

```
$ cypress-cli select e30 'lohi'
Error: Cannot select on <div> — cy.select() can only be called on <select> elements.
```

**Observed on**: SauceDemo (custom styled dropdown). Worked fine on The
Internet's dropdown page (native `<select>`).

**Impact**: Many modern sites use custom combobox components. The agent has no
fallback — `run-code` evaluates in browser context (not Cypress), so it can't
call `.select()` either.

**Fix**: The selector generator should resolve `combobox` refs to the underlying
`<select>` element rather than its `<div>` wrapper. Or `select` should
automatically traverse children to find the `<select>`.

---

### BUG-3: `dialog-dismiss` crashes with uncaught exception (MEDIUM) — RESOLVED

**Commands affected**: `dialog-dismiss`
**Symptom**: The `cy.stub(win, 'prompt').returns(null)` call in the dismiss
handler throws an uncaught exception on pages that haven't defined
`window.prompt` or where the stub conflicts with existing code.

```
Error: The following error originated from your application code, not from Cypress.
  > Cannot read properties of undefined (reading 'apply')
```

**Observed on**: The Internet's `/javascript_alerts` page.

**Impact**: The session survived (good error recovery!), but the confirm dialog
was never properly dismissed and the result text wasn't verified.

**Fix**: Guard the `prompt` stub with an existence check, or catch errors from
the stub setup.

---

### BUG-4: `press Escape` generates invalid sequence (LOW) — RESOLVED

**Commands affected**: `press`
**Symptom**: `press Escape` generates `{Escape}` but Cypress expects `{esc}`.

```
Error: Special character sequence: `{Escape}` is not recognized.
```

**Workaround**: Use `press esc` (Cypress's key name) instead of `press Escape`
(the standard key name).

**Impact**: The discoverability is poor — `Escape` is the standard KeyboardEvent
key name that any LLM would produce. The tool should map standard key names to
Cypress's shorthand forms.

**Fix**: Add a key name mapping in the `press` command handler:
`Escape→esc`, `ArrowUp→upArrow`, `ArrowDown→downArrow`, etc.

---

## UX Friction Points

### FRICTION-1: Refs are unstable across DOM changes (HIGH) — RESOLVED

Refs shifted when the DOM changed — even minor changes like a button label
switching from "Add to cart" to "Remove" caused all subsequent refs to
renumber.

**Example**: In SauceDemo, after adding one item to cart, the Bike Light's
"Add to cart" button shifted from `e58` to `e49`. Clicking the old `e58` hit a
different element (a `<div>` wrapper), wasting two attempts.

**Resolution**: Refs are now stable across DOM mutations. The ref map uses
WeakRef-based tracking so elements keep their assigned ref even when the DOM
re-renders. Refs only become invalid when their element is removed from the DOM,
in which case commands correctly fail with a ref-not-found error.

---

### FRICTION-2: SPA routing needs explicit waits (MEDIUM) — RESOLVED

Single-page applications (Conduit, and partially SauceDemo) perform client-side
routing that doesn't trigger Cypress's page load detection. The snapshot after a
`click` on a SPA navigation link often captures the page before the new route's
components have rendered.

**Pattern observed**: Had to use `wait 2000` + `snapshot` after every SPA
navigation in the Conduit scenario.

**Resolution**: Added `waitforresponse` command that uses `cy.wait('@alias')`
to wait for intercepted network responses. Combined with `intercept`, agents can
now wait for specific API calls to complete before snapshotting. Skill docs
also document `waitfor` for element-based waits.

---

### FRICTION-3: Diff snapshots hide stale refs (MEDIUM) — RESOLVED

The incremental diff snapshot format (`ref=e14 [unchanged]`) is compact but
didn't show the current element details. An agent needed to remember which refs
were assigned in previous full snapshots or take a full `snapshot` to see current
refs.

**Resolution**: Resolved by FRICTION-1 fix (stable refs). Refs are now stable
across DOM mutations — they only become invalid when elements are removed from
the DOM, in which case the command correctly fails with a ref-not-found error.
Diff snapshots no longer hide stale refs because refs don't go stale from
re-renders.

---

### FRICTION-4: Export includes failed/stale commands (LOW) — RESOLVED

The exported test includes every command in history, including failed attempts
that hit wrong elements. In the SauceDemo export, there were 3 click commands
targeting wrapper `<div>` elements that did nothing — these become dead code in
the test.

**Resolution**: Failed commands are now filtered out of the exported test file.
The `buildHistory` function in codegen skips any command result with
`success: false`, keeping exports clean.

---

## What Works Well

### Strengths

1. **Error recovery is excellent**: The session survived every error gracefully.
   Crashed `dialog-dismiss`, wrong element clicks, invalid key names — none
   killed the session. The agent could always continue.

2. **Selector generation is usually good**: When refs are correct, the generated
   selectors are high quality — `data-test` attributes, semantic IDs, named
   inputs. SauceDemo's `data-test="login-button"`, `data-test="checkout"` etc.
   are ideal for real test code.

3. **ARIA snapshot is excellent for LLM comprehension**: The hierarchical YAML
   snapshot is easy to parse and reason about. Element roles, labels, states
   (`[checked]`, `[active]`, `[disabled]`) give clear context without
   overwhelming the agent.

4. **Core commands work reliably**: `fill`, `click`, `check`, `uncheck`, `type`,
   `assert`, `asserturl`, `asserttitle`, `navigate` all work as expected. The
   command set is comprehensive for standard web workflows.

5. **Codegen output is clean**: Exported tests are syntactically valid and
   readable. The Cypress code uses appropriate commands (`.check()` not
   `.click()`, `.should()` with correct chainers).

6. **Multi-page sessions are stable**: The Internet scenario navigated across 7
   different sub-pages within one session with no issues.

---

## Scenario Results Summary

| Scenario | Site              | Steps | Passed | Failed | Workarounds                  |
| -------- | ----------------- | ----- | ------ | ------ | ---------------------------- |
| 1        | TodoMVC           | 13    | 11     | 0      | 2 (numeric assert)           |
| 2        | SauceDemo         | 23    | 16     | 2      | 5 (refs, numeric, select)    |
| 3        | The Internet      | 34    | 28     | 3      | 3 (press key, dialog, hover) |
| 4        | RealWorld Conduit | 26    | 21     | 1      | 4 (SPA waits, stale refs)    |

**Total**: 96 steps attempted, 76 passed first try, 4 failed, 14 needed workarounds

**Success rate**: 79% first-try, 94% with workarounds

---

## Priority Recommendations

1. **Fix BUG-1 (numeric coercion)** — ✅ Fixed. Arg parser now preserves
   string types for command arguments.

2. **Fix BUG-4 (key name mapping)** — ✅ Fixed. Standard key names mapped to
   Cypress equivalents.

3. **Address FRICTION-1 (ref stability)** — ✅ Fixed. Refs are now stable across
   DOM mutations via WeakRef-based tracking.

4. **Fix BUG-3 (dialog-dismiss)** — ✅ Fixed. Guard added to prompt stub.

5. **Address FRICTION-2 (SPA waits)** — ✅ Fixed. `waitforresponse` command added
   for network-based waits; `waitfor` documented for element-based waits.

---

## Comparison Notes (vs Playwright MCP)

Based on the scenarios tested, the key advantages of `cypress-cli`:

- ARIA snapshot format is very LLM-friendly (vs raw HTML)
- Command names map well to agent intent (fill, check, assert)
- Error recovery keeps sessions alive

Key gaps relative to Playwright MCP:

- No automatic DOM stability detection (Playwright waits for network idle)
- No CSS hover simulation (Cypress limitation, not tool limitation)
- Dialog handling is less robust
- Ref instability vs Playwright's more stable locators
