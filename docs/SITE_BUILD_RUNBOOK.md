# Site Build — Runbook

> **Audience:** An LLM agent running via `/site-pipeline` or manually.
> You MUST write to [SITE_BUILD_LOGBOOK.md](SITE_BUILD_LOGBOOK.md) after
> every step completes or fails. This is part of the task, not optional.
> The logbook is how progress is tracked across session boundaries.
>
> **Goal:** Build the cypress-cli launch site following the design spec
> in [SITE_DESIGN.md](SITE_DESIGN.md). The site lives in the `site/`
> directory at the repo root.
>
> **This runbook is structured in phases.** A single pipeline run should
> attempt one phase at a time. After completing a phase, the pipeline's
> review step runs. Fixes are applied. Then the next phase can begin in
> a new pipeline run.

---

## Reference Documents

Read these before starting. They are your specification.

| Document                                           | What it tells you                                               |
| -------------------------------------------------- | --------------------------------------------------------------- |
| [SITE_DESIGN.md](SITE_DESIGN.md)                   | Full design specification — colors, typography, components      |
| [SITE_DESIGN.md §4.6](SITE_DESIGN.md)              | Anti-default rules — MANDATORY, check after every step          |
| [SITE_DESIGN.md §9](SITE_DESIGN.md)                | Performance budget                                              |
| [SITE_DESIGN.md §11](SITE_DESIGN.md)               | Resolved design questions                                       |
| [design-review/README.md](design-review/README.md) | Index of all review artifacts and mockups                       |
| [CONVENTIONS.md](../CONVENTIONS.md)                | Code style for the main repo (reference, not binding for site/) |
| [AGENTS.md](../AGENTS.md)                          | Agent workflow rules                                            |

---

## Prerequisites

```bash
# Verify you're on the right branch
git branch --show-current   # should be feat/demo-site

# Verify the main project still builds
npm run build && npx tsc --noEmit && npx vitest run
```

## Pinned Versions (April 2026)

Use these exact versions. Do not rely on `latest` — pin in `package.json`.

| Package             | Version | Notes                                    |
| ------------------- | ------- | ---------------------------------------- |
| `astro`             | 6.1.5   | Latest stable                            |
| `tailwindcss`       | 4.2.2   | Use Vite plugin, NOT `@astrojs/tailwind` |
| `@tailwindcss/vite` | 4.2.2   | Vite plugin for Tailwind v4              |
| `@astrojs/react`    | 5.0.3   | React integration for Astro 6            |
| `react`             | 19.2.5  | React 19 (latest stable)                 |
| `react-dom`         | 19.2.5  | Match React version                      |
| `shadcn`            | 4.2.0   | CLI for adding components                |

**Do NOT install `@astrojs/tailwind`** — it is deprecated and only
supports Tailwind v3.

---

## Phase 0: Project Setup

> **Goal:** A working Astro project in `site/` with Tailwind v4, React
> integration, shadcn/ui initialized with Terminal Native theme, and IBM
> Plex fonts. Zero custom components yet — just the scaffold.

### Step 0.1: Initialize Astro project

The `site/` directory already has a `package.json` but no Astro project
files. The existing `package.json` references Tailwind v3 — it needs to be
replaced.

```bash
cd site/

# Remove the stale package.json
rm package.json

# Create a fresh Astro project (accept defaults, pick empty template)
npm create astro@latest . -- --template minimal --no-install

# Verify astro.config.mjs exists
ls astro.config.mjs
```

**Log:** Record the Astro version installed.

### Step 0.2: Install Tailwind CSS v4

`@astrojs/tailwind` is **deprecated**. Tailwind v4 uses its own Vite
plugin, which Astro supports natively.

```bash
# Install Tailwind v4 via its Vite plugin (NOT @astrojs/tailwind)
npm install tailwindcss @tailwindcss/vite

# Add the Vite plugin to astro.config.mjs:
# import tailwindcss from '@tailwindcss/vite'
# export default defineConfig({
#   vite: { plugins: [tailwindcss()] }
# })

# Import Tailwind in your base CSS file:
# @import "tailwindcss";
```

