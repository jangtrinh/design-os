# Plan 006 — Living loop: hook points + phasing (binding for executor)

> Executor: Sonnet implements → Opus audits → final gate reviews/commits (Art V). The kernel
> stays deterministic (auto-record, counters, decay = pure transforms, no model, no network);
> the harvest extraction is the ONLY model-driven piece and lives at the host layer
> (`design-os` Python side, invoking the host model). Every phase = 1 PR, stop-and-report.
> Re-verify each hook before editing. **Parallel executors MUST use `isolation: worktree`.**

## Hook points (verified 2026-07-17)

- **Event API (kernel):** `src/core/memory-events.ts` — `buildEvent(input)`, `serializeEvent`,
  `nextEventId(lineCount)`, `validateEvent`, `EventType` union. `src/core/memory-store.ts` —
  `memoryPaths(dirFlag)` resolves the ledger path; append site for `ui memory record` is
  `src/commands/memory-record-impl.ts`. **Auto-record reuses this API** — do NOT invent a
  second write path.
- **Outcome-bearing kernel subcommands (the trigger set):** `src/commands/a11y-lint.ts`,
  `content-lint.ts`, `taste-lint.ts`, `validate-layout.ts`, `audit.ts`, `autofix.ts`,
  `taste-record-impl.ts` (a vote), `ds-change-token-impl.ts` (token change),
  `figma-reconcile-run.ts` (reconcile apply). These are the ONLY commands wired in P1.
- **Graph (recurrence):** `src/core/memory-graph.ts` compiles the ledger → `memory.graph.json`
  (`insights`, `tokens`, `personas`…). Recurrence counters live here.
- **Recall decay:** `recall/cli/src/rank.ts` (half-life decay input) — the last-retrieval
  refinement is here; retrieval events already exist to timestamp against.
- **Heartbeat (rhythm):** `design-os/src/design_os/heartbeat_core.py` +
  `commands/heartbeat.py` + `heartbeat_runners.py` (+ `heartbeat_render.py`). Harvest becomes a
  new heartbeat task/runner.
- **Librarian (gate):** `design-os/src/design_os/commands/librarian/*` +
  `knowledge/librarian-loop.md` (the veto-chained procedure). Harvest FEEDS the librarian's
  input (gap/insight candidates); it does not change the gate.

## Phasing

| Phase | Scope | Depends | Note |
|-------|-------|---------|------|
| **P1 Auto-record core** | A shared `recordOutcome(kind, data, dir)` helper (new `src/core/memory-autorecord.ts`) that builds+appends a `MemoryEvent` via the existing API — deterministic, no model. Add the needed `EventType`s (`lint_run`, `audit_run`, `autofix_run`, `token_changed`, `reconcile_applied`; `taste vote` already has a shape). Wire the 9 outcome-bearing commands to call it on completion. **Art IV:** one helper, all call sites. | — | Highest leverage. Pure kernel. |
| **P2 Enforce (emitter+linter)** | The auto-record convention IS a standard → ship its linter (Art II): a check (extend `ui knowledge check` or a new `ui lint autorecord`) that FAILS if an outcome-bearing command file does not call `recordOutcome`. A registry of outcome-bearing commands is the single source both the wiring and the linter read. | P1 | No silent drift as new commands land. |
| **P3 Recurrence + retrieval-decay** | `memory-graph.ts`: insights gain `{seen, upvotes, downvotes, lastSeenAt}`; recurrence across compiles strengthens, absence decays (ExpeL). `recall/rank.ts`: decay input switches to time-since-last-*retrieval* (Oblivion); needs a retrieval-timestamp the recall store already tracks (verify) or a minimal add. | P1 | Small, kernel, testable offline. |
| **P4 Harvest command (host)** | `design-os harvest [--dir <project>] [--since <phase>]` (Python): reads `plans/*.md` (+ `plans/**/reports/*.md`) with outcomes known → invokes the **host model with a FRESH context** to extract structured candidates (insight / gap / taste-observation), each with a provenance ref to the source report → **selection gate** (Selective-Hindsight: drop the un-actionable) → writes candidates via the kernel event API (`ui memory record gap/insight`) + queues gaps for the librarian. Extraction prompt is versioned; the model NEVER writes `knowledge/` directly. | P1, P3 | The only model-driven piece. Fresh instance = no self-serving. |
| **P5 Heartbeat rhythm + real-data GATE** | Add a `harvest` (and `recall reflect`) heartbeat runner (`heartbeat_runners.py`) on a due schedule — no human trigger. **Art III:** run the whole fed loop on VSF-PCP + platform-design-system; prove the ledger goes ingest-only → alive (diverse events, populated graph, first librarian graduations from real findings). Owner-in-the-loop only for the final graduation-PR merge (git discipline, Art VI). | P1-P4 | The definitive proof; not a fixture. |

## Ràng buộc chung

Kernel pieces (P1-P3) are pure transforms — no network, no model, byte-stable given the same
ledger (the store stamps id/timestamp as it already does for `ui memory record`). The harvest
extraction (P4) is model-driven and lives ONLY at the host layer; the kernel event API it calls
is deterministic. Module <200 lines. 4 gates + `ui knowledge check` + `uv run pytest -q`.
Git: explicit-path + hunk-sweep + AI-ref-clean (`gh pr merge --body ""` / `git commit --amend`).

## Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Auto-record floods the ledger (the 13%-accuracy bloat) | Outcome-bearing commands ONLY (locked decision); P3 recurrence + decay prune; harvest gates before anything graduates |
| Harvest extracts hallucinated / self-serving lessons | Fresh model instance; outcome-aware (ending known); selection gate; and NOTHING enters `knowledge/` except through the existing librarian veto-chain + fresh-judge |
| Auto-record breaks determinism (Art I) | The event API already stamps id/ts; the *payload* is a pure function of the command's result — assert byte-stable payload in tests |
| Two write paths drift | Art IV: one `recordOutcome` helper; P2 linter fails on any outcome-bearing command that bypasses it |
| Recall retrieval-timestamp may not exist | P3 verifies; if absent, add a minimal last-retrieval stamp to the recall store before switching decay input |
| Harvest cost per phase | Runs on heartbeat rhythm (not per-command); reads only NEW reports since the last harvest cursor |
