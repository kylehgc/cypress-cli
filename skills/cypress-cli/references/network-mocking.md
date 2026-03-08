# Network mocking

Network mocking commands are planned but are **not implemented yet** in the
current `cypress-cli` release.

## Planned scope

The roadmap includes:

- `route <pattern> [opts]`
- `route-list`
- `unroute [pattern]`
- passive `network` inspection

These features are expected to map to `cy.intercept()` and daemon-side tracking
of registered intercepts.

## Guidance today

- Do not pretend `route`, `route-list`, or `unroute` already exist.
- If request mocking is required before these commands land, explain that the
  CLI does not yet expose network interception as a first-class command.
- Once implemented, prefer the dedicated commands over ad hoc test edits so the
  mocked routes remain visible to the agent and compatible with export/history.
