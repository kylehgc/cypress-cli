# Launch Site Design Mockups — Runbook

> **Audience:** An LLM agent executing this as a single long-running task.
> You MUST write to [DESIGN_MOCKUP_LOGBOOK.md](DESIGN_MOCKUP_LOGBOOK.md)
> after every step completes or fails. This is part of the task, not optional.
>
> **ABORT RULE:** If you are unable to write a logbook entry for a step
> (e.g., the file cannot be opened, the write fails, or you skip the
> entry), **stop all work immediately**. Do not proceed to the next step.
> The logbook is the only way progress is tracked across session
> boundaries. Work without a logbook entry is invisible and
> unrecoverable.
>
> **Branch:** `feat/demo-site` (or child branch)
>
> **Goal:** Build 9 static HTML mockup pages (3 component libraries ×
> 3 visual directions) so the user can compare them side-by-side in a
> browser and pick the winning combination before any real site work
> begins. All pages go in `mockups/` and use CDN-loaded libraries — no
> build step, no `npm install`.
>
> **Success criteria:**
>
> 1. `mockups/index.html` links to all 9 mockups
> 2. Each mockup renders a complete page: nav, hero, install command,
>    feature highlights, workshop 3-column layout, and command table
> 3. All use real content from the repository (not lorem ipsum)
> 4. Each is a single self-contained HTML file (CDN includes only)
> 5. Opening `mockups/index.html` in a browser shows all 9 links
> 6. dark mode respects `prefers-color-scheme: dark` (system preference)
>
> **Non-goals:** No Astro, no build tooling, no npm dependencies, no
> interactivity (REPL, codegen, etc.). These are static visual mockups
> for design comparison only. They will be deleted after a direction is
> chosen.

---

## Design Context

### Decisions Already Made

| Decision                                      | Value                                                 |
| --------------------------------------------- | ----------------------------------------------------- |
| Site framework (for final build, not mockups) | Astro                                                 |
| Layout paradigm                               | "Workshop" — 3-column: TOC \| Demo/REPL \| Output     |
| Color mode                                    | System preference (`prefers-color-scheme`), no toggle |
| Aesthetic                                     | Brutalist-adjacent + distinct custom theming          |
| Components                                    | Native rewrite (not iframe embed of existing demo)    |
| Typography                                    | IBM Plex family (Mono, Sans, Serif)                   |
| Hosting                                       | GitHub Pages                                          |

### 3 Visual Directions

Each direction defines a color palette, typography treatment, spacing
philosophy, and component styling. The visual directions are orthogonal
to the component library choice.

**A — Lab Manual** (engineering-spec, Oxide-inspired)

- Accent: warm amber (`oklch(0.75 0.18 60)` / `#D4A017` approx)
- Background: light `#FAFAFA`, dark `#0A0A0A`
- Typography: IBM Plex Mono for headings, IBM Plex Sans for body
- Corners: 0px (no border-radius anywhere)
- Sections: numbered (`01.`, `02.`) with horizontal rules
- Tables: data-dense, visible grid lines, monospace cells
- Vibe: engineering spec sheet, technical documentation, oxide.computer

**B — Signal** (editorial/magazine, curated)

- Accent: muted teal (`oklch(0.68 0.12 195)` / `#4A9A9A` approx)
- Background: warm off-white `#F8F7F4`, dark `#1A1A18`
- Typography: IBM Plex Serif for headings, IBM Plex Sans for body
- Corners: 2px
- Sections: large pull-quotes, generous whitespace, thin dividers
- Tables: minimal, borderless except header underline
- Vibe: editorial, curated, signal-over-noise, calm authority

**C — Terminal Native** (CLI-first, Atuin-inspired)

- Accent: terminal green (`oklch(0.72 0.19 155)` / `#22C55E` approx)
- Background: pure white `#FFFFFF`, dark `#0D0D0D`
- Typography: IBM Plex Mono for headings AND code, IBM Plex Sans for body
- Corners: 0px
- Sections: `$`-prefixed headings, prompt-style labels
- Tables: monospace, compact, terminal-grid feel
- Vibe: CLI tool showing its own nature, atuin.sh, charm.sh

