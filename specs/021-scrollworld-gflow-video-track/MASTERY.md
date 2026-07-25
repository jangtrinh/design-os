# MASTERY — scroll-world, distilled (Phase 1 done)

What actually makes a scroll-scrubbed fly-through SMOOTH. Learned by getting it wrong twice
(keyframe-anchored "lạc quẻ") then following the repo. These are the load-bearing rules.

## 1. Camera architecture is TOPIC-DEPENDENT (the meta-rule)
- **Immersive world fly-through** → **Architecture A** (continuous forward take).
- **Product** (orbit 360 / explode) → **keyframe-anchored** (`--end-frame`): orbit is bounded A→A, explode A→B — the end-frame is load-bearing here, not harmful (product-scroll research).
- **Character on white bg** → static camera, moving subject → not a camera arch at all; identity-lock + alpha + a **loop** playback (character research).
- Fable's keyframe ruling wasn't wrong universally — it was wrong for a *world*, right for a *product*. There is no single camera law; branch on what moves.

## 2. World fly-through = Architecture A, NEVER keyframe-anchored
Each leg's `--initial-frame` = the **PREVIOUS leg's ACTUAL last frame** (ffmpeg `-sseof -0.08`), **NO `--end-frame`**. Why keyframe-anchored fails: locking two *different* establishing stills as endpoints makes the seam **velocity discontinuous** — frames can match at the seam yet the motion lurches ("lạc quẻ"). Research confirmed the mechanism: two endpoints too far apart → soft/warping/identity-drift midpoint. The seed-chain gives frame AND velocity continuity.

## 3. Motion-handoff contract in every leg prompt (verbatim clauses)
"…**Continue the same slow, steady forward glide.** [mid-leg move]. …**In the final second, settle back into a slow, steady forward glide toward [next scene].**" Every leg begins and ends in the same forward drift → velocity continuous across seams in BOTH scrub directions (scroll is a scrubber; users scroll up too).

## 4. Never reverse the camera ACROSS a seam
Reversals are safe INSIDE one leg (single render, no seam). Fatal across a seam (reads as rewind). This is why Architecture B (dive + pull-out aerial connector) stutters when scrubbed backward — avoid it except for true archipelago worlds.

## 5. Seams are frame-locked BY CONSTRUCTION; QA them
leg_N last frame == leg_{N+1} first frame (the seed). Measure boundary-frame mean-abs-diff — MATCH is <8/255 (we hit 2.2–2.4). Section **poster = each leg's FIRST frame**, not the design still (so poster→video paint is seamless). Scrub both directions headless; confirm no visible velocity reversal.

## 6. Download-decouple for reliability (our gflow reality)
The CLI inline download throws `error_unhandled` on flaky renders and strands the credit (hit it on leg0). Use the client boundary: `generate_video(download=False)` → `download_video(media_id)`. Seed-chain is inherently SEQUENTIAL (each leg needs the prior's rendered frame) so submit-all-then-collect doesn't apply — but per-leg decouple still saves stranded credits. Driver: `es-gflow/references/archA_driver.py`.

## 7. Encode + engine for scrubbing
- Blob-seek engine (fetch clip → object URL) — `python -m http.server` doesn't serve byte ranges, so `<video>.currentTime` clamps to frame 0 without blobs. The scroll-world engine already does blob-seek.
- Encode: native res + `unsharp=5:5:0.8` + `crf 20` + `-g 8` + `+faststart` (repo Step 6). Small GOP scrubs fine via blob; all-intra just bloats.
- `<video>`-currentTime scrub = right for the immersive world film. A crisp product turntable wants **image-sequence on `<canvas>`** instead (Apple's method) — a second render backend, Phase 3.

## 8. Tiers + gates
veo-fast = draft (soft, proves smoothness cheap) → veo-quality = final (same seed-chain, re-run from st1). Stills first (Codex neighbour-referenced one-world) + **human GATE before any video credit**; drift iteration lives in the zero-credit still tier, not the video tier.

## The pipeline that works (world topic)
```
scene beats + ONE camera path → master still → neighbour-referenced one-world stills (Codex) → GATE
→ Architecture-A forward chain (archA_driver: leg0 from still1; each next = prev leg's real last frame,
   NO end-frame, motion-handoff prompt) → download by media_id → extract seeds
→ encode (unsharp+crf20+g8) · posters = leg first-frames → scrub-engine (connectors:[], crossfade ~0.08)
→ seam QA (boundary diff <8 + scrub both ways) → veo-quality re-render → ship
```

## 9. The DRIFT ↔ SMOOTHNESS tradeoff (surfaced live, needs an owner taste-call + one test)
Architecture A is smooth but **integrates art-direction error**: each leg seeds from the previous
leg's rendered last frame, so the clean isometric-clay look degrades hop-by-hop (by leg2 the
veo-quality re-run drifted to blur + lantern-heavy, off-style). Keyframe-anchored is the inverse:
on-style (every segment anchored to a designed still) but seam-velocity jerks ("lạc quẻ"). **Neither
pure approach wins.** Observed this pilot: the veo-FAST forward-chain draft actually read MORE
on-style than the veo-quality re-run (seed-chain is stochastic; that quality run drifted worse) —
so "veo-quality is always better" is false for a seed-chain.

**Proposed resolution (HYBRID — not yet tested, gated on owner + credits):** Architecture A
forward-glide (start-image = prev last frame, smooth) **+ feed the master style still as a Flow
Ingredient / reference image on every leg** to hold the art direction WITHOUT locking an end-frame
(the thing that caused the jerk). Research finding #4: Flow Ingredients-to-Video takes up to 3 refs
to hold world/style across shots. **Mechanism confirmed at the DTO level (260722):** the gflow CLI
SPLITS them (`i2v` = start-frame only, no `--ref`; `r2v` = `--ref` ingredients but no start-frame),
BUT `GenerateVideoRequest` carries BOTH `start_image` AND `reference_images` fields, and the i2v
`generate_captured` log exposes a `referenceIds:[]` slot — so the HYBRID = extend `archA_driver` to
set BOTH `start_image=prev_last_frame` AND `reference_images=(master_style_still,)` on one request.
**RESOLVED (260723, one credit): the combo is FORBIDDEN.** `GenerateVideoRequest.__post_init__`
raises *"I2V request must not carry reference_images, ref_names, or reference_entities"* — Flow splits
i2v (start-frame continuity, drifts) and r2v (reference ingredients, NO start-frame → no forward seam)
into mutually exclusive modes. You get EITHER continuity OR style-anchoring per clip, never both.
So the forward-glide + Ingredient-ref hybrid is a DEAD END via gflow. **Drift mitigation is therefore:
(a) shorter legs (less drift per hop), or (b) periodic re-anchoring** — every Nth leg starts from a
fresh designed still, accepting ONE seam there (a keyframe-anchored seam inside a mostly-forward chain).
The "Ignition & Rise" finale fell back to pure i2v and its aerial re-synthesis held palette acceptably
(dream-logic aerial is fine for a finale), so re-anchoring wasn't needed there.

**Standing decision for now:** keep the veo-fast forward-chain draft as the current best (smooth +
acceptably on-style); do NOT ship the drifted veo-quality; the hybrid is the next video experiment,
owner-gated. Smoothness (the original complaint) is FIXED; art-direction fidelity across a long
forward-chain is the remaining lever.
