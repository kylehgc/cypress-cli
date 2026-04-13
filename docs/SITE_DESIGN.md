# cypress-cli Launch Site — Design Document

> **Status:** Draft v2 — awaiting review  
> **Date:** 2026-04-12  
> **Branch:** `feat/demo-site`  
> **Design review archive:** [docs/design-review/](design-review/) (mockups,
> screenshots, 3 independent reviews, scoring matrices, logbooks)

---

## 1. Executive Summary

cypress-cli's launch site uses a **Tailwind-C × Tailwind-B hybrid** — the
Terminal Native direction for the primary identity and hero, blended with
Signal's editorial typography for inner pages and documentation. The site is
built with **Astro**, uses **shadcn/ui** components (React, rendered static
by Astro for non-interactive pages, hydrated for the workshop), styled with
**Tailwind CSS**, and is **dark-mode primary** with a light-mode fallback
respecting `prefers-color-scheme`. Hosting is flexible (GitHub Pages, Vercel,
or equivalent static host).

Three independent model reviews (original + Claude Opus 4.6 + GPT-5.4 +
Gemini 3.1 Pro) scored 9 mockups across 6 weighted criteria. Tailwind-C
(Terminal Native) won at 53/60. All four reviewers agreed on the winner and
agreed that dark background was the single most impactful variable. The
hybrid approach cherry-picks Tailwind-B's serif typography strength where
terminal framing is not appropriate.

**Critical constraint:** shadcn's default visual language (rounded corners,
zinc palette, Inter font, subtle borders) is instantly recognizable and
overused. Every shadcn default must be overridden to achieve the Terminal
Native identity. Section 4.6 defines the mandatory anti-default rules.

---

## 2. Design Principles

These principles apply to every page and component. They are ordered by
priority — when two principles conflict, the higher-ranked one wins.

1. **The design IS the product.** The site should feel like using
   cypress-cli, not reading about it. Terminal metaphors are not decoration —
   they are the interface language.

2. **Dark-first, light-acceptable.** Dark mode is the default and primary
   design surface. Light mode exists for `prefers-color-scheme: light` users
   but is not the design target. Every element must look good on dark first.

3. **Developer recognition over marketing polish.** The target audience reads
   terminal output daily. Use patterns they already know (`$` prompts, green
   stdout, red stderr, `[ref]` identifiers) rather than generic marketing
   components.

4. **Typography carries the hierarchy.** Use font weight, family, and size
   to establish structure — not borders, backgrounds, or color. Reserve color
   for functional meaning (green = terminal output, teal = interactive, amber
   = warning/highlight).

5. **Content density over whitespace.** Show real commands, real output, real
   code. Avoid hero sections that waste the viewport on taglines. Every
   above-fold pixel should demonstrate the product.

---

## 3. Prior Decisions

These were established before the design review and remain in effect.

| Decision            | Value                                                 |
| ------------------- | ----------------------------------------------------- |
| Framework           | Astro (static site generation)                        |
| Hosting             | Vercel, GitHub Pages, or equivalent static host       |
| Color mode          | System preference (`prefers-color-scheme`), no toggle |
| Typography          | IBM Plex family (Mono, Sans, Serif)                   |
| Layout              | "Workshop" — 3-column: TOC \| Demo/REPL \| Output     |
| Component library   | shadcn/ui (React) — heavily themed, see §4.6          |
| Interactive runtime | React (Astro island, hydrated only on workshop page)  |
| Demo components     | Native rewrite (not iframe embed of existing demo)    |
| Aesthetic           | Brutalist-adjacent + distinct custom theming          |

---

## 4. Visual Identity

### 4.1 The Hybrid: Terminal Native + Signal

The site uses two complementary voices:

| Context                       | Direction       | Characteristics                                 |
| ----------------------------- | --------------- | ----------------------------------------------- |
| Landing page hero             | Terminal Native | Hero IS a terminal session running cypress-cli  |
| Landing page sections         | Terminal Native | `$`-prefixed headings, prompt-style labels      |
| Feature cards, command tables | Terminal Native | Monospace, compact, terminal-grid feel          |
| Documentation page headings   | Signal (hybrid) | Serif headings for editorial authority          |
| Documentation body text       | Signal (hybrid) | Sans-serif body, generous line-height           |
| Blog / announcements          | Signal (hybrid) | Pull-quotes, teal accents, editorial whitespace |
| Code blocks everywhere        | Terminal Native | Dark background, green/white text, `$` prompts  |

