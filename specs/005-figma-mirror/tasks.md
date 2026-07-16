# Tasks — 005 Figma mirror (1:1)

> Draft-for-review. Foundation (reverse-walker + fixed-point test) merged as the spike.
> Each phase = 1 PR, 3-tier pipeline, human merge. Parallel executors MUST use isolation:
> worktree. P5 is owner-in-the-loop (real Figma).

- [x] Spike — reverse-walker node→FigmaExportNode + fixed-point proof — ✓ merged `b9b7255`.
      Core reversible; 2 gaps documented (bindings, instances).
- [x] P1 — Token bindings survive — ✓ 2026-07-16 merged (PR #45, CI 5/5, figma-agent 223; mutation-verified). Edges: library-vars + per-edge-padding (→ P2/P4). scan-node.ts split folds into P2.
- [x] P2 — Instances survive — ✓ 2026-07-16 merged (PR #46, CI 5/5, figma-agent 232; mutation-verified). ref+properties+node-overrides fixed-point; 3 edges degrade w/ warning; scan-node split. Nested-variant/VariableAlias-prop/real-overrides → P4/P5.
- [x] P3 — Sidecar storage — ✓ 2026-07-16 merged (PR #47, CI 5/5, suite 1867). figma-node-reader + ComponentRecord.figmaNode pointer; kernel open-type (no cross-package import). registry-store 393>200 → separate refactor.
- [ ] P4 — Scoped mirror in reconcile — implemented, PR #48 (CI 5/5, kernel 1890 / figma-agent 250),
      stage:audit · UNMERGED, live-checklist in the PR body pending owner. Chain: broker sync-apply
      runs dry-run → `figma-agent scan-node <id>` per changed node → `ui figma reconcile --apply
      --mirror-file` (live scan OUTSIDE the kernel, Art I.2; the kernel reads a plain capture file).
      ADD with a capture now materializes a record (markup "" — ingest-figma-ds's own shape); no
      capture = spec 004 pending, unchanged. Plugin-down degrades explicitly (`mirrorSkipped`).
      Panel honesty closed via shared/figma-sync-summary.ts + SYNC_RESULT.landed.
      Edges deferred to P5: real overrides / nested variants; scan-node needs a repo checkout.
- [x] dist-bundle fix — ✓ 2026-07-16 merged (PR #50, CI 5/5, figma-agent 254). Walker pre-bundled
      into `cli/src/generated/scan-node-walker-bundle.ts` (esbuild IIFE, emitter+linter per Art II);
      `scan-node` self-contained → dist-only install mirrors. Self-containment proven LIVE (dist copied
      to temp, no repo → real `FigmaExportNode`). Bonus: `getNodeById`→`getNodeByIdAsync` (sync getter
      throws under `documentAccess: dynamic-page`) — scan-node had never resolved a real node before.
- [x] mirror-verify harness — ✓ 2026-07-16 merged (PR #51, CI 5/5, figma-agent 281). One-command
      P5 gate: `mirror-verify <nodeId>` (scan → IMPORT_PAYLOAD rebuild → scan → structural-diff),
      `structural-diff.ts` util (epsilon 1e-5, undefined≡absent) = the mirror linter (Art II);
      `--keep` retains the rebuild for eyeball. bridge `expectFixedPoint()` folds structuralDiff into
      every fixed-point case. Exposed the binding gap (below) — harness honestly reports tokenRef diffs.
- [x] P6 — rebuild-from-spec reattaches token bindings by name — ✓ 2026-07-16 merged (PR #52, CI 5/5,
      figma-agent 295). Closes the Art III gap the harness exposed: rebuild from a record alone dropped
      bindings (`tokenVars.size>0` gate at 3 sites — frame/shapes/text). `executor-token-var-resolve.ts`:
      `readLocalVariableMap()` (name→existing Variable, one async read = inverse of the scan join),
      `resolveTokenVars` layers payload tokens over it. Additive (payload-wins precedence intact);
      fallback binds only to existing vars (no dupes). Test-with-teeth: point rebuild back at old path →
      5/5 reattach tests FAIL. Follow-ups: executor-frame.ts 301 / executor-variables.ts 216 over Art IX;
      plugin code under no lint gate; dup-name-across-collections = first-wins.
- [x] instance-async-mainComponent — ✓ 2026-07-16 merged (PR #53, CI 5/5, figma-agent 300).
      P5 LIVE (node 25575:353653, "Platform - Design System") found it: sync `.mainComponent` THROWS
      under `documentAccess: "dynamic-page"` (safe() swallowed → null) → all 4 INSTANCEs lost
      componentKey/id/name → rebuild set_name crash. Fixes: (A) `readMainComponentMap` async pre-pass
      (getMainComponentAsync, mirrors readTokenNameMap); (B) THE real set_name cause = `scanNodeSpec`
      returned the whole `{result,console,ms}` EXEC_JS envelope as the spec → unwrapExecJsReply;
      (C) `specNodeName` fallback at all 6 name sites. Same async-getter class as #50's getNodeByIdAsync.
- [x] P5 — Live round-trip GATE — **PASS 2026-07-16** on owner's real component. `mirror-verify
      25575:353653` (+ 25575:353516) → **equal:true, 0 diff, 0 warning** (2nd run; the 1st after any
      code.js rebuild is STALE — plugin loads code lazily). 3 `normalized` entries = honest Figma-limit
      exclusions (maxWidth unbindable on TEXT; x/y root absolute position). Path 24→10→6→0, every diff a
      REAL bug caught only by live canvas (Art III), none conceded by fake-normalize. Closed across:
      P7/P8 keyed-binding reattach (local+library by publish key, all fields), P9 text (node.fontName
      lies figma.mixed → read segments; unbindable-field registry), P10 sizing (resize() clobbers both
      axes → reassert; per-side strokeWeights), P11 inner-override reapply by main-relative key, P12
      slot-SWAP replay (`swapComponent`, an override Figma never names) + FILL coerces child's own mode.
      figma-agent 350 tests. Verified vs a real baseline-main rebuild (no regression).
- [x] DS-WIDE GATE — **PASS 2026-07-16**. After the gate node passed, `mirror-verify` across the whole DS
      surfaced systematic loss the single node hid (owner's call to sweep the DS first was right). Closed:
      **P13** (`04216df`, #60) inner-instance `componentProperties` never replayed + its consequence (a
      variant IS a different component → rebuilt slot at default variant, tree map taken before the write;
      nested compound-id = ONE `I<outermost>;<a>;<b>`, each node's id in its OWN main); **P14** (`dc13d25`,
      #61) `fillsDiffer` compared live-Paint vs payload-Paint by JSON.stringify → ALWAYS differed →
      clobbered every instance's INHERITED fill binding (silent) → fixed via `asFills` lens; + FILL-child
      width/height "was-set" flag Figma won't register → `figmaScanFillSize` normalize (geometry still
      checked both sides; a real move → still red). **9/9 diverse components (incl. 3 unbriefed fresh) →
      equal:true, 0 diff, 0 warning.** figma-agent 367 tests. **SPEC 005 COMPLETE — mirror is a proven
      live fixed point DS-wide.** Honest debts: `applyNodeOverrides` writes `instance.effects` with no
      differ-check (SAME clobber class as fills, not yet hit in data); a FILL child whose ONLY inner
      override is width/height loses the entry (not in DS sample).
