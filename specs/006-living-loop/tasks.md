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

## Phase files (binding for the executor — signatures grounded in the live source 2026-07-17)

| Phase | File | Headline decision |
|-------|------|-------------------|
| P1 | `phase-01-auto-record-core.md` | 4 new event types (`lint_run`, `autofix_applied`, `reconcile_applied`, `taste_vote`); `token_change` REUSED; `recordOutcome(parsed, input, nowIso?)` + `withOutcome` sugar; records only when `design/` exists |
| P2 | `phase-02-enforce-emitter-linter.md` | `src/core/outcome-registry.ts` + `tests/autorecord-wiring.test.ts` (a vitest meta-linter — NOT a `ui` subcommand) |
| P3 | `phase-03-recurrence-and-retrieval-decay.md` | Insight clusters (`seen/upvotes/downvotes/lastSeenAt`); a NEW `retrievals` table (no retrieval stamp existed); `rank.ts` untouched |
| P4 | `phase-04-harvest-command.md` | Deterministic core + one pluggable model adapter (`DESIGN_OS_MODEL_CMD`); verbatim-evidence gate; `harvested`→`insight`/`gap` provenance chain |
| P5 | `phase-05-heartbeat-rhythm-and-real-data-gate.md` | `harvest`+`reflect` runners (summary carries only up=bad numbers); the VSF-PCP + platform-design-system gate |

## Open questions — RESOLVED (see the phase file for the reasoning)

- ~~P1 trigger granularity~~ → **outcome-bearing only, and state-change only where a command
  can no-op**: `autofix` records iff `--write` AND ≥1 fix; `ds change-token` iff the value
  changed; `figma reconcile` iff `--apply` AND the registry/sidecars changed. Lints record
  every successful run — **a clean pass is an outcome** (P1 Decision 1).
- ~~P4 harvest cadence: per-phase vs per-session~~ → **the question dissolves**: the cursor is
  a per-report **content hash**, so harvest can run every heartbeat and does nothing until a
  report lands or changes (`skipped/no-new-reports`). Default interval 12h; cost bounded by
  `MAX_REPORTS_PER_RUN=5` (P4 Decisions 6–7).
- ~~`--since <phase>`~~ → **dropped**: "phase" is not a concept the file tree exposes, and
  reports get edited after they are written. `--force` + the sha cursor cover the real need
  (P4 Decision 6).
- ~~Graduation-merge autonomy~~ → **unchanged owner-merge**. Harvest records `gap` events →
  `librarian collect` reads them → the loop opens a PR → the owner merges
  (`librarian-loop.md` step 7 is the invariant). 007 may gate it later (P5 Decision 6).
- ~~`taste record --mode study`~~ → **deferred, not forced**: a study verdict fits no existing
  type and `study.jsonl` already keeps it durably. Not in the P2 registry (P1 Decision 6).
- Spec 007 (competence ladder) reads THIS ledger — do not build ladder state here.

## Deviations from `plan.md` found by grounding (the gate must ratify these)

1. **`token_changed` would have duplicated the live `token_change` type** (P1).
2. **`taste vote` has no existing shape**; `user_pick` would have corrupted the graph's
   `designs` map, so `taste_vote` is a new type (P1).
3. **`audit_run` folded into `lint_run`** — same shape, `data.check` discriminates (P1).
4. **`rank.ts` does not compute decay** — the change lands in `decay.ts`/`store.ts`/
   `cmd-query.ts` (P3).
5. **No retrieval timestamp exists** ("retrieval events already exist to timestamp against"
   is false) — a `retrievals` table is added (P3).
6. **`librarian record`/`librarian run` do not exist** — only `collect`, and it reads the
   ledger. "Queue gaps for the librarian" = record `gap` events; no librarian file changes (P4).
7. **No host-model invocation exists anywhere in the repo** — P4 designs the first one, behind
   an env var, degrading to `skipped` (P4 Decision 2). This needs the gate's explicit blessing.
8. **`heartbeat_runners.py` is already at 199/200 lines** — the new runners live in
   `heartbeat_runners_learning.py` (P5).
9. **P1 makes the four existing heartbeat runners auto-record call sites** — they must be
   audited for the cwd trap before P5's evidence is collected (P5).
