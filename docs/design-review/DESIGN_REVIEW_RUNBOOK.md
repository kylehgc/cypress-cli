# Design Review — Runbook

> **Audience:** An LLM agent executing this as a single long-running task.
> You MUST write to [DESIGN_REVIEW_LOGBOOK.md](DESIGN_REVIEW_LOGBOOK.md)
> after every step completes or fails. This is part of the task, not optional.
>
> **ABORT RULE:** If you are unable to write a logbook entry for a step
> (e.g., the file cannot be opened, the write fails, or you skip the
> entry), **stop all work immediately**. Do not proceed to the next step.
> The logbook is the only way progress is tracked across session
> boundaries. Work without a logbook entry is invisible and
> unrecoverable.
>
> **Branch:** `feat/demo-site`
>
> **Goal:** Visually review all 9 mockups (3 component libraries ×
> 3 visual directions), take screenshots of each, record detailed
> observations, score every combination, and write persuasive arguments
> for at least 2 finalists. The output is a completed logbook that the
> project owner can read to make a final decision.
>
> **Success criteria:**
>
> 1. Every mockup page has been opened, scrolled, and screenshotted
>    (top and bottom of each page = 18 screenshots minimum)
> 2. Each screenshot has been inspected via `view_image` and observations
>    written to the logbook
> 3. A scoring matrix (9 cells, 6 weighted criteria) is filled in
> 4. At least 2 persuasive arguments are written with pros, cons, and
>    cherry-pick suggestions
> 5. All screenshots saved to `mockups/screenshots/`
>
> **CRITICAL — Be honest and blunt.** Do not be polite. Do not give
> every mockup a participation trophy. If a design is bad, say it is
> bad and explain exactly why. If a combination doesn't work — ugly
> colors, broken hierarchy, clashing aesthetics, amateur feel, poor
> readability — call it out directly. Use phrases like "this does not
> work", "this looks cheap", "this is the weakest option", "I would
> not ship this". The project owner needs a ruthless filter, not
> diplomatic hedging. Praise only what genuinely earns it. If all 9
> are mediocre, say so. If one is clearly terrible, flag it early and
> explain why it should be eliminated. Score low when warranted — a
> score of 1 or 2 is not an insult, it is useful signal.
>
> **Tools required:**
>
> - `playwright-cli` skill — for `open`, `goto`, `screenshot`, `press`,
>   and `close` commands
> - `view_image` tool — for inspecting captured screenshots
> - File editing tools — for writing to the logbook

---

## Screenshot Naming Convention

All screenshots go to `mockups/screenshots/`. Naming pattern:

```
{NN}-{library}-{direction}-{position}.png
```

Examples:

- `01-daisyui-a-top.png`
- `01-daisyui-a-bottom.png`
- `02-daisyui-b-top.png`

Step numbers correspond to the step that captures them.

---

## Step 0: Setup

1. Verify `mockups/screenshots/` directory exists. Create it if not.
2. Verify all 9 mockup files exist in `mockups/`:
   - `daisyui-a.html`, `daisyui-b.html`, `daisyui-c.html`
   - `shoelace-a.html`, `shoelace-b.html`, `shoelace-c.html`
   - `tailwind-a.html`, `tailwind-b.html`, `tailwind-c.html`
3. Open a browser session:
   ```
   playwright-cli open file:///absolute/path/to/mockups/index.html
   ```
4. Take a screenshot of the index page:
   ```
   playwright-cli screenshot --filename=mockups/screenshots/00-index.png
   ```
5. Inspect the screenshot with `view_image` to confirm the page loaded.

**Write to logbook.**

---

## Step 1: Review DaisyUI × Lab Manual (`daisyui-a.html`)

1. Navigate:
   ```
   playwright-cli goto file:///absolute/path/to/mockups/daisyui-a.html
   ```
2. Screenshot the top of the page:
   ```
   playwright-cli screenshot --filename=mockups/screenshots/01-daisyui-a-top.png
   ```
