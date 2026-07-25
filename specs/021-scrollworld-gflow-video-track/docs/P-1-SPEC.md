# P-1 SPEC — one-product orbit slice (scroll-cinema, 2nd consumer)

Opus spec of Fable's `PHASE3-DIRECTION.md` next build unit. Tiering: Opus specs (this),
Sonnet builds the code, Opus+Codex review, Fable audits before the credit-spending run.

## Goal
Prove `scroll-cinema` is a family (not a one-off) by making the engine serve a SECOND
renderer — an **image-sequence-on-`<canvas>`** product turntable — behind a clean interface,
WITHOUT regressing the proven world page. Measure the product camera open question with numbers.

## Split by what needs a human GATE / credits (owner asleep → autonomous does only the safe half)

### AUTONOMOUS-SAFE (build tonight — no credits, no GATE) — Sonnet
Work on COPIES in `specs/021-.../` (do NOT touch the upstream `~/.claude/skills/scroll-world` engine; it graduates later via librarian). Base = `web-v2/scrub-engine.js`.

1. **Extract a renderer interface** from the engine: `{ load(), draw(progress), poster() }`.
   Keep the existing `<video>` blob-seek path as `video-scrub-renderer` (BEHAVIOR UNCHANGED).
   Add `image-sequence-renderer`: preload N WebP frames (staged: first ~10 eager, then ±5
   around the cursor), `ctx.drawImage(frames[Math.round(progress*(N-1))], …)` on a `<canvas>`,
   object-fit cover. Selection of renderer per-section via a `renderer:'video'|'imageseq'` key
   (default 'video' — world sections keep working untouched).
2. **Three lints (`qa_lint`, emitter-AND-linter doctrine — SAME commit as the renderer):**
   a. **loop-closure diff** — for an A→A orbit, frame[0] vs frame[N-1] mean-abs-diff < 8/255 (else the loop pops).
   b. **effective-fps ≥ 24** — extracted_frame_count / clip_seconds ≥ 24 (else scrub looks steppy).
   c. **weight budget** — total sequence bytes ≤ a ceiling (default 6 MB desktop); warn over.
   Ship as a small node/py script `scroll-cinema-lint.(mjs|py)` + a test.
3. **Prove the image-seq renderer on PLACEHOLDER frames** — extract a frame sequence from an
   existing world leg clip (`clips-A/leg0.mp4` → 48 WebP frames) as a stand-in "sequence",
   mount it in a throwaway `web-product-test/` page, headless-scrub it, screenshot 4 positions,
   confirm the canvas advances frames with scroll. (Content is irrelevant — this validates the
   RENDERER, not a real product.)
4. **Regression gate:** the existing `web-v2/` world page must still render + scrub identically
   after the interface extraction (re-run the seam QA / a top+finale screenshot diff).

### GATED (defer to after owner wakes + approves) — do NOT run tonight
- Pick a real product; generate its master still (Codex, zero-credit) — I (Opus) will STAGE one
  candidate still for the owner to react to, but the storyboard GATE is the owner's.
- 360 orbit A→A via `flythrough_hand` (keyframe-anchored, `--initial-frame`==`--end-frame` for a
  closed loop) at draft tier — **measures the open question: does one i2v clip hold a full 360, or
  need 4× 90° arcs?** (spend a few credits, report numbers). Then ffmpeg→WebP real product frames.

## Out of scope (Fable): explode, mobile chain, Route-2 per-angle stills, GLB, character, loop/alpha, code registry. Profile table stays markdown until a 3rd consumer.

## Done (autonomous half)
Renderer interface extracted; world page regression-clean; image-seq renderer proven on placeholder
frames headless; 3 lints + test green; a staged product master-still candidate awaiting GATE.
Codex reviews the code; Fable audits before any credit spend.

---

## RESULTS (260723) — product-orbit slice PROVEN + findings

**Image-sequence canvas renderer + product profile PROVEN end-to-end.** `product-slice/site/` scrubs a
headphone rotation on scroll (72 webp frames, 0.9MB, 0 console errors, design:os product UI). The
scroll-cinema family now has 2 renderers (video-scrub / image-seq) × 2 profiles (world / product).

**Open-question answer — does ONE clip hold a 360?** NO (for veo-fast i2v, 8s, first=last=master):
the product TUMBLES through views rather than a rigid single-axis turntable, and does NOT cleanly
return to the start angle. Production turntable needs **4× 90° arcs** (Fable tier-3), gated on credits.
For a scroll-SCRUB (linear 0→N, not an autoplay loop) the tumble reads fine — loop-closure isn't
required. So: scrub-product = 1 clip OK; loop-product (autoplay turntable) = needs the 4-arc chain.

**qa_lint needs a loop-mode vs scrub-mode split (emitter-AND-linter surfaced its own gap on consumer #2):**
- `effective-fps` (frameCount/clipSeconds ≥ 24) is a LOOP-playback metric — FALSE-NEGATIVE for scrub
  (72 frames scrubs smoothly but "fails" at 8.9fps). Scrub density ≠ playback fps.
- `loop-closure` (first vs last mean-abs-diff) FALSE-POSITIVES on a small subject over a large flat bg
  (bg dominates the diff → 2.97 "pass" even though orientation differs). Needs subject-weighted diff.
- `weight-budget` is sound.
→ Next lint iteration: a `--mode loop|scrub` flag; scrub skips fps + uses a min-frame-count; loop keeps
  fps + a subject-masked loop-closure. (Do when graduating scroll-cinema.)

**Minor:** the product page's copy `01 / 02` num runs into the eyebrow (same num-block nit as the world
page's first pass) — cosmetic, fix on graduate.