### 4.2 Color Palette

**Dark mode (primary):**

| Role             | Token name         | Value     | Usage                                        |
| ---------------- | ------------------ | --------- | -------------------------------------------- |
| Background       | `--bg-primary`     | `#0D0D0D` | Page background                              |
| Surface          | `--bg-surface`     | `#1A1A2E` | Cards, terminal windows, code blocks         |
| Surface elevated | `--bg-elevated`    | `#242438` | Hover states, active cards                   |
| Warm alt section | `--bg-warm`        | `#2A2420` | Mid-page section break (optional)            |
| Text primary     | `--text-primary`   | `#E8E8E8` | Body text                                    |
| Text secondary   | `--text-secondary` | `#A0A0B0` | Captions, metadata                           |
| Terminal green   | `--accent-green`   | `#22C55E` | Terminal output, `$` prompts, primary accent |
| Teal             | `--accent-teal`    | `#4A9A9A` | Links, nav, interactive elements, buttons    |
| Amber            | `--accent-amber`   | `#D4A017` | Warnings, highlights, numbered labels        |
| Error red        | `--accent-red`     | `#EF4444` | Error states, destructive actions            |
| Terminal dots    | `--dot-red`        | `#FF5F56` | Terminal window chrome — close               |
| Terminal dots    | `--dot-yellow`     | `#FFBD2E` | Terminal window chrome — minimize            |
| Terminal dots    | `--dot-green`      | `#27C93F` | Terminal window chrome — maximize            |

**Light mode (fallback):**

| Role           | Token name         | Value     | Notes                              |
| -------------- | ------------------ | --------- | ---------------------------------- |
| Background     | `--bg-primary`     | `#FAFAFA` | Light page background              |
| Surface        | `--bg-surface`     | `#F0F0F5` | Slightly warm gray                 |
| Text primary   | `--text-primary`   | `#1A1A1A` |                                    |
| Text secondary | `--text-secondary` | `#5A5A6A` |                                    |
| Terminal green | `--accent-green`   | `#16A34A` | Darker green for contrast on light |
| Teal           | `--accent-teal`    | `#0D7377` | Darker teal for contrast on light  |

> **Open question:** Should light mode terminal windows keep a dark
> background (dark inset) or use the light surface color? The reviews
> suggest dark terminal insets on light pages look more authentic.

### 4.3 Typography

| Role               | Family         | Weight | Size (desktop)  | Notes                               |
| ------------------ | -------------- | ------ | --------------- | ----------------------------------- |
| Hero heading       | IBM Plex Serif | 700    | 3.5rem / 56px   | Signal influence — serif for impact |
| Section heading    | IBM Plex Mono  | 600    | 1.5rem / 24px   | `$ section-name` format             |
| Card heading       | IBM Plex Mono  | 500    | 1.125rem / 18px | `[01/label]` format                 |
| Body text          | IBM Plex Sans  | 400    | 1rem / 16px     | 1.6 line-height                     |
| Code / terminal    | IBM Plex Mono  | 400    | 0.875rem / 14px | In terminal windows, code blocks    |
| Nav links          | IBM Plex Sans  | 500    | 0.875rem / 14px |                                     |
| Caption / metadata | IBM Plex Sans  | 400    | 0.75rem / 12px  |                                     |

**Font loading:** Self-host via `@fontsource/ibm-plex-*` packages. Subset
to latin. Use `font-display: swap` for performance.

### 4.4 Spacing System

Base unit: `4px`. Use Tailwind's default spacing scale (`1` = 4px, `2` = 8px,
etc.).

| Context                 | Value    |
| ----------------------- | -------- |
| Page max-width          | `1280px` |
| Page horizontal padding | `1.5rem` |
| Section vertical gap    | `4rem`   |
| Card padding            | `1.5rem` |
| Terminal window padding | `1rem`   |
| Terminal line spacing   | `1.5`    |

### 4.5 Component System: shadcn/ui + Custom Astro Components

**Why shadcn:** The workshop page is a real interactive application —
resizable panels, terminal REPL, command autocomplete, state management
between columns. Pure CSS libraries (DaisyUI, Tailwind-only) provide zero
help here. shadcn gives us accessible, composable React primitives
(ResizablePanelGroup, Tabs, Command palette, Dialog) that Astro renders to
static HTML on non-interactive pages and hydrates only where needed.

