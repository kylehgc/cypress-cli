# Scenario 3: The Internet — Multi-Page Command Coverage

**Target**: `https://the-internet.herokuapp.com`
**Complexity**: Broad (~30 commands across 7 sub-pages)
**Time**: ~5 minutes

## What This Tests

A collection of isolated test pages, each exercising a different browser
interaction. This scenario navigates across multiple sub-pages to test the
broadest set of cypress-cli commands in a single session. Good for catching
cross-origin, navigation, and command diversity issues.

## Commands Exercised

| Command             | Used For               | Sub-Page             |
| ------------------- | ---------------------- | -------------------- |
| `open`              | Start session          | Homepage             |
| `navigate`          | Move between sub-pages | All                  |
| `snapshot`          | Read page state        | All                  |
| `check` / `uncheck` | Toggle checkboxes      | `/checkboxes`        |
| `assert`            | Verify element state   | All                  |
| `select`            | Pick dropdown option   | `/dropdown`          |
| `fill`              | Login form             | `/login`             |
| `click`             | Submit buttons, links  | Multiple             |
| `asserturl`         | Verify navigation      | `/login`             |
| `dialog-accept`     | Accept JS alert        | `/javascript_alerts` |
| `dialog-dismiss`    | Dismiss JS confirm     | `/javascript_alerts` |
| `press`             | Keyboard input         | `/key_presses`       |
| `hover`             | Mouse hover            | `/hovers`            |
| `screenshot`        | Capture evidence       | Various              |
| `export`            | Generate test file     | End                  |
| `stop`              | End session            | End                  |

## Steps

### Setup

```bash
# 1. Open the homepage
cypress-cli open https://the-internet.herokuapp.com
```

**Expected**: Page with "Welcome to the-internet" heading and list of example
links. Snapshot shows many link elements.

---

### Page 1: Checkboxes

```bash
# 2. Navigate to checkboxes page
cypress-cli navigate https://the-internet.herokuapp.com/checkboxes
```

**Expected**: Page with two checkboxes. By default, checkbox 1 is unchecked and
checkbox 2 is checked.

```bash
# 3. Check the first checkbox
cypress-cli check <checkbox-1-ref>
```

**Expected**: First checkbox is now checked.

```bash
# 4. Uncheck the second checkbox
cypress-cli uncheck <checkbox-2-ref>
```

**Expected**: Second checkbox is now unchecked.

```bash
# 5. Assert checkbox 1 is checked
cypress-cli assert <checkbox-1-ref> be.checked
```

**Expected**: Assertion passes.

---

### Page 2: Dropdown

```bash
# 6. Navigate to dropdown page
cypress-cli navigate https://the-internet.herokuapp.com/dropdown
```

**Expected**: Page with a dropdown (`<select>`) element.

```bash
# 7. Select "Option 1"
cypress-cli select <dropdown-ref> 'Option 1'
```

**Expected**: Dropdown shows "Option 1" selected.

```bash
# 8. Select "Option 2"
cypress-cli select <dropdown-ref> 'Option 2'
```

**Expected**: Dropdown now shows "Option 2" selected.

```bash
# 9. Assert the dropdown value
cypress-cli assert <dropdown-ref> have.value '2'
```

**Expected**: Assertion passes (Option 2 has value "2").

---

### Page 3: Form Authentication (Login)

```bash
# 10. Navigate to login page
cypress-cli navigate https://the-internet.herokuapp.com/login
```

**Expected**: Page with username field, password field, and Login button.

```bash
# 11. Fill username
cypress-cli fill <username-ref> 'tomsmith'
```

```bash
# 12. Fill password
cypress-cli fill <password-ref> 'SuperSecretPassword!'
```

```bash
# 13. Click Login button
cypress-cli click <login-button-ref>
```

**Expected**: Navigates to `/secure`. Flash message says "You logged into a
secure area!".

```bash
# 14. Verify URL contains "secure"
cypress-cli asserturl contain 'secure'
```

**Expected**: Assertion passes.

```bash
# 15. Assert the success message
cypress-cli assert <flash-message-ref> contain 'secure area'
```

**Expected**: Assertion passes.

---

### Page 4: JavaScript Alerts

```bash
# 16. Navigate to JavaScript alerts page
cypress-cli navigate https://the-internet.herokuapp.com/javascript_alerts
```