3. Scroll to the bottom:
   ```
   playwright-cli press End
   ```
4. Screenshot the bottom of the page:
   ```
   playwright-cli screenshot --filename=mockups/screenshots/01-daisyui-a-bottom.png
   ```
5. Inspect **both** screenshots with `view_image`.
6. Write observations to the logbook. Address **all** of these:
   - **First impression:** What is the immediate visual feeling?
   - **Hierarchy:** Is the heading/section structure clear?
   - **Color:** Does the amber accent work? Is contrast sufficient?
   - **Components:** Do DaisyUI components feel cohesive with Lab Manual direction?
   - **Typography:** Does IBM Plex Mono for headings feel right?
   - **Density:** Is the data-dense approach effective or cluttered?
   - **Dark mode readiness:** Does the palette look like it would work in dark mode?
   - **Standout elements:** What works especially well?
   - **Weaknesses:** What feels off or could be better?
   - **Kill shot:** Is this design fundamentally bad? If so, say it plainly and recommend eliminating it from consideration. Don't soften the verdict.

**Write to logbook.**

---

## Step 2: Review DaisyUI × Signal (`daisyui-b.html`)

1. Navigate:
   ```
   playwright-cli goto file:///absolute/path/to/mockups/daisyui-b.html
   ```
2. Screenshot top:
   ```
   playwright-cli screenshot --filename=mockups/screenshots/02-daisyui-b-top.png
   ```
3. Scroll to bottom:
   ```
   playwright-cli press End
   ```
4. Screenshot bottom:
   ```
   playwright-cli screenshot --filename=mockups/screenshots/02-daisyui-b-bottom.png
   ```
5. Inspect **both** screenshots with `view_image`.
6. Write observations to the logbook. Same criteria as Step 1, but also:
   - **Serif headings:** Does IBM Plex Serif give it editorial authority?
   - **Whitespace:** Is the generous spacing elegant or wasteful?
   - **Pull-quote:** Does it add personality or feel gratuitous?
   - **Comparison to Step 1:** How does this feel relative to Lab Manual?

**Write to logbook.**

---

## Step 3: Review DaisyUI × Terminal Native (`daisyui-c.html`)

1. Navigate:
   ```
   playwright-cli goto file:///absolute/path/to/mockups/daisyui-c.html
   ```
2. Screenshot top:
   ```
   playwright-cli screenshot --filename=mockups/screenshots/03-daisyui-c-top.png
   ```
3. Scroll to bottom:
   ```
   playwright-cli press End
   ```
4. Screenshot bottom:
   ```
   playwright-cli screenshot --filename=mockups/screenshots/03-daisyui-c-bottom.png
   ```
5. Inspect **both** screenshots with `view_image`.
6. Write observations to the logbook. Same criteria as Step 1, but also:
   - **Terminal aesthetic:** Does the `$`-prefix / terminal window chrome feel authentic?
   - **Lowercase:** Does forced lowercase help or hurt readability?
   - **Green accent:** Is it vibrant-fun or garish?
   - **DaisyUI fit:** Do DaisyUI components work with terminal styling or fight it?
   - **Comparison to Steps 1–2:** Rank the three DaisyUI pages so far.

**Write to logbook.**

---

## Step 4: Review Shoelace × Lab Manual (`shoelace-a.html`)

1. Navigate:
   ```
   playwright-cli goto file:///absolute/path/to/mockups/shoelace-a.html
   ```
2. Screenshot top:
   ```
   playwright-cli screenshot --filename=mockups/screenshots/04-shoelace-a-top.png
   ```
3. Scroll to bottom:
   ```
   playwright-cli press End
   ```
4. Screenshot bottom:
   ```
   playwright-cli screenshot --filename=mockups/screenshots/04-shoelace-a-bottom.png
   ```