**Why not just shadcn defaults:** shadcn's default visual language (rounded
corners, zinc palette, Inter font, ring-offset focus states, subtle borders,
Lucide icons) is the most recognizable component library aesthetic on the
web in 2026. Shipping these defaults produces a site that looks like every
other LLM-generated project page. See §4.6 for mandatory overrides.

**Architecture:**

- **Static pages** (landing, docs, blog): shadcn components rendered at
  build time by Astro → zero JS shipped. A `<Button>` becomes a `<button>`
  with Tailwind classes. No React runtime in the browser.
- **Workshop page**: Astro hydrates a React island (`client:load`) that
  contains the interactive REPL, resizable panels, and state management.
  React runtime (~40-50KB gzip) ships only on this page.
- **Custom Astro components**: `<TerminalWindow>`, `<TerminalLine>`,
  `<CopyButton>` — these are `.astro` components (no React) used on static
  pages for the terminal chrome that is unique to this site.

**shadcn components we'll use:**

| Component             | Where                          | Why                                            |
| --------------------- | ------------------------------ | ---------------------------------------------- |
| `ResizablePanelGroup` | Workshop 3-column layout       | Drag-to-resize panels with keyboard support    |
| `Tabs`                | Workshop mobile, output views  | Switch between snapshot/console/network output |
| `Command`             | Workshop REPL autocomplete     | Command palette with fuzzy search              |
| `Table`               | Landing page command table     | Accessible, sortable data table                |
| `Dialog` / `Sheet`    | Mobile nav, help overlay       | Accessible modal with focus trap               |
| `Button`              | CTAs, interactive controls     | Consistent interaction states                  |
| `Tooltip`             | Copy button "Copied!" feedback | Accessible tooltip with auto-dismiss           |
| `ScrollArea`          | Terminal output, docs sidebar  | Custom scrollbar styling consistent with theme |
| `NavigationMenu`      | Top nav                        | Accessible nav with keyboard support           |

**Components we build ourselves (Astro, not React):**

| Component          | Why custom                                            |
| ------------------ | ----------------------------------------------------- |
| `<TerminalWindow>` | Core brand element — title bar, colored dots, content |
| `<TerminalLine>`   | `$` prompt prefix, green text, output formatting      |
| `<CopyButton>`     | Vanilla JS clipboard, ~15 lines, no React needed      |
| `<FeatureCard>`    | Numbered `[01/label]` format, unique to this site     |
| `<SectionHeading>` | `$ section-name` prompt-style heading                 |

#### Terminal Window

The foundational component. Used for hero, code blocks, agent flow, and
architecture diagrams.

```
┌──────────────────────────────────────────────┐
│ ● ● ●   cypress-cli — session               │  ← Title bar (colored dots)
├──────────────────────────────────────────────┤
│ $ npm install -g cypress-cli                 │
│ + cypress-cli@1.0.0                          │
│ $ cypress-cli open https://example.com       │
│ session started: https://example.com         │
│ $ cypress-cli snapshot                       │
│ - document:                                  │
│     - heading "welcome" [e1]                 │
│     - textbox "email" [e2]                   │
│     - button "submit" [e3]                   │
│ $▌                                           │  ← Blinking cursor
└──────────────────────────────────────────────┘
```

- Background: `--bg-surface`
- Title bar: slightly lighter, with colored dots (`--dot-red`, `--dot-yellow`,
  `--dot-green`) — cherry-picked from DaisyUI-C and Shoelace-C
- Border: none (no border-radius — brutalist corners)
- Text: `--accent-green` for prompts and output, `--text-primary` for regular text
- Copy button: top-right of title bar, vanilla JS clipboard

#### Feature Card

```
┌──────────────────────────────────────────────┐
│ [01/commands]                                │  ← Mono label
│                                              │
│ Real Cypress Commands                        │  ← Card heading
│ Every action executes as a genuine Cypress   │
│ command in a live browser.                   │
└──────────────────────────────────────────────┘
```

- Background: `--bg-surface`
- Hover: `--bg-elevated` + subtle green ring (`ring-1 ring-green-500/30`)
- No border-radius
- Numbered label in mono, green text

#### Button

Two variants:

| Variant | Background      | Text            | Border     | Usage             |
| ------- | --------------- | --------------- | ---------- | ----------------- |
| Primary | `--accent-teal` | white           | none       | CTAs              |
| Ghost   | transparent     | `--accent-teal` | `1px` teal | Secondary actions |