### 3 Component Libraries

**DaisyUI** — Tailwind CSS plugin with semantic class names (`btn`,
`card`, `table`, `navbar`, `hero`, `mockup-code`, `mockup-window`).
Loaded via CDN (Tailwind + DaisyUI plugin). Has a built-in theme system
that can be customized with CSS variables. Documentation:
https://daisyui.com/

**Shoelace** (Web Awesome) — Web Components library. Framework-agnostic,
works with plain HTML. Components: `<sl-button>`, `<sl-card>`,
`<sl-input>`, `<sl-tab-group>`, `<sl-tree>`. Loaded via CDN (JS + CSS).
Custom theming via CSS custom properties. Documentation:
https://shoelace.style/

**Tailwind-only** — No component library. Pure Tailwind CSS utility
classes from CDN. All components hand-crafted. Maximum visual control,
most labor-intensive. Baseline for evaluating what the libraries add.

### Competitive Research (reference sites studied)

- oxide.computer — direction A inspiration (engineering brutalism)
- charm.sh / charm.land — direction C reference (terminal-native)
- atuin.sh — direction C reference (CLI-tool product site)
- zed.dev — fast/clean dev tool marketing
- dagger.io — pipeline-tool visual language
- raycast.com — dev tool with distinct brand
- warp.dev — terminal company visual identity
- supabase.com — developer-focused product site
- vitest.dev, playwright.dev — documentation pattern reference

---

## Real Content to Use

Do NOT use lorem ipsum. Extract real text from these repo files:

| Content           | Source file                 | What to extract                                            |
| ----------------- | --------------------------- | ---------------------------------------------------------- |
| Tagline           | `README.md` line 3          | "A CLI tool that gives LLMs…through real Cypress commands" |
| Install command   | `README.md` lines 19–22     | `npm install -g cypress-cli`                               |
| Quick start       | `README.md` lines 40–56     | 6-step bash example                                        |
| Command table     | `README.md` lines 60–73     | Category × commands table                                  |
| AI agent flow     | `README.md` lines 100–125   | Tool-use flow example                                      |
| Feature stats     | `docs/COMMANDS.md`          | 65+ commands, 10 categories                                |
| Capability matrix | `docs/CAPABILITY_MATRIX.md` | Direct/Workaround/Limited/Infeasible counts                |
| Output format     | `README.md` lines 82–93     | Snapshot output example                                    |

---

## Prerequisites

```bash
# Verify you're on the right branch
git branch --show-current

# Verify no leftover mockups/ or site/ directories
ls mockups/ 2>/dev/null && echo "CLEAN UP FIRST" || echo "OK"
ls site/ 2>/dev/null && echo "CLEAN UP FIRST" || echo "OK"
```

---

## Step 0: Create Directory and Index Page

Create `mockups/` directory and an `index.html` that links to all 9
mockup files. The index page itself should have a dark, minimal design
(IBM Plex Mono headings, `#0a0a0a` background) with a 3×3 grid of
cards — rows are libraries, columns are directions. Each card links to
the corresponding HTML file and has a short description + a colored tag
indicating the accent color.

**Files created:** `mockups/index.html`

