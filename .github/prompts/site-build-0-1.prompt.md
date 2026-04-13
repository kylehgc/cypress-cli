---
description: 'Autonomous Phase 0 + Phase 1 build with 3-model visual review and fix loop. Kick off and walk away.'
name: 'Site Build (Phase 0–1)'
agent: 'agent'
tools: [read, search, edit, execute, agent, todo, web]
argument-hint: 'No arguments needed — runs the full Phase 0–1 pipeline'
---

You are an autonomous build agent. You will scaffold the Astro project
(Phase 0), build the full landing page (Phase 1), take screenshots, get
three independent visual reviews, and fix every issue — all without user
intervention.

**DO NOT ask the user any questions.** Make reasonable decisions and
document them in the logbook.

---

## Step 1 — Read all reference docs

Read these files at the start. They are your specification. Do not skip any.

1. `docs/SITE_BUILD_RUNBOOK.md` — step-by-step build instructions
2. `docs/SITE_DESIGN.md` — full design spec (especially §4.5, §4.6, §5.1)
3. `docs/SITE_BUILD_LOGBOOK.md` — prior progress (may be empty)
4. `CONVENTIONS.md` — code style rules
5. `AGENTS.md` — agent workflow rules

## Step 2 — Phase 0: Project Setup

Follow **every step** in `docs/SITE_BUILD_RUNBOOK.md` → Phase 0 (Steps 0.1–0.8).
These are:

1. Initialize Astro project in `site/`
2. Install Tailwind CSS v4 via `@tailwindcss/vite` (**not** `@astrojs/tailwind`)
3. Install React integration
4. Initialize shadcn/ui
5. Apply Terminal Native theme overrides (CSS variables from §4.6)
6. Install IBM Plex fonts
7. Install initial shadcn components
8. Run the anti-default checklist

After each sub-step, verify the result before moving on.
After all steps, verify the **Phase 0 Gate** from the runbook:

- [ ] `npm run build` succeeds in `site/`
- [ ] No anti-default violations (grep searches return nothing)
- [ ] IBM Plex fonts are installed
- [ ] shadcn components installed and themed
- [ ] Zero border-radius anywhere

**If the gate fails:** fix the issue before proceeding.

Log Phase 0 results to `docs/SITE_BUILD_LOGBOOK.md`.

## Step 3 — Phase 1: Landing Page

Follow **every step** in `docs/SITE_BUILD_RUNBOOK.md` → Phase 1 (Steps 1.1–1.12).
These are:

1. Build `<TerminalWindow>` component
2. Build `<TerminalLine>` and `<CopyButton>` components
3. Build hero section (terminal + tagline + typing animation)
4. Build features section (3 `<FeatureCard>` components)
5. Build how-it-works section (two terminal windows)
6. Build command table (10–15 curated commands)
7. Build nav and footer
8. Build base layout (`BaseLayout.astro`)
9. Accessibility pass (contrast, keyboard, aria, reduced-motion)
10. Responsive pass (1280px, 768–1023px, <768px)
11. Performance audit (zero JS, <100KB gzip)
12. Anti-default checklist (again)

After all steps, verify the **Phase 1 Gate** from the runbook:

- [ ] Landing page renders correctly at all breakpoints
- [ ] Zero client-side JavaScript (except copy button)
- [ ] Anti-default checklist passes
- [ ] Page weight < 100KB gzip
- [ ] Typing animation works and respects `prefers-reduced-motion`

**If the gate fails:** fix the issue before proceeding.

Log Phase 1 results to `docs/SITE_BUILD_LOGBOOK.md`.

## Step 4 — Screenshot Capture

1. Build the site: `cd site && npm run build`
2. Start preview server: `cd site && npm run preview &`
3. If no screenshot script exists, create `site/scripts/screenshot.mjs`
   using Playwright. It must capture at these viewport widths:
   - Desktop: 1440×900
   - Tablet: 768×1024
   - Mobile: 375×812
4. Run the script:
   ```bash
   npx playwright install chromium
   node site/scripts/screenshot.mjs
   ```
   Save to `site/screenshots/` with descriptive names:
   `desktop-full.png`, `desktop-hero.png`, `desktop-features.png`,
   `desktop-commands.png`, `tablet-full.png`, `mobile-full.png`
5. Stop the preview server
6. View each screenshot yourself to verify they captured correctly.
   If any are blank or broken, fix the issue and re-capture.

## Step 5 — Visual Review (3 models)

Invoke all three review agents as subagents. Send each one the SAME
prompt, varying only the agent name:

Agents: **Review (GPT-5.4)**, **Review (Gemini)**, **Review (Opus)**

Prompt for each:

> You are reviewing the cypress-cli launch site build.
>
> Read these files first:
>
> - `docs/SITE_DESIGN.md` — full design spec, especially §4.6 Anti-Default Rules
> - `docs/SITE_BUILD_RUNBOOK.md` — runbook (Phases 0 and 1)
> - `docs/SITE_BUILD_LOGBOOK.md` — what was implemented
>
> Now view ALL of these screenshots and compare against the spec:
> [list every .png file in site/screenshots/]
>
> The task was: Phase 0 (Astro + Tailwind v4 + shadcn + Terminal Native
> theme setup) and Phase 1 (full static landing page with hero, features,
> how-it-works, command table, nav, footer).
>
> Return your structured visual review with Brand Score.

After all three return:

1. Consolidate: deduplicate same issues across reviewers, use highest
   severity (Critical > Warning > Nit)
2. Note disagreements
3. Compute average Brand Score
4. Append everything to `docs/SITE_BUILD_LOGBOOK.md` under
   `## Visual Review — [date]`

## Step 6 — Fix Loop

1. Read through every **Critical** and **Warning** from the consolidated review
2. Create a todo list for fixes
3. For each issue:
   - If valid → fix it
   - If wrong (reviewer misread screenshot or spec) → note WHY in logbook
4. After all fixes: rebuild, re-take screenshots, view them yourself
5. If any Critical issues were fixed, run ONE more review cycle:
   re-invoke all 3 agents with the new screenshots. Repeat this step
   at most once (2 total review rounds max).
6. Append `## Fixes Applied — [date]` to the logbook

## Step 7 — Final Report

Print a summary for the user:

```
## Build Complete — Phase 0 + Phase 1

### What was built
- [list major components and features]

### Visual Review
- GPT-5.4 Brand Score: X/10
- Gemini Brand Score: X/10
- Opus Brand Score: X/10
- **Average: X/10**
- Issues found: N Critical, N Warning, N Nit
- Issues fixed: N
- Issues declined: N (with reasons)

### Build Status
- `npm run build`: ✅/❌
- Page weight: XXkB gzip
- Client-side JS: none / [details]

### Needs Human Review
- [anything requiring judgment]
```

## Rules

- Follow the anti-default rules in `docs/SITE_DESIGN.md` §4.6 — this is
  the **MOST IMPORTANT** design constraint. Every component, every color,
  every radius must comply.
- Use pinned versions from `docs/SITE_BUILD_RUNBOOK.md` §Pinned Versions.
- DO NOT install `@astrojs/tailwind` — it is deprecated.
- DO NOT ask the user questions — decide and document.
- DO NOT skip the visual review — all three reviewers must run.
- DO NOT skip the fix loop — address every Critical and Warning.
- Keep the logbook updated after every major step.
- If something fails and you cannot fix it after 3 attempts, log it in
  the logbook as a blocker and move on to the next step.
