# GOALS — scroll-world mastery → generalize into a design:os workflow family

**Owner:** Jang · **Set:** 260722 (overnight autonomous grant; escalate to Fable 5 for direction, Codex GPT-5.6-sol for review)

## The 3 phases (in order — do NOT skip ahead)

### Phase 1 — MASTER scroll-world (finish SoDeal pilot, PROVEN smooth)
The bar: a genuinely SMOOTH continuous fly-through (the user's standing complaint: ST2→ST3, ST3→ST4 "lạc quẻ"). Method = **FOLLOW the scroll-world repo, Architecture A** (continuous forward take): each leg `--initial-frame` = previous leg's ACTUAL last frame, NO `--end-frame`, motion-handoff-contract prompts, `connectors:[]`, crossfade ~0.08. Encode per Step 6 (unsharp+crf20+g8). Seam QA per Step 8 (screenshot before/after each seam → near-identical; scrub both directions; no velocity reversal).
- Root cause learned: keyframe-anchored (both endpoints) makes seam VELOCITY discontinuous even when frames match → the "lạc quẻ". Arch A (seed-chain) is what the pilot originally had and RETRO called "seams continuous". Fable's keyframe re-ratification traded smoothness for drift-control — reversed here by direct user order to follow the repo.
- Done = draft flight scrubs smooth end-to-end (headless QA + honest self-review), THEN veo-quality final pass via the download-decoupled hand.
- Distil the mastery: the ~6 rules that actually make it smooth (write to a MASTERY note).

### Phase 2 — RESEARCH adjacent scroll/motion topics (parallel, does not block P1)
Open the technique from the diorama-world into other use-cases the same engine can serve:
- **Product scroll** — Apple-style scroll-scrub of a product (rotate / explode / push-in), pre-rendered frame sequence scrubbing.
- **Character moving on clean/white background** — hero character / mascot turntable or walk loop on white/transparent bg, consistent identity.
- Others surfaced by research (scroll cinemagraph, before/after, map fly-over…).
Deliverable: cited reports in `research/` + how each maps onto our gflow/Veo + Codex-image + scrub-engine stack, and what a GENERALIZED workflow must parameterize.

### Phase 3 — BUILD the proper workflow (a design:os skill family, like scroll-world)
Generalize the proven mechanism into a reusable design:os workflow/skill: brief → stills/frames → GATE → forward-chain (or the right camera arch per topic) → collect → encode → scrub-engine wiring → QA. Backend-agnostic (gflow now, Veo-API seam). One skill with topic profiles (world / product / character), OR a small family. Gate the design on Fable; review with Codex.

## Standing method rules (hard-won this session)
- FOLLOW the documented method before inventing (the repo already solved most of it).
- Every load-bearing claim: verify against the real tool/binary, not a report.
- Human/GATE approves stills before spending video credit; drift iteration lives in the zero-credit still tier.
- A report is not evidence — re-run the gate yourself where it runs.