**Verify:** Open `mockups/index.html` in a browser. All 9 links should
be visible (they'll 404 until the mockup files are created).

**Write to logbook.**

---

## Step 1: Build DaisyUI × Lab Manual (`mockups/daisyui-a.html`)

Single self-contained HTML file. CDN includes:

```html
<link
	href="https://cdn.jsdelivr.net/npm/daisyui@5/themes.css"
	rel="stylesheet"
/>
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
```

See https://daisyui.com/docs/cdn/ for the latest CDN setup. Use the
DaisyUI 5 CDN approach (Tailwind CSS v4 browser build + DaisyUI themes
CSS). DaisyUI v5 uses Tailwind v4 which is CSS-first — no JS config
file, all customization through `@theme` in a `<style>` block.

**Custom theme:** Define a custom DaisyUI theme using CSS variables
that maps to the Lab Manual palette. DaisyUI v5 themes are applied via
`[data-theme="labmanual"]` on the `<html>` element. Override primary,
secondary, accent, base colors, and set `--rounded-btn: 0` for sharp
corners. Provide both light and dark variants and apply via
`@media (prefers-color-scheme: dark)` toggling the `data-theme`.

**Page structure:**

1. **Navbar** — DaisyUI `navbar` component. Logo text "cypress-cli" in
   monospace. Links: Docs, Commands, Demo, GitHub. No rounded corners.

2. **Hero section** — DaisyUI `hero` component. Large heading with the
   tagline. Subheading: "65+ commands • Aria snapshots • Cypress test
   export • AI-agent ready". Install command in a DaisyUI `mockup-code`
   component. CTA buttons: "Try the Demo" (primary), "Read the Docs"
   (outline).

3. **Feature grid** — 3 DaisyUI `card` components in a row. Card 1:
   "Real Cypress Commands" (cy.click(), cy.type(), cy.visit() — not
   simulated). Card 2: "Aria Snapshots" (accessibility-tree DOM
   representation). Card 3: "Test Generation" (export session as
   .cy.ts file).

4. **Workshop preview** — 3-column grid simulating the workshop layout.
   Left column: DaisyUI `menu` component as a TOC (Commands, Assertions,
   Network, Storage, Navigation). Center column: mock REPL area with
   DaisyUI `mockup-code` showing the quick-start example. Right column:
   mock output panel showing a snippet of YAML aria snapshot.

5. **Command table** — DaisyUI `table` component with the command
   categories from README.md. Columns: Category, Commands, Count.
   Use `table-zebra` modifier. Monospace font for command names.

6. **Footer** — Minimal. "cypress-cli" + GitHub link + MIT license.

**Lab Manual specific styling:**

- All `--rounded-*` DaisyUI vars set to `0`
- Section numbers before headings: `01. Real Cypress Commands`
- Horizontal rules between sections
- Amber accent for buttons, links, and active states
- Dense, data-heavy aesthetic

**Dark mode:** Use a `<script>` at the top of `<body>` that checks
`window.matchMedia('(prefers-color-scheme: dark)').matches` and sets
`data-theme` to either `labmanual-light` or `labmanual-dark`.
Also register a `change` listener to auto-switch.

**Verify:** Open in browser. Check both light and dark modes (toggle
system preference). All sections should render with amber accent and
sharp corners.

**Write to logbook.**

---

## Step 2: Build DaisyUI × Signal (`mockups/daisyui-b.html`)

Same CDN includes as Step 1. New custom DaisyUI theme: `signal-light`
and `signal-dark`.

**Signal-specific differences from Lab Manual:**

- Accent: muted teal instead of amber
- `--rounded-btn: 0.125rem`, `--rounded-box: 0.125rem` (subtle, not zero)
- Headings use IBM Plex Serif (add Google Fonts import)
- Hero heading is larger, more whitespace above and below
- Feature cards have no border, just a subtle shadow
- Section dividers are thin 1px lines, not heavy rules
- Pull-quote between hero and features: a single compelling line from
  the README in large serif italic, with a thin left border
- Workshop preview center column has more padding
- Command table: minimal borders, only header underline, no zebra
- Footer has more breathing room

**Verify:** Open in browser. Confirm teal accent, serif headings, and
the calmer editorial feel is visually distinct from the Lab Manual page.

**Write to logbook.**

---

## Step 3: Build DaisyUI × Terminal Native (`mockups/daisyui-c.html`)

Same CDN includes. Custom theme: `terminal-light` and `terminal-dark`.

**Terminal Native-specific differences:**

- Accent: terminal green
- `--rounded-*: 0` everywhere (like Lab Manual)
- Headings use IBM Plex Mono (monospace)
- Section headings prefixed with `$` prompt character:
  `$ Real Cypress Commands`
- Hero install command uses DaisyUI `mockup-window` instead of
  `mockup-code`, styled as a real terminal window with title bar
- Feature cards have a monospace border label at top-left:
  `[01/COMMANDS]`, `[02/SNAPSHOTS]`, `[03/CODEGEN]`
- Workshop preview: center REPL area styled as a terminal with
  green-on-black color scheme; the prompt is `cypress-cli >`
- Command table: monospace throughout, compact rows, green highlight
  on hover
- Footer: single line, `$ exit` styled

**Verify:** Open in browser. Confirm green accent, monospace headings,
prompt-style sections. Should feel like a CLI tool's homepage.

**Write to logbook.**

---

## Step 4: Build Shoelace × Lab Manual (`mockups/shoelace-a.html`)

CDN includes for Shoelace (check https://shoelace.style/getting-started/installation#cdn-loader for latest):

```html
<link
	rel="stylesheet"
	href="https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20/cdn/themes/light.css"
/>
<script
	type="module"
	src="https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20/cdn/shoelace-autoloader.js"
></script>
```

Also include Tailwind CSS v4 browser CDN for layout utilities (Shoelace
handles components, Tailwind handles layout/spacing):

```html
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
```

**Shoelace components to use:**

- `<sl-button>` for CTAs
- `<sl-card>` for feature cards
- `<sl-tab-group>` + `<sl-tab>` + `<sl-tab-panel>` for the command
  categories (instead of a flat table)
- `<sl-tree>` + `<sl-tree-item>` for the workshop TOC
- `<sl-copy-button>` on the install command
- `<sl-divider>` between sections
- `<sl-badge>` for command counts
- `<sl-tooltip>` on feature card icons

**Lab Manual styling via Shoelace CSS custom properties:**

- Override `--sl-color-primary-*` with amber scale
- Set `--sl-border-radius-*` to `0`
- Set `--sl-font-mono` to IBM Plex Mono
- Set `--sl-font-sans` to IBM Plex Sans
- Add numbered section headings, horizontal rules, etc. via regular CSS

**Page structure:** Same 6 sections as Step 1 (navbar, hero, features,
workshop, commands, footer) but using Shoelace components instead of
DaisyUI classes. The visual feel should be recognizably "Lab Manual"
despite different component primitives. The tab-based command reference
is a notable UX difference from the DaisyUI table — highlight this.

**Dark mode:** Shoelace has a built-in dark theme. Load both light and
dark CSS, toggle `<html class="sl-theme-dark">` based on
`prefers-color-scheme`. Override dark theme custom properties to match
the Lab Manual dark palette.

**Verify:** Open in browser. Web components should render. Amber accent,
sharp corners, same data-dense feel. Tabs for commands should be
functional (Shoelace JS handles the interactivity).

**Write to logbook.**

---

## Step 5: Build Shoelace × Signal (`mockups/shoelace-b.html`)

Same Shoelace CDN. Custom theme overrides for Signal palette.

**Signal-specific Shoelace customizations:**

- `--sl-color-primary-*` mapped to teal scale
- `--sl-border-radius-*` set to small values (2px)
- Import IBM Plex Serif for headings (via `<style>` override on h1-h3)
- `<sl-card>` components with `shadow: none`, subtle border only
- More padding/margin on all components
- `<sl-divider>` components are thinner
- Pull-quote as a `<sl-card>` with left border accent
- Tab panels have generous padding

**Verify:** Visually distinct from Shoelace × Lab Manual. Teal, serif,
editorial calm.

**Write to logbook.**

---

## Step 6: Build Shoelace × Terminal Native (`mockups/shoelace-c.html`)

Same Shoelace CDN. Terminal theme overrides.

**Terminal-specific Shoelace customizations:**

- `--sl-color-primary-*` mapped to green scale
- `--sl-border-radius-*` all `0`
- Headings in Plex Mono with `$` prefix
- `<sl-card>` components styled with monospace border labels
- Workshop REPL area: custom-styled `<sl-input>` with green prompt
- `<sl-tree>` TOC items in monospace
- Compact `<sl-tab-group>` for commands

**Verify:** Green, monospace, prompt-style. Feels terminal-native.

**Write to logbook.**

---

## Step 7: Build Tailwind-only × Lab Manual (`mockups/tailwind-a.html`)

CDN include — Tailwind v4 browser build only:

```html
<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
```

No component library. All components hand-crafted with Tailwind utility
classes. This is the baseline to evaluate what DaisyUI and Shoelace
actually add.

**Custom theme via Tailwind `@theme` directive in `<style>`:**

```css
@import 'tailwindcss';
@theme {
	--color-accent: oklch(0.75 0.18 60);
	--color-bg: #fafafa;
	--color-fg: #0a0a0a;
	--color-border: #d4d4d4;
	--font-mono: 'IBM Plex Mono', monospace;
	--font-sans: 'IBM Plex Sans', sans-serif;
}
```

**Hand-built components:**

- Navbar: `<nav>` with flexbox, monospace logo, plain `<a>` links
- Hero: centered text block, `<pre>` for install command with copy-ready
  styling
- Feature cards: `<div>` with border, padding, no radius
- Workshop: CSS Grid `grid-cols-[240px_1fr_320px]`
- Command table: `<table>` with utility classes for striping, monospace
- Footer: `<footer>` with flex

**Lab Manual styling:** Same amber, sharp, numbered aesthetic. Compare
how much more code this takes vs DaisyUI to achieve similar results.

**Dark mode:** Use Tailwind v4 dark variant (`dark:`) which
automatically reads `prefers-color-scheme`. Define dark color overrides
in `@theme`.

**Verify:** Open in browser. Should look very similar to DaisyUI × Lab
Manual but with subtle differences in component polish.

**Write to logbook.**

---

## Step 8: Build Tailwind-only × Signal (`mockups/tailwind-b.html`)

Same Tailwind CDN. Signal color overrides in `@theme`.

Hand-build the same components with Signal typography and spacing.
Pull-quote is a simple `<blockquote>` with left border and serif italic.
Table is minimal. More whitespace everywhere.

**Verify:** Teal, serif, editorial. Compare effort to DaisyUI version.

**Write to logbook.**

---

## Step 9: Build Tailwind-only × Terminal Native (`mockups/tailwind-c.html`)

Same Tailwind CDN. Terminal green overrides in `@theme`.

Hand-build with prompt-prefixed headings, monospace throughout, compact
layout. Terminal window for REPL is a `<div>` with title bar dots.

**Verify:** Green, monospace, terminal-native. Compare to DaisyUI and
Shoelace versions.

**Write to logbook.**

---

## Step 10: Final Verification

1. Open `mockups/index.html` in browser
2. Click every link — all 9 pages should load without errors
3. Toggle system dark mode — all 9 should switch cleanly
4. Compare within each row (same library, different directions):
   - Do the 3 directions feel genuinely different?
5. Compare within each column (same direction, different libraries):
   - What does each library add or remove?
6. Check that real content is used throughout (no lorem ipsum)
7. Check responsiveness at mobile width (320px) — layout should not break

**Write to logbook** with a summary comparison matrix:

|            | DaisyUI | Shoelace | Tailwind-only |
| ---------- | ------- | -------- | ------------- |
| Lab Manual | notes   | notes    | notes         |
| Signal     | notes   | notes    | notes         |
| Terminal   | notes   | notes    | notes         |

---

## After This Runbook

The user will review all 9 mockups and pick a winning library ×
direction combination. Then:

1. Delete `mockups/` directory entirely
2. Create a new runbook for the real site build using the chosen stack
3. Scaffold the Astro project in `site/` with the chosen component
   library and design tokens
