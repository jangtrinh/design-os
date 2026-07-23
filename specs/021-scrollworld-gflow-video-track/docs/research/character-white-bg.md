# Character / subject on a clean white (or transparent) background — web hero

Research date: 2026-07-22. Scope: an **animated character / mascot / product-person**
(turntable, idle loop, walk cycle, gesture, scroll-driven pose) on a **white / solid /
transparent** background, as a modern landing-page hero. This is the second Phase-2 topic
of spec 021 (GOALS.md §Phase 2) — sibling to `veo-best-practices.md` (the diorama-world
report). Sources ranked SOURCE-grade first (official docs, real repos, practitioner
engineering blogs) over blog-spam.

> Our stack already owns two of the four pieces: `knockout.py`
> (`~/.claude/skills/scroll-world/references/knockout.py`) for flat-bg matting, and
> `scrub-engine.js` for scroll scrubbing. This report tells us where they DO and DON'T
> transfer to a character, and what the generalized workflow must add.

---

## 0. TL;DR — the pragmatic path for a web hero on white bg

The character problem splits cleanly from the world problem: a **world** is a fly-through
(camera moves, subject static); a **character** is the inverse (subject moves, camera
static/orbits). That inversion changes every downstream choice.

**Two viable production paths, pick by identity-hardness:**

| Path | When | Identity lock | Alpha | Motion |
|------|------|---------------|-------|--------|
| **A · AI-video (Veo/Flow i2v + Ingredients)** | stylised / illustrative / one hero shot; fastest | Flow **Ingredients** (up to 3 refs) — holds well for stylised, drifts on photoreal faces | prompt white-seamless → **per-frame matting** (BiRefNet), NOT knockout.py | i2v of the character moving; loop or scrub |
| **B · generate-once + rig (3D)** | need turntable / walk / interactive / pose-on-scroll; hardest identity | **perfect** (same mesh every frame) | native — three.js renders on transparent canvas, no matting at all | Mixamo clips on the rig, real-time or baked |

The honest recommendation: **stylised mascot / single hero loop → Path A**. **Turntable,
walk cycle, or scroll-driven pose change → Path B** — the moment you need multiple angles or
scroll-scrubbed poses of a *recognisable* character, per-frame AI identity drift and per-frame
matting flicker both fight you, and a rig makes both problems disappear (identity is a mesh,
alpha is a transparent canvas). This mirrors our world/character inversion: worlds want AI
video, characters want a rig.

---

## 1. Ranked techniques / tools table