Do NOT install `@astrojs/tailwind` — it is deprecated and only supports
Tailwind v3.

**Log:** Record the Tailwind version and integration method.

### Step 0.3: Install React integration

```bash
npx astro add react

# Verify react is in dependencies and astro.config has the integration
cat astro.config.mjs
```

**Log:** Record React version.

### Step 0.4: Initialize shadcn/ui

```bash
npx shadcn@latest init
```

During init, configure:

- Style: Default (we override everything)
- Base color: Neutral (we override to Terminal Native palette)
- CSS variables: Yes
- `tailwind.config` path: whatever Astro created
- Components path: `src/components/ui`
- Utils path: `src/lib/utils`

**Log:** Record shadcn version and config choices.

### Step 0.5: Apply Terminal Native theme overrides

Override **all** shadcn CSS variables in the global CSS file (see
SITE_DESIGN.md §4.6 for the exact values). The critical overrides:

```css
@layer base {
	:root {
		--background: 0 0% 5%; /* #0D0D0D */
		--foreground: 0 0% 91%; /* #E8E8E8 */
		--card: 240 29% 14%; /* #1A1A2E */
		--card-foreground: 0 0% 91%;
		--primary: 145 68% 45%; /* #22C55E — terminal green */
		--primary-foreground: 0 0% 5%;
		--secondary: 180 33% 45%; /* #4A9A9A — teal */
		--secondary-foreground: 0 0% 91%;
		--muted: 240 10% 20%;
		--muted-foreground: 145 68% 45% / 0.5;
		--accent: 240 29% 18%; /* #242438 */
		--accent-foreground: 0 0% 91%;
		--destructive: 0 84% 60%;
		--border: 145 68% 45% / 0.15;
		--input: 145 68% 45% / 0.2;
		--ring: 145 68% 45%;
		--radius: 0rem; /* ZERO border-radius globally */
	}
}
```

**Verify:** NO `rounded-md`, `rounded-lg` classes in any generated shadcn
component. Search for them and replace with `rounded-none` if found.

**Log:** Record which files were modified.

### Step 0.6: Install IBM Plex fonts

```bash
npm install @fontsource/ibm-plex-mono @fontsource/ibm-plex-sans @fontsource/ibm-plex-serif
```

Import them in the base layout:

```ts
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-serif/400.css';
import '@fontsource/ibm-plex-serif/700.css';
```

Set in Tailwind config:

```js
fontFamily: {
  mono: ['IBM Plex Mono', 'monospace'],
  sans: ['IBM Plex Sans', 'sans-serif'],
  serif: ['IBM Plex Serif', 'serif'],
}
```

**Log:** Record font versions and weights installed.

### Step 0.7: Install initial shadcn components

```bash
npx shadcn@latest add button table navigation-menu tooltip scroll-area
```

After install, verify each component file does NOT contain `rounded-md`,
`rounded-lg`, or any zinc/slate color classes. Fix any that do.

**Log:** Record which components were installed and which files were modified.

### Step 0.8: Verify and run anti-default checklist

Run every check from SITE_DESIGN.md §4.6:

```bash
# Search for anti-default violations
cd site/
grep -r "rounded-md\|rounded-lg\|rounded-xl" src/ --include="*.tsx" --include="*.astro" --include="*.css"
grep -r "zinc-\|slate-\|gray-\|neutral-" src/ --include="*.tsx" --include="*.astro" --include="*.css"
grep -r "lucide-react" src/ --include="*.tsx" --include="*.ts"
grep -r "ring-offset" src/ --include="*.tsx" --include="*.astro" --include="*.css"
grep -r "shadow-sm\|shadow-md" src/ --include="*.tsx" --include="*.astro" --include="*.css"
```

All searches must return zero results. Fix any violations.

```bash
# Build and preview
npm run build
npm run preview
```

Open in browser and verify:

