Execute the design review runbook at `docs/DESIGN_REVIEW_RUNBOOK.md`. Read it fully before starting.

**Key files:**

- **Runbook:** `docs/DESIGN_REVIEW_RUNBOOK.md` — follow every step in order
- **Logbook:** `docs/DESIGN_REVIEW_LOGBOOK.md` — write an entry after EVERY step (this is mandatory, see ABORT RULE in the runbook)
- **Mockups:** `mockups/*.html` — the 9 pages to review + `index.html`
- **Screenshots:** save to `mockups/screenshots/`

**Tools you need:**

- `playwright-cli` skill (at `.claude/skills/playwright-cli/SKILL.md`) — for opening pages, navigating, scrolling, and taking screenshots
- `view_image` — for inspecting each screenshot after capture

**How to take screenshots:**

```
playwright-cli open file:///Users/kylechristensen/projects/cypress-cli/mockups/index.html
playwright-cli screenshot --filename=mockups/screenshots/00-index.png
playwright-cli press End
playwright-cli goto file:///Users/kylechristensen/projects/cypress-cli/mockups/daisyui-a.html
```

**Critical reminders:**

- Be brutally honest. If a design is bad, say so. Read the "CRITICAL — Be honest and blunt" section in the runbook.
- Write to the logbook after EVERY step. No exceptions.
- Use `view_image` on every screenshot before writing observations.
- The runbook has 16 steps (0–15). Do all of them.
