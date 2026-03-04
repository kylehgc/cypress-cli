# Time-Travel Debugging (Future Feature)

> Design notes for snapshot-based debugging and checkpointing. This is NOT
> planned for Phase 1 — it's documented here to inform architectural decisions
> that would make it easier to add later.

## The Idea

Cypress already has time-travel debugging: every command creates a DOM snapshot
that you can hover over in the Command Log to see the page state at that
moment. This is a core differentiator of Cypress over other test frameworks.

We can build a parallel system: **capture a stripped-down aria snapshot
alongside each command**, creating a debug trail that both LLMs and humans can
replay.

## What We'd Capture

For each command executed through the REPL:

```typescript
type SnapshotEntry = {
	index: number; // Command sequence number
	timestamp: number; // When the command executed
	command: Command; // What was executed
	cypressCommand: string; // The resolved Cypress command string
	selector: string; // The resolved selector
	beforeSnapshot?: string; // Aria snapshot before command (YAML)
	afterSnapshot: string; // Aria snapshot after command (YAML)
	diff?: string; // Incremental diff (beforeSnapshot → afterSnapshot)
	error?: string; // If the command failed
};
```

This gives us a sequence like:

```
[0] visit('/login')
    after: - main: - heading "Login" - textbox "Email" [ref=e1] - textbox "Password" [ref=e2] - button "Sign In" [ref=e3]

[1] type e1 "user@example.com"
    diff: - <changed> textbox "Email" [ref=e1]: user@example.com

[2] type e2 "secretpass"
    diff: - <changed> textbox "Password" [ref=e2]: ••••••••••

[3] click e3
    diff: (entire page changed)
    after: - main: - heading "Dashboard" - text: Welcome back, user@example.com
```

## Use Cases

### 1. LLM Self-Healing

When a command fails or produces unexpected results, the LLM can look at the
snapshot history to understand what went wrong:

> "I clicked ref e3 expecting navigation to the dashboard, but the page still
> shows the login form. Looking at the diff, I see an error message appeared:
> `alert 'Invalid credentials'`. I should try different credentials."

This is possible because we include the snapshot even on error responses (see
COMMANDS.md). The history makes it even richer — the LLM can see the full
progression and reason about state.

### 2. Checkpoint / Rollback

If a sequence of commands goes wrong, we could potentially roll back to a
previous state:

- **Soft rollback**: Navigate back to a known URL and re-execute commands from
  a checkpoint. Doesn't restore form state but gets the page to a known route.
- **Hard rollback**: Use Cypress's `cy.session()` to save/restore browser state
  (cookies, localStorage) combined with navigation. Closer to a true rollback.

Open question: Is there a way to hook into Cypress's internal snapshot system
(`cy.snapshot()`, undocumented) to restore DOM state directly? This would be
true time-travel but is fragile and version-dependent.

### 3. Test Explanation

Generate human-readable descriptions of what each command did to the page:

```
Step 1: Navigated to the login page
  → Page shows: Login heading, email input, password input, sign-in button

Step 2: Typed "user@example.com" into the email field
  → Email field now contains the typed value

Step 3: Typed password into the password field
  → Password field shows masked input

Step 4: Clicked the "Sign In" button
  → Page navigated to the dashboard
  → Page now shows: Dashboard heading, welcome message with user's email
```

This could be auto-generated from the snapshot diffs without any LLM call —
it's just structured data.

### 4. Debugging Failed Exported Tests

When an exported test fails in CI, the snapshot history (if persisted alongside
the test) would show exactly what the page looked like at each step during the
REPL session. This is like Cypress's video recording but as structured text that
can be diffed, searched, and processed.

## Architecture Implications

### Decisions that help time-travel (Phase 1 should already do these):

1. **Always keep the previous snapshot** — We already do this for incremental
   diffs (`compareSnapshots` takes a `previousSnapshot`). We just need to persist
   it in the command history rather than discarding it.

2. **Track resolved selectors** — For each ref, record the CSS selector that
   was resolved. This is needed for codegen anyway.

3. **Track the full Cypress command string** — Record `cy.get('[data-cy="submit"]').click()`
   not just `click e5`. Needed for codegen and for replay.

4. **Make the command history a first-class data structure** — Not just an array
   of strings, but a typed list of `SnapshotEntry` objects.

### Decisions deferred to later:

1. **Snapshot storage format** — In-memory for the session? Persisted to disk?
   How to handle large snapshot histories (hundreds of commands)?

2. **Rollback implementation** — Which approach (soft navigation, cy.session,
   or internal snapshot hook)?

3. **Compression** — Incremental diffs are already small, but for very long
   sessions, should we store only diffs and reconstruct full snapshots on demand?

4. **Integration with Cypress Dashboard** — Could snapshot histories be uploaded
   alongside test recordings?

## Cypress's Internal Snapshot System

Reference notes from research (may be useful later):

- `cy.snapshot()` is an undocumented internal Cypress command
- It captures a DOM snapshot that the Command Log uses for time-travel
- Snapshots are stored in memory as part of the command log
- Each command has `consoleProps` and `snapshots` arrays
- The Test Runner UI uses these to restore the DOM when hovering over commands
- This is purely a UI feature — there's no API to "restore" a snapshot
  programmatically
- The snapshot format is internal and changes between Cypress versions

For our purposes, capturing aria snapshots (small, text-based, structured) is
more useful than DOM snapshots (large, format-dependent) for LLM consumption.
But we could potentially capture both.

## Relationship to Playwright's compareSnapshots

The `compareSnapshots()` and `filterSnapshotDiff()` functions we're porting are
the foundation for this feature. They:

1. Take two `AriaSnapshot` objects (before/after)
2. Walk both trees, comparing nodes by ref and by structural equality
3. Mark each node as `'same'`, `'skip'` (children changed but this node is
   just a container), or `'changed'`
4. Filter the tree to show only changed subtrees, collapsing unchanged ref'd
   nodes to `ref=eN [unchanged]`

This produces compact diffs even for large pages. A 500-line snapshot might
produce a 5-line diff after a button click that only changes one section.

For time-travel, we'd call `compareSnapshots()` on each command's
before→after pair and store the filtered diff alongside the full after snapshot.
The full snapshot enables reconstruction; the diff enables quick scanning.
