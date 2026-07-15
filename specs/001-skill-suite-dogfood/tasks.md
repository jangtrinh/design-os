# Tasks — 001 skill-suite dogfood

> Cross-machine state lives in the GitHub tracking issue (Constitution Art. VII).
> Check a box here AND tick the issue when done; the issue thread carries logs.

- [x] T1 — Fresh-project skills-only onboard run (scratch dir, subagent given ONLY
      the 3 skills; transcript + friction log) — stage:implement
      ✓ 2026-07-15 criterion 1 PASS (fresh-cafe E1 end-to-end, DESIGN_OK 3/3; findings F1-F3 → issue #1 thread)
- [x] T2 — VSF-PCP skills-only re-onboard + daily loop (2 scripted audit asks;
      friction log) — stage:implement · depends: T1
      ✓ 2026-07-15 criterion 2 PASS (verify path, git STOP-gate, stale-seal found; both audit surfaces correct; K1-K4 → issues #2-#5)
- [x] T3 — VSF deliver playbook run (static→rendered order; handoff summary;
      wording guard verified) — stage:implement · depends: T2
      ✓ 2026-07-15 criterion 3 PASS (playbook order held, ship-guard wording clean, verdict NOT-READY on real data; K5-K6 → issues #6-#7)
- [x] T4 — Findings synthesis + one template fix round (Sonnet) + re-gates —
      stage:audit · depends: T1-T3
      ✓ 2026-07-15 11 edits applied (10 template + 1 help-string), 5 verified factual corrections, 4 gates green (1682 tests)
- [ ] T5 — Opus audit of fix round + final gate verdict (PASS→ unlock P3 spec) —
      stage:final-gate · depends: T4
      → in progress 2026-07-15 (Opus audit running)