No border-radius. Horizontal padding `1.5rem`, vertical `0.75rem`.

### 4.6 Anti-Default Rules (MANDATORY)

**These rules are non-negotiable.** If any shadcn default leaks into the
production site, it is a bug. Agents must verify every page against this
checklist before considering work complete.

**The test:** If a developer looks at the site and thinks "this looks like
shadcn," it has failed. The Terminal Native identity must be the only thing
a visitor perceives.

#### Visual Override Table

| shadcn default                                   | Required override                                                                                                  | Rationale                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `rounded-md` / `rounded-lg` on all components    | **`rounded-none` globally** — zero border-radius everywhere                                                        | Rounded corners are shadcn's #1 visual fingerprint |
| Zinc/slate gray palette (`zinc-50` → `zinc-950`) | **No zinc anywhere.** Use `--bg-primary`, `--bg-surface`, `--bg-elevated`                                          | Zinc gray IS the shadcn identity                   |
| Inter / system font stack                        | **IBM Plex Mono, Sans, Serif** — as specified in §4.3                                                              | Inter is the second most recognizable tell         |
| `border` + `shadow-sm` on cards/inputs           | **No borders on cards.** Solid background color blocks only. Inputs: `border-green-500/30` or `border-teal-500/30` | Thin border + tiny shadow = instant shadcn         |
| `ring-2 ring-ring ring-offset-2` focus states    | **`outline-2 outline-offset-0 outline-green-500`** — green outline, no ring offset                                 | ring-offset is a subtle but recognizable pattern   |
| Lucide icons everywhere                          | **No Lucide icons.** Use terminal symbols: `$`, `>`, `▌`, `●`, `✓`, `✗`, `→`                                       | Lucide is another instant tell                     |
| `text-muted-foreground` for secondary text       | **`text-green-500/50`** or `text-teal-500/50` — dimmed accent, never gray                                          | Gray muted text is default shadcn behavior         |
| Smooth `transition-colors duration-150`          | **`transition-none`** on most elements. Instant state changes.                                                     | Brutalist interactions — no easing, no animation   |
| White/light background default                   | **Dark-first.** `--bg-primary: #0D0D0D`                                                                            | Most shadcn sites are light themed                 |
| `hover:bg-accent` (subtle gray hover)            | **`hover:bg-elevated`** — visible dark surface shift, or green/teal tint                                           | Gray hover states are the shadcn norm              |

#### CSS Variables Override

The shadcn theme file (`components.json` or `globals.css`) must map to
Terminal Native tokens. This replaces shadcn's default color system entirely:

```css
@layer base {
	:root {
		/* Override ALL shadcn CSS variables */
		--background: 0 0% 5%; /* #0D0D0D */
		--foreground: 0 0% 91%; /* #E8E8E8 */
		--card: 240 29% 14%; /* #1A1A2E */
		--card-foreground: 0 0% 91%; /* #E8E8E8 */
		--primary: 145 68% 45%; /* #22C55E — terminal green */
		--primary-foreground: 0 0% 5%; /* #0D0D0D */
		--secondary: 180 33% 45%; /* #4A9A9A — teal */
		--secondary-foreground: 0 0% 91%;
		--muted: 240 10% 20%; /* dark surface, not gray */
		--muted-foreground: 145 68% 45% / 0.5; /* dimmed green, NOT gray */
		--accent: 240 29% 18%; /* #242438 — elevated surface */
		--accent-foreground: 0 0% 91%;
		--destructive: 0 84% 60%; /* #EF4444 */
		--border: 145 68% 45% / 0.15; /* faint green border, not gray */
		--input: 145 68% 45% / 0.2; /* green-tinted input border */
		--ring: 145 68% 45%; /* green focus ring */
		--radius: 0rem; /* ZERO border-radius globally */
	}
}
```

#### Agent Verification Checklist

Before any page or component ships, verify:

- [ ] **No rounded corners** — inspect every element. Zero `rounded-*`
      classes except `rounded-full` on terminal dots.
- [ ] **No zinc/slate/gray** — search the entire codebase for `zinc-`,
      `slate-`, `gray-`, `neutral-`. None should appear.
- [ ] **No Inter font** — check computed styles. All text must be IBM Plex.
- [ ] **No Lucide icons** — search for `lucide-react` imports. Must be zero.
- [ ] **No ring-offset** — search for `ring-offset`. Must be zero.
- [ ] **No `shadow-sm`** on cards — search for `shadow-sm`, `shadow-md`.
- [ ] **No default transitions** — hover/focus states must be instant or
      use `duration-75` maximum.
