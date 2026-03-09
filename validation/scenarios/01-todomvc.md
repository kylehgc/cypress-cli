# Scenario 1: TodoMVC — Basic CRUD

**Target**: `https://demo.playwright.dev/todomvc`
**Complexity**: Simple (~12 commands)
**Time**: ~2 minutes

## What This Tests

A minimal todo-list app. Tests the core loop: type text, press Enter to submit,
check items complete, filter views, and verify state with assertions. This is
the same app Playwright CLI uses in their README demo.

## Commands Exercised

| Command       | Used For              |
| ------------- | --------------------- |
| `open`        | Start session         |
| `snapshot`    | Read page state       |
| `type`        | Enter todo text       |
| `press`       | Submit with Enter key |
| `check`       | Mark todos complete   |
| `click`       | Click filter links    |
| `assert`      | Verify element state  |
| `asserttitle` | Verify page title     |
| `export`      | Generate test file    |
| `stop`        | End session           |

## Steps

### Setup

```bash
# 1. Open the TodoMVC app
cypress-cli open https://demo.playwright.dev/todomvc
```

**Expected**: Session starts. Output shows `### Page` with URL
`https://demo.playwright.dev/todomvc` and `### Snapshot` file link. Read the
snapshot file to find the input element ref (should be a textbox with
placeholder "What needs to be done?").

### Add Todo Items

```bash
# 2. Verify the page title
cypress-cli asserttitle contain 'TodoMVC'
```

**Expected**: Assertion passes.

```bash
# 3. Type the first todo (find the input ref from the snapshot)
cypress-cli type <input-ref> 'Buy groceries'
```

**Expected**: Text appears in the input. Snapshot shows the input with
`[value="Buy groceries"]`.

```bash
# 4. Press Enter to submit
cypress-cli press Enter
```

**Expected**: "Buy groceries" appears as a list item in the snapshot.
The input is cleared. A new list item element with text "Buy groceries"
should be visible.

```bash
# 5. Type and submit a second todo
cypress-cli type <input-ref> 'Water the plants'
cypress-cli press Enter
```

**Expected**: Two list items now visible in the snapshot.

```bash
# 6. Type and submit a third todo
cypress-cli type <input-ref> 'Read a book'
cypress-cli press Enter
```

**Expected**: Three list items visible. Footer shows "3 items left".

### Interact with Todos

```bash
# 7. Mark "Buy groceries" as complete (find its checkbox ref)
cypress-cli check <groceries-checkbox-ref>
```

**Expected**: The checkbox is checked. Footer should update to "2 items left".
The item may get a strikethrough style (visible in snapshot as a different
state).

### Filter Todos

```bash
# 8. Click the "Active" filter link
cypress-cli click <active-link-ref>
```

**Expected**: Only "Water the plants" and "Read a book" should be visible.
"Buy groceries" should be hidden (not in snapshot, or marked hidden).

```bash
# 9. Assert that the active count is correct
cypress-cli assert <items-left-ref> contain '2'
```

**Expected**: Assertion passes — "2 items left" text present.

```bash
# 10. Click the "Completed" filter
cypress-cli click <completed-link-ref>
```

**Expected**: Only "Buy groceries" shown (the completed one).

```bash
# 11. Click "All" to show everything again
cypress-cli click <all-link-ref>
```

**Expected**: All three todos visible again.

### Teardown

```bash
# 12. Export the test
cypress-cli export --file /tmp/cypress-cli-validation/todomvc.cy.ts --describe 'TodoMVC' --it 'should manage todos'
```

**Expected**: A `.cy.ts` file is written. Review it for:

- `cy.visit('https://demo.playwright.dev/todomvc')` at the start
- `cy.get(...)` selectors that target real elements (not just nth-of-type)
- `.type('Buy groceries')`, `.type('{enter}')` calls
- `.check()` call
- `.click()` calls for filters
- `.should('contain', '2')` assertion

```bash
# 13. Stop the session
cypress-cli stop
```

## Success Criteria

- [ ] All 12 steps complete without errors
- [ ] Refs from snapshot correctly identify input, checkboxes, and filter links
- [ ] Assertions pass on first attempt
- [ ] Exported test file is syntactically valid TypeScript
- [ ] Exported test contains reasonable selectors (not all deeply nested nth-of-type)

## Notes

- The input element for new todos has no visible label — the LLM must identify
  it by its role (textbox) and placeholder text in the snapshot
- Filter links ("All", "Active", "Completed") appear in the footer after the
  first todo is added
- This scenario does NOT test: dblclick (editing todos), drag, upload, dialogs,
  or navigation — those are covered in other scenarios
