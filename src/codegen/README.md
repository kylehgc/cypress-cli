# src/codegen/

> Generates Cypress test files from the sequence of commands executed in a
> REPL session.

## Responsibility

As the user (or LLM) executes commands through the CLI, this module:

1. Records each command, its resolved selector, and the Cypress code it maps to
2. On `export`, assembles these into a valid `.cy.ts` test file
3. Resolves element refs to stable CSS selectors using a priority-based strategy
4. Handles assertion generation

## Key Files (planned)

```
codegen/
├── index.ts          ← Public API: recordCommand(), exportTest(), getHistory()
├── history.ts        ← Ordered command history with snapshot entries
├── selector.ts       ← Ref → CSS selector resolution (priority-based)
├── template.ts       ← Test file template (describe/it structure, imports)
└── formatter.ts      ← Cypress command string formatting
```

## Selector Strategy

When a command references `e5`, we need to produce a CSS selector for the
exported test. The selector must be:

1. **Stable** — survives minor DOM changes
2. **Readable** — a human can understand what it targets
3. **Unique** — matches exactly one element

Priority order (following Cypress.ElementSelector defaults):

```
1. [data-cy="value"]
2. [data-test="value"]
3. [data-testid="value"]
4. [data-qa="value"]
5. #id                    (if unique and not auto-generated)
6. [name="value"]
7. .className             (if unique and not utility class)
8. tag[attr="value"]
9. tag:nth-child(n)       (last resort)
```

### Auto-generated ID detection

IDs like `ember-123`, `react-456`, `:r0:`, `mui-789` are auto-generated and
unstable. The selector generator should detect common patterns and skip these:

```typescript
const AUTO_GEN_ID_PATTERNS = [
	/^ember\d+$/,
	/^react-\w+$/,
	/^:r\w+:$/,
	/^mui-\d+$/,
	/^\d+$/,
	/^[a-f0-9]{8,}$/, // Hex hashes
];
```

### Utility class detection

Classes like `flex`, `mt-4`, `px-2`, `bg-blue-500` (Tailwind/utility-first CSS)
are poor selectors. We should detect utility class patterns and skip them.

## Command Recording

Each executed command produces a `HistoryEntry`:

```typescript
type HistoryEntry = {
	index: number;
	command: Command; // The raw command from the CLI
	selector: string | null; // Resolved CSS selector (null for navigate, wait)
	cypressCode: string; // The Cypress code string
	beforeSnapshot?: string; // YAML snapshot before command
	afterSnapshot: string; // YAML snapshot after command
	timestamp: number;
};
```

Example entries:

```typescript
[
	{
		index: 0,
		command: { action: 'navigate', url: '/login' },
		selector: null,
		cypressCode: "cy.visit('/login')",
		afterSnapshot: '- main: ...',
		timestamp: 1709000000000,
	},
	{
		index: 1,
		command: { action: 'type', ref: 'e1', text: 'user@example.com' },
		selector: '[data-cy="email-input"]',
		cypressCode: "cy.get('[data-cy=\"email-input\"]').type('user@example.com')",
		afterSnapshot: '- main: ...',
		timestamp: 1709000001000,
	},
	{
		index: 2,
		command: { action: 'click', ref: 'e3' },
		selector: '[data-cy="submit-btn"]',
		cypressCode: 'cy.get(\'[data-cy="submit-btn"]\').click()',
		afterSnapshot: '- main: ...',
		timestamp: 1709000002000,
	},
];
```

## Export Format

The `export` command generates:

```typescript
describe('cypress-cli generated test', () => {
	it('should complete the recorded flow', () => {
		cy.visit('/login');
		cy.get('[data-cy="email-input"]').type('user@example.com');
		cy.get('[data-cy="password-input"]').type('secretpass');
		cy.get('[data-cy="submit-btn"]').click();
		cy.url().should('include', '/dashboard');
		cy.get('[data-cy="welcome-msg"]').should('contain', 'Welcome');
	});
});
```

### Export options

- `--file <path>` — write to file instead of stdout
- `--describe <name>` — custom describe block name
- `--it <name>` — custom it block name
- `--baseUrl <url>` — make cy.visit paths relative to baseUrl

## The `undo` Command

`cypress-cli undo` removes the last entry from the history. This is useful when
the LLM (or human) makes a mistake and wants to remove it from the exported
test. Note that `undo` only affects the codegen history — it doesn't reverse
the browser action (that would require time-travel, see `docs/TIME_TRAVEL.md`).

## Open Design Questions

### Should assertions be inferred or explicit?

Two approaches:

1. **Explicit only**: the LLM/user must issue `assert` commands. Simple, predictable.
2. **Heuristic inference**: after commands that cause navigation or state changes,
   auto-add assertions (e.g., `cy.url().should('include', '/dashboard')` after
   a form submit that navigates). More magical, harder to control.

**Current decision**: Explicit only. The LLM is smart enough to issue assertions.
We can revisit heuristic inference later.

### Should the export include comments?

Adding comments like `// Navigate to login page` or `// Fill in email` makes
the exported test more readable. These could be derived from the aria snapshot
(the element's accessible name provides natural language context).

**Current decision**: Add comments for navigation and assertion commands.
Interaction commands are self-documenting from the selector + action.