- [ ] **Dark background** — page background is `#0D0D0D`, not white.
- [ ] **Green or teal accents only** — no blue, purple, or generic colors.
- [ ] **Terminal symbols present** — `$`, `●`, `▌` visible where expected.

---

## 5. Page Structure

### 5.1 Landing Page

The landing page is a single scrollable page. Every section uses terminal
framing or prompt-style headings.

```
┌─────────────────────────────────────────────────────┐
│ NAV:  cypress-cli_   Docs  Demo  GitHub       ★ Star│
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─ Terminal Window ──────────────────────────────┐  │
│  │ $ npm install -g cypress-cli                   │  │
│  │ $ cypress-cli open https://example.com         │  │
│  │ $ cypress-cli snapshot                         │  │
│  │ - heading "welcome" [e1]                       │  │
│  │ - button "submit" [e3]                         │  │
│  │ $▌                                             │  │
│  └────────────────────────────────────────────────┘  │
│                                                     │
│  The missing REPL for Cypress.                      │  ← Serif tagline
│  Give any LLM real browser control.                 │
│                                                     │
│  [Try the Demo]  [Read the Docs]                    │
│                                                     │
├─ $ features ────────────────────────────────────────┤
│                                                     │
│  [01/commands]    [02/snapshots]    [03/export]     │
│  Real Cypress     Aria snapshots    Export to        │
│  commands in a    as structured     real Cypress     │
│  live browser     DOM repr          test files       │
│                                                     │
├─ $ how-it-works ────────────────────────────────────┤
│                                                     │
│  ┌─ agent session ─────┐   ┌─ system ─────────────┐ │
│  │ LLM: click [e3]     │   │ LLM → CLI Client     │ │
│  │ CLI: ✓ clicked       │   │ CLI → Daemon          │ │
│  │ LLM: snapshot        │   │ Daemon → Cypress      │ │
│  │ CLI: - heading [e1]  │   │ Cypress → Browser     │ │
│  └──────────────────────┘   └──────────────────────┘ │
│                                                     │
├─ $ commands ────────────────────────────────────────┤
│                                                     │
│  ┌─ Command Table ──────────────────────────────┐   │
│  │ Command     │ Description      │ Category    │   │
│  │ click [ref] │ Click element    │ action      │   │
│  │ type ...    │ Type into input  │ action      │   │
│  │ snapshot    │ Get aria tree    │ query       │   │
│  │ assert ...  │ Run assertion    │ assertion   │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
├─ $ exit ────────────────────────────────────────────┤
│  MIT License · GitHub · npm                         │
└─────────────────────────────────────────────────────┘
```

### 5.2 Workshop Page (Interactive Demo)

The workshop uses the pre-decided 3-column layout. This is the core
interactive experience.

```
┌─────────────────────────────────────────────────────┐
│ NAV:  cypress-cli_   Docs  [Demo]  GitHub           │
├────────┬──────────────────────────┬─────────────────┤
│        │                          │                 │
│  TOC   │   REPL / Demo Area      │   Output /      │
│        │                          │   Snapshot      │
│  Try   │  ┌─ Terminal ─────────┐  │                 │
│  these:│  │ $ snapshot         │  │  - document:    │
│        │  │ $ click [e3]       │  │    - heading    │
│  • Nav │  │ $ type [e2] hello  │  │    - button     │
│  • Form│  │ $ assert [e2] ...  │  │    - input      │
│  • List│  │ $▌                 │  │                 │
│        │  └────────────────────┘  │                 │
│        │                          │                 │
│        │  Target page renders     │                 │
│        │  here (live iframe or    │                 │
│        │  simulated)              │                 │
│        │                          │                 │
├────────┴──────────────────────────┴─────────────────┤
│  $ exit                                             │
└─────────────────────────────────────────────────────┘
```

**Interactivity model: Live cypress-cli + LLM test generation.**

The workshop runs a real cypress-cli session against a live target page.
Users interact with the REPL exactly as an agent would — typing commands,
seeing aria snapshots, clicking refs. Additionally, users can ask an LLM
to generate a Cypress test based on the current page state and their
natural-language intent.

**Architecture:**

- A backend service (or serverless function) manages a cypress-cli session
  per workshop visitor. The React island communicates with it over
  WebSocket or HTTP.
