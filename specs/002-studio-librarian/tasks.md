# Tasks — 002 studio librarian

> Cross-machine state: GitHub tracking issues per phase (Art VII). Check a box here AND
> tick the issue when done; issue thread carries phase reports. Executor DỪNG sau mỗi
> phase, báo cáo theo format trong issue, chờ final-gate review trước phase kế.

- [x] P1 — WS-A: gap event type trong ledger — ✓ 2026-07-15 merged `5f6afef` (PR #14, CI 5/5, suite 1687; issue #10 closed)
- [x] P2 — WS-C `ui knowledge check` + WS-E authoring-standard — ✓ 2026-07-15 merged (PR #15, CI 5/5, suite 1713; 2 real errors dogfooded+fixed; issue #11 closed)
- [x] P3 — WS-B librarian agent — ✓ 2026-07-15 merged (PR #16, CI 5/5, suite 1717; B4 row deferred to P4 by the P2 linter's own rule; issue #12 closed)
- [ ] P4 — WS-D: `design-os librarian collect` + `knowledge/librarian-loop.md` (kèm bước
      1b PR-merge confirm) + red-team pytest + dogfood end-to-end — stage:final-gate ·
      depends: P3 merged
- [ ] Seed: sau P1 — đổ FINDINGS.md của design-starter-lab thành gap events (brand/ =
      studio home) làm dữ liệu mồi cho P4 dogfood