5. Inspect **both** screenshots with `view_image`.
6. Write observations to the logbook. Same criteria as Step 1, but also:
   - **Web Components:** Do `sl-tab-group`, `sl-tree`, `sl-card` etc. add value?
   - **Tab-based commands:** Better than a flat table? Worse?
   - **Copy button:** Does `sl-copy-button` on the install command feel polished?
   - **Comparison to DaisyUI-A:** Same direction, different library. Which executes Lab Manual better?

**Write to logbook.**

---

## Step 5: Review Shoelace × Signal (`shoelace-b.html`)

1. Navigate:
   ```
   playwright-cli goto file:///absolute/path/to/mockups/shoelace-b.html
   ```
2. Screenshot top:
   ```
   playwright-cli screenshot --filename=mockups/screenshots/05-shoelace-b-top.png
   ```
3. Scroll to bottom:
   ```
   playwright-cli press End
   ```
4. Screenshot bottom:
   ```
   playwright-cli screenshot --filename=mockups/screenshots/05-shoelace-b-bottom.png
   ```
5. Inspect **both** screenshots with `view_image`.
6. Write observations to the logbook. Same criteria as Step 1, but also:
   - **Shoelace + editorial:** Do web components complement or clash with the minimal editorial feel?
   - **Comparison to DaisyUI-B:** Same direction, different library. Which is more editorial?
   - **Comparison to Shoelace-A:** Same library, different direction. How much does direction change the feel?

**Write to logbook.**

---

## Step 6: Review Shoelace × Terminal Native (`shoelace-c.html`)

1. Navigate:
   ```
   playwright-cli goto file:///absolute/path/to/mockups/shoelace-c.html
   ```
2. Screenshot top:
   ```
   playwright-cli screenshot --filename=mockups/screenshots/06-shoelace-c-top.png
   ```
3. Scroll to bottom:
   ```
   playwright-cli press End
   ```
4. Screenshot bottom:
   ```
   playwright-cli screenshot --filename=mockups/screenshots/06-shoelace-c-bottom.png
   ```
5. Inspect **both** screenshots with `view_image`.
6. Write observations to the logbook. Same criteria as Step 1, but also:
   - **Shoelace + terminal:** Do web components enhance the terminal theme (e.g., interactive tabs) or feel foreign?
   - **Comparison to DaisyUI-C:** Same direction, different library. Which feels more terminal-native?
   - **Rank all 3 Shoelace pages.**

**Write to logbook.**

---

## Step 7: Review Tailwind-only × Lab Manual (`tailwind-a.html`)

1. Navigate:
   ```
   playwright-cli goto file:///absolute/path/to/mockups/tailwind-a.html
   ```
2. Screenshot top:
   ```
   playwright-cli screenshot --filename=mockups/screenshots/07-tailwind-a-top.png
   ```
3. Scroll to bottom:
   ```
   playwright-cli press End
   ```
4. Screenshot bottom:
   ```
   playwright-cli screenshot --filename=mockups/screenshots/07-tailwind-a-bottom.png
   ```
5. Inspect **both** screenshots with `view_image`.
6. Write observations to the logbook. Same criteria as Step 1, but also:
   - **Hand-crafted feel:** Does the absence of a component library show? Better or worse?
   - **Comparison to DaisyUI-A and Shoelace-A:** All three Lab Manual variants. Rank them.
   - **Implementation cost:** How much more work would Tailwind-only be for the real site?

**Write to logbook.**

---

## Step 8: Review Tailwind-only × Signal (`tailwind-b.html`)

1. Navigate:
   ```
   playwright-cli goto file:///absolute/path/to/mockups/tailwind-b.html
   ```
2. Screenshot top:
   ```
   playwright-cli screenshot --filename=mockups/screenshots/08-tailwind-b-top.png
   ```
3. Scroll to bottom:
   ```
   playwright-cli press End
   ```
4. Screenshot bottom:
   ```
   playwright-cli screenshot --filename=mockups/screenshots/08-tailwind-b-bottom.png
   ```