- The target page renders in a live iframe (or is proxied). Commands
  execute against the real page — `snapshot`, `click`, `type`, `assert`
  all produce real results.
- An LLM integration (API call from the backend) accepts the current aria
  snapshot + user prompt and returns a generated Cypress test. The
  workshop displays the generated test in a code pane and optionally
  runs it.
- Fallback: if live sessions are unavailable (cost, scale, cold start),
  the workshop degrades to replaying pre-recorded sessions with realistic
  timing. The UI stays identical — only the data source changes.

**Workshop columns:**

| Column | Content                                                          |
| ------ | ---------------------------------------------------------------- |
| Left   | TOC / guided scenarios ("Try navigating", "Try form fill", etc.) |
| Center | REPL terminal + target page iframe (stacked or tabbed)           |
| Right  | Output: aria snapshot, console, generated test code              |

**Column widths:**

| Column | Width    | Collapsible | Mobile behavior        |
| ------ | -------- | ----------- | ---------------------- |
| TOC    | `200px`  | Yes         | Collapses to hamburger |
| Demo   | `flex-1` | No          | Full width             |
| Output | `320px`  | Yes         | Tabs below demo area   |

### 5.3 Documentation Pages

Documentation pages use the Signal hybrid voice — serif headings for
authority, sans-serif body for readability, with terminal windows for all
code examples.

```
┌─────────────────────────────────────────────────────┐
│ NAV:  cypress-cli_   [Docs]  Demo  GitHub           │
├─────────┬───────────────────────────────────────────┤
│         │                                           │
│  Side   │  Getting Started                          │  ← Serif heading
│  nav    │                                           │
│         │  cypress-cli gives LLMs REPL-like access  │  ← Sans body
│  Get    │  to a live web page through real Cypress   │
│  Start  │  commands.                                │
│         │                                           │
│  Cmds   │  ┌─ Terminal ──────────────────────────┐  │
│         │  │ $ npm install -g cypress-cli         │  │
│  Config │  │ $ cypress-cli open https://example.  │  │
│         │  └─────────────────────────────────────┘  │
│  API    │                                           │
│         │  ## Commands                               │
│         │  ...                                       │
├─────────┴───────────────────────────────────────────┤
│  $ exit                                             │
└─────────────────────────────────────────────────────┘
```

### 5.4 Blog / Announcements (stub)

> **Stub:** Not in scope for initial launch. When added, blog posts should
> use the Signal hybrid voice — serif titles, generous whitespace, pull-quotes
> with teal left-border accent. Code blocks remain Terminal Native styled.

---

## 6. Cherry-Pick List

Elements explicitly borrowed from non-winning mockups, as identified across
all four reviews.

| Element                    | Source                | Priority | Implementation                                                                                              |
| -------------------------- | --------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| Colored terminal dots      | DaisyUI-C, Shoelace-C | P0       | Red/yellow/green dots in terminal title bars. Universal "this is a terminal" signal.                        |
| Copy button on code blocks | Shoelace-B            | P0       | `<CopyButton>` — custom Astro component with vanilla JS, or shadcn `Tooltip` for feedback on workshop page. |
| Serif accent heading       | Tailwind-B            | P0       | IBM Plex Serif for landing page tagline and doc page headings. Core hybrid element.                         |
| Teal as secondary color    | Tailwind-B            | P1       | Green = terminal content, teal = site chrome (nav, links, buttons, interactive).                            |
| Card hover glow            | Shoelace-B            | P2       | `hover:ring-1 hover:ring-green-500/30` on feature cards. No border-radius.                                  |
| Warm-tone alt section      | Shoelace-B            | P3       | Optional `#2A2420` background for one mid-page section to break dark monotony.                              |
| Copy button with tooltip   | Shoelace-B            | P1       | shadcn `Tooltip` on workshop page; CSS-only tooltip (or `<CopyButton>` built-in) on static pages.           |
| Resizable panels           | (new)                 | P0       | shadcn `ResizablePanelGroup` for workshop 3-column layout. No equivalent in CSS-only approach.              |
| Command palette            | (new)                 | P1       | shadcn `Command` for REPL autocomplete on workshop page.                                                    |

---

## 7. Responsive Strategy (stub)

> **Stub — needs detailed breakpoints and testing.** General principles:

