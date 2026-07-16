# Spec 004 — Figma live-sync: the registry auto-follows Figma on idle

**Status**: draft-for-review · **Stage**: spec · **Tracking**: GitHub issues per phase
**Constitution**: Art I (capture lives outside the kernel; the delta→registry transform is
deterministic), Art II (emitter+linter), Art III (real data), Art V (three-tier pipeline)

## What

When the user edits anything in Figma, then stops for **5 minutes** (idle window,
configurable), the accumulated changes auto-save into design:os's component-registry —
one-way (Figma→registry), same rule for local and global components, deterministic reconcile.
The append-only change-log is the audit trail and the undo source: the registry is a
replayable view over the log (the design:os ledger philosophy). Detail + hook points:
`plan.md`. Feasibility research (API + code hooks, file:line): lab
`harvest/figma-sync-research.md`.

## Why

Today the flow is pull-once: `figma scan → ingest-figma-ds → registry` re-snapshots the whole
DS. Owner wants it automatic: edit, walk away, and the registry has already caught up — no
publish step, no manual sync, no accept dialog. The 5-min-idle model is the simplest thing
that works: it needs no library-publish signal (which Figma only exposes via a paid REST
webhook) and no "which component did you leave" heuristic — every edit flows the same way.

## Locked model (owner, 2026-07-16)

- **Direction: one-way Figma→registry.** Figma is the design source of truth.
- **Commit-point: 5-minute idle debounce, uniform for local AND global.** Each Figma change
  resets a timer; 5 minutes with no change → auto-commit. Default 5 min, **configurable** in
  `design/` (one line). No publish-gate, no per-component boundary.
- **Confirm mechanism (locked): a 1-click prompt in the plugin's existing status panel.** At
  the idle point, the figma-agent panel — already open in Figma, already showing connection
  status — adds a line *"N changes ready — Sync now / Later"*. One click applies; in-context,
  never leaves Figma. Safe because the change-log is append-only: every apply is reversible by
  replaying the log to a prior cursor.
- **Scope tag stays:** records are still tagged `scope: local | global` (inferred from Figma
  publish-status / `remote`) — the tag matters for cross-project reuse, but both scopes use
  the same idle-commit timing.
- **Deletion = soft-deprecate** (not hard-delete), matching the existing audit `deprecated`.

## Feasibility (from research)

Strong, and the idle model removes the one real risk. Reused primitives: broker
`broadcastToClients` event channel + `EventMsg` (transport), `memory-store` append-only jsonl +
line-count cursor (the change-log is a drop-in mirror — and the undo source), `registerComponent`
name-keyed replace + `ds-diff` added/removed/changed (reconcile). `documentchange` gives op +
node id + changed props + `origin: LOCAL|REMOTE`, whole-document under `dynamic-page` +
`loadAllPagesAsync()`. The idle timer is a plain debounce (`setTimeout` reset on each change).

**Dropped by this model:** the `LIBRARY_PUBLISH` webhook (was the one risk — gone) and the
selectionchange "leave-component" heuristic (gone). Both replaced by the single idle timer.

**Remaining caveats (not blockers):**
- The idle timer needs the plugin open during the 5 min. If Figma/plugin closes first, that
  idle-commit doesn't fire — but the change-log persisted at the broker, so the next reconcile
  catches up. No data loss, just a delayed save.
- `documentchange` fires on every settle → coalesce hard to the component level before commit.
- `RemovedNode` loses props on DELETE → snapshot identity at capture.
- `loadAllPagesAsync()` at boot loads all pages into RAM.

## Owner decision needed (one)

- **D3 — Registry schema:** add `scope: local|global` and `deprecated?: boolean` to
  `ComponentRecord` (its allowed-keys are closed, `additionalProperties:false`). This is a
  DS-manifest schema change — normal reviewed PR. Confirm the two fields + defaults
  (proposed: `scope` defaults `local`, `deprecated` defaults absent/false).

*(D1 local-boundary and D2 publish-workaround from the earlier draft are RESOLVED — the idle
model eliminates both.)*

## Non-goals

- Two-way sync (registry→Figma) — deferred; needs real conflict resolution.
- Manual accept / preview-gate — owner chose auto-save; the log is the undo path.
- LLM in the reconcile path — the transform stays deterministic (kernel rule).
- Library-publish webhook / server — not needed for the idle model (may revisit for
  multi-machine global sync later, opt-in).

## Acceptance criteria (per phase)

1. Capture: `documentchange` → `design/figma.changes.jsonl` append-only, identity snapshotted;
   dogfood on a real Figma file measuring event coverage + volume (Art III).
2. Reconcile `--dry-run`: deterministic preview-delta from the log, zero network/LLM.
3. Idle-auto-commit: 5-min idle (configurable) → reconcile applies; cursor advances; an
   `undo`/replay path to a prior cursor exists.
4. Deletion soft-deprecates; audit still reads `deprecated`.
5. Every phase = 1 PR, human merge; 4 gates + `ui knowledge check` + `uv run pytest -q` green.

## References

- Feasibility research: lab `harvest/figma-sync-research.md`.
- Hook points + phasing: `plan.md`.