| # | Name | URL | What it gives us | Relevance | Grade |
|---|------|-----|------------------|-----------|-------|
| 1 | **Google — Veo 3.1 Ingredients-to-Video** (official) | https://blog.google/innovation-and-ai/technology/ai/veo-3-1-ingredients-to-video/ | Up to **3 reference images** (character/object/style) held across shots; "keep characters looking the same even as the setting changes." Google's own consistency feature. | HIGHEST for Path A identity | Official |
| 2 | **Google Flow — Ingredients** (official help) | https://support.google.com/flow/answer/16353334 | An *ingredient* = a reusable character/object/style asset (Imagen-gen or upload); "same character consistently across clips." **Explicit tip: use PLAIN backgrounds in ingredient images** — directly enables our white-bg lock. | HIGHEST — this is the gflow path | Official |
| 3 | **JakeArchibald — Video with alpha transparency on the web (2024)** | https://jakearchibald.com/2024/video-with-transparency/ | The canonical cross-browser transparent-video reference: exact ffmpeg for VP9-alpha (`yuva420p`, 2-pass) + HEVC-alpha (`hevc_videotoolbox`, `premultiply`), source-order gotcha, the WebGL stacked-alpha alternative (460 kB AV1 vs 1.1 MB VP9). | HIGHEST for web playback | Official-grade eng blog |
| 4 | **Nano Banana Pro / Gemini 2.5–3.x Flash Image — character sheets** | https://prompting.systems/blog/nano-banana-pro-character-consistency-guide | The "character DNA" method: one reference sheet with 3 views (front / 45° / 90°) becomes the identity anchor; ~93% cross-scene consistency (ZDNET); NB2 holds up to 5 characters. Best image-model identity lock; feeds Path A refs and Path B texturing. | HIGH — identity source-of-truth image | Practitioner + benchmark |
| 5 | **rembg + BiRefNet matting** | https://github.com/danielgatis/rembg | AI matting CLI/lib; **BiRefNet** = continuous alpha (hair/fur/soft edges) vs binary segmentation; **FFmpeg binary-stream mode = per-frame video knockout**. The right tool where knockout.py's flood-fill fails (white-on-white, hair). | HIGH — the alpha engine for AI-video characters | ~19k★ repo |
| 6 | **GSAP — imageSequenceScrub / canvas** (official) | https://gsap.com/docs/v3/HelperFunctions/helpers/imageSequenceScrub/ | Official helper: preload numbered frames, map scroll→frame index, draw to `<canvas>`. HiDPI cap + reduced-motion. The Apple-AirPods technique, canonical form. | HIGH — scroll-scrub of a pose sequence (our scrub-engine's sibling) | Official |
| 7 | **Ben Terhechte — Encoding transparent videos Safari/Chrome/Firefox (2025)** | http://terhech.de/posts/2025-02-02-transparent-video-safari.html | Second-source confirmation of the two-file HEVC+VP9 recipe with updated 2025 commands; practical file-size numbers. | HIGH — corroborates #3 | Eng blog |
| 8 | **Mixamo** (official, Adobe) | https://www.mixamo.com | Free rigged characters + auto-rigger + huge library of body animations (idle, walk, wave, turn). The motion source for Path B. | HIGH — Path B animation | Official |
| 9 | **Ready Player Me + three.js + Mixamo pipeline** | https://robesantoro.medium.com/three-js-blender-mixamo-52304823046 | Documented pipeline: RPM `.glb` → retarget Mixamo clips → load in three.js/R3F, animate on scroll with GSAP. Real portfolio implementations (SamVerse/Portfolio-Three-JS). | HIGH — the full Path B web recipe | Practitioner + repos |
| 10 | **Higgsfield MCP — `remove_background`, `show_characters`, `generate_3d`, `motion_control`** | (local MCP, `es-gflow` sibling) | Already on this machine: cutout/transparent (`remove_background`), a **character reference system** (`show_characters`), **image→GLB** (`generate_3d`) for a fast rig, and puppeteer/motion-transfer (`motion_control`). | HIGH — much of both paths is already wired MCP-side | Local tool |
| 11 | **Lottie / LottieLab** | https://lottiefiles.com/blog/design-inspiration/lottie-character-animation-bring-your-brand-mascot-to-life | Vector mascot animation, ~10× smaller than MP4/GIF, resolution-independent, native transparency (no codec war). For *illustrated* (not photoreal) mascots. | MED — a whole different lane; skip for photoreal | Official |
| 12 | **Rive** | https://rive.app/blog/rive-as-a-lottie-alternative | Interactive vector characters (state machines, respond to hover/scroll/toggle) — heavier runtime than Lottie but truly interactive. | MED — interactive illustrated mascot only | Official |
| 13 | **snubroot/Veo-3-Prompting-Guide** | https://github.com/snubroot/Veo-3-Prompting-Guide | Physical-description character-consistency templates (repeat concrete attributes every prompt); already cited in the world report. | MED — prompt-side identity reinforcement | ~314★ |
| 14 | **CSS-Tricks — Overlaying video with transparency** | https://css-tricks.com/overlaying-video-with-transparency-while-wrangling-cross-browser-support/ | Older but still-cited cross-browser survey; context for the codec split. | LOW-MED — background reading | Blog |

---

## 2. Answers to the five questions (with evidence)

### Q1 — The consistency problem (holding ONE identity)

Ranked by how hard identity actually holds:

