# Tasks — 004 Figma live-sync (idle model)

> Draft-for-review. Owner reads spec.md (decision D3 only). P1/P2/P3 need no decision — safe to
> build first. Each phase = 1 PR, 3-tier pipeline, human merge. Parallel executors MUST use
> isolation: worktree (spec 003 P3/P5 race lesson).

- [ ] P1 — Capture read-only: documentchange listener → design/figma.changes.jsonl (coalesced,
      identity snapshot on DELETE, boot loadAllPagesAsync, EventMsg types + broker append). No
      apply. Dogfood: event coverage + volume on a real Figma file — stage:spec
- [ ] P2 — reconcile --dry-run: deterministic preview-delta from the log (coalesce → ds-diff →
      scope-map) — stage:spec · depends P1
- [ ] P3 — Registry schema: add scope (default local) + deprecated to ComponentRecord (D3),
      migrate existing registries — stage:spec · parallel to P1/P2
- [ ] P4 — Idle-commit + panel prompt + apply: idle timer (config, default 5 min) → panel
      "N changes — Sync/Later" 1-click → reconcile --apply (local+global); deletion
      soft-deprecate + audit; cursor advance + replay-undo — stage:spec · depends P2+P3
- [ ] Decision D3 (schema fields scope + deprecated) — owner
      (D1 local-boundary + D2 publish-workaround RESOLVED — the idle model eliminates both)