| Breakpoint    | Behavior                                                              |
| ------------- | --------------------------------------------------------------------- |
| `≥1280px`     | Full layout as designed                                               |
| `1024–1279px` | Workshop: collapse TOC to hamburger                                   |
| `768–1023px`  | Workshop: single column, output as tabs below                         |
| `<768px`      | Stack everything. Terminal windows full-width. Reduce hero font size. |

Terminal windows should never horizontally scroll on mobile — truncate long
lines with `...` or wrap.

---

## 8. Accessibility Requirements (stub)

> **Stub — needs full audit against WCAG 2.1 AA.**

- All text must meet WCAG 2.1 AA contrast ratios (4.5:1 for body text,
  3:1 for large text)
- Green (#22C55E) on dark (#0D0D0D) = contrast ratio ~6.4:1 ✓
- Teal (#4A9A9A) on dark (#0D0D0D) = needs verification
- Terminal windows must be navigable by keyboard
- Copy button must have `aria-label="Copy to clipboard"` and announce
  "Copied" to screen readers
- Respect `prefers-reduced-motion` — disable blinking cursor animation
- All images (if any) need alt text; decorative terminal chrome is
  `aria-hidden="true"`

---

## 9. Performance Budget (stub)

> **Stub — needs benchmarking after initial build.**

| Metric                   | Target (static pages)                    | Target (workshop)                            |
| ------------------------ | ---------------------------------------- | -------------------------------------------- |
| Lighthouse Performance   | ≥ 95                                     | ≥ 85                                         |
| First Contentful Paint   | < 1.0s                                   | < 1.5s                                       |
| Largest Contentful Paint | < 2.0s                                   | < 2.5s                                       |
| Total page weight (gzip) | < 100KB (zero JS)                        | < 250KB (includes React + shadcn island)     |
| Font files               | ≤ 6 subsets (IBM Plex Mono, Sans, Serif) | Same                                         |
| JavaScript               | 0KB — static HTML from Astro + shadcn    | ~40-50KB React runtime + ~20KB shadcn bundle |
| Third-party requests     | 0 (everything self-hosted)               | 0 (everything self-hosted)                   |

**Note:** Static pages render shadcn components at build time → zero client
JS. The workshop page is the only page that ships React. If React + shadcn
exceeds 70KB gzip, investigate tree-shaking or Preact compat.

---

## 10. Implementation Plan (stub)

> **Stub — needs detailed breakdown into issues/tasks.**

**Phase 0: Project setup**

1. Initialize Astro project with Tailwind CSS v4
2. Install React integration (`@astrojs/react`)
3. Run `npx shadcn@latest init` — configure with Terminal Native theme
4. Override shadcn CSS variables in `globals.css` (see §4.6)
5. Install IBM Plex fonts (Mono, Sans, Serif)
6. Verify `--radius: 0rem` globally — NO rounded corners
7. Install needed shadcn components: `button`, `table`, `navigation-menu`,
   `tooltip`, `scroll-area`
8. Run anti-default checklist (§4.6) against initial setup

**Phase 1: Landing page (static — zero JS)**

9. Build `<TerminalWindow>` Astro component
10. Build `<TerminalLine>`, `<CopyButton>` Astro components
11. Build hero section (terminal + serif tagline)
12. Build `<FeatureCard>` Astro component + features section
13. Build how-it-works section (agent session + system terminals)
14. Build command table — shadcn `Table` rendered static by Astro
15. Build nav (shadcn `NavigationMenu` rendered static) and footer
16. Implement light mode fallback
17. Accessibility pass (WCAG 2.1 AA, see §8)
18. Responsive pass (see §7)
19. Performance audit — confirm 0KB JS shipped
20. Run anti-default checklist (§4.6)

**Phase 2: Documentation**

21. Set up Astro content collections for docs
22. Build doc layout (sidebar nav + content + `ScrollArea`)
23. Port key docs (Getting Started, Commands, API)
24. Implement search (stub)

**Phase 3: Workshop / Interactive Demo (React island)**

25. Install workshop shadcn components: `resizable`, `tabs`, `command`,
    `dialog`, `sheet`
26. Build 3-column layout with shadcn `ResizablePanelGroup`
27. Implement REPL component with shadcn `Command` autocomplete
28. Build output pane with `Tabs` (snapshot / console / generated test)
29. Build backend service for live cypress-cli session management
30. Connect REPL to live cypress-cli over WebSocket
31. Implement target page iframe / proxy
32. Build LLM test generation flow (snapshot + prompt → Cypress test)
33. Build generated test display pane with syntax highlighting
34. Build recorded-session replay fallback
35. Verify React island hydrates ONLY on workshop page
36. Performance audit — React + shadcn < 70KB gzip
37. Run anti-default checklist (§4.6)

**Phase 4: Blog / Polish**

34. Blog layout (Astro content collections)
35. Launch announcement post
36. Final cross-browser testing
37. Analytics (privacy-respecting, if any)

---

## 11. Resolved Questions

1. ~~**Light mode terminal insets:**~~ **Resolved: Dark inset always.**
   Terminal windows keep their dark background (`--bg-primary`) regardless
   of page theme. A light-background terminal breaks the "real terminal"
   illusion. One terminal component, one color scheme.

2. ~~**Workshop interactivity model:**~~ **Resolved: Live cypress-cli.**
   Live sessions with LLM-powered test generation. Fallback to recorded
   session replay if live is unavailable. See §5.2.

3. ~~**Serif font for hero:**~~ **Resolved: IBM Plex Serif.** Stay with
   the Plex family for cohesion — Mono, Sans, and Serif were designed
   together and share weight/proportion. Playfair Display is more dramatic
   but fights the rest of the typography.

4. ~~**Green saturation:**~~ **Resolved: `#22C55E` (Tailwind green-500).**
   Primary terminal text and accent color. `#00FF41` is too fatiguing at
   body text sizes. Reserve `#00FF41` for micro-accents only (blinking
   cursor `▌`, brief flash effects).

5. ~~**Command table scope:**~~ **Resolved: Curated 10-15 on landing.**
   Pick the commands that tell a session story (`open`, `snapshot`, `click`,
   `type`, `assert`, `scroll`, `navigate`, `network`, `console`, `codegen`)
   with a link to the full reference in docs. The workshop and docs pages
   show the complete set.

6. ~~**Animated terminal hero:**~~ **Resolved: Yes, with motion respect.**
   Typing animation on the hero terminal (~3-4 commands, ~4 seconds total).
   Respect `prefers-reduced-motion` by showing the final state immediately.
   This is the highest-impact landing page element.

7. ~~**GitHub stars badge:**~~ **Resolved: Skip for launch.** Adds a
   third-party request (breaks the 0 third-party performance budget) and a
   low count early on works against you. Add later when worth showing. A
   "GitHub" nav link is sufficient.

---

## Appendix A: Design Review Archive

All design review artifacts are archived in
[docs/design-review/](design-review/):

| File                                              | Description                                     |
| ------------------------------------------------- | ----------------------------------------------- |
| `DESIGN_MOCKUP_RUNBOOK.md`                        | Instructions for building the 9 mockups         |
| `DESIGN_MOCKUP_LOGBOOK.md`                        | Progress log from mockup creation               |
| `DESIGN_REVIEW_KICKOFF.md`                        | Review session kickoff notes                    |
| `DESIGN_REVIEW_RUNBOOK.md`                        | Instructions for the visual review              |
| `DESIGN_REVIEW_LOGBOOK.md`                        | Primary review — detailed observations + scores |
| `DESIGN_REVIEW_SECOND_OPINION_CLAUDE_OPUS_4.6.md` | Second opinion — Claude Opus 4.6                |
| `DESIGN_REVIEW_SECOND_OPINION_GPT-5.4.md`         | Second opinion — GPT-5.4                        |
| `Gemini-3.1-Pro-Review.md`                        | Second opinion — Gemini 3.1 Pro                 |
| `mockups/`                                        | 9 HTML mockups + index + screenshot tool        |
| `mockups/screenshots/`                            | 28 captured screenshots from the review         |

### Scoring Summary (from primary review)

|               | Lab Manual (A) | Signal (B) | Terminal Native (C) |
| ------------- | -------------- | ---------- | ------------------- |
| DaisyUI       | 22/60          | 17/60      | 40/60               |
| Shoelace      | 39/60          | 43/60      | 42/60               |
| Tailwind-only | 44/60          | 48/60      | **53/60**           |

**Winner: Tailwind-only × Terminal Native (C) — 53/60**  
**Runner-up: Tailwind-only × Signal (B) — 48/60**  
**Best non-Tailwind: Shoelace × Signal (B) — 43/60**

All four independent reviews confirmed: Tailwind-C wins, dark background is
the most impactful variable, and the hero-as-terminal concept is the design's
signature element.
