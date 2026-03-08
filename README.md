# cypress-cli

A CLI tool that gives LLMs (and humans) REPL-like access to a live web page through real Cypress commands, using Playwright's aria snapshot for DOM representation. Every action executes as a genuine Cypress command (`cy.get().click()`, `cy.visit()`, etc.), and the result is returned as an [aria snapshot](https://playwright.dev/docs/aria-snapshots) — a compact, accessibility-tree-based view of the page that LLMs can reason about.

Unlike [`playwright-cli`](https://github.com/microsoft/playwright-cli) which targets Playwright test generation, **cypress-cli** targets **Cypress test generation**: every command you run maps 1-to-1 to a Cypress API call, and you can export your entire session as a ready-to-run `.cy.ts` test file. Both tools follow the same CLI + SKILLS model for coding agents — see [docs/ROADMAP.md](docs/ROADMAP.md) for a detailed comparison.

## Prerequisites

- **Node.js** ≥ 18
- **Cypress** ≥ 12 (installed as a peer dependency)

## Installation

```bash
# Global install
npm install -g cypress-cli

# Or run directly with npx
npx cypress-cli <command>
```

### Install AI agent skills

Install the bundled project skill into `.github/skills/cypress-cli` so coding
agents can auto-discover it in your repository:

```bash
cypress-cli install --skills
```

If you are running the CLI locally through `npx`, use:

```bash
npx cypress-cli install --skills
```

## Quick Start

```bash
# 1. Open a page in a Cypress-controlled browser
cypress-cli open https://example.com

# 2. Get an aria snapshot of the current page
cypress-cli snapshot

# 3. Click an element by its ref (from the snapshot output)
cypress-cli click e5

# 4. Type into an input
cypress-cli type e3 "hello world"

# 5. Assert something about the page
cypress-cli assert e5 contain.text "hello"

# 6. Export your session as a Cypress test
cypress-cli export --file my-test.cy.ts
```

### Interactive REPL

```bash
# Start an interactive session
cypress-cli repl

# Then type commands directly:
> open https://example.com
> snapshot
> click e5
> export
```

## Commands

| Category    | Commands                                                          |
| ----------- | ----------------------------------------------------------------- |
| Core        | `open`, `stop`, `status`, `install`, `snapshot`                   |
| Navigation  | `navigate`, `back`, `forward`, `reload`                           |
| Interaction | `click`, `dblclick`, `rightclick`, `type`, `clear`, `select`      |
|             | `check`, `uncheck`, `focus`, `blur`, `scrollto`, `hover`          |
| Keyboard    | `press`                                                           |
| Assertion   | `assert`, `asserturl`, `asserttitle`                              |
| Wait        | `wait`, `waitfor`                                                 |
| Export      | `export`, `history`, `undo`                                       |

See [docs/COMMANDS.md](docs/COMMANDS.md) for full syntax, schemas, and Cypress API mappings.

## AI Agent Skills

cypress-cli is designed as a tool-use interface for LLMs. To integrate with an AI agent:

1. **Tool definition**: Each command is a tool call. The agent sends a command string, receives a JSON response with `snapshot` (aria tree) and `success` (boolean).
2. **Ref-based interaction**: Elements in the aria snapshot are tagged with refs (e.g., `e5`). The agent uses these refs to target elements for clicks, typing, and assertions.
3. **Session export**: After the agent builds a workflow, `export` generates a complete Cypress test file capturing every action.

Example tool-use flow:
```
Agent → cypress-cli open https://app.example.com
Agent ← { snapshot: "- heading \"Dashboard\" [ref=e1]\n- button \"Settings\" [ref=e2]\n...", success: true }
Agent → cypress-cli click e2
Agent ← { snapshot: "- heading \"Settings\" [ref=e3]\n- textbox \"Name\" [ref=e4]\n...", success: true }
Agent → cypress-cli export --file settings.cy.ts
Agent ← { success: true, file: "settings.cy.ts" }
```

To install the packaged skill files into the current project, run:

```bash
cypress-cli install --skills
```

This copies the shipped `skills/cypress-cli/` directory into
`.github/skills/cypress-cli/`, including the task-specific reference guides.

## How It Works

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐     ┌─────────────┐
│  LLM / User │────▶│  CLI Client  │────▶│    Daemon     │────▶│   Cypress   │
│             │◀────│  (one-shot)  │◀────│ (persistent)  │◀────│  (browser)  │
└─────────────┘     └──────────────┘     └───────────────┘     └─────────────┘
                     Unix socket IPC      cy.task() bridge
```

1. The CLI client sends commands to a persistent daemon over a Unix socket
2. The daemon forwards commands to a running Cypress test via `cy.task()` polling
3. Cypress executes real browser commands and returns aria snapshots
4. Results flow back to the caller

## Documentation

- [Architecture](ARCHITECTURE.md) — system design, data flow, component diagram
- [Commands](docs/COMMANDS.md) — all commands, schemas, Cypress API mappings
- [Conventions](CONVENTIONS.md) — code style, naming, error handling
- [Test Plan](docs/TEST_PLAN.md) — test structure, fixtures, and coverage

## License

MIT
