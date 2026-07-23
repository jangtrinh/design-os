# PHASE 3 DIRECTION — Fable ruling on the scroll-cinematic family

Fable 5, 2026-07-22. Input: PHASE3-SYNTHESIS.md (Opus), MASTERY.md, research/product-scroll.md,
research/character-white-bg.md, scroll-world SKILL.md. This is the architecture ruling; Opus specs
from it, Sonnet builds, Opus+Codex review, Fable audits at the end.

## The name

**scroll-cinema** — the family of pages where *scroll scrubs a pre-rendered cinematic* behind a
quiet design:os copy shell. That sentence is also the membership test. Graduated skill name (later,
Q5): `es-scroll-cinema`, invoked with `profile: world | product`.

---

## Ruling 1 (Q1) — One skill, TWO profiles. Character is OUT of the family.

**One skill with profiles — but only {world, product}.** They pass the membership test identically:
scroll drives time over pre-rendered frames; everything that differs (camera contract, renderer,
bg) is a swappable axis, everything that is hard-won (generation hand, consistency lock, GATE,
shell) is shared — a profile, not a fork.

**Character is not a third profile; it is the DUAL problem and mostly not scroll-cinema at all.**
Its own research says so: subject moves / camera static, playback is *loop* (not scrub), and the
recommended production path for anything beyond one stylised loop is a 3D rig — a generation
universe that shares nothing with the gflow video pipeline (no seams, no matting, no encode).
Its renderer column in the synthesis table has THREE unresolved alternatives — that is the
signature of an unbuilt sibling, not a profile. Verdict: shelve character-white-bg.md as
research; when demand arrives, it enters as its own skill (or a rig-path track), and only its
scrub-turntable sub-case gets re-evaluated against this family. Do not carry character axes in
the profile table until then.

## Ruling 2 (Q2) — ONE engine; extract a renderer interface, add the canvas backend. Nothing else.

Extend `scrub-engine.js`. The engine's irreplaceable substance is the *shell*: scroll→progress
math, section/copy/nav/linger, seek smoothing, reduced-motion, iOS/mobile hardening, theme
tokens — all renderer-independent and all paid for in bugs. Duplicating that into a second engine
recreates the L1→L4 class of error (same blind spot, two consumers). The renderer is the thin
part: extract the current blob-video path into `video-scrub-renderer`, add
`image-sequence-renderer` (the GSAP/Codrops ~40-line drawImage pattern — **own the code, never
vendor the dead apple-scroller repos**). Interface stays minimal — roughly
`{ load(section, signals), draw(progress), poster() }` — two implementations, no plugin system.

**Explicitly refused now:** loop playback mode and the alpha branch. Both exist only to serve
character (Ruling 1). Adding them is speculative surface — es-lazy violation.

## Ruling 3 (Q3) — Product is second. Not close.

Product proves the *generalization* with the minimum untested delta: both generators already
exist (`flythrough_hand` keyframe-anchored IS the product camera contract — orbit A→A, explode
A→B, end-frame load-bearing per MASTERY §1), the consistency lock and GATE port wholesale, and
the only genuinely new build is the canvas backend + frame-extraction/WebP step. Character second
would test almost nothing shared while paying for everything new (identity drift, matting
flicker, dual-codec war, maybe a rig). Second instance = maximum reuse, one new axis. That is
how you prove a family exists.

## Ruling 4 (Q4) — Abstract at the END of the product build, extracted not designed.

Confirmed with one sharpening: the abstraction is *harvested from* the product slice, never
written before it. Order inside the slice: build the product page against the real engine
(the renderer extraction happens here, because product IS the engine's second consumer — that
refactor is earned, not speculative), ship it through its own gate on ONE real product, and only
then write the profile table for {world, product} — **as a markdown table in the spec, not a
code-level registry**. A registry becomes code when a third consumer reads it, not before.
Character rows stay in the research reports. This is the constitution's "one run on real data
before done" and es-lazy's second-instance rule applied to the same object.

## Ruling 5 (Q5) — Lives in specs/021 until the product slice passes its gate; then graduates via the librarian door.

No graduation on promises. The recurrence gate (2 real, shipped instances) is satisfied the day
the product page passes QA on a real product — at that point `scroll-world` + the product slice
fold into `es-scroll-cinema` through the normal gap→librarian→judge→owner chain, not by hand-
carry. Not a `ui` CLI command: the workflow's spine is a generation hand plus a **human GATE**,
which is skill-shaped, not deterministic-binary-shaped. The deterministic fragments (frame
extraction, WebP encode, the lints below) may become `ui` subcommands later if a second consumer
appears — same second-instance rule.

## Ruling 6 — Profile-table corrections

