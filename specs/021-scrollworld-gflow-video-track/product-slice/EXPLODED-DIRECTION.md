# EXPLODED-DIRECTION — x-ray + exploded-view beat (Fable 5, director)

Elevates the proven product slice (`product-slice/site/`, AURA Studio One headphone,
72-frame image-seq scrub) with the Apple-page moment: shell turns transparent → ordered
explosion → hold with callouts → reassemble. Feasibility-first: everything below compiles
to webp frame directories that the EXISTING image-seq renderer already scrubs — the
generation method can fail all the way down the ladder without changing the page contract.

## 0. Three director rulings (read before generating anything)

1. **Explode ONE earcup, not the whole product.** The front-facing earcup (camera-left in
   `source/stills/master.png`) breaks down along its own axis; headband + far cup stay
   assembled. This is the AirPods-Max move, not a cop-out: a full-product explode is
   10+ parts Veo must conserve — guaranteed melt. One cup = 5–6 big rigid shapes. The
   full-product explode is a STRETCH variant, only after the cup beat lands.
2. **The camera is LOCKED. Nothing moves except parts.** Same pose, framing, lighting,
   background as master in every keyframe and every clip. Explosion + camera move =
   double motion = the tumble failure from P-1 all over again. All drama comes from the
   parts and the glass.
3. **The exploded view is a marketing diagram, not a teardown.** 5–6 parts, big readable
   silhouettes, even spacing, straight-line travel. NO text/labels baked into any
   generated image — callouts are DOM overlays (crisp, localizable, re-editable).

**Part inventory (canon — outward from the shell, along the earcup axis, angled toward
camera-left following the master's 3/4 view):**

| # | Part | Callout copy hook |
|---|------|-------------------|
| 1 | Outer shell cap (graphite aluminium — the "cover" that goes transparent) | Thiết kế nguyên khối |
| 2 | ANC mic + thin circular PCB | ANC chủ động |
| 3 | 40mm driver (copper voice coil + ring magnet, one unit) | Driver 40mm Hi-Res |
| 4 | Acoustic baffle / internal frame | — (structure, no callout) |
| 5 | Memory-foam cushion + leather ring | Đệm da đeo cả ngày |

Keep internals PLAUSIBLE and SIMPLE — one driver unit, one PCB. Fewer parts = fewer
things for both Codex (cross-still consistency) and Veo (mid-flight conservation) to lose.

## 1. Beat structure (scroll sections)

All pinned sections, image-seq renderer, one continuous narrative. `S1`/`S-CTA` already
exist in `site/index.html`; `S2–S4` are new sections between them.

| Beat | Section | Frames | scroll | What the visitor sees | Copy |
|------|---------|--------|--------|----------------------|------|
| Hero orbit | S1 `rotate` (exists) | 72 (exists) | 3.0 | tumble-orbit scrub | exists |
| **X-RAY** | S2 `xray` | X1: 36 (K0→K1) | 1.5 | outer shell cap of front cup turns to smoked glass; driver + coil glow inside | "Nhìn xuyên thiết kế." — card fades in as glass completes |
| **EXPLODE a** | S3a `lift` | X2: 36 (K1→K2) | 1.5 | shell cap glides off-axis; parts crack apart, small gaps | "Từng lớp, có chủ đích." |
| **EXPLODE b + HOLD** | S3b `explode` | X3: 36 (K2→K3), `linger:0.3` | 2.0 | parts spread to full even spacing, dwell at full explode | 3 DOM callout labels + hairlines to parts 1/2/3/5 (positions fixed — camera is locked) |
| **REASSEMBLE** | S4 `reassemble` | same 108 frames, `reverse:true` | 2.0 | whole sequence runs backward to the assembled hero | "Hợp lại thành một." |
| CTA | S5 `buy` (exists) | still = master | 1.2 | assembled hero | exists |

- **Scrub direction is honest both ways**: scrolling back up through S2–S3 IS a
  reassembly (free, frame-exact) — keyframe-anchored sequences are reverse-safe, unlike
  the world's forward-glide (research §5, seam rule INVERTED).
- **S4 costs zero bytes**: it reuses the S2+S3 frame dir with a reversed index map.
  Engine addition (~3 lines in `imageSequenceRenderer`): section flag `reverse:true` →
  `idx = (N-1) - idx`. Do NOT duplicate reversed webp files on disk.
- Callouts land at the S3b linger (scrub dwells there by design — copy peaks where the
  camera settles, same dwell law as the world page).

## 2. Generation approach — ranked (the crux)

### RECOMMENDED: (a) Codex keyframe stills → Veo frames-to-video between adjacent keyframes

The product arch exactly as proven: bounded A→B moves, `--initial-frame`/`--end-frame`
both set, endpoints CLOSE (adjacent states, 4s clips). This is the case the research says
keyframe-anchoring is FOR, and the case P-1's failure does NOT apply to (P-1's tumble was
one unbounded 8s clip asked to hold a 360; here every clip travels a small, defined
distance between two approved stills).

Keyframe ladder (all Codex image_gen, zero-credit):