5. Inspect **both** screenshots with `view_image`.
6. Write observations to the logbook. Same criteria as Step 1, but also:
   - **Signal without components:** Does the editorial direction work with hand-crafted elements?
   - **Comparison to DaisyUI-B and Shoelace-B:** All three Signal variants. Rank them.

**Write to logbook.**

---

## Step 9: Review Tailwind-only × Terminal Native (`tailwind-c.html`)

1. Navigate:
   ```
   playwright-cli goto file:///absolute/path/to/mockups/tailwind-c.html
   ```
2. Screenshot top:
   ```
   playwright-cli screenshot --filename=mockups/screenshots/09-tailwind-c-top.png
   ```
3. Scroll to bottom:
   ```
   playwright-cli press End
   ```
4. Screenshot bottom:
   ```
   playwright-cli screenshot --filename=mockups/screenshots/09-tailwind-c-bottom.png
   ```
5. Inspect **both** screenshots with `view_image`.
6. Write observations to the logbook. Same criteria as Step 1, but also:
   - **Pure terminal:** With no component library, does this feel most authentically terminal?
   - **Comparison to DaisyUI-C and Shoelace-C:** All three Terminal Native variants. Rank them.
   - **Rank all 3 Tailwind-only pages.**

**Write to logbook.**

---

## Step 10: Column Cross-Comparison (same direction, different libraries)

Go back through each direction and rapidly compare the three library
implementations side by side. For each direction, open all three pages
in sequence and take notes.

### 10a: Lab Manual column (A)

1. `playwright-cli goto file:///absolute/path/to/mockups/daisyui-a.html`
2. `playwright-cli screenshot --filename=mockups/screenshots/10a-daisyui-a-compare.png`
3. `playwright-cli goto file:///absolute/path/to/mockups/shoelace-a.html`
4. `playwright-cli screenshot --filename=mockups/screenshots/10a-shoelace-a-compare.png`
5. `playwright-cli goto file:///absolute/path/to/mockups/tailwind-a.html`
6. `playwright-cli screenshot --filename=mockups/screenshots/10a-tailwind-a-compare.png`
7. Inspect all three screenshots. Record:
   - Which library **best executes** the Lab Manual direction?
   - What does each library add or subtract from the visual intent?
   - Would you cherry-pick anything from a non-winner?

### 10b: Signal column (B)

1. `playwright-cli goto file:///absolute/path/to/mockups/daisyui-b.html`
2. `playwright-cli screenshot --filename=mockups/screenshots/10b-daisyui-b-compare.png`
3. `playwright-cli goto file:///absolute/path/to/mockups/shoelace-b.html`
4. `playwright-cli screenshot --filename=mockups/screenshots/10b-shoelace-b-compare.png`
5. `playwright-cli goto file:///absolute/path/to/mockups/tailwind-b.html`
6. `playwright-cli screenshot --filename=mockups/screenshots/10b-tailwind-b-compare.png`
7. Inspect all three screenshots. Record same questions as 10a.

### 10c: Terminal Native column (C)

1. `playwright-cli goto file:///absolute/path/to/mockups/daisyui-c.html`
2. `playwright-cli screenshot --filename=mockups/screenshots/10c-daisyui-c-compare.png`
3. `playwright-cli goto file:///absolute/path/to/mockups/shoelace-c.html`
4. `playwright-cli screenshot --filename=mockups/screenshots/10c-shoelace-c-compare.png`
5. `playwright-cli goto file:///absolute/path/to/mockups/tailwind-c.html`
6. `playwright-cli screenshot --filename=mockups/screenshots/10c-tailwind-c-compare.png`
7. Inspect all three screenshots. Record same questions as 10a.

**Write to logbook** (one entry covering all three column comparisons).

---

## Step 11: Row Cross-Comparison (same library, different directions)

Using the screenshots already captured in Steps 1–9, compare across
directions for each library. No new screenshots needed — use `view_image`
on the existing files.

