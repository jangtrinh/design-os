# Report — Spec 012 Phase 1: `design-os evolution`

**Branch**: `feat/evolution-check` (off `main`, commit `0d14008`) · **Status**: DONE

## What shipped

- `design-os/src/design_os/evolution_core.py` (147 lines) — ledger/graph/soul signal
  readers + `compute_verdict`/`gather_signals` (no subprocess, no model, no wall-clock read).
- `design-os/src/design_os/evolution_signals.py` (106 lines) — heartbeat/registry/roles/
  taste-votes signal readers, split out to keep both modules under Art IX's ~200-line
  guideline.
- `design-os/src/design_os/commands/evolution.py` (91 lines) — Typer command
  `design-os evolution [--dir] [--json]`, envelope + text rendering.
- Registered in `cli.py`; golden `tests/goldens/root-help.txt` regenerated.
- `design-os/tests/test_evolution_core.py` (9 tests) + `test_command_evolution.py` (4
  tests, 2 of them LIVE against real project dirs, `skipif` when the checkout is absent).

## Gates

| Gate | Result |
|---|---|
| `uv run pytest -q` (design-os/) | **250 passed** |
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm run build` | pass |
| `npm test` | **140 files / 2136 passed, 4 skipped** (pre-existing skips, untouched) |

## The two LIVE verdicts (Art III, read-only)

### dana-desktop → **DEAD-LOOP** ✅ (matches the measured baseline)

```
evolution: DEAD-LOOP
  ledger diversity: 1 distinct type(s) over 276 event(s) — token_change=276
  learning events: no insights, no gaps
  graph insights: no memory.graph.json
  soul: no soul.md
  heartbeat: not wired (no design/heartbeat.json with tasks)
  taste votes: no votes.jsonl found
  DS role coverage: 0/286 tokens carry a design-os.role
  registry: 0 component(s) in component-registry.json, 0 component_registered event(s) in ledger
```

### VSF-PCP → **ALIVE** ✅ (matches the measured baseline)

```
evolution: ALIVE
  ledger diversity: 4 distinct type(s) over 168 event(s) — component_registered=155, harvested=8, insight=4, lint_run=1
  learning events: 4 insight(s), no gaps
  graph insights: 4 total, 0 recurrent (seen>1)
  soul: status=ratified, ratified=True, evidence citations=10
  heartbeat: wired (5 task(s)), fired, last run at 2026-07-15T14:25:37.555177+07:00
  taste votes: no votes.jsonl found
  DS role coverage: 0/123 tokens carry a design-os.role
  registry: 0 component(s) in component-registry.json, 155 component_registered event(s) in ledger
```

## Findings (Art VIII — reported, not smoothed over)

1. **`heartbeat-state.json` has no `lastRunAt` field.** `heartbeat_core.record_run`
   (design-os/src/design_os/heartbeat_core.py:167-194) writes `nextRunAt`/`lastStatus`/
   `lastSummary`/`history` per task — `history` is unshifted newest-first
   (`history.insert(0, {...})`). "Firing" reads as `history` non-empty; the recency value
   ("last_run_at") is `history[0]["at"]`, the most recent run's own timestamp across all
   tasks — never `datetime.now()`. This satisfies the plan's "do NOT compute recent against
   a wall clock" instruction by construction, but the field name in plan.md (`lastRunAt`)
   doesn't literally exist on disk — noted here rather than silently patched.
2. **VSF's `component-registry.json` is `{"components": []}`** despite 155
   `component_registered` ledger events and the soul.md's own claim of a "129-component
   registry." The live registry file and the ledger's event count diverge — the 129 number
   traces to an old snapshot under `plans/.../component-registry-129.json`, not the file
   `design/component-registry.json` the command reads. Reported as two independent numbers
   (`component_count: 0`, `component_registered_events: 155`), per the plan's Art VIII
   instruction not to paper over a divergence — this itself is a signal the registry can
   drift from the ledger.
3. **DS role coverage is 0/N on both projects.** Spec 011's role-baking (`ds import`) hasn't
   been re-run on either project since P1/P2 shipped — expected, not a bug in this check.
   It's an informational signal only; it does not feed the ALIVE/DEAD-LOOP verdict.
4. **`votes.jsonl`** wasn't found on either project at either candidate location
   (`design/votes.jsonl` or `<project>/taste/votes.jsonl` — taste-store.ts's default taste
   root). Matches the living-loop memory finding ("0 votes everywhere").

## Design notes

- Signal readers mirror the TS kernel's own shapes exactly (verified by reading
  `memory-events.ts`, `memory-graph.ts`, `ds-soul.ts`, `design-system.ts`,
  `taste-store.ts`, `ds-context-roles.ts` directly) rather than guessing field names.
- Chose **direct file reads** over shelling out to `ui`, matching the existing
  `reflect_core.py` pattern (spec 006 P5) already in this codebase — no subprocess needed
  for Phase 1's read-only signals.
- The ALIVE rule is exactly plan §6.3: `insight_events > 0 OR gap_events > 0 OR
  soul.ratified OR heartbeat.fired`. Graph-recurrence (`seen > 1`), taste votes, role
  coverage, and registry counts are reported but don't gate the verdict — informational
  per Art VIII, not part of the rollup.
- Command always exits 0 (a health report, not a gate) — matches `doctor`'s
  envelope-`ok`-stays-true-health-lives-elsewhere convention, except here there is no
  failing exit code at all, per plan §"Exit 0 always."

## Unresolved questions

- None. Both live verdicts matched the plan's grounding exactly; no ambiguity triggered
  Art V.