**Expected**: Three buttons: "Click for JS Alert", "Click for JS Confirm",
"Click for JS Prompt".

```bash
# 17. Click "Click for JS Alert"
cypress-cli click <js-alert-button-ref>
```

**Expected**: A JS alert dialog appears. The command may auto-handle it or
require explicit action.

```bash
# 18. Accept the alert
cypress-cli dialog-accept
```

**Expected**: Alert dismissed. Result text on page says "You successfully
clicked an alert".

```bash
# 19. Assert the result text
cypress-cli assert <result-ref> contain 'successfully clicked an alert'
```

**Expected**: Assertion passes.

```bash
# 20. Click "Click for JS Confirm"
cypress-cli click <js-confirm-button-ref>
```

```bash
# 21. Dismiss the confirm dialog
cypress-cli dialog-dismiss
```

**Expected**: Result text says "You clicked: Cancel".

```bash
# 22. Assert dismiss result
cypress-cli assert <result-ref> contain 'Cancel'
```

**Expected**: Assertion passes.

---

### Page 5: Key Presses

```bash
# 23. Navigate to key presses page
cypress-cli navigate https://the-internet.herokuapp.com/key_presses
```

**Expected**: An input field and a result display area.

```bash
# 24. Click into the input area first
cypress-cli click <input-ref>
```

```bash
# 25. Press the Escape key
cypress-cli press Escape
```

**Expected**: Result area shows "You entered: ESCAPE".

```bash
# 26. Assert the key press was recognized
cypress-cli assert <result-ref> contain 'ESCAPE'
```

**Expected**: Assertion passes.

---

### Page 6: Hovers

```bash
# 27. Navigate to hovers page
cypress-cli navigate https://the-internet.herokuapp.com/hovers
```

**Expected**: Three user avatar images in a row.

```bash
# 28. Hover over the first avatar
cypress-cli hover <first-avatar-ref>
```

**Expected**: Hidden content appears — shows "name: user1" and a "View profile"
link. These should appear in the snapshot after hover.

```bash
# 29. Assert the hover content is visible
cypress-cli assert <user1-heading-ref> contain 'user1'
```

**Expected**: Assertion passes.

---

### Page 7: Sortable Data Tables

```bash
# 30. Navigate to tables page
cypress-cli navigate https://the-internet.herokuapp.com/tables
```

**Expected**: Two data tables with sortable headers.

```bash
# 31. Take a screenshot of the tables
cypress-cli screenshot --filename tables-page
```

**Expected**: Screenshot saved.

```bash
# 32. Assert table header text
cypress-cli assert <last-name-header-ref> contain 'Last Name'
```

**Expected**: Assertion passes.

### Teardown

```bash
# 33. Export the full multi-page test
cypress-cli export --file /tmp/cypress-cli-validation/the-internet.cy.ts --describe 'The Internet' --it 'should exercise multiple interaction types'
```

**Expected**: A `.cy.ts` file with multiple `cy.visit()` calls (one per
sub-page), interspersed with checks, selects, fills, clicks, assertions.
Note: the exported test may be long but should be syntactically valid.

```bash
# 34. Stop the session
cypress-cli stop
```

## Success Criteria

- [ ] Navigation between 7 different sub-pages works within one session
- [ ] `check`/`uncheck` work on native checkboxes
- [ ] `select` works on native `<select>` dropdown
- [ ] `fill` + `click` completes a login form
- [ ] `dialog-accept` and `dialog-dismiss` handle JS alert/confirm dialogs
- [ ] `press` sends keyboard events that the page recognizes
- [ ] `hover` reveals hidden content
- [ ] Assertions pass for all verified states
- [ ] Session survives multiple `navigate` calls without errors
- [ ] Exported test file contains all commands in sequence

## Notes

- The Internet (herokuapp.com) is a classic E2E testing playground by Dave Haeffner.
  Each page is intentionally simple with one interaction pattern.
- Login credentials: `tomsmith` / `SuperSecretPassword!`
- The dialogs page tests both `dialog-accept` and `dialog-dismiss` —
  important because these set up one-shot event listeners.
- The hovers page tests `hover` which uses `trigger('mouseover')` —
  content only appears during hover state, so the snapshot must be taken
  while hovering or immediately after.
- Some pages may have slow loads (it's hosted on Heroku free tier). If
  commands fail with timeouts, retry once.
