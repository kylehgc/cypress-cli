# tests/

> All tests: unit, integration, and e2e.

## Structure

```
tests/
├── unit/               ← Pure function tests, mocked dependencies
│   ├── injected/       ← Aria snapshot rendering (happy-dom environment)
│   ├── daemon/         ← Command queue, session management
│   ├── client/         ← Argument parsing, command validation
│   ├── codegen/        ← Selector generation, test export
│   └── protocol/       ← Socket message serialization
├── integration/        ← Component interaction without full Cypress
│   ├── daemon-plugin/  ← Daemon↔plugin bridge
│   └── polling-loop/   ← Long-poll timeout behavior
├── e2e/                ← Full round-trip: CLI → browser → result
│   └── fixtures/       ← HTML test pages
└── parity/             ← Compare our snapshot output against Playwright's
```

## Running

```bash
npm test               # All tests
npm run test:unit      # Unit tests only
npm run test:integration
npm run test:e2e
npx vitest --watch     # Watch mode
```

## Environments

Tests use Vitest's `environmentMatchGlobs`:

- `tests/unit/injected/**` → `happy-dom` (needs DOM APIs)
- Everything else → `node` (default)

## Guidelines

See `CONVENTIONS.md` for test naming and style rules.
See `docs/TEST_PLAN.md` for the full list of test cases.
