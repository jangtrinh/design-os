# Product-scroll — Apple-style scroll-scrubbed PRODUCT showcase

Research date: 2026-07-22. Scope: the technique where scrolling scrubs a cinematic of a
**product** (360 rotate, explode into parts, push-in on details, assemble/disassemble) —
AirPods Pro / iPhone / Mac / Watch style. Adjacent to our diorama fly-through (spec 021)
but a **different camera architecture**. Sources ranked SOURCE-grade first (GSAP/Codrops
docs, real teardowns, Apple's own numbers) over blog-spam.

> Read the two local skills first — `scroll-world` (`~/.claude/skills/scroll-world/`) and
> `es-gflow`. This report says which of that engine/pipeline reuses for product-scroll and
> what is genuinely new (orbit/explode ≠ forward-glide; white/solid bg; image-sequence
> scrub, not `<video>` currentTime).

---

## TL;DR (the 5 findings)

1. **The dominant build is NOT `<video>` scrubbing — it is a pre-rendered image sequence
   drawn to `<canvas>` on scroll.** Apple, and every serious teardown, splits a cinematic
   into hundreds of numbered frames and `context.drawImage(frames[i], 0, 0)` where
   `i = round(scrollProgress × frameCount)`. `<video>.currentTime` seeking stutters on
   mobile (seek cost scales with distance-from-keyframe; no repaint mid-scroll until the UI
   thread frees). **This inverts our current scrub engine**, which is `<video>` currentTime
   scrubbing (fine for our full-bleed diorama film, wrong for a crisp product turntable).
2. **Product-scroll INVERTS the forward-glide seam rule.** Our world fly-through banned the
   end-frame (forward glide, start-image only — GOALS.md Arch A). A product **orbit/explode
   is a bounded A→B move** (or A→A loop for a full 360) — this is exactly the
   **first+last-frame keyframe-anchored** case that Fable ratified then GOALS reversed for
   the world. For product-scroll the keyframe architecture is *correct*, not a mistake: the
   product must return to a known pose. Same gflow `--initial-frame X --end-frame Y`.
3. **AI-generate the frames two ways, both on our stack.** (a) **Veo i2v turntable/explode**
   from ONE approved product still → extract frames (proven feasible; Veo can spin a product
   from a single photo). (b) **Imagen/nano per-angle stills** with a locked master reference
   (nano2/nano-pro ref_cap 10 beats Imagen's 3) for a crisp, artifact-free sequence. The
   **consistency problem is the whole game** and it is solved the same way as the world:
   one approved master still → reference image on every gen + frozen prompt scaffold. Veo's
   own object consistency "falls short" on product detail, so the master-reference lock is
   mandatory, not optional.
4. **Canonical open-source starting point = the GSAP `imageSequenceScrub` helper + the
   Codrops/CSS-Tricks teardowns — NOT the "apple-scroller" GitHub repos** (all ~0–26★,
   most stale). The real IP is the frame-extraction + staged-preload + canvas-draw pattern,
   which is ~40 lines and we should own it, not vendor a dead repo.
5. **Real-time 3D (three.js / model-viewer) is the higher-fidelity path but needs a 3D
   asset we don't have.** It scrubs smoother and weighs less than 300 frames, but requires a
   GLB. For a team with no model, AI-video-to-frames is the viable route. Offer 3D as a
   "bring-your-own-GLB" profile; default to the AI image-sequence path.

---

## 1. Ranked techniques / libs / references

| # | Name | URL | What it gives us | Relevance | Grade |
|---|------|-----|------------------|-----------|-------|
| 1 | **GSAP `imageSequenceScrub` helper** | https://gsap.com/docs/v3/HelperFunctions/helpers/imageSequenceScrub/ | Canonical ~40-line scrub: `{urls[], canvas, scrollTrigger, onUpdate}`; tweens `{frame:0}`→`length-1`, `ctx.drawImage(images[round(frame)],0,0)`; preload via `new Image()` | HIGHEST — the reference implementation of the whole technique | Official GSAP |
| 2 | **Codrops — OPTIKKA: HTML5 Video → Frame Sequences** (Zajno) | https://tympanus.net/codrops/2025/10/16/creating-smooth-scroll-synchronized-animation-for-optikka-from-html5-video-to-frame-sequences/ | Real teardown of WHY they abandoned `<video>` scrubbing; FFmpeg → PNG @30fps → WebP q80; **device-specific counts (desktop 1182 / tablet+mobile 880)**; staged preload (first 10 instant, rest via ParallelQueue, ±5 directional); canvas w/ DPR + object-fit:cover | HIGHEST — the exact video→frames migration we must replicate; has real numbers | SOURCE (agency teardown) |
| 3 | **CSS-Tricks — Fancy Apple-style scrolling animations** | https://css-tricks.com/lets-make-one-of-those-fancy-scrolling-animations-used-on-apple-product-pages/ | The canonical tutorial. AirPods Pro = **148 frames**, `0001.jpg…`; `scrollFraction = scrollTop/maxScrollTop`; `frameIndex = floor(scrollFraction × frameCount)`; preload loop; **Apple's own weight: 148 imgs = 55.8 MB, 1609 requests**; fallback single image on slow conn | HIGH — the teaching baseline + the weight reality-check | SOURCE |
| 4 | **Codrops — Cinematic 3D Scroll with GSAP** | https://tympanus.net/codrops/2025/11/19/how-to-build-cinematic-3d-scroll-experiences-with-gsap/ | The real-time-3D alternative (three.js + ScrollTrigger driving camera/model) | HIGH — the other architecture, when a GLB exists | SOURCE |
| 5 | **builder.io — Apple-style 3D scroll in three.js/WebGL** | https://www.builder.io/blog/webgl-scroll-animation | GLTF via `useGLTF` + `useGLTF.preload`; scroll→0-1→`useFrame` eases `rotation.y = π·0.5·progress`; argues 3D beats "100s of images, jittery" | MED-HIGH — clearest real-time pattern; needs a model | Vendor eng blog |
| 6 | **Veo 3.1 turntable / i2v** (see veo-best-practices.md #1) | https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1 | i2v + first+last interpolation + Ingredients (ref imgs) = the AI frame-source for orbit/explode from one still | HIGH — our generation engine; camera-vocab (`orbit`, `arc shot`, `slow half-orbit`) | Official |
| 7 | **model-viewer** (Google) | https://modelviewer.dev/ | Drop-in web component for a GLB; `camera-orbit` bindable to scroll; `<model-viewer>` handles decode/lighting/AR | MED — lowest-effort real-time 3D if a GLB exists; less scrub control than raw three.js | Official |
| 8 | **circlr.js** | https://www.jqueryscript.net/blog/best-360-product-view.html | Lightweight "fake-3D" 360 from a series of stills w/ scroll/drag/touch | MED — a pre-built image-sequence spinner; thin, but proves the minimal pattern | Small lib |
| 9 | **emanuelefavero/apple-scroll-animation** | https://github.com/emanuelefavero/apple-scroll-animation | Vanilla JS frame-synced-to-scroll Apple clone | LOW-MED — **26★, last push 2023**; readable but nothing #1 doesn't give | GitHub, stale |
| 10 | **rtr-dnd/apple-scroller · kerimcharfi/frame-scroll-animation** | https://github.com/rtr-dnd/apple-scroller · https://github.com/kerimcharfi/frame-scroll-animation | npm "apple-scroller" (canvas seq); dependency-free canvas seq lib | LOW — **both ~0★**; apple-scroller last push 2020. Do NOT vendor; write our own | GitHub, near-dead |

**Verdict on canonical starting point:** the "apple-style-scroll" repo ecosystem is a
graveyard (0–26★, mostly stale). The living, authoritative source is the **GSAP helper (#1)
+ Codrops OPTIKKA teardown (#2) + CSS-Tricks tutorial (#3)**. Our engine should absorb that
~40-line canvas-scrub pattern directly, not depend on an abandoned package (es-lazy: reuse
the *pattern*, own the code).

---

## 2. How they're actually built — the three architectures & when each

| Architecture | How | Weight | When to use | Verdict for us |
|---|---|---|---|---|
| **A. Pre-rendered image sequence → canvas** (Apple's real method) | N numbered frames (PNG→WebP), preload, `drawImage(frames[round(progress·N)])` on scroll | 148 frames = ~56 MB uncompressed-ish (Apple); WebP q80 cuts hard; 300–1200 frames typical | **Default.** No 3D asset needed; pixel-crisp product; deterministic scrub | **Primary path.** Frames come from our AI video/stills |
| **B. `<video>.currentTime` scrubbing** | One mp4, set `currentTime` on scroll | Smallest file | Full-bleed cinematic where compression softness is OK (our diorama world) | **Our CURRENT engine.** Keep for world; **wrong for product** — mobile seek jank + compression eats fine product edges |
| **C. Real-time 3D** (three.js / model-viewer) | Load GLB, scroll drives `camera-orbit` / `rotation.y` via `useFrame` lerp | GLB often < a 300-frame seq; Draco/meshopt | Smoothest, resolution-independent, interactive — **but needs a 3D model** | **Opt-in "bring-your-own-GLB" profile.** Not the default (teams lack a model) |

**Frame-count / smoothness tradeoff (from the sources):**
- Apple AirPods Pro: **148 frames** for a short beat; enough because scroll distance is short.
- OPTIKKA (Zajno): **1182 desktop / 880 mobile** for a long hero — the higher count is what
  makes it read as film. **Rule of thumb: ~1 frame per 1–2 px of scroll**; below ~24 fps of
  *effective* scrub it looks steppy, above ~60 wastes bytes.
- Weight is the enemy: 148 frames already = 1609 requests / 55.8 MB at Apple's fidelity.
  **WebP q80 + device-specific counts + staged preload are mandatory, not nice-to-have.**

**The preload architecture that makes it smooth (OPTIKKA, source-grade):**
1. Load **first ~10 frames immediately** → animation starts instantly.
2. Remaining frames in background via a parallel queue.
3. **Directional prefetch**: 5 ahead when scrolling down, 5 behind when scrolling up.
4. Draw to `<canvas>` (not swapping `<img>`) → no DOM reflow, `requestAnimationFrame`-timed,
   DPR-aware, `object-fit:cover` math in JS.

---

## 3. How to GENERATE the product frames with OUR stack (gflow/Veo + Codex image_gen)

The team has **no 3D asset** — so frames come from AI. Two viable routes, both already on
our rails; the consistency lock is identical to the world pipeline.

### Route 1 — Veo i2v turntable/explode → extract frames (PRIMARY)
One approved product still → `gflow video i2v` with a bounded camera move → extract frames at
scrub density with ffmpeg. Confirmed feasible: Veo can spin a product 360 from a single photo.
```
# ORBIT (360): start=end=the hero still → seamless loop
gflow video i2v --initial-frame hero.png --end-frame hero.png \
  --prompt "[Cinematography] slow, steady 360° orbit / turntable of [product], camera arcs
  smoothly around it, product perfectly still and centered. [Context] seamless white cyclorama,
  soft studio key + rim light, subtle floor reflection. [Style] product-film, crisp, no motion
  blur on the product." --aspect_ratio 16:9
# EXPLODE: start=assembled still, end=exploded still (2 approved keyframes) → A→B interpolation
gflow video i2v --initial-frame assembled.png --end-frame exploded.png --prompt "parts glide
  apart along their axes, floating in place, even spacing…"
# then extract at scrub density (density = page-weight lever; see §4):
ffmpeg -i clip.mp4 -vf fps=30 -q:v 2 frames/f_%04d.png   # → WebP q80 for the page
```
**Why keyframe-anchored here (opposite of the world):** an orbit must return to the start pose
(A→A) and an explode has a defined end state (A→B). The end-frame is *load-bearing*, not
harmful — the failure mode that made us drop it in the forward-glide world (soft-dissolve
midpoint from far-apart endpoints) doesn't apply: a 360 orbit's endpoints are *identical*, and
an explode's are *close in lighting/world*. **This is why our seed-chain forward-glide idea
does NOT translate to a turntable — orbit is inherently bounded, so it's the frames-to-video
case, driven by gflow `--end-frame` (verified real in gflow 0.42, SPEC.md).**

For >90° in one clip Veo coherence may wobble → **chain arcs**: 0°→90°, 90°→180°, … each a
bounded i2v with the *rendered* boundary frame as the next start (the seam law ports), or
render 4× 90° from 4 approved corner stills. Prefer 4s segments (SPEC.md scrub-density note).

### Route 2 — Per-angle stills (Imagen / nano) → direct image sequence (CRISPEST)
Skip video; generate the turntable **as stills** at fixed angle steps, each conditioned on the
locked master reference. Best crispness (no video compression), best for a low-frame-count
hero (e.g. 24–36 stills for a snappy 360). **Flow's nano2 / nano-pro (ref_cap 10)** likely
beats Imagen (ref_cap 3) for holding product identity across angles (SPEC.md live recon).
Codex `image_gen` (zero-key, subscription-billed) is the cheap tier for drafts.

### The consistency problem (the whole game) — solved 3 ways, same as the world
1. **One approved master product still → reference image on EVERY subsequent gen.** Non-
   negotiable: Veo's object consistency "falls short" on product detail without it.
2. **Frozen prompt scaffold** `[Cinematography]+[Subject]+[Action]+[Context]+[Style]`; the
   Subject block (exact product description) + Style block **verbatim** across all angles.
3. **Frames-to-video bounds residual drift** per segment (keyframe-anchored, §above).
4. **GATE: human approves the still storyboard (or the 4 corner stills) BEFORE any video
   credit** — identical to the world pipeline's zero-credit iteration tier.

**Does first+last / reference-image conditioning help a 360 turntable? YES, decisively** —
more than for the world. The world's forward-glide had no natural end pose; a turntable's end
pose *is* its start pose, so first=last gives a free seamless loop and pins drift to zero over
the full revolution.

---

## 4. Best practices (product-scroll specific)

- **Frame count:** ~1 frame / 1–2 px scroll; 148 for a short beat, ~600–1200 for a long hero.
  Ship **device-specific counts** (desktop full, mobile ~⅔) like OPTIKKA.
- **Format/weight:** PNG master → **WebP q80**; this is the single biggest weight lever
  (Apple's un-optimized 56 MB / 1609 requests is the cautionary number).
- **Preload:** first ~10 frames eager → instant start; rest via parallel queue; **directional
  prefetch** ±5. Never block scroll on the network.
- **Draw to `<canvas>`**, not `<img>` swap or `<video>.currentTime` — DPR-aware, `cover` math
  in JS, `requestAnimationFrame`-timed.
- **Easing / pinning:** pin the product section (sticky), map scroll 0→1 across the pin length,
  smooth the frame index (lerp toward target — our engine already does `s.cur += (target-cur)*k`).
  Add per-beat dwell (our `linger` remap) so the camera settles on a detail where copy peaks.
- **Background:** product-scroll is **white/solid-bg** (studio cyclorama), not our immersive
  world. Match `--sw-bg` to the render bg for seamless posters; a knocked-out product on a
  themeable bg (reuse `knockout.py`) lets the same sequence sit on any brand color.
- **Mobile:** lower frame count + WebP; canvas seq scrubs *better* than video on phones (no
  seek jank) — a reason product-scroll should be image-sequence even where the world is video.
- **Accessibility / reduced-motion:** honor `prefers-reduced-motion` — show a **single hero
  still** (or first+last), skip the sequence entirely (our engine already gates clip loading on
  `reduce`; the equivalent here is "draw frame 0, don't scrub"). This doubles as the slow-conn
  fallback Apple ships.

---

## 5. How this DIFFERS from our diorama fly-through — reuse vs new

| Dimension | Diorama fly-through (built) | Product-scroll (new) | Reuse? |
|---|---|---|---|
| **Camera arch** | Forward glide, start-image only, no end-frame (Arch A) | **Orbit / explode / push-in — bounded A→B or A→A**, `--end-frame` load-bearing | NEW camera contract |
| **Seam rule** | Never reverse at a seam; chain off rendered last frame | Orbit *returns* to start (loop); explode has fixed end; reversal is *expected* (scrub back = reverse) | INVERTED |
| **Background** | Immersive full-bleed world | **White/solid studio cyclorama**; product is the subject | NEW |
| **Scrub engine** | `<video>.currentTime` on Blob | **Image sequence → canvas `drawImage`** | NEW renderer (big change) |
| **Frame source** | Veo/gflow film → encode mp4 | Veo i2v OR per-angle stills → **extract/gen frames → WebP** | Reuse gflow hand; NEW extraction density + WebP step |
| **Consistency lock** | Master style still + frozen scaffold + frames-to-video | **SAME** (master *product* ref + scaffold + keyframe) | REUSE wholesale |
| **GATE** | Approve still storyboard before video credit | **SAME** | REUSE wholesale |
| **Copy/nav/theme shell** | sw-copy, sw-route, sw-nav, theme tokens, linger, reduced-motion | **SAME** (product-scroll still has sections/copy/CTA over the pinned canvas) | REUSE wholesale |

**Reuses unchanged:** the gflow submit/collect/manifest hand (SPEC.md), the master-
reference + frozen-scaffold consistency system, the GATE, the copy/nav/route/theme/linger
UI shell, reduced-motion gating, `knockout.py` (for themeable-bg products), the ffmpeg
frame-extraction habit.

**Genuinely new:**
1. **A canvas image-sequence renderer** alongside the current `<video>` scrubber (the engine
   grows a second render backend; the scroll-math, copy layer, dwell, and mobile seek-
   coalescing logic stay).
2. **Keyframe-anchored camera contract** (orbit A→A / explode A→B) — literally the thing
   GOALS.md told us to drop for the world, resurrected because product motion is bounded.
3. **Frame-extraction density + WebP pipeline** (ffmpeg fps → cwebp q80 → device-count
   variants + staged/directional preload).
4. **Studio-cyclorama art direction** (white/solid bg, product-film lighting) vs immersive
   world prompts.

---

## What a GENERALIZED design:os workflow must parameterize (for Phase 3)

To cover world **and** product (and the character track) with one skill family, parameterize:

1. **`camera` arch** — `forward-glide` (world, start-only) · `orbit`/`explode`/`push-in`
   (product, keyframe-anchored A→A or A→B) · `turntable`/`walk-loop` (character). Selects the
   gflow flag set (`--end-frame` on/off) and the seam rule (reverse-safe? loop?).
2. **`background`** — `immersive` (full-bleed world) vs `solid`/`cyclorama` (product/character,
   themeable, optional knockout). Drives prompt art-direction + poster/bg matching.
3. **`renderer`** — `video-scrub` (current `<video>` engine) vs `image-sequence` (canvas
   drawImage). Product/character default to image-sequence; world defaults to video-scrub.
4. **`frame_source`** — `veo-film` (extract from i2v) · `still-sequence` (per-angle Imagen/nano
   gen) · `byo-glb` (real-time three.js/model-viewer, no AI). Same GATE and consistency lock
   across all three.
5. **`frame_density`** — frames-per-scroll (page-weight ↔ smoothness lever) + device-count
   variants + WebP quality. Only relevant for the image-sequence renderer.
6. **Constant across all profiles** — master-reference consistency lock, frozen prompt
   scaffold, the human GATE before video credit, the copy/nav/theme/dwell UI shell, reduced-
   motion fallback, the gflow submit/collect/manifest hand.

The engine is thus **one scroll shell + two render backends + a camera/bg/source profile
table** — product-scroll is a *profile*, not a fork.

---

## Unresolved questions
- **Second render backend or replace?** Cleanest is to add a canvas image-sequence backend to
  the existing engine (keep `<video>` for world). Needs a small refactor of `loadClip`/`raf`
  into a renderer interface. Not yet scoped.
- **Optimal orbit segmentation:** does gflow Veo hold a full 360 in one i2v clip, or must we
  chain 4× 90° arcs (or gen 4 corner stills)? Needs one real gflow run to measure the coherence
  ceiling for a pure orbit (budget the "one run on real data").
- **Still-sequence vs video-extract crispness:** per-angle nano stills (ref_cap 10) should be
  crisper than video frames but risk angle-to-angle jitter; video is smooth but soft. Pilot both
  on one product; the winner may differ by product class (hard-surface vs soft-goods).
- **Exploded-view feasibility:** can Veo interpolate a clean assemble/disassemble from two
  approved keyframes without parts warping? Untested; the explode beat is the highest-risk AI
  ask and may need the still-sequence route or a real GLB.
- **Weight budget:** Apple ships ~56 MB unoptimized. What is our ceiling with WebP q80 +
  device counts for a 600-frame hero? Needs a measured encode.
