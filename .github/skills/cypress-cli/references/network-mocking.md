# Network Mocking & Request Waiting

## Available commands

| Command           | Purpose                                           |
| ----------------- | ------------------------------------------------- |
| `intercept`       | Register a URL pattern to intercept/mock requests |
| `waitforresponse` | Wait for a response matching an intercepted URL   |
| `unintercept`     | Remove one or all active intercepts               |
| `intercept-list`  | List all active intercept routes                  |
| `network`         | List all captured network requests                |

## Mocking API responses

```bash
# Mock with status code and JSON body
cypress-cli intercept '**/api/users' --status 200 --body '{"users":[]}'

# Mock with custom content type
cypress-cli intercept '**/api/health' --body 'OK' --content-type 'text/plain'

# Monitor requests without mocking (no --status or --body)
cypress-cli intercept '**/api/articles*'
```

Intercepts map to `cy.intercept()` and are replayed automatically after error
recovery.

## Waiting for network responses (SPA pattern)

The `intercept` + `waitforresponse` pair is the idiomatic Cypress pattern for
waiting on API calls. This is essential for SPA navigation where client-side
route changes trigger API fetches.

```bash
# 1. Register the intercept BEFORE the action
cypress-cli intercept '**/api/articles*'

# 2. Perform the action that triggers the API call
cypress-cli click e5

# 3. Wait for the API response
cypress-cli waitforresponse '**/api/articles*'

# 4. Now the page is fully loaded
cypress-cli snapshot
```

The exported Cypress test will contain:

```js
cy.intercept('**/api/articles*').as('apiArticles1');
cy.get('.nav-link').click();
cy.wait('@apiArticles1');
```

### Timeout option

```bash
# Wait up to 15 seconds for a slow API
cypress-cli waitforresponse '**/api/articles*' --timeout 15000
```

### Important rules

- **Register intercepts before the triggering action.** An intercept set up
  after the request fires will not capture it.
- **The pattern in `waitforresponse` must match a previously registered
  `intercept`.** If no matching intercept exists, the command will error.
- Each `intercept` generates a unique alias so that multiple intercepts for
  different patterns work independently.

## Managing intercepts

```bash
# List active intercepts
cypress-cli intercept-list

# Remove a specific intercept
cypress-cli unintercept '**/api/users'

# Remove all intercepts
cypress-cli unintercept
```

## Viewing captured traffic

```bash
# See all network requests captured since page load
cypress-cli network
```
