# cypress-cli 1.0 Launch Plan

> Plan for shipping v1.0.0 and getting visibility for the project.

## Current State (2026-04-10)

- **Version:** 0.1.0
- **Commands:** 64 implemented (68 registry entries with aliases)
- **Tests:** 1009 passing across 52 files
- **CI:** GitHub Actions (ci.yml + e2e.yml), both green
- **License:** MIT
- **Package size:** 175 kB (well under npm limits)
- **Open PRs:** 0
- **Open issues:** 5 (all P1-testing or P3 — no blockers)

### Open Issues

| #    | Title                                            | Priority | 1.0 Blocker? |
| ---- | ------------------------------------------------ | -------- | ------------ |
| #73  | Long-running real-world validation comparison    | P1       | **Yes**      |
| #62  | Keyboard/mouse primitives                        | P3       | No           |
| #63  | delete-data and browser config on open           | P3       | No           |
| #64  | AI agent end-to-end test harness                 | P3       | No           |
| #113 | Refactor: extract executeCommand from driverSpec | P3       | No           |

---

## Phase 1: Pre-Release (1–2 days)

### 1.1 Resolve the one blocker: #73 LLM validation

Run a real end-to-end test-generation session using an LLM (Claude, GPT-4, etc.)
against at least 3 different sites. Document:

- Sites tested (e.g., TodoMVC, a login form, a multi-page wizard)
- Commands used per session
- Exported test file — does it pass `cypress-cli run`?
- Pain points found → file as new issues or fix inline
- Side-by-side notes vs playwright-cli (if applicable)

Capture results in `validation/LLM_VALIDATION_RESULTS.md`. This is the final
confidence gate before tagging 1.0.

### 1.2 Version bump & changelog

- [ ] Bump `package.json` version to `1.0.0`
- [ ] Create `CHANGELOG.md` with a summary of all features since 0.1.0
  - Group by: Core, Navigation, Interaction, Assertions, Network, Storage,
    DevTools, Execution, Export, Infrastructure
- [ ] Audit `README.md` — ensure install instructions reference the published
      npm package name, not local paths
- [ ] Verify `"files"` field in `package.json` includes everything needed
      (`dist/`, `bin/`, `skills/`, `README.md`, `LICENSE`, `THIRD_PARTY_LICENSES`)
- [ ] Run `npm pack` and inspect the tarball contents

### 1.3 Final checks

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/ tests/
npm run build
npm pack --dry-run
```

### 1.4 Label open P3 issues

Add a `post-1.0` label to #62, #63, #64, #113 so they're clearly deferred.

---

## Phase 2: Release (1 day)

### 2.1 npm publish

```bash
# Ensure you're logged in
npm whoami
# Dry run first
npm publish --dry-run
# Publish
npm publish --access public
```

**Note:** The package name `cypress-cli` may be taken on npm. Check availability
first (`npm view cypress-cli`). If taken, consider:

- `@kylehgc/cypress-cli` (scoped)
- `cypress-agent-cli`
- `cy-cli`

### 2.2 GitHub release

- [ ] Tag: `git tag v1.0.0 && git push origin v1.0.0`
- [ ] Create GitHub Release from the tag
  - Title: `cypress-cli v1.0.0`
  - Body: paste the CHANGELOG content for 1.0
  - Attach nothing (npm is the distribution channel)

### 2.3 Optional: GitHub Actions release workflow

Add a `.github/workflows/release.yml` that auto-publishes to npm on version
tags:

```yaml
name: Release
on:
  push:
    tags: ['v*']
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: https://registry.npmjs.org
      - run: npm ci
      - run: npm run build
      - run: npm test
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## Phase 3: Visibility & Showcasing (1–2 weeks)

### 3.1 README polish

The README is the #1 landing page. It needs:

- [ ] **Hero section:** One-sentence pitch + animated GIF/asciicast showing
      `open → snapshot → click → type → assert → export` flow
- [ ] **"Why cypress-cli?"** section:
  - LLMs can drive real Cypress commands through a simple CLI
  - Aria snapshots give compact, semantic DOM representation
  - Every session exports to a runnable `.cy.ts` test
  - 65 commands covering navigation, interaction, assertions, network, storage
