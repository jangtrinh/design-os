# RETRO — AURA scrub page: build · glass · perf · the frozen-poster bug (260723 pt.2)

Continues `RETRO-260723-product-slice.md`. Covers the page-build arc after the 2K film: Liquid Glass,
stars, route titles, 6-node re-cut, the performance pass, and the regression I shipped + the owner caught.

## Outcome (shipped)
- **Liquid Glass ★** page (design:os persona, 3 signature moves declared+verified on canvas).
- Iterative owner feedback, each verified by screenshot: stars background (hand-built from signature, CSP-blocked lib),
  route-node **titles**, **Star-this-repo** button, English UI, text-only wordmark, svgl logo (added → reverted).
- **6-beat re-cut** (was 3): finer nodes + shorter lingers → continuous scrub. Owner's diagnosis was right.
- **Performance pass, measured**: 30→**56 fps**, janky frames 49%→**5%**, worst 108ms→**42ms**. Ranked causes with a
  playwright probe: backdrop-filter #1 (10+ always-on blur panels re-blurring the moving film), stars #2, 1600px decode #3.
- **Progressive LQ→HQ** image-sequence built into the engine (opt-in `framesLQ`; 420px instant tier upgrades to 1440px).
- Deployed + two LinkedIn videos (prewarm-then-record so HQ is cached before the recorded pass).

## The miss — shipped a correctness regression behind a green PERF gate
The progressive-loading change scoped each beat's eager load to its own frame range (`lo+i` instead of `0+i`). But the
engine's `s.ready` flag — which gates whether a scene draws **at all** — was keyed on **frame 0 loading**. Range-beats
(X-ray→Finish, ranges 58+) never load frame 0 → never `ready` → their canvas never drew → they showed the **frozen
poster**. The **owner caught it** ("frame from X-ray→end is broken… hardcoded image"), not me.

Why it slipped: I built a **perf probe** (FPS) and a **visual shoot** — but the shoot waited 1400ms/position so frames
loaded, masking the bug; and the FPS probe measured the thing I was optimizing, never **whether every section rendered**.
I verified the improvement, not the invariant. Once the owner flagged it, a 12-line probe (`has-clip` + center-pixel
blank per scene) pinpointed it in one run — sections 1-5 `hasClip:false, blank:true`.

## Root cause
- **Optimized a shared invariant without knowing what depended on it.** `s.ready` meant "frame 0 is in" — an implicit
  contract the whole draw loop relied on. Range-scoping silently broke it. (ease-design rule: *a change at the shared
  layer — ask which consumer has this blind spot* — I changed the producer and never traced the consumer.)
- **The verification measured the improvement, not the preserved behavior.** A perf gate is not a correctness gate.

## What went well (keep doing)
- **The perf work was textbook**: measured before, isolated each cause (stars off, backdrop off), ranked by impact,
  fixed the biggest lever first, re-measured. The exact opposite of the earlier hybrid-pivot guess. Diagnosis-first paid.
- **Bug fix was diagnosis-first too**: reproduced + confirmed with a probe (`hasClip`/blank per scene) BEFORE touching
  code — did not guess. Fix keyed readiness off any in-range frame + belt-and-suspenders `has-clip` in `draw()`.
- **Owner's 6-node call was correct** — trusted it, verified, shipped. Small-feedback loop (screenshot-per-change) was fast.

## Durable lesson (one)
**When a change optimizes or refactors X, the verification must assert the UNCHANGED behavior Y — not just the improved
X.** A perf probe that reports 56fps says nothing about whether every frame still renders. Pair the improvement metric
with a contract check on what must stay true. → saved to memory.

## Kit reflection — what to update (proposal, owner-gated)
1. **Record gap → `es-review-gate`**: "a change whose stated goal is X must verify the invariant Y it could break, not
   only measure X." Evidence: this session (frozen-poster behind a green FPS gate). *(recorded)*
2. **scroll-cinema graduation: NOT yet.** Proven twice — but both within ease-design (world + product profiles, one
   product). The librarian's recurrence gate caps single-product topics at `surface`. Extract to an `es-*` skill /
   `knowledge/` only when a 3rd context needs it, or on a deliberate owner decree. Honest: don't graduate on internal
   repetition (this spec's own scar).
3. **knowledge/ candidate (when it recurs)**: "perf budget for scroll-cinema pages" — backdrop-filter is the #1 cost
   (never leave live blur on many always-on panels over a moving canvas); progressive LQ→HQ image-seq; readiness
   invariants in a shared scrub engine. Reusable, but keep it in the spec until a 2nd product pulls on it.
4. **Librarian run is due**: 4 open gaps (3× es-gflow, 1× emitter-needs-linter) ≥ the 3-gap threshold. Worth a
   `/es-librarian run` (fresh session) — several gflow gaps may graduate the download-decouple + project-label into es-gflow.
