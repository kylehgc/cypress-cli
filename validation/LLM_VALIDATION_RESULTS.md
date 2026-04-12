# LLM Validation Results — 1.0 Gate

**Date:** 2026-04-10
**Agent:** GitHub Copilot (GPT-5.4)
**Codebase:** 64 commands, 1009 tests

## Summary

Baseline checks passed cleanly: `npm run build`, `npx vitest run`, `npx tsc --noEmit`, and `npx eslint src/ tests/` all succeeded. Two release-affecting `run` defects and one package/doc issue were fixed inline during validation.

| Category                   | Steps | Pass | Fail | Blocked |
| -------------------------- | ----- | ---- | ---- | ------- |
| Scenario re-runs (4 sites) | 4     | 3    | 0    | 1       |
| New command validation     | 6     | 2    | 4    | 0       |
| Error recovery             | 1     | 0    | 1    | 0       |
| Export quality             | 1     | 0    | 1    | 0       |
| Skill & package audit      | 2     | 1    | 1    | 0       |
| **Total**                  | 14    | 6    | 7    | 1       |

Partial steps are counted under `Fail` in the table because this roll-up format has no separate `Partial` column.

## Blockers Found

- Failed `open` calls can report stale page metadata and snapshot paths from the previously active session, which is misleading for the exact agent workflow this tool is shipping to support.
- The packaged `.github/skills/cypress-cli/SKILL.md` is stale and inaccurate for the current CLI output and command surface, so agent discoverability currently teaches the wrong interface.
- REPL mode is still treated as part of the product surface in validation/readiness docs, but the public CLI does not expose `repl`; 1.0 needs either a real public `repl` command or consistent docs that remove it from the supported surface.

## Should-Fix Issues

- `state-save` / `state-load` ergonomics drifted: `state-load` now requires a filename, but `state-save` does not print the default file path in human-readable output.
- The storage and network portions of the runbook use targets that do not cleanly validate the intended behavior in Cypress (`https://example.com` reachability, JSON endpoint via `navigate`).
- `cyrun` executes successfully but does not surface yielded values back to the caller, which makes it much less useful than `eval` or `run-code` for exploratory agent workflows.
- Exported selector quality is still uneven on weakly instrumented pages; several flows replayed successfully, but long absolute selectors remain common outside data-attribute-rich sites.
- SPA settling is sometimes laggy in the snapshot/output path, producing transient stale or near-empty snapshots until an explicit follow-up command is run.
- CLI ergonomics around empty-string assertions are weak because `assert ... have.value ''` is parsed as if the expected value were missing.
- Baseline validation still emitted runtime warnings (`tsconfig-paths` warnings and a `MaxListenersExceededWarning`) despite the readiness doc claiming those warnings were resolved.

## Launch Plan Observations

The launch plan's baseline counts are accurate, and the explicit package checklist directly caught a real release issue (`THIRD_PARTY_LICENSES` missing from the tarball before the inline fix). That level of specificity is useful and should stay.

The plan currently understates the scope of the final confidence gate. In practice, the runbook is doing more than "test three sites": it is validating `export` together with `run`, error recovery semantics, agent-skill accuracy, and release packaging. Those should be reflected more explicitly in Phase 1 so the time estimate and exit criteria match reality.

The current 1–2 day estimate for Phase 1 looks optimistic if live-site validation remains part of the gate, because external outages and weakly chosen validation targets can consume time without telling you much about the product. The runbook should explicitly allow substitute sites and should prefer targets that exercise the feature under test without avoidable network ambiguity.

The plan should also elevate usability criteria, not just correctness criteria, for 1.0. Selector robustness, snapshot-settling behavior, and truthful error output all materially affect whether an LLM can stay oriented without human intervention.

## Verdict

**NOT READY for 1.0 release.**

The codebase is close: the baseline is green, real end-to-end flows on TodoMVC, SauceDemo, and Conduit exported and replayed successfully, and two important `run` defects were fixed inline. But the remaining blockers are on the exact public surface being launched to agents and users: misleading failed-`open` output, stale packaged skill documentation, and unresolved REPL surface ambiguity mean the product/docs contract is still inconsistent enough that shipping 1.0 now would create avoidable confusion.