1. **MISSING AXIS (the important one): `qa_lint` — the per-profile gate.** The constitution's
   emitter-AND-linter doctrine applies squarely: each profile is a standard for "smooth", so each
   ships its own machine check, same commit as its driver. World already has one (boundary
   mean-abs-diff < 8 + two-direction scrub). Product's is NEW and must exist before the slice is
   "done": **loop-closure diff** (orbit A→A: first frame ≈ last frame), **effective-fps floor**
   (≥ ~24 effective fps across the scrub span — steppiness check), **weight budget** (measured
   MB after WebP q80 vs a stated ceiling — Apple's 56 MB is the cautionary number). A profile
   without a lint is prose, and prose drifts (L7).
2. **OVER-ABSTRACTED: the `playback` axis (scrub | loop).** Loop is character-only and character
   is out (Ruling 1). Strike the axis; the family is scrub by definition. Reinstate it only if a
   scrubbing character profile is ever actually built.
3. **OVER-ABSTRACTED: the `alpha` axis.** For {world, product} it collapses to "none, knockout.py
   optional for themeable product bg". The BiRefNet/dual-codec branch is character machinery —
   move it to the shelved research, out of the table.
4. **Under-specified, keep but annotate: `frame_source`.** Product research leaves Route 1
   (video-extract) vs Route 2 (per-angle stills) genuinely open, per product class. The slice
   pilots Route 1 only (cheapest path through existing generators); Route 2 is the first
   follow-up experiment, not part of the slice.
5. Otherwise the table is RIGHT — notably "camera arch is topic-dependent" as the meta-rule and
   "end-frame load-bearing for product" (my earlier keyframe ruling was wrong for a world and
   right for a product; MASTERY §1 states it correctly).

---

## The shape

```
scroll-cinema                       ← the family: scroll scrubs pre-rendered cinema
│
├── SHARED CORE (invariant — already built, never duplicated)
│   ├── generation hand ..... gflow/Codex submit→collect, download-decoupled, manifest
│   ├── consistency lock .... ONE approved master ref on every gen + frozen prompt scaffold
│   ├── GATE ................ human approves stills BEFORE any video credit (zero-credit iteration tier)
│   ├── scrub shell ......... scroll→progress, sections/copy/nav/linger, reduced-motion,
│   │                          mobile hardening, design:os theme tokens (scrub-engine.js)
│   └── renderer interface .. { load, draw(progress), poster } — extracted in the P-1 slice
│
├── PROFILE world (PROVEN)
│   ├── camera ... forward seed-chain (archA_driver), NO end-frame, motion-handoff contract
│   ├── renderer . video-scrub (blob + currentTime)
│   ├── bg ....... immersive full-bleed
│   └── qa_lint .. boundary mean-abs-diff < 8 + two-direction scrub QA
│
└── PROFILE product (P-1 — the proof of the family)
    ├── camera ... keyframe-anchored (flythrough_hand), end-frame LOAD-BEARING (orbit A→A, explode A→B)
    ├── renderer . image-sequence-renderer (canvas drawImage; ffmpeg→WebP q80; staged+directional preload)
    ├── bg ....... studio cyclorama; themeable via knockout.py (optional)
    └── qa_lint .. loop-closure diff + effective-fps ≥24 + weight budget   ← NEW, ships with the slice

SHELVED (research, not axes): character-white-bg — the dual problem (identity+alpha or rig);
re-enters as its own track on demand, via the gap door.
```

## The ONE next build unit — P-1 "one-product orbit slice"

Smallest shippable proof that scroll-cinema is a family and not a coincidence. Opus specs this
immediately.

**Scope (all of it, nothing else):**
1. ONE real product (owner picks). Master still → GATE (approved before any video credit).
2. ONE 360° orbit, keyframe-anchored A→A via `flythrough_hand` (`--initial-frame` =
   `--end-frame` = the approved still), draft tier first. This run MEASURES the open question:
   full 360 in one clip vs chained 90° arcs — a decision recorded with numbers, not a guess.
3. Frames: ffmpeg fps-extract → WebP q80, desktop count only.
4. Engine: extract `video-scrub-renderer` from scrub-engine.js (world page must still pass its
   existing QA afterward — that is the refactor's regression gate), add
   `image-sequence-renderer`, mount the product section in the existing shell.
5. Lints, same commit as the renderer: loop-closure diff, effective-fps floor, weight budget.
6. Exit gate: the page scrubs smooth both directions on a real browser, all three lints pass,
   world profile still green.

**Explicitly OUT of P-1:** explode beat, mobile 9:16 chain, Route-2 still-sequence, BYO-GLB/3D,
character anything, loop/alpha engine modes, code-level profile registry. Each returns only via
its own demanded instance.

**On P-1 pass:** write the {world, product} profile table into the spec, then open the librarian
gap to graduate `es-scroll-cinema` (Ruling 5).

— Fable 5
