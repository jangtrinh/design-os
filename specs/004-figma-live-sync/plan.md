# Plan 004 — Figma live-sync (idle model): hook points + phasing (binding for executor)

> Executor: Sonnet implements → Opus audits → final gate reviews/commits (Art V). Capture
> (plugin/broker) lives OUTSIDE the kernel; the delta→registry transform is deterministic
> (no live Figma call, no LLM) — Art I. Every phase = 1 PR, stop-and-report. Hook points from
> the feasibility research (lab `harvest/figma-sync-research.md`), cited to real file:line;
> re-verify each before editing (line numbers drift).
> **Parallel executors MUST use `isolation: worktree`** — never share one tree (spec 003
> P3/P5 race lesson).

## Locked model
One-way Figma→registry · 5-min idle debounce (configurable in `design/`), uniform for local
and global · at idle the plugin's existing status panel prompts a 1-click "N changes — Sync
now / Later" · records tagged `scope: local|global` · deletion soft-deprecates · the
append-only change-log is the undo/replay source.

## Architecture (3 tiers)

**Tier 1 — Capture (plugin, `figma-agent/plugin`, source `main/main.ts` → build `code.js`):**
- Register `figma.on("documentchange", batch→postMessage)` beside the existing
  `figma.on("currentpagechange", announceFileInfo)`.
- Call `figma.loadAllPagesAsync()` at boot (currently lazy) — required by the `dynamic-page`
  manifest for whole-document events.
- On DELETE, snapshot node identity (id/name/type) at capture — `RemovedNode` loses props.
- **Idle timer:** a `setTimeout(IDLE_MS)` reset on every `documentchange`; on fire, post
  `IDLE_READY {count}`. The panel renders the "Sync now / Later" line; "Sync" posts
  `SYNC_REQUEST`. `IDLE_MS` default 300000, read from a config value the CLI passes in.
- Reuse the panel that already shows connection status (Swiss Monolith panel) — add one line,
  no new UI surface.

**Tier 2 — Transport + Log (broker, `figma-agent/cli/src/transport/broker-daemon.ts`):**
- Add `DOC_CHANGE | IDLE_READY | SYNC_REQUEST` to `EventMsg` (`figma-agent/shared/protocol.ts`).
- The broker (long-lived; CLI clients are ephemeral) **appends each DOC_CHANGE frame to
  `design/figma.changes.jsonl`** — coalesced to the component level before append. Reuse the
  `src/core/memory-store.ts` append-only + line-count-cursor pattern.

**Tier 3 — Reconcile (deterministic CLI, `src/commands/` + `src/core/`):**
- `design-os figma reconcile --since <cursor> [--dry-run|--apply]`: walk `figma.changes.jsonl`
  from cursor → coalesce to component → map scope (publish-status / `remote`) → delta via
  `src/core/ds-diff.ts` (added/removed/changed by name) → `registerComponent(force)`
  (`src/core/registry-store.ts` ~:258). DELETE/removed → `deprecated:true`.
- `--dry-run` emits a preview-delta; `--apply` commits + advances the cursor (= line-count).
- Undo = `reconcile` replay to a prior cursor (the log is the source of truth). Zero network,
  zero LLM.

## Phasing (4 phases)

| Phase | Scope | Depends | Note |
|-------|-------|---------|------|
| **P1 Capture read-only** | documentchange listener → `figma.changes.jsonl` (coalesced, identity-snapshot on DELETE, boot loadAllPagesAsync, new EventMsg + broker append). No apply. | — | Dogfood: event coverage + volume on a real Figma file (Art III one-run budget). Proves the stream before anything consumes it. |
| **P2 reconcile --dry-run** | deterministic preview-delta from the log (coalesce → ds-diff → scope-map). No writes. | P1 | Validates reconcile-by-name + scope mapping on a real batch. |
| **P3 Registry schema** | add `scope: local\|global` (default `local`) + `deprecated?: boolean` to `ComponentRecord` (closed allowed-keys + `additionalProperties:false` → schema change, normal reviewed PR). Migrate existing registries. | — (parallel to P1/P2) | D3. Small, gates P4. |
| **P4 Idle-commit + panel prompt + apply** | idle timer (config `IDLE_MS`, default 5 min) → panel "N changes — Sync/Later" 1-click → `reconcile --apply` (uniform local+global); DELETE→soft-deprecate + audit reads `deprecated`; cursor advance + replay-undo. | P2+P3 | The whole loop closes here. |

*(Old draft's P5 GLOBAL-webhook and P6 deletion are gone: the idle model needs no publish
signal, and deletion folds into P4.)*

## Ràng buộc chung
`ui`/`design-os` deterministic: reconcile is pure transform over the captured log. Module
<200 lines, kebab-case. 4 gates + `ui knowledge check` + `uv run pytest -q`. Git explicit-path
+ hunk-sweep + AI-ref-clean commits (harness appends `Co-authored-by`; strip via
`gh pr merge --body ""` / `git commit --amend`).

## Risks & mitigations
| Risk | Mitigation |
|------|-----------|
| Plugin closed before 5-min idle → commit skipped | change-log persisted at broker; next reconcile catches up. No loss, delayed save. Document. |
| documentchange volume/noise | coalesce to component level in the broker before append. |
| RemovedNode loses props | snapshot identity at capture (Tier 1). |
| loadAllPagesAsync RAM cost | accept; measure in P1 dogfood; document. |
| ComponentRecord schema closed | P3 adds fields via reviewed PR; default scope=local. |
| registerComponent is whole-record replace | reconcile rebuilds the full record from change + prior; note if partial-merge ever needed. |