- [ ] **Comparison table** vs playwright-cli (already in ROADMAP.md — extract
      key rows)
- [ ] **AI Agent integration** section with the SKILL file workflow:
  ```bash
  cypress-cli install --skills
  ```
- [ ] **Badges:** npm version, CI status, license, Node version

### 3.2 Create a demo recording

Record a terminal session (using [asciinema](https://asciinema.org/) or
[VHS](https://github.com/charmbracelet/vhs)) showing:

1. `cypress-cli open https://todomvc.com/examples/react/dist/`
2. `cypress-cli snapshot` — show the aria tree
3. `cypress-cli type e5 "Write launch plan"`
4. `cypress-cli press Enter`
5. `cypress-cli snapshot` — show the todo appeared
6. `cypress-cli assert e10 have.text "Write launch plan"`
7. `cypress-cli export --file todo.cy.ts`
8. `cypress-cli run todo.cy.ts` — show it passes
9. `cypress-cli stop`

This becomes the hero GIF in the README and the demo for all promotion.

### 3.3 Blog post / announcement

Write a launch post covering:

- **Problem:** LLMs need browser access for test generation, but existing tools
  target Playwright. Cypress users are left out.
- **Solution:** cypress-cli gives LLMs REPL-like access to a live browser through
  real Cypress commands, with aria snapshot output.
- **Architecture highlight:** The cy.task() polling loop + QueueBridge approach
  that makes Cypress work as an interactive tool despite its non-interactive
  design.
- **Demo:** Embed the terminal recording.
- **Comparison:** Feature parity with playwright-cli (65 commands, same CLI +
  SKILLS model).
- **Call to action:** `npm install -g cypress-cli` + link to repo.

### 3.4 Distribution channels

#### Primary (day of release)

| Channel                 | Action                                                                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| **Hacker News**         | "Show HN: cypress-cli — Give LLMs REPL access to a browser through Cypress commands"                |
| **Reddit r/javascript** | Post with demo GIF + 2-paragraph description                                                        |
| **Reddit r/webdev**     | Same post, emphasize testing angle                                                                  |
| **Reddit r/cypress**    | Targeted post for Cypress community                                                                 |
| **Twitter/X**           | Thread: problem → solution → demo GIF → link. Tag @Abortedbrain (Cypress), @plaabortwrightdev, etc. |
| **Dev.to**              | Cross-post the blog post                                                                            |
| **LinkedIn**            | Personal post with demo + link                                                                      |

#### Secondary (week after release)

| Channel                          | Action                                                         |
| -------------------------------- | -------------------------------------------------------------- |
| **Cypress Discord / Community**  | Share in #show-and-tell or equivalent                          |
| **GitHub Discussions (Cypress)** | Create a discussion in cypress-io/cypress about the tool       |
| **AI coding agent communities**  | Post in Cursor, Cline, Aider, Claude forums                    |
| **npm "awesome" lists**          | PR to awesome-cypress, awesome-testing-tools                   |
| **YouTube**                      | 5-min walkthrough video (optional, high-effort but high-reach) |

### 3.5 AI agent ecosystem integration

This is the highest-leverage visibility channel — if AI coding agents discover
and use the tool natively, adoption grows organically.

- [ ] **Ensure SKILL.md is discoverable:** The `install --skills` command
      already copies it to `.github/skills/cypress-cli/`. Verify this works with
      the major agents (Copilot, Claude Code, Cursor).
- [ ] **Open PRs to agent tool directories:**
  - Cursor: community tools/MCP directory
  - Claude: tool-use examples
  - Cline: tool integration docs
- [ ] **Create example prompts** showing LLMs how to use cypress-cli:
  - "Generate a Cypress test for the login flow on [url]"
  - "Verify that the checkout process works end-to-end"
  - "Test all form validations on this page"
- [ ] **Publish the SKILL.md approach** as a pattern other tools can follow

### 3.6 Launch website

Build a single-page landing site at **cypress-cli.dev** (or GitHub Pages at
`kylehgc.github.io/cypress-cli`). This is the link you share everywhere — HN,
Reddit, Twitter, blog posts. A GitHub repo README alone doesn't convert
drive-by visitors.

**Stack:** Static site — Astro Starlight, VitePress, or even a single
`index.html` with Tailwind. Host on GitHub Pages (free, zero-config with
Actions). No backend needed.

**Sections:**

- [ ] **Hero:** One-liner pitch + `npm install -g cypress-cli` + embedded
      asciinema/VHS terminal recording of the full open→snapshot→interact→export→run
      flow
- [ ] **How it works:** 3-step diagram (CLI sends command → Cypress executes in
      real browser → aria snapshot returned). Reuse the architecture diagram from
      `ARCHITECTURE.md`
- [ ] **For AI agents:** Show the SKILL file workflow — `install --skills`,
      then the LLM auto-discovers commands. Embed an example prompt + response
- [ ] **Command reference:** Searchable/filterable table of all 65 commands
      with examples (auto-generate from `docs/COMMANDS.md`)
- [ ] **vs playwright-cli:** Side-by-side comparison table. Honest about
      limitations (no multi-tab, no PDF). Emphasize: same CLI+SKILLS model, but
      generates Cypress tests
- [ ] **Getting started:** 60-second quickstart with copy-paste commands
- [ ] **Footer:** GitHub link, npm link, license, "Built by @kylehgc"

**Why this matters:**

- Every social media post needs a destination URL that's not a raw GitHub repo
- A polished landing page signals "real project" vs "weekend experiment"
- The embedded terminal demo lets people see it work without installing anything
- The command reference becomes the canonical docs people bookmark
- SEO: "cypress cli llm" / "cypress test generation ai" queries will land here

**Effort:** ~1 day with a static site generator. The content already exists in
README.md, COMMANDS.md, ROADMAP.md, and ARCHITECTURE.md — it's mostly
reformatting.

### 3.7 Full documentation site (post-launch, if traction)

If the tool gains traction beyond the landing page, expand into a multi-page
docs site with:

- Getting started guide
- Command reference (auto-generated from COMMANDS.md)
- AI agent integration guide
- Architecture deep-dive
- Contributing guide

---

## Phase 4: Post-Launch (ongoing)

### 4.1 Monitor & respond

- [ ] Watch GitHub issues for user-reported bugs — triage within 24h
- [ ] Monitor npm download stats
- [ ] Respond to HN/Reddit comments on launch day
- [ ] Track which AI agents are actually using the tool (via GitHub search for
      SKILL.md references)

### 4.2 Fast-follow releases (v1.1, v1.2)

Queue these based on user feedback and open issues:

| Version | Candidates                                               |
| ------- | -------------------------------------------------------- |
| v1.1    | #63 (delete-data + browser config), #62 (keyboard/mouse) |
| v1.2    | #113 (driverSpec refactor), #64 (AI test harness)        |
| v1.x    | User-requested features, bug fixes from real-world usage |

### 4.3 Metrics to track

| Metric                          | Target (3 months) | How to measure                   |
| ------------------------------- | ----------------- | -------------------------------- |
| npm weekly downloads            | 500+              | npm stats                        |
| GitHub stars                    | 200+              | GitHub                           |
| Open issues from external users | 10+               | GitHub issues (non-kylehgc)      |
| AI agent integrations           | 2+                | GitHub search for SKILL.md usage |
| Contributed PRs                 | 3+                | GitHub PRs from non-kylehgc      |

---

## Timeline Summary

| Phase               | Duration | Key Deliverable                         |
| ------------------- | -------- | --------------------------------------- |
| Pre-Release         | 1–2 days | LLM validation, version bump, CHANGELOG |
| Release             | 1 day    | npm publish, GitHub release tag         |
| Launch site + demo  | 1 day    | Landing page + terminal recording       |
| Visibility (wave 1) | Day of   | HN, Reddit, Twitter, blog post          |
| Visibility (wave 2) | Week 1   | Discord, agent ecosystems, lists        |
| Post-Launch         | Ongoing  | Bug triage, fast-follow releases        |
