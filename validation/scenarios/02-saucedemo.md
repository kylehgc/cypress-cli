# Scenario 2: SauceDemo E-Commerce — Full Purchase Flow

**Target**: `https://www.saucedemo.com`
**Complexity**: Medium (~20 commands)
**Time**: ~3 minutes

## What This Tests

A complete e-commerce purchase workflow: login → browse inventory → add items
to cart → checkout → verify confirmation. Exercises form filling, navigation
through multiple pages, element assertions, and stateful multi-step flows.

## Commands Exercised

| Command      | Used For                                                       |
| ------------ | -------------------------------------------------------------- |
| `open`       | Start session                                                  |
| `snapshot`   | Read page state                                                |
| `fill`       | Fill login credentials, checkout form fields                   |
| `click`      | Login button, add-to-cart buttons, cart icon, checkout buttons |
| `assert`     | Verify text content, element presence                          |
| `asserturl`  | Verify navigation to correct pages                             |
| `screenshot` | Capture state at key points                                    |
| `select`     | Sort inventory dropdown                                        |
| `export`     | Generate test file                                             |
| `stop`       | End session                                                    |

## Credentials

```
Username: standard_user
Password: secret_sauce
```

## Steps

### Setup & Login

```bash
# 1. Open SauceDemo
cypress-cli open https://www.saucedemo.com
```

**Expected**: Login page with username/password fields and "Login" button.
Snapshot shows two text inputs and a submit button.

```bash
# 2. Fill username
cypress-cli fill <username-ref> 'standard_user'
```

**Expected**: Username field has value "standard_user".

```bash
# 3. Fill password
cypress-cli fill <password-ref> 'secret_sauce'
```

**Expected**: Password field is filled (value may not be visible in snapshot
due to password masking).

```bash
# 4. Click Login
cypress-cli click <login-button-ref>
```

**Expected**: Page navigates to inventory. Snapshot shows product cards with
names, prices, and "Add to cart" buttons.

```bash
# 5. Verify we're on the inventory page
cypress-cli asserturl contain 'inventory'
```

**Expected**: Assertion passes.

### Browse & Add to Cart

```bash
# 6. Take a screenshot of the inventory page
cypress-cli screenshot --filename inventory-page
```

**Expected**: Screenshot saved. Output shows file path.

```bash
# 7. Sort products by price (low to high) — find the sort dropdown
cypress-cli select <sort-dropdown-ref> 'lohi'
```

**Expected**: Products reorder with cheapest first. Snapshot shows updated
order.

```bash
# 8. Add first product to cart (e.g., "Sauce Labs Onesie" — cheapest)
cypress-cli click <add-to-cart-button-ref-1>
```

**Expected**: Button text changes from "Add to cart" to "Remove".
Cart badge appears showing "1".

```bash
# 9. Add second product
cypress-cli click <add-to-cart-button-ref-2>
```

**Expected**: Cart badge shows "2". Second item's button changes to "Remove".

```bash
# 10. Assert cart badge shows 2
cypress-cli assert <cart-badge-ref> have.text '2'
```

**Expected**: Assertion passes.

### Cart Review

```bash
# 11. Click the cart icon to go to cart page
cypress-cli click <cart-icon-ref>
```

**Expected**: Navigates to cart page. Snapshot shows two items with names,
quantities, and prices. "Checkout" and "Continue Shopping" buttons visible.

```bash
# 12. Verify we're on the cart page
cypress-cli asserturl contain 'cart'
```

**Expected**: Assertion passes.

```bash
# 13. Assert both items are present (check first item name)
cypress-cli assert <first-item-name-ref> contain 'Sauce Labs'
```

**Expected**: Assertion passes — item name contains "Sauce Labs".

### Checkout

```bash
# 14. Click Checkout
cypress-cli click <checkout-button-ref>
```

**Expected**: Navigates to checkout step one (your information form) with
first name, last name, and zip code fields.

```bash
# 15. Fill checkout form — first name
cypress-cli fill <first-name-ref> 'Test'
```

```bash
# 16. Fill checkout form — last name
cypress-cli fill <last-name-ref> 'User'
```

```bash
# 17. Fill checkout form — zip code
cypress-cli fill <zip-code-ref> '90210'
```

**Expected**: All three fields filled.

```bash
# 18. Click Continue
cypress-cli click <continue-button-ref>
```

**Expected**: Navigates to checkout step two (overview). Shows items, prices,
tax, and total. "Finish" button visible.

```bash
# 19. Click Finish to complete the order
cypress-cli click <finish-button-ref>
```

**Expected**: Navigates to confirmation page. Shows "Thank you for your order!"
or similar confirmation message.

```bash
# 20. Assert the confirmation message
cypress-cli assert <confirmation-heading-ref> contain 'Thank you'
```

**Expected**: Assertion passes.

### Teardown

```bash
# 21. Take a screenshot of the confirmation
cypress-cli screenshot --filename checkout-complete
```

```bash
# 22. Export the test
cypress-cli export --file /tmp/cypress-cli-validation/saucedemo.cy.ts --describe 'SauceDemo' --it 'should complete a purchase' --baseUrl https://www.saucedemo.com
```

**Expected**: A `.cy.ts` file with the full flow: visit → fill login → click →
navigate → select sort → click add-to-cart → click cart → fill checkout → finish.
Verify that `--baseUrl` makes the visit use a relative path.

```bash
# 23. Stop the session
cypress-cli stop
```

## Success Criteria

- [ ] Login flow works end-to-end (fill + click)
- [ ] `fill` command clears existing values before typing
- [ ] `select` correctly changes the sort dropdown
- [ ] Cart state persists across page navigations
- [ ] Checkout form accepts fill commands for all three fields
- [ ] Final assertion correctly validates confirmation text
- [ ] Screenshots are saved to disk
- [ ] Exported test includes all steps with reasonable selectors
- [ ] `--baseUrl` in export produces relative `cy.visit('/')` path

## Notes

- SauceDemo has intentionally "broken" users (`problem_user`,
  `performance_glitch_user`, `error_user`, `visual_user`). Only `standard_user`
  works correctly — others can be used for future error-recovery scenarios.
- The site uses `data-test` attributes on many elements, which should produce
  clean selectors via `@cypress/unique-selector`.
- Inventory page has 6 products. The sort dropdown has options: `az`, `za`,
  `lohi`, `hilo`.