- Dark background (#0D0D0D)
- No rounded corners anywhere
- IBM Plex fonts loading (check DevTools → Network → Fonts)

**Log:** Record anti-default checklist results and any violations found/fixed.

### Phase 0 Gate

Before proceeding to Phase 1, all of the following must be true:

- [ ] `npm run build` succeeds in `site/`
- [ ] `npm run preview` shows a page with dark background
- [ ] No anti-default violations (grep searches return nothing)
- [ ] IBM Plex fonts load in browser
- [ ] Zero JavaScript shipped to browser (check Network tab)
- [ ] shadcn components installed and themed

---

## Phase 1: Landing Page

> **Goal:** A complete, static landing page with zero client-side
> JavaScript. All components are Astro components (`.astro`) or shadcn
> components rendered to static HTML at build time.

### Step 1.1: Build `<TerminalWindow>` component

Create `site/src/components/TerminalWindow.astro`. This is the single
most important component — it defines the brand.

Requirements (from SITE_DESIGN.md §4.5):

- Title bar with colored dots (red, yellow, green) — `●` characters
- Title text in mono
- Content slot
- Background: `--bg-surface` / card color
- NO border-radius — hard corners
- Copy button slot in title bar (top-right)
- `aria-hidden="true"` on decorative dots

**Log:** Record file created.

### Step 1.2: Build `<TerminalLine>` and `<CopyButton>` components

`<TerminalLine>`: Renders a line with `$ ` prefix in green, output in
primary text color.

`<CopyButton>`: Vanilla JS clipboard button — no React. Use the Astro
`<script>` tag for the ~15 lines of JS. Shows `✓` after copy, auto-dismiss.

**Log:** Record files created.

### Step 1.3: Build hero section

The hero is the first thing visitors see. Requirements:

- Terminal window showing a cypress-cli session (3-4 commands)
- Serif tagline below or beside the terminal
- Typing animation on the terminal (respect `prefers-reduced-motion`)
- See SITE_DESIGN.md §5.1 for the exact layout

**Log:** Record implementation details and any design decisions made.

### Step 1.4: Build features section

Three `<FeatureCard>` components with the numbered `[01/label]` format.
Cards from SITE_DESIGN.md §4.5.

**Log:** Record cards created.

### Step 1.5: Build how-it-works section

Two terminal windows showing an agent session and system output.
See SITE_DESIGN.md §5.1.

**Log:** Record implementation.

### Step 1.6: Build command table

Curated 10-15 commands using shadcn `Table` rendered static.
Commands that tell a session story: `open`, `snapshot`, `click`, `type`,
`assert`, `scroll`, `navigate`, `network`, `console`, `codegen`.
Link to full docs reference.

**Log:** Record which commands were included and why.

### Step 1.7: Build nav and footer

Nav: shadcn `NavigationMenu` rendered static.
Items: cypress-cli logo/text, Docs, Demo, GitHub link.
Footer: MIT License, GitHub, npm links. Terminal-styled with `$ exit`.

**Log:** Record implementation.

### Step 1.8: Build base layout

Create `site/src/layouts/BaseLayout.astro` with:

- Font imports
- Global CSS with Terminal Native variables
- `<html>` with dark class/attribute
- Meta tags, Open Graph
- Nav + slot + footer

**Log:** Record layout structure.

### Step 1.9: Accessibility pass

- Check all contrast ratios (run axe or Lighthouse)
- Verify keyboard navigation
- Test `prefers-reduced-motion`
- Check `aria-label` on copy buttons
- Verify `aria-hidden="true"` on decorative elements

**Log:** Record issues found and fixed.

### Step 1.10: Responsive pass

Test at all breakpoints from SITE_DESIGN.md §7:

- `≥1280px`: Full layout
- `768–1023px`: Stacked, reduced hero font
- `<768px`: Full-width terminals, no horizontal scroll

**Log:** Record responsive issues found and fixed.

### Step 1.11: Performance audit

```bash
npm run build
# Check build output size
```

Verify:

- Zero JavaScript in the build output (no JS files for landing page)
- Total page weight < 100KB gzip
- Font files ≤ 6

**Log:** Record build sizes and performance numbers.

### Step 1.12: Anti-default checklist (again)

Run the full grep checklist from Step 0.8. All must pass.

**Log:** Record results.

### Phase 1 Gate

Before proceeding to Phase 2:

- [ ] Landing page renders correctly at all breakpoints
- [ ] Zero client-side JavaScript
- [ ] All accessibility checks pass
- [ ] Anti-default checklist passes
- [ ] Page weight < 100KB gzip
- [ ] Typing animation works and respects `prefers-reduced-motion`

---

## Phase 2: Documentation Pages

> **Goal:** Astro content collections for docs, sidebar nav, doc layout
> with serif headings and terminal-styled code blocks.

### Step 2.1: Set up content collections

Create `site/src/content/docs/` with Astro content collection config.
Markdown files with frontmatter for title, order, section.

**Log:** Record content collection structure.

### Step 2.2: Build doc layout

`site/src/layouts/DocLayout.astro`:

- Sidebar nav (generated from content collection)
- Content area with serif headings (IBM Plex Serif)
- `ScrollArea` from shadcn for sidebar
- Terminal windows for all code blocks
- Mobile: sidebar collapses to hamburger

**Log:** Record implementation.

### Step 2.3: Port key docs

Create initial doc pages:

- Getting Started
- Commands (full command reference — all 64+)
- API Reference

Use the existing `docs/COMMANDS.md` as source material.

**Log:** Record which docs were ported.

### Step 2.4: Search (stub)

Add a search input to the doc sidebar. Can be non-functional stub with
a "Coming soon" tooltip, or implement basic client-side search.

**Log:** Record approach chosen.

### Phase 2 Gate

- [ ] Doc pages render with serif headings and terminal code blocks
- [ ] Sidebar nav works at all breakpoints
- [ ] Content collection builds without errors
- [ ] Anti-default checklist passes

---

## Phase 3: Workshop (Interactive Demo)

> **Goal:** The workshop page with live cypress-cli, resizable panels,
> REPL, and LLM test generation. This is the only page that ships React.

_This phase needs its own detailed runbook. The steps in SITE_DESIGN.md
§10 are a starting point, but the backend architecture (session management,
WebSocket, iframe proxy) requires a separate design spec._

### Step 3.0: Create workshop design spec

Before implementing, write a focused spec covering:

- Backend session management (how sessions are created, isolated, cleaned up)
- WebSocket protocol (message format, error handling)
- Target page iframe/proxy strategy
- LLM test generation API design
- Recorded-session replay fallback format
- Security (session isolation, rate limiting, input sanitization)

**Log:** Record spec file location.

### Steps 3.1–3.13: See SITE_DESIGN.md §10 Phase 3

Follow steps 25-37 from the implementation plan.

### Phase 3 Gate

- [ ] Workshop page hydrates React island
- [ ] Resizable 3-column layout works
- [ ] REPL connects to live cypress-cli (or replay fallback)
- [ ] LLM test generation produces valid Cypress tests
- [ ] React + shadcn < 70KB gzip
- [ ] Anti-default checklist passes
- [ ] No React shipped on non-workshop pages

---

## Phase 4: Blog & Polish

> **Goal:** Blog layout, launch post, final testing.

### Step 4.1: Blog layout

Astro content collections for blog posts. Signal hybrid voice — serif
titles, generous whitespace, teal left-border pull-quotes.

### Step 4.2: Launch announcement post

Write the v1.0 launch post.

### Step 4.3: Final testing

- Cross-browser (Chrome, Firefox, Safari)
- Lighthouse audit on all pages
- Mobile testing
- Link checking

### Step 4.4: Analytics (optional)

Privacy-respecting analytics if desired. No third-party services that
violate the performance budget.

### Phase 4 Gate

- [ ] Blog renders correctly
- [ ] All Lighthouse scores meet budget
- [ ] Cross-browser testing passes
- [ ] No broken links
