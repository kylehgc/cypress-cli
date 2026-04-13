# Launch Site Design Mockups — Logbook

> **Linked runbook:** [DESIGN_MOCKUP_RUNBOOK.md](DESIGN_MOCKUP_RUNBOOK.md)
>
> **Instructions:** After completing (or failing) each runbook step, add
> an entry below. This is **part of the task**, not optional.
>
> **ABORT RULE:** If you cannot write a logbook entry for a completed
> step — for any reason (file locked, write failed, forgot, skipped) —
> **you must stop all work immediately.** Do not proceed to the next
> step. Do not attempt to batch entries later. Each entry must be
> written before starting the next step. Work without a logbook entry
> is invisible, unrecoverable, and not considered done.
>
> The logbook is how progress is tracked across session boundaries and
> how future agents recover context. If a session ends mid-task, the
> next agent reads this file to know exactly where to resume.
>
> **What to record:**
>
> - Date/time (with minutes) and step number
> - Outcome: PASS, FAIL, PARTIAL, or BLOCKED
> - Files created, modified, or deleted
> - Errors encountered and how they were resolved
> - Decisions made that deviate from the runbook
> - Anything that surprised you or contradicted expectations
>
> **Format:**
>
> ```
> ### YYYY-MM-DD HH:MM — Step N: Short Title [OUTCOME]
> [details, decisions, errors encountered, files changed]
> ```

---

<!-- Logbook entries go below this line -->

### 2026-04-12 10:00 — Step 0: Create Directory and Index Page [PASS]

- Created `mockups/index.html` with a dark, minimal design (IBM Plex Mono headings, `#0a0a0a` background)
- 3×3 grid layout: rows = libraries (DaisyUI, Shoelace, Tailwind-only), columns = directions (Lab Manual, Signal, Terminal Native)
- Each card has colored accent tag (amber/teal/green), title, description, and library version label
- All 9 links point to their respective HTML files (will 404 until created)
- Column headers include colored dots matching the direction's accent color
- Footer with GitHub link
- No deviations from runbook

### 2026-04-12 10:05 — Step 1: DaisyUI × Lab Manual [PASS]

- Created `mockups/daisyui-a.html`
- CDN: DaisyUI 5 themes CSS + Tailwind CSS v4 browser build
- Custom themes `labmanual-light` and `labmanual-dark` with CSS variables
- Dark mode auto-detection via `prefers-color-scheme` with change listener
- All 7 sections: navbar, hero, features (3 cards), workshop (3-col), command table, capability matrix, agent flow, architecture, footer
- Section numbers (01–07) with amber accent color
- All `--rounded-*` set to 0 for sharp corners
- Real content: tagline from README, install command, quick start, command table (13 categories), capability matrix (28/20/16/12), tool-use flow, architecture diagram
- IBM Plex Mono for headings/code, IBM Plex Sans for body
- "← All Mockups" floating button to return to index
- No deviations from runbook

### 2026-04-12 10:12 — Step 2: DaisyUI × Signal [PASS]

