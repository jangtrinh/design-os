# Tasks — 005 Figma mirror (1:1)

> Draft-for-review. Foundation (reverse-walker + fixed-point test) merged as the spike.
> Each phase = 1 PR, 3-tier pipeline, human merge. Parallel executors MUST use isolation:
> worktree. P5 is owner-in-the-loop (real Figma).

- [x] Spike — reverse-walker node→FigmaExportNode + fixed-point proof — ✓ merged `b9b7255`.
      Core reversible; 2 gaps documented (bindings, instances).
- [x] P1 — Token bindings survive — ✓ 2026-07-16 merged (PR #45, CI 5/5, figma-agent 223; mutation-verified). Edges: library-vars + per-edge-padding (→ P2/P4). scan-node.ts split folds into P2.
- [ ] P2 — Instances survive: extend FigmaExportNode (INSTANCE + overrides), createFigmaNode
      instance build-case, nodeToSpec captures; inner composition preserved — stage:spec
- [ ] P3 — Sidecar storage: design/components/<name>.figma.json + figma-node-reader +
      registry pointer (markup untouched) — stage:spec
- [ ] P4 — Scoped mirror in reconcile: log nodeId → scan-node → sidecar replace on --apply;
      panel reports what actually landed (closes 004 panel-honesty) — stage:spec · depends P1+P2+P3
- [ ] P5 — Live round-trip GATE: real Figma component, scan→rebuild→structural-diff == fixed
      point incl. bindings+instances (owner-in-the-loop) — stage:spec · depends P1-P4