### 11a: DaisyUI row

1. `view_image` for `01-daisyui-a-top.png`, `02-daisyui-b-top.png`, `03-daisyui-c-top.png`
2. Record: Which direction suits DaisyUI best? What gets lost in each?

### 11b: Shoelace row

1. `view_image` for `04-shoelace-a-top.png`, `05-shoelace-b-top.png`, `06-shoelace-c-top.png`
2. Record: Which direction suits Shoelace best? What gets lost in each?

### 11c: Tailwind-only row

1. `view_image` for `07-tailwind-a-top.png`, `08-tailwind-b-top.png`, `09-tailwind-c-top.png`
2. Record: Which direction suits Tailwind-only best? What gets lost in each?

**Write to logbook** (one entry covering all three row comparisons).

---

## Step 12: Scoring Matrix

Fill in the scoring matrix in the logbook. Rate each of the 9
combinations on a 1–5 scale across these weighted criteria:

| Criterion             | Weight | What to evaluate                                                      |
| --------------------- | ------ | --------------------------------------------------------------------- |
| Visual impact         | ×3     | Does it grab attention? Does it look like a product you want to use?  |
| Brand fit             | ×3     | Does it feel right for a CLI tool that gives LLMs access to browsers? |
| Content clarity       | ×2     | Is the information hierarchy clear? Can you scan and find things?     |
| Component quality     | ×2     | Do the UI components feel polished, consistent, and well-implemented? |
| Dark mode potential   | ×1     | How well does the color palette translate to dark mode?               |
| Implementation effort | ×1     | How much work to build the real site? (5 = least effort)              |

**Total possible:** 60 points per combination.

Fill in this table in the logbook:

```
|                  | Lab Manual (A) | Signal (B) | Terminal Native (C) |
| ---------------- | -------------- | ---------- | ------------------- |
| DaisyUI          |    /60         |    /60     |    /60              |
| Shoelace         |    /60         |    /60     |    /60              |
| Tailwind-only    |    /60         |    /60     |    /60              |
```

Show the per-criterion breakdown for each cell, then the weighted total.

**Write to logbook.**

---

## Step 13: Persuasive Arguments

Write **at least 2** persuasive arguments for the top-scoring
combinations. Each argument should be a self-contained pitch that could
convince a stakeholder. Structure each as:

### Argument Template

```
## The Case for [Library] × [Direction]

**One-line pitch:** [Single sentence selling this combination]

### Why This Wins

[3–5 paragraphs making the affirmative case. Reference specific visual
elements you observed in the screenshots. Cite the scoring matrix.]

### Pros
- [Bullet list of concrete advantages]

### Cons
- [Bullet list of honest weaknesses]

### Cherry-Pick List
[Elements from other combinations that could be borrowed to address the
cons. Be specific: "Take the tab-based command reference from Shoelace-A
and adapt it for DaisyUI components."]

### Risk Assessment
[What could go wrong with this choice? What's the biggest unknown?]
```

Write **at least 2** of these arguments. If there's a clear third
contender, write a third. The arguments should genuinely argue for their
choice, not be lukewarm. Include them in the logbook.

**Write to logbook.**

---

## Step 14: Final Recommendation

Based on all observations, scores, and arguments, write a final
recommendation section in the logbook:

1. **Winner:** Which combination do you recommend and why?
2. **Runner-up:** Which was the close second?
3. **Cherry-picks:** What specific elements from other combinations
   should be incorporated into the winner?
4. **Next steps:** What should happen next to move from mockup to
   real site?

**Write to logbook.**

---

## Step 15: Cleanup

1. Close the browser:
   ```
   playwright-cli close
   ```
2. Verify all screenshots exist in `mockups/screenshots/` (should be
   at least 27 files: 18 from Steps 1–9, 9 from Step 10, plus the
   index screenshot from Step 0).
3. Write final logbook entry confirming completion.

**Write to logbook.**