- Created `mockups/daisyui-b.html`
- Custom themes `signal-light` and `signal-dark` with teal accent (#4A9A9A / #5AB5B5)
- IBM Plex Serif for headings (Google Fonts import added)
- `--rounded-*` set to 0.125rem (subtle, not zero)
- Pull-quote blockquote between hero and features with left teal border
- Feature cards: no border, no shadow — clean editorial feel
- Command table: minimal borders, only header underline, no zebra
- Thin 1px dividers between sections (not heavy rules)
- Hero heading larger (text-5xl/6xl) with more vertical padding (py-28)
- More whitespace throughout (py-20 sections, gap-8 features)
- All real content preserved from Lab Manual variant
- Visually distinct from Lab Manual: serif headings, teal palette, editorial calm
- No deviations from runbook

### 2026-04-12 10:18 — Step 3: DaisyUI × Terminal Native [PASS]

- Created `mockups/daisyui-c.html`
- Custom themes `terminal-light` and `terminal-dark` with green accent (#22C55E / #16A34A)
- All `--rounded-*` set to 0
- Headings use IBM Plex Mono with `$` prompt prefix via `.prompt-heading::before` CSS
- Hero install command uses custom terminal window with title bar dots (red/yellow/green) instead of mockup-code
- Feature cards have monospace border labels: `[01/COMMANDS]`, `[02/SNAPSHOTS]`, `[03/CODEGEN]`
- Workshop REPL styled as terminal window with green `cypress-cli >` prompt (green-on-dark)
- Command table: monospace throughout, compact, green highlight on hover (`hover:bg-primary/5`)
- Navbar links lowercase, blinking cursor after logo (`animate-pulse`)
- Footer: single line with `$ exit` styled
- All text lowercase for terminal feel
- All real content preserved
- No deviations from runbook

### 2026-04-12 10:25 — Step 4: Shoelace × Lab Manual [PASS]

- Created `mockups/shoelace-a.html`
- CDN: Shoelace 2.20 (light + dark CSS, autoloader JS) + Tailwind CSS v4 browser build
- Shoelace CSS custom properties overridden: `--sl-color-primary-*` mapped to amber scale, all `--sl-border-radius-*` set to 0
- Custom CSS variables for bg/fg/border/muted/surface switching between light/dark
- Dark mode: toggles `sl-theme-dark` / `sl-theme-light` class on `<html>` via `prefers-color-scheme`
- Tab-based command reference: `sl-tab-group` with 8 tabs (Core, Navigation, Interaction, Assertion, Execution, Network, Storage, Other) with `sl-badge` counts — notable UX difference from DaisyUI flat table
- `sl-tree` for workshop TOC navigation
- `sl-copy-button` on install command
- `sl-card` for feature cards, `sl-button` for CTAs, `sl-divider` between sections
- Numbered sections (01–07) with amber accent
- IBM Plex Mono headings, IBM Plex Sans body
- All real content preserved from repo
- No deviations from runbook

### 2026-04-12 10:32 — Step 5: Shoelace × Signal [PASS]

- Created `mockups/shoelace-b.html`
- Shoelace CSS custom properties: `--sl-color-primary-*` mapped to teal scale, `--sl-border-radius-*` set to 2px
- IBM Plex Serif for headings (h1-h3), IBM Plex Sans for body, IBM Plex Mono for code
- Pull-quote between hero and features with left teal border
- `sl-card` with `border: none; box-shadow: none` for clean editorial feel
- Feature cards: no borders, just heading + teal underline accent + text
- Tab panels have generous padding (1.5rem)
- Tab badges removed for cleaner editorial look (vs Lab Manual which kept them)
- More whitespace: py-20 sections, py-28 hero, gap-10 features, gap-8 nav links
- Thin 1px dividers between all sections
- All real content preserved
- Visually distinct: serif headings, teal, generous whitespace, editorial calm
- No deviations from runbook

### 2026-04-12 10:38 — Step 6: Shoelace × Terminal Native [PASS]

- Created `mockups/shoelace-c.html`
- Shoelace `--sl-color-primary-*` mapped to green scale, all `--sl-border-radius-*` set to 0
- IBM Plex Mono for headings with `$` prompt prefix via `.prompt-heading::before`
- Terminal window component: title bar dots + green-on-dark body, used for hero install, REPL, agent flow, architecture
- `sl-card` components with monospace border labels: `[01/COMMANDS]`, `[02/SNAPSHOTS]`, `[03/CODEGEN]`
- `sl-tree` TOC items in monospace (via `sl-tree-item::part(label)` override), lowercase
- Compact `sl-tab-group` for commands: lowercase tab labels, green indicator
- Blinking cursor on logo, all text lowercase
- Footer: `$ exit` styled single line
- All real content preserved
- No deviations from runbook

### 2026-04-12 10:44 — Step 7: Tailwind-only × Lab Manual [PASS]

- Created `mockups/tailwind-a.html`
- CDN: Tailwind CSS v4 browser build only — no component library
- Custom `@theme` with `--color-accent: oklch(0.75 0.18 60)`, bg/fg/muted/border tokens
- Dark mode via `@media (prefers-color-scheme: dark)` overriding `@theme` values
- All components hand-crafted: `<nav>` with flexbox, `<pre>` install block, `<div>` feature cards with border, `<table>` with `even:bg-bg-alt` striping, CSS Grid workshop
- Numbered sections (01–07), amber accent, sharp corners (0 border-radius), horizontal rules
- IBM Plex Mono for headings/code, IBM Plex Sans for body
- Notably more utility classes needed vs DaisyUI (manual button styling, manual table striping)
- All real content preserved
- No deviations from runbook

## Step 8 — Tailwind-only × Signal (`tailwind-b.html`)

- **Status**: PASS
- Created `mockups/tailwind-b.html`
- CDN: Tailwind CSS v4 browser build only — same approach as tailwind-a
- Custom `@theme` with `--color-accent: oklch(0.68 0.12 195)` (teal), same token structure
- Dark mode via `@media (prefers-color-scheme: dark)` overriding `@theme` values
- IBM Plex Serif for headings, IBM Plex Sans for body, IBM Plex Mono for code
- Pull-quote `<blockquote>` with `border-l-2 border-accent`, serif italic text
- Minimal table: no zebra striping, header underline via `border-b-2`, clean rows
- Generous whitespace: `py-20`/`py-28`, max-w-3xl hero, max-w-4xl content
- Feature cards: accent underline `<div>` instead of bordered cards, editorial spacing
- Capability matrix: centered stat blocks with serif numbers, minimal dividers
- Hand-crafted horizontal rules between sections (`border-t border-border`)
- 2px border-radius via `rounded-sm` throughout
- All real content preserved
- No deviations from runbook (tailwind-b signal direction)

## Step 9 — Tailwind-only × Terminal Native (`tailwind-c.html`)

- **Status**: PASS
- Created `mockups/tailwind-c.html`
- CDN: Tailwind CSS v4 browser build only — same approach as tailwind-a/b
- Custom `@theme` with `--color-accent: oklch(0.72 0.19 145)` (green), plus `--color-terminal-bg`/`--color-terminal-fg` tokens for terminal windows
- Dark mode via `@media (prefers-color-scheme: dark)` overriding `@theme` values
- IBM Plex Mono throughout (headings + body), IBM Plex Sans available but not primary
- `prompt-heading::before { content: '$ ' }` for all `h2` headers
- Terminal windows: hand-crafted `<div>` with title bar dots (`.terminal-dots::before`), `border border-border`, dark backgrounds
- Card labels `[01/COMMANDS]`, `[02/SNAPSHOTS]`, `[03/EXPORT]`, `[nav]`, `[output]`
- REPL terminal with `cypress-cli >` prompt and blinking cursor animation
- Agent flow in terminal window: `→`/`←` arrows, muted output lines
- Architecture in terminal window: ASCII box diagram, all lowercase
- Footer: `$ exit` styled single line
- All lowercase text throughout: headings, nav, body
- All components hand-crafted: table with `border-b border-border` rows, grid layout cards, terminal divs
- All real content preserved
- No deviations from runbook (tailwind-c terminal native direction)

## Step 10 — Final Verification

- **Status**: PASS
- All 10 files present in `mockups/`: index.html + 9 mockups (3 libraries × 3 directions)
- File sizes: 8–20 KB each (self-contained HTML, no external assets except CDN)
- No lorem ipsum or placeholder text found (grep confirmed)
- All pages reference real project content: "cypress-cli", Cypress commands, architecture diagram
- CDN verification:
  - DaisyUI pages: `daisyui@5` + `@tailwindcss/browser@4` ✓
  - Shoelace pages: `@shoelace-style/shoelace@2.20` + `@tailwindcss/browser@4` ✓
  - Tailwind pages: `@tailwindcss/browser@4` only ✓
- Visual direction verification:
  - A pages (Lab Manual): amber accent, sharp corners, numbered sections, IBM Plex Mono headings ✓
  - B pages (Signal): teal accent, serif headings, pull-quotes, editorial whitespace ✓
  - C pages (Terminal Native): green accent, `$`-prefix headings, terminal windows, lowercase ✓
- index.html links to all 9 mockup pages ✓
- All mockup pages have "← All Mockups" back link to index.html ✓
- Dark mode: all pages use `prefers-color-scheme` media query or JS theme toggle ✓

### Comparison Matrix

| Feature            | DaisyUI                                                              | Shoelace                                                                               | Tailwind-only                          |
| ------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------- |
| Component count    | High (btn, card, navbar, table, hero, footer, badge, collapse, diff) | High (sl-card, sl-button, sl-tab-group, sl-tree, sl-badge, sl-copy-button, sl-divider) | Zero (all hand-crafted)                |
| CSS volume         | Low (theme vars + utility classes)                                   | Medium (custom properties + overrides)                                                 | High (all styling via utility classes) |
| Dark mode approach | data-theme attribute + JS toggle                                     | sl-theme-dark/light class + JS toggle                                                  | @media prefers-color-scheme (no JS)    |
| Customization ease | Excellent (CSS variables)                                            | Good (--sl-\* custom properties)                                                       | Direct (but verbose)                   |
| File size          | ~17-19 KB                                                            | ~18-20 KB                                                                              | ~15-16 KB                              |
| Visual polish      | Highest out-of-box                                                   | High with web components                                                               | Matches other two but more manual work |
