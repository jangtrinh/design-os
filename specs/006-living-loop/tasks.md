# Tasks — 006 Living loop (fuel line)

> Draft-for-review. Each phase = 1 PR, 3-tier pipeline (Sonnet→Opus→gate), human merge.
> Parallel executors MUST use isolation: worktree. P5 is owner-in-the-loop (real projects).
> Kernel pieces (P1-P3) deterministic; harvest (P4) is the only model-driven piece, host-layer.

- [ ] P1 — **Auto-record core.** `src/core/memory-autorecord.ts` `recordOutcome(kind,data,dir)`
      via the existing `memory-events`/`memory-store` API (no new write path, no model). New
      `EventType`s (lint_run · audit_run · autofix_run · token_changed · reconcile_applied).
      Wire the 9 outcome-bearing commands (a11y/content/taste-lint · validate-layout · audit ·
      autofix · taste-record · ds-change-token · figma-reconcile-run). One helper, all sites
      (Art IV). Tests: payload byte-stable given the same result; each command appends on run.
- [ ] P2 — **Enforce (emitter+linter).** A single registry of outcome-bearing commands; a
      check (`ui lint autorecord` or fold into `ui knowledge check`) that FAILS if any listed
      command doesn't call `recordOutcome`. Art II — convention ships with its check.
- [ ] P3 — **Recurrence + retrieval-decay.** `memory-graph.ts` insights gain
      seen/upvotes/downvotes/lastSeenAt (ExpeL recurrence). `recall/rank.ts` decay switches to
      time-since-last-retrieval (Oblivion) — verify/add a retrieval timestamp first. Tests:
      recurrence strengthens; never-retrieved fades; DS/recall suites unregressed.
- [ ] P4 — **Harvest command (host).** `design-os harvest [--dir] [--since]` (Python): read
      new `plans/*.md` + reports with outcomes → FRESH host-model extraction → structured
      candidates (insight/gap/taste + provenance) → selection gate → write via kernel event API
      + queue gaps for librarian. Extraction prompt versioned; model never writes knowledge/.
      Cursor so it only reads reports new since last harvest. Tests: on a fixture campaign
      report, surfaces the seeded finding, drops the noise.
- [ ] P5 — **Heartbeat rhythm + real-data GATE.** `harvest` + `recall reflect` heartbeat
      runners on a due schedule (`heartbeat_runners.py`) — no human trigger. Art III proof:
      run the fed loop on VSF-PCP + platform-design-system → ledger goes ingest-only → alive
      (diverse events, populated graph, first real graduations). Owner-in-the-loop for the
      final graduation-PR merge (Art VI). — stage:spec · depends P1-P4.

## Open questions (resolve during the phases / with owner)
- P1 trigger granularity confirmed = outcome-bearing only (locked). If a listed command proves
  too chatty on real data, demote it (record on state-CHANGE only, e.g. autofix that changed
  nothing records nothing).
- P4 harvest cadence: per-phase vs per-session — start per-phase (plans/ are phase-structured);
  measure extraction cost on P5.
- Graduation-merge autonomy: harvest auto-runs to an OPEN librarian PR; whether the owner
  auto-merges or reviews stays the current owner-merge practice until 007 competence gates it.
- Spec 007 (competence ladder) reads THIS ledger — do not build ladder state here.