1. **generate-once + rig (3D) — PERFECT identity, by construction.** The character is a single
   mesh; every frame/angle/pose is the *same geometry*, so there is zero drift across turntable,
   walk, or scroll-pose. This is why Path B wins the moment you need >1 angle of a *recognisable*
   character. Rig sources: Mixamo auto-rig (#8), Ready Player Me (#9), or Higgsfield `generate_3d`
   image→GLB (#10). Cost: the 3D pipeline (Blender retarget step in #9).
2. **Image model with character sheet (nano-banana / GPT-Image-2) — strong for stills, the
   identity SOURCE.** Method (#4): build ONE reference sheet with 3 views (front / 45° / 90°) =
   the character's "DNA", then generate poses/scenes off it. Nano Banana Pro benches ~93%
   cross-scene consistency; NB2 holds up to 5 characters. **GPT-Image-2's consistency from a
   reference photo is reported "on another level"** for realism, while Gemini/nano-banana edges
   it on stylised toy-like characters (the Nano-Banana-2-vs-GPT-Image-2 test, #4). This sheet is
   the input to *both* other paths — it's the refs for Flow Ingredients and the texture ref for
   the rig.
3. **Veo/Flow Ingredients-to-Video (up to 3 refs) — good for stylised, drifts on photoreal
   faces.** Google's dedicated feature (#1, #2): pass 2–3 clean refs (front / three-quarter /
   profile, neutral light, plain bg) and Veo holds "facial features, clothing, identity" across
   the clip. Real-world caveat from practitioners (skywork, sider): consistency is "better than
   ever" but a photoreal human face still micro-drifts frame-to-frame, which reads as uncanny on
   a *close-up* hero. It holds far better on stylised / medium-shot subjects. **Flow's own tip:
   plain backgrounds in the ingredient images** (#2) — which is exactly the white-bg lock we want.
4. **Plain i2v with a single reference (no Ingredients) — weakest.** One ref, no multi-view
   anchor; fine for a 4–8 s loop where the camera barely moves, unreliable across angles.

**Verdict:** identity holds in the order rig ≫ image-sheet ≫ Ingredients-video ≫ single-ref-video.
The image sheet (#4) is the keystone — generate it once, and it feeds whichever motion path.

### Q2 — Clean-bg / transparent generation + compositing

Two sub-problems: (a) *get* a clean-bg subject out of a scene-painting model, (b) *knock it out*
to alpha, (c) *play* alpha on the web.

- **(a) Prompt for the bg you want.** Flow/Veo and image models paint full scenes by default;
  force the plate with `"plain white seamless studio background, evenly lit, no props, no
  shadows on the backdrop"` (Google's Ingredients guidance literally recommends plain
  backgrounds, #2). A **flat, evenly-lit white or solid** is the whole game — it makes matting
  trivial and knockout.py *possible*.
- **(b) Does our `knockout.py` apply?** **Partially — for STILLS on a truly flat bg, yes; for a
  character it is the wrong default.** knockout.py is a border-connected flood-fill from the
  corners over pixels within `TOL=34` RGB of the corner colour, with a 1.4 px Gaussian on the
  alpha contour. Two structural limits for characters:
  1. **White-on-white bleed.** The flood eats any bg-coloured region *connected to the border*.
     A white shirt / blonde hair / light shoe touching the white backdrop is contiguous with it
     → the fill bleeds into the character. Diorama scenes rarely touch their own bg colour;
     characters do constantly. This is knockout.py's designed-for case (interior cream walls are
     *preserved because not border-connected*) turning into a failure case (subject edges *are*
     border-connected through matching pixels).
  2. **No soft matting.** A single hard threshold + 1.4 px blur cannot resolve hair, fur, motion
     blur, or semi-transparent edges — it gives a crunchy cutout. Diorama hard edges tolerate it;
     a character's silhouette does not.
  3. **Per-frame independence = temporal flicker.** Run frame-by-frame, the flood-fill threshold
     lands on slightly different pixels each frame → the alpha edge shimmers. Fatal for video.

  **Use BiRefNet matting (rembg, #5) instead for characters.** It predicts *continuous* alpha
  (hair/fur/soft), and rembg's **FFmpeg binary-stream mode does per-frame video knockout** in one
  command. Higgsfield `remove_background` (#10) is the zero-setup MCP equivalent for one-shot
  cutouts. Keep knockout.py for the *diorama-still* case it was written for; it is not the
  character tool.
- **(c) Alpha on the web = the two-file codec war (#3, #7).** Safari supports **HEVC-with-alpha**
  and NOT VP9-alpha; Chrome/Firefox support **VP9-alpha (webm)** and NOT HEVC-alpha. So you ship
  BOTH and let each browser pick, HEVC source FIRST (Safari also matches VP9 but can't do its
  alpha, so ordering steers it to HEVC):
  ```html
  <video playsinline muted autoplay loop>
    <source type='video/quicktime; codecs="hvc1.1.6.H120.b0"' src="char.mov" />
    <source type='video/webm;      codecs="vp09.00.41.08"'    src="char.webm" />
  </video>
  ```
  VP9-alpha encode (Chrome/FF), 2-pass:
  ```bash
  ffmpeg -i in.mov -pix_fmt yuva420p -an -c:v libvpx-vp9 -crf 30 -b:v 0 \
    -deadline good -row-mt 1 -lag-in-frames 25 -pass 1 -f null /dev/null && \
  ffmpeg -i in.mov -pix_fmt yuva420p -an -c:v libvpx-vp9 -crf 30 -b:v 0 \
    -deadline good -row-mt 1 -lag-in-frames 25 -pass 2 out.webm
  ```
  HEVC-alpha encode (Safari, macOS videotoolbox):
  ```bash
  ffmpeg -i in.mov -c:v hevc_videotoolbox -require_sw 1 -alpha_quality 0.1 \
    -tag:v hvc1 -q:v 35 -vf "premultiply=inplace=1" out.mov
  ```
  **Gotchas:** Android Chrome historically gets VP9 alpha wrong (fixed in Canary); Firefox-Android
  stalls on VP9; videotoolbox HEVC roughly doubles file size vs Apple Compressor. The **WebGL
  stacked-alpha** alternative (color on top, grayscale-matte below, one opaque video, reassembled
  in a shader) sidesteps the whole codec war and compresses best (460 kB AV1 vs 1.1 MB VP9) at the
  cost of a JS/WebGL player — worth it if file size or Android reach matters (#3).
  **And note:** if you go Path B (3D), *there is no matting and no codec war at all* — three.js
  renders the character on a transparent `<canvas>` with real per-pixel alpha, natively, every
  browser. That is a large hidden advantage of the rig path.

### Q3 — Motion source

| Source | Best for | Identity | Alpha | Verdict |
|--------|----------|----------|-------|---------|
| **AI video (Veo i2v of the character moving)** | one hero loop, stylised subject, fast | Ingredients, drifts on photoreal | prompt-white → BiRefNet matte | Pragmatic default for a *single* looping shot |
| **Image-sequence (per-pose gen)** | scroll-scrub through discrete poses | per-frame drift is worst here (each frame independent) | per-frame matte, flicker-prone | Avoid for characters unless poses are few + stylised |
| **Real-time 3D (RPM/Mixamo + three.js, or Spline/VRM)** | turntable, walk, interactive, scroll-pose | **perfect** | **native transparent canvas** | Best when motion is more than one canned loop |

Pragmatic path for a web hero on white bg: **one stylised looping character → AI-video (Path A).
Turntable / walk / scroll-driven pose → 3D rig (Path B).** The AirPods-style pre-rendered
image-sequence scrub (#6) is superb for a *product* (rigid, no identity to hold) but poor for a
character generated per-frame (identity + matte both flicker) — for a character you'd render the
sequence *from the rig* (Path B baked to frames), which restores identity and alpha.

### Q4 — Web playback

- **Autoplay loop vs scroll-scrub — pick by intent.** Idle/walk/gesture = **autoplay loop**
  (`<video muted autoplay loop playsinline>`, or a Lottie/rig loop). Turntable or "pose changes
  as you scroll" = **scrub**: map scroll progress → frame index (GSAP imageSequenceScrub, #6) or →
  the rig's animation time. Our `scrub-engine.js` already does the scroll→time mapping; a
  character adds the *loop* mode as an alternative it may not yet cover.
- **Transparent video** = the two-file HEVC+VP9 dance (Q2c). Real cross-browser pain; budget for
  it or avoid it via rig/Lottie.
- **Image-sequence on canvas** (#6): preload numbered frames, draw current to `<canvas>` on
  scroll; cap `devicePixelRatio` for Retina; honour `prefers-reduced-motion`. Heavier on memory
  (N decoded frames) but seek-perfect and codec-free. Good for a *baked* turntable (opaque or
  PNG-alpha frames).
- **Sprite sheet** — fine for a short, small-resolution loop (few frames); memory-cheap, but a
  large hero sheet is a huge PNG. Niche.
- **Lottie / Rive** (#11, #12): vector, tiny, native alpha, resolution-independent, no codec war —
  **but only for *illustrated* mascots**, not photoreal AI-generated humans. Rive if it must react
  to hover/scroll/state; Lottie if it's a lightweight loop. A whole separate lane from the
  AI-video/rig pipeline; flag it, don't force it.
- **Gotchas:** iOS needs `playsinline muted` or it won't autoplay; large webm/HEVC hero videos
  block LCP — poster + lazy; scrubbing a *video* (vs frames) seeks poorly on mobile unless GOP is
  tiny (our `pipeline.md` §6 rule ports directly: `-g 4` / all-intra for phone seeks).

### Q5 — Mapping onto our stack + what to generalize

**How the pieces map:**

| Our asset | World use (spec 021 P1) | Character use (this report) |
|-----------|-------------------------|------------------------------|
| **gflow / Veo Ingredients** | style refs for scene consistency | **character refs (up to 3) for identity** — the primary lever |
| **Codex `image_gen` / nano-banana** | scene stills | **the 3-view character DNA sheet** (Q1.2) — new keystone step |
| **`knockout.py`** | diorama-still flat-bg float | **NOT the character tool** — replace with BiRefNet/rembg per-frame or Higgsfield `remove_background` |
| **`scrub-engine.js`** | scroll → camera-flight time | scroll → *pose/turntable* time — plus a NEW **autoplay-loop** mode for idle/walk |
| **Higgsfield MCP** | scene gen | `show_characters` (identity), `generate_3d` (fast rig → Path B), `motion_control` (puppeteer), `remove_background` |
| **encode pipeline** (`pipeline.md` §6) | opaque mp4, tight GOP | **alpha encode: dual HEVC+VP9** (new), or transparent canvas (rig → no encode) |

**What a generalized `design:os` workflow MUST parameterize** (so one skill family covers world /
product / character):

1. **`subject_motion` vs `camera_motion`** — the top-level fork. World = camera moves (fly-through,
   forward-chain seam laws). Character = subject moves, camera static/orbit. This flips the entire
   camera-architecture step (Step 4 of scroll-world) — a character has *no seam-chain* problem; it
   has an *identity-hold* problem instead.
2. **`background` = {scene | solid | white | transparent}** — drives the matting decision:
   scene→none; flat solid/white→knockout.py *(stills only)*; character/soft-edge→BiRefNet matte;
   rig→none (native alpha). Never hard-code knockout.py as "the float step."
3. **`alpha` = {none | png-seq | dual-codec-video | webgl-stacked | canvas-native}** — drives
   encode + playback. Only the character/transparent branch pays the HEVC+VP9 tax; the rig branch
   skips it entirely.
4. **`identity_lock` = {style-preamble | ingredients-refs | character-sheet | rig-mesh}** — world
   uses the identical-preamble lever; character *adds* the 3-view sheet + Ingredients refs, or
   escalates to a rig for hard identity. This is the character analogue of the world's "byte-
   identical style preamble."
5. **`playback` = {scrub | loop | autoplay-once}** — world is always scrub; character can be loop
   (idle/walk) OR scrub (turntable/scroll-pose). `scrub-engine.js` currently assumes scrub; the
   generalization is to expose loop as a first-class mode.
6. **`motion_source` = {ai-video-i2v | baked-frame-seq | realtime-rig | vector(lottie/rive)}** —
   the render backend, chosen from the above (Q3 table). Keep it backend-agnostic exactly as the
   world track is model-agnostic (Seedance/Kling/Veo all satisfy the frame-handoff contract).

The unifying insight: **the world skill's hard-won laws are all about a moving camera over a
static world; the character case is the dual — a static camera over a moving subject — so the
"seam/handoff" machinery is replaced by "identity-lock + alpha" machinery, and the workflow's job
is to branch on `subject_motion` and swap those two subsystems.** knockout.py and the opaque
encode are world-branch defaults, not universals.

---

## Top-5 findings (summary for the caller)

1. **Character is the DUAL of world: subject moves, camera static.** That inversion swaps the
   whole problem — the world's seam/forward-chain laws don't apply; instead you fight *identity
   drift* and *alpha*. The generalized workflow must branch on `subject_motion` vs `camera_motion`
   at the top and swap those two subsystems (knockout + opaque-encode are world-branch defaults,
   not universals).

2. **Identity holds in the order rig ≫ image-sheet ≫ Ingredients-video ≫ single-ref.** A 3D rig
   (Mixamo/RPM/Higgsfield `generate_3d`) gives *perfect* identity by construction — same mesh
   every angle. For AI paths, the keystone is a **one-time 3-view "character DNA" sheet**
   (nano-banana/GPT-Image-2, ~93% consistency) that then feeds Flow **Ingredients** (up to 3 refs,
   Google's dedicated feature) — but photoreal faces still micro-drift, so Ingredients is for
   *stylised/medium-shot*, not close-up photoreal.

3. **`knockout.py` is the WRONG tool for a character.** Its border-connected flood-fill bleeds
   into white-on-white edges (shirt/hair touching the backdrop), can't soft-matte hair, and
   flickers per-frame. Keep it for diorama stills; use **BiRefNet via rembg** (continuous alpha +
   FFmpeg per-frame video mode) or Higgsfield `remove_background` for characters.

4. **Transparent video on the web = ship TWO files** — HEVC-alpha (`.mov`, Safari) FIRST + VP9-
   alpha (`.webm`, Chrome/FF), let the browser pick. Exact 2-pass ffmpeg recipes captured
   (JakeArchibald). Real pain: Android-Chrome/Firefox quirks, videotoolbox double-size. **A 3D
   rig sidesteps the entire codec war** — three.js renders on a native transparent canvas, no
   matting, no dual-encode.

5. **Two clean paths by identity-hardness:** stylised single hero loop → **AI-video (Veo i2v +
   Ingredients → BiRefNet matte → dual-codec loop)**; turntable/walk/scroll-pose of a
   recognisable character → **generate-once + rig (Mixamo/RPM/three.js, transparent canvas,
   scrub or loop)**. `scrub-engine.js` needs a new first-class **loop** mode alongside scrub; the
   encode pipeline needs an **alpha branch**.

## Unresolved questions
- Does the **gflow-cli / Flow automated path** expose Ingredients (multi-ref) at all, or is it
  Flow-UI / Vertex-API only? (Same open Q as the world report — our CLI consistency lever may be
  refs-in-UI + preamble only.) Needs an in-product check.
- **Higgsfield `generate_3d`** mesh quality for a *riggable* character (clean topology, separable
  limbs) is unverified — is the image→GLB good enough to drive Mixamo, or Blender-cleanup-heavy?
  Budget one real run.
- No source gives a hard **max coherent i2v length** for a moving *character* on white bg before
  identity degrades — needs one gflow/Veo test (mirrors the world report's open length question).
- **BiRefNet per-frame temporal stability** on AI-video (does the matte edge still shimmer across
  frames even with soft alpha?) — may need a temporal-consistency pass (optical-flow-guided) we
  don't yet own. Test before committing the AI-video-character path to production.