```
K0 = master.png                    (exists — assembled hero)
K3 = FULL EXPLODED                 ← generate FIRST: it defines the part canon
K1 = TRANSPARENT SHELL             ← references K3 (same internals, inside glass)
K2 = HALF EXPLODED                 ← references K3 ("same parts, 50% toward assembled")
```

**Generate K3 first.** The exploded still is the canon document for what parts exist and
what they look like; K1 and K2 each reference it so internals are invented ONCE and
propagated, not re-imagined per keyframe. Every prompt also carries the frozen scaffold
(verbatim subject block + style block from `gen-orbit.py`'s prompt) to hold body,
lighting, warm-grey background, contact shadow.

Veo segments (gflow, `Mode.I2V`, `start_image` + `end_image`, NO reference_images —
MASTERY §9: i2v+ref is FORBIDDEN by Flow; endpoint stills carry all the anchoring):

```
X1: K0→K1, 4s  "The outer shell cap of the front earcup transitions to transparent smoked
                glass, revealing the driver and internals inside. Nothing moves — camera
                locked, product perfectly still, lighting and background unchanged."
X2: K1→K2, 4s  "The glass shell cap glides straight off the earcup along its axis and the
                internal components separate outward with small even gaps, each part
                moving in a straight rigid line, no rotation, no deformation. Camera
                locked, background and lighting unchanged."
X3: K2→K3, 4s  "The separated components continue gliding apart to even spacing and come
                to rest, floating perfectly still. Rigid straight-line motion only.
                Camera locked, background and lighting unchanged."
```

Extract ~36 frames per segment (`ffmpeg -vf fps=9` on 4s → 36, or fps=12 → 48 and cull),
`cwebp -q 80`, number into one dir `assets/seq/xray/0001..0108.webp`.

**Why this wins:** motion smoothness comes from Veo, part identity comes from the
approved stills, endpoints are pinned by construction (frames-to-video holds the supplied
first/last frames → segment joins are frame-locked the way world seams never were), and
the entire risk is absorbed at the zero-credit still tier before any spend.

**Realistic failure modes, named:**
- *Codex tier:* internals redrawn between K1/K2/K3 (part-count drift, driver changes
  shape), pose/zoom drift off master. Mitigation: K3-as-canon referencing; silhouette
  overlay diff vs master (difference-blend QA) per keyframe; retry loop is free. Expect
  3–5 attempts per keyframe.
- *Veo tier:* parts morph mid-flight, a part vanishes/duplicates mid-segment, shell
  "grows back", floaty wobble, slight camera breathe. Mitigation: 4s bounded segments
  with close endpoints (the research's warping mechanism — far-apart endpoints — is
  designed out), rigid-motion prompt language, one retry per segment. Two fails on the
  same segment → that segment drops to the ladder below, others keep their Veo clips.

### Fallback ladder (each rung is per-SEGMENT, not all-or-nothing)

Because the renderer only sees a webp dir, every rung compiles to identical page assets:

1. **(a) full**: 3 Veo segments as above.
2. **(a-minus): failed segment → offline cross-dissolve.** `ffmpeg -filter_complex xfade`
   between the segment's two keyframes → 36 frames → same dir. Zero credits, zero engine
   change. For X1 this is barely a downgrade — a dissolve to glass reads as intentional
   materialization. For X2/X3 it ghosts (parts fade-slide rather than travel) — acceptable
   draft, not final.
3. **(c) stills-only floor**: no Veo at all. Codex generates 2–3 extra in-between states
   per segment (K0.5, K1.5, K2.5…), chain-xfade the whole ladder into ~108 frames. Full
   control, crispest single frames, zero credits — but motion is dissolve-stepped, not
   physical. This is the SHIP-A-DRAFT rung and the permanent plan-B.

### REJECTED: (b) pure Veo i2v "explode" from one still

One unbounded clip asked to invent an explosion with no end-frame: P-1 already measured
what one veo-fast i2v does with an unconstrained rigid ask — it tumbles. An explode
without a pinned end state will melt parts, invent internals mid-flight, and give us no
exploded STILL to hang the callout beat on. Also unusable for the reassemble (no defined
pose to return to). Not worth one credit of measurement; the research flags it and P-1's
data agrees.

## 3. The transparent-cover beat (K1 prompt strategy)

The x-ray still is the highest-taste single image in the sequence — iterate it hardest
(it's free). Prompt skeleton, referencing K3 + frozen scaffold:

> Same premium over-ear headphone, identical pose, framing, studio lighting, soft warm-grey
> gradient background and soft contact shadow. The outer shell cap of the front (left)
> earcup is now rendered as transparent smoked glass with a subtle edge highlight,
> revealing the internals inside exactly as in the reference: a single 40mm driver with
> copper voice coil, ring magnet, and a thin circular PCB behind it, softly lit inside the
> cup. Everything else — headband, far earcup, metal yokes, cushion — completely unchanged,
> opaque. High-end technical product render, crisp detail. No text, no labels, no logo.

Direction notes: *smoked* glass (neutral dark tint sits in the graphite/champagne palette;
clear glass reads cheap/plastic), one soft internal glow so the driver reads at thumbnail
size, edge highlight so the cap still exists as a surface. If Codex refuses clean glass:
fall back to "cutaway" language ("shell cap shown as a translucent x-ray cutaway") — same
beat, slightly more diagram-flavoured, still on-brand.

## 4. Credit-aware plan (GATE before any spend)

| Phase | Tier | Cost | Output |
|-------|------|------|--------|
| 1. Keyframes K3, K1, K2 (+retries) | Codex image_gen | **0 credits** | 4-still storyboard strip (K0–K3) |
| 2. **GATE** — owner approves the strip | human | 0 | go/no-go per keyframe |
| 3. Draft video X1–X3 | veo-fast, 4s each | 3 clips (~20 Flow credits ea ≈ 60) | draft frame dirs |
| 4. Retry budget | veo-fast | ≤2 clips (~40) | — |
| 5. Optional final polish | veo-quality | 3 clips (~100 ea ≈ 300) | only if draft GATE passes AND owner wants it |

Draft tier lands the whole beat for **≤5 veo-fast clips (~100 Flow credits)**; the
stills-only floor lands it for **zero**. Verify remaining Flow credits before phase 3
(per-clip credit numbers are Flow-current estimates — check, don't trust). Use the
download-decoupled pattern from `gen-orbit.py` (submit → `download_video(media_id)`) so a
flaky render never strands a credit. Note veo-quality is NOT automatically better —
MASTERY §9's stochastic finding — so quality re-render is owner-taste-gated, not default.

**GATE artifact:** a single strip image (montage K0|K1|K2|K3) + the silhouette-diff QA
overlays, staged in `product-slice/source/stills/` for the owner to react to. No video
credit moves before approval — identical to the world pipeline's law.

## 5. Feeding the existing renderer

- **Frames:** one dir `site/assets/seq/xray/` with `0001.webp … 0108.webp` (36×3),
  same `%04d.webp` contract as `assets/seq/prod/`. ~1.5 MB at q80 → page total ~2.5 MB,
  well under the 6 MB lint ceiling.
- **Sections** (S2/S3a/S3b slice ONE dir by frame range — needs the small addition below):

```js
{ id:'xray',    renderer:'imageseq', frames:'assets/seq/xray/', frameCount:108,
  range:[0,35],   scroll:1.5, ... },
{ id:'lift',    renderer:'imageseq', frames:'assets/seq/xray/', frameCount:108,
  range:[36,71],  scroll:1.5, ... },
{ id:'explode', renderer:'imageseq', frames:'assets/seq/xray/', frameCount:108,
  range:[72,107], scroll:2.0, linger:0.3, ... },
{ id:'reassemble', renderer:'imageseq', frames:'assets/seq/xray/', frameCount:108,
  reverse:true, scroll:2.0, ... },
```

- **Engine additions (tiny, es-lazy):** `range:[a,b]` (map progress across a sub-span so
  three sections share one preloaded dir instead of triplicating files) and
  `reverse:true` (`idx = (N-1)-idx`). Both are index-math-only inside
  `imageSequenceRenderer`; the preload/cache/cover-fit machinery is untouched.
- **Explode vs reassemble = one linear sequence + reversed replay.** Do NOT generate a
  separate reassembly clip: reversing an exploded sequence is physically exact (rigid
  parts retrace their lines), costs nothing, and guarantees S4 ends on the true assembled
  pose (frame 0001 ≈ K0 = master) so S5's still lands seamlessly. A generated "reassemble"
  clip would re-roll all the Veo risk for zero visual gain.
- **Lint:** run `scroll-cinema-lint` in scrub mode intent — weight budget applies;
  effective-fps does not (P-1 finding: scrub density ≠ playback fps); loop-closure N/A
  (linear sequence). Reduced-motion: sections draw frame 0 (assembled / master) — the
  engine's existing gate covers it.
- **Callouts (S3b):** absolutely-positioned DOM labels + 1px hairlines over the pinned
  canvas, opacity keyed to section progress > 0.7. Positions are safe to hardcode per
  breakpoint BECAUSE the camera is locked — the exploded frame is deterministic.

## 6. Order of work

1. Codex: K3 exploded canon still (retry to taste) — zero credit.
2. Codex: K1 transparent, K2 half, referencing K3 — zero credit.
3. QA strip + silhouette diffs → **owner GATE**.
4. veo-fast X1–X3 (download-decoupled) → ffmpeg/cwebp → `assets/seq/xray/`.
5. Engine: `range` + `reverse` flags; wire S2–S4 sections; callout overlay.
6. Headless scrub QA both directions + lint + screenshot at the 4 beat peaks.
7. Owner draft review → optional veo-quality re-render (taste-gated).

Stretch (post-landing, separate GATE): full-product explode (headband + both cups) as an
alternate K3', and a subtle 15° parallax orbit ON the exploded state (bounded A→B between
two exploded-angle stills) — only after the locked-camera beat has proven part conservation.
