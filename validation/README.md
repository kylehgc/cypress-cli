# LLM Validation Scenarios

Structured test scenarios for validating cypress-cli with real LLM-driven
workflows against live public websites. See [issue #66](https://github.com/kylehgc/cypress-cli/issues/66).

## Purpose

Unit and integration tests validate internal correctness, but they don't answer:

- Can an LLM parse snapshot YAML and extract refs correctly?
- Are error messages actionable enough for self-correction?
- Does the full open → snapshot → interact → assert → export loop work?
- Can the exported test compile and run against a real site?

These scenarios test the **end-to-end LLM experience** against real public web
applications — not test fixtures.

## Scenarios

| #   | Name                                                    | Target Site                   | Complexity             | Commands Exercised                                                                                |
| --- | ------------------------------------------------------- | ----------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | [TodoMVC](scenarios/01-todomvc.md)                      | `demo.playwright.dev/todomvc` | Simple (~12 commands)  | type, press, click, check, dblclick, assert, export                                               |
| 2   | [SauceDemo E-Commerce](scenarios/02-saucedemo.md)       | `www.saucedemo.com`           | Medium (~20 commands)  | fill, click, assert, navigate, select, screenshot, export                                         |
| 3   | [The Internet Multi-Page](scenarios/03-the-internet.md) | `the-internet.herokuapp.com`  | Broad (~30 commands)   | check, uncheck, select, fill, click, assert, dialog-accept, press, upload, drag, navigate, export |
| 4   | [RealWorld Conduit](scenarios/04-realworld-conduit.md)  | `demo.realworld.show`         | Complex (~25 commands) | fill, click, assert, type, navigate, asserturl, asserttitle, snapshot, export                     |

## How to Run

### Prerequisites

```bash
npm run build          # Build IIFE bundles
```

### Manual (Recommended for First Run)

Walk through each scenario file step by step, running the commands listed and
checking the expected outcomes. This is the intended use — have an LLM read
the scenario and execute it.

### With an LLM Agent

Point your agent at a scenario file:

```
Read validation/scenarios/01-todomvc.md and execute the cypress-cli
validation scenario described there. Run each step, verify the expected
outcomes, and report any failures.
```

### Quick Smoke Test (All Scenarios)

```bash
bash validation/run-all.sh
```

This runs the command sequences non-interactively. It does **not** verify
snapshot contents (that requires an LLM or human to read the YAML). It only
checks that commands return successfully.

## Evaluation Criteria

After running a scenario, assess:

| Criteria                 | What to Check                                                      |
| ------------------------ | ------------------------------------------------------------------ |
| **Snapshot readability** | Can refs be identified for target elements from the YAML?          |
| **Ref stability**        | Do refs remain consistent across sequential commands?              |
| **Error recovery**       | When a command fails, does the error + snapshot enable correction? |
| **Command feedback**     | Does `cypressCommand` output match what actually happened?         |
| **Export quality**       | Does the exported test file compile? Are selectors reasonable?     |
| **Token efficiency**     | Is the snapshot file reasonably sized? No redundant output?        |

## Adding Scenarios

Create a new `NN-name.md` file in `scenarios/` following the existing format:

1. **Header**: site name, URL, what it tests
2. **Setup**: the `open` command
3. **Steps**: numbered commands with expected outcomes
4. **Teardown**: export + stop
5. **Coverage matrix**: which cypress-cli commands the scenario exercises
