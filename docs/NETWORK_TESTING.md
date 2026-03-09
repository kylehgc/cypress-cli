# Network Commands Testing Guide

Testing instructions for the `network`, `intercept`, `intercept-list`, and `unintercept` commands (PR #94, Issue #59).

## Automated Tests

### Unit Tests (no Cypress required)

```bash
# Run all unit + integration tests (~795 tests)
npx vitest run tests/unit/ tests/integration/

# Run only network-related tests
npx vitest run tests/unit/client/commands.test.ts    # command schemas + parsing
npx vitest run tests/unit/daemon/session.test.ts     # intercept registry
npx vitest run tests/unit/browser/selectorGenerator.test.ts  # codegen output
npx vitest run tests/unit/codegen/codegen.test.ts    # full export with intercepts
```

**What unit tests cover:**

| Area                  | Tests                                                                 |
| --------------------- | --------------------------------------------------------------------- |
| Command schemas       | `network`/`intercept`/`intercept-list`/`unintercept` arg validation   |
| Command parsing       | Positional args, options (`--status`, `--body`, `--content-type`)     |
| Session registry      | `addIntercept`, `removeIntercept` (single/all), pattern replacement   |
| Codegen (basic)       | `cy.intercept('pattern')` for pattern-only                            |
| Codegen (full)        | `cy.intercept('pattern', { statusCode, body, headers })` with options |
| Codegen (unintercept) | Comment output: `// cy.intercept('pattern', passthrough)`             |
| Codegen (skip)        | `network` command filtered from exported test files                   |
| Full export           | `generateTestFile()` with intercept+unintercept in history            |

### E2E Tests (requires Cypress + Electron)

```bash
# Build first (required for E2E)
npm run build

# Run network E2E tests
npx vitest run tests/e2e/network.test.ts

# Run ALL E2E tests (includes network)
npx vitest run tests/e2e/
```

**What E2E tests cover:**

| Test                                            | What it validates                                        |
| ----------------------------------------------- | -------------------------------------------------------- |
| `captures network requests via passive monitor` | Initial page load requests appear in `network` output    |
| `intercepts and mocks a network response`       | `intercept` registers successfully, returns confirmation |
| `intercept-list returns active mocks`           | Daemon-local query returns registered intercepts         |
| `unintercept removes a mock`                    | Mock is removed, `intercept-list` reflects empty state   |

## Manual Testing (Live Validation)

### Prerequisites

```bash
npm run build
```

### Test 1: Basic Network Monitoring

```bash
# 1. Open a session against a site that makes network requests
node bin/cypress-cli open https://example.cypress.io/commands/actions

# 2. View captured network requests from page load
node bin/cypress-cli network

# Expected: JSON array of network entries with url, method, status, contentType, size, timestamp
# Should include the initial page HTML and any CSS/JS/image requests
```

### Test 2: Intercept with Mock Response

```bash
# 1. Open a session
node bin/cypress-cli open https://jsonplaceholder.typicode.com/

# 2. Register an intercept to mock an API response
node bin/cypress-cli intercept '**/posts' --status 200 --body '{"posts":["mocked"]}' --content-type 'application/json'

# Expected output: "Intercept registered for "**/posts""

# 3. Verify the intercept is listed
node bin/cypress-cli intercept-list

# Expected: JSON array containing the intercept entry with pattern, statusCode, body, contentType

# 4. Navigate to trigger the intercepted route
node bin/cypress-cli navigate https://jsonplaceholder.typicode.com/posts

# 5. Check the snapshot — page should show mocked JSON
node bin/cypress-cli snapshot
```

### Test 3: Unintercept

```bash
# Continuing from Test 2...

# 1. Remove the specific intercept
node bin/cypress-cli unintercept '**/posts'

# Expected output: "Intercept removed for "**/posts""

# 2. Verify intercept-list is empty
node bin/cypress-cli intercept-list

# Expected: empty array []

# 3. Navigate again — should now show real data
node bin/cypress-cli navigate https://jsonplaceholder.typicode.com/posts
```

### Test 4: Unintercept All

```bash
# 1. Register multiple intercepts
node bin/cypress-cli intercept '**/posts' --status 404
node bin/cypress-cli intercept '**/users' --status 500

# 2. Verify both listed
node bin/cypress-cli intercept-list

# 3. Remove all at once
node bin/cypress-cli unintercept

# Expected output: "All 2 intercept(s) removed"

# 4. Verify empty
node bin/cypress-cli intercept-list
```

### Test 5: Codegen with Intercepts

```bash
# 1. Open a session
node bin/cypress-cli open https://example.cypress.io/commands/actions

# 2. Register an intercept
node bin/cypress-cli intercept '**/api/data' --status 200 --body '{"message":"hello"}' --content-type 'application/json'

# 3. Do some interactions
node bin/cypress-cli snapshot
# (use refs from snapshot)
node bin/cypress-cli click <ref>

# 4. Export the test
node bin/cypress-cli export

# Expected: Generated test file should contain:
#   cy.intercept('**/api/data', { statusCode: 200, body: {"message":"hello"}, headers: { 'content-type': 'application/json' } });
# The `network` commands should NOT appear in the export

# 5. Clean up
node bin/cypress-cli stop
```

### Test 6: Verify Exported Test is Valid

After exporting from Test 5, verify the generated test file:

```bash
# The exported file should look like this (conceptual):
#
# describe('cypress-cli generated test', () => {
#   it('should complete the recorded flow', () => {
#     cy.visit('https://example.cypress.io/commands/actions');
#     cy.intercept('**/api/data', { statusCode: 200, body: {"message":"hello"}, headers: { 'content-type': 'application/json' } });
#     cy.get('[data-cy="action-email"]').click();
#   });
# });

# Run it with Cypress to verify it's syntactically valid:
npx cypress run --spec <path-to-exported-file>
```

## Review Checklist

### Codegen Quality

- [ ] `intercept` with options produces `cy.intercept(pattern, { statusCode, body, headers })` — not bare `cy.intercept(pattern)`
- [ ] JSON body is inlined as parsed object (not string): `body: {"key":"value"}` not `body: '{"key":"value"}'`
- [ ] Plain text body is quoted: `body: 'OK'`
- [ ] `content-type` maps to `headers: { 'content-type': '...' }`
- [ ] `unintercept` produces a comment: `// cy.intercept('pattern', passthrough)`
- [ ] `network` is filtered out of exports entirely
- [ ] `intercept-list` never reaches Cypress, has no `cypressCommand`, is excluded from codegen

### Error Recovery

- [ ] Passive network monitor is re-registered after error recovery (new `it()` block)
- [ ] Active route mocks are replayed with their original static responses after recovery
- [ ] `_activeRoutes` Map stores pattern → staticResponse for replay

### Known Limitations

1. **Network log grows unbounded** — The `_networkLog` array grows for the session lifetime. Long sessions with many requests will accumulate memory. Consider capping or adding `network --clear`.

2. **Unintercept relies on LIFO precedence** — `unintercept` registers a passthrough handler on top of the original mock. Cypress processes handlers LIFO, so the passthrough is checked first. The original mock handler is still registered but never reached. This works correctly because `req.continue()` sends the request to the real server.

3. **Daemon and driver state are shadow-synced** — The daemon maintains an `InterceptEntry[]` registry for `intercept-list` (fast, no Cypress round-trip). The driver maintains `_activeRoutes` for execution and recovery. These are synced via command result reporting but could diverge on network failure.
