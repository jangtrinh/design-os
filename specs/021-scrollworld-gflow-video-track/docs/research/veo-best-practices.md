# Veo 3 / 3.1 best-practices — for the scroll-scrubbed fly-through world

Research date: 2026-07-22. Scope: HIGH-QUALITY Veo output for a **continuous
camera-flies-through-a-diorama-world** landing page, driven via **Google Flow**
(image-to-video, first-frame + optional first+last-frame interpolation). Sources ranked
SOURCE-grade first (official Google docs, real repos w/ stars) over blog-spam.

> Our stack already encodes the seam laws: local skills `scroll-world`
> (`~/.claude/skills/scroll-world/`) and `es-gflow`. This report is external corroboration
> + the canonical origins of the scaffolds we already use, + the evidence for/against the
> end-frame-pull-back claim. Read those two skills first — they are more specific to us
> than anything below.

---

## 1. Ranked repos / tools / official guidance

| # | Name | URL | What it gives us | Relevance | Grade |
|---|------|-----|------------------|-----------|-------|
| 1 | **Google Cloud — Ultimate prompting guide for Veo 3.1** (official) | https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-veo-3-1 | Canonical **5-part scaffold** `[Cinematography]+[Subject]+[Action]+[Context]+[Style & Ambiance]`; **First-and-Last-Frame** transition method; **Ingredients-to-Video** (up to 3 reference imgs for world/character consistency); **timestamp prompting** for multi-shot single-generation; camera-vocab table | HIGHEST — this is the source of the scaffold we use, plus the two features our chain depends on (i2v, first+last) | Official |
| 2 | **Vertex AI — Video generation prompt guide** (official docs) | https://cloud.google.com/vertex-ai/generative-ai/docs/video/video-gen-prompt-guide | Same 5-part formula, canonical camera/lens term list, negative-prompt guidance, resolution/aspect params | HIGH — authoritative term list Veo actually responds to | Official (SPA; content mirrored in #1) |
| 3 | **snubroot/Veo-3-Prompting-Guide** | https://github.com/snubroot/Veo-3-Prompting-Guide | 10+ camera-movement library, 200+ templates, **character-consistency framework** (physical-description templates), 7-part "2025 Pro Format", negative-prompt/technical slot | HIGH — best-organized open camera + consistency reference | ~314★, updated 2025-07 (v5.0) |
| 4 | **Replicate — How to prompt Veo 3.1** | https://replicate.com/blog/veo-3-1 | Practical i2v + first+last interpolation walkthrough; reference-image character consistency ("place a character in different scenarios"); camera/lens vocab | MED-HIGH — clearest practitioner take on the interpolation feature | Vendor eng blog |
| 5 | **veo3ai.io — Frames to Video guide (2026)** | https://www.veo3ai.io/blog/veo-3-1-frames-to-video-guide-2026 | The one source that documents **first+last FAILURE MODES** (warp / soft dissolve midpoint / identity drift) and the QA ritual (inspect the midpoint frame) | HIGH for our claim-test — see §3c | Blog, but the only failure-mode source |
| 6 | **shijincai/veo3-prompt-generator** | https://github.com/shijincai/veo3-prompt-generator | Web tool: style presets + cinematography controls, JSON/Markdown export of Veo prompts | MED — scaffold generator, not knowledge; useful to bulk-emit leg prompts | GitHub tool |
| 7 | **geekjourneyx/awesome-ai-video-prompts** | https://github.com/geekjourneyx/awesome-ai-video-prompts | Curated index: official guides, cinematic-language shot types, audio-visual sync, cross-tool (Veo/Sora/Kling/Runway) | MED — jump-off list, thin on Veo specifics | ~67★, low commit count |
| 8 | **aliswl20/Veo-3-Json-Prompt-** | https://github.com/aliswl20/Veo-3-Json-Prompt- | JSON-structured Veo prompting approach | LOW-MED — structured-prompt pattern only | GitHub, small |
| — | invideo / clixie / modelslab comparisons | see §5 | Veo-vs-Kling-vs-Runway-vs-Sora consensus on seamless camera work | Context for model choice | Blog roundups |

**The `[Cinematography]+[Subject]+[Action]+[Context]+[Style]` scaffold is GOOGLE-CANONICAL.**
Its authoritative form (from #1/#2) is five parts:
`[Cinematography] + [Subject] + [Action] + [Context] + [Style & Ambiance]`.
snubroot (#3) extends it to a 7-slot version by splitting out **Dialogue**, **Sounds**, and a
**Technical/negative** slot — irrelevant for us (silent clips) except the negative slot.

---

## 2. Techniques that apply to our fly-through

### a) Continuous / seamless multi-scene camera flight

- **Timestamp prompting = a whole multi-shot sequence in ONE generation** (official #1). Format:
  `[HH:MM-HH:MM] [Cinematography] of [Subject], [Action]. [Context]. [Style/Emotion].`
  Google's own example strings 4 beats (00:00→00:08) into a single continuous take. **This is
  the highest-leverage native tool for our dive-in shots** — one 8s clip can carry
  establish→descend→push-in→settle without a seam, exactly our "fly into the scene" beat.
  Source: cloud.google.com guide #1.
- **Prompt the camera as ONE unbroken move.** Our skill's contract clause ("Single continuous
  cinematic camera move, no cuts… continue the same slow, steady forward glide…") matches
  Google's continuity intent. Keep the open + close motion clauses verbatim across every leg —
  that identical phrasing is what makes legs hand off cleanly (scroll-world `prompts.md`).
- **Extend / scene-extension** for clips >8s (Replicate #4, veo3ai #5): Veo can lengthen a clip
  from its own final second. For us this is a fallback for a long dive; the primary chaining
  method stays frame-handoff (below), because Extend gives no control over where the next scene sits.
- **Frame-handoff chaining is the durable method** (our skill, corroborated by veo3ai #5's
  "chain multiple Frames-to-Video clips on a timeline"): render leg _i_, extract its **actual last
  frame** from the rendered mp4, feed it as leg _i+1_'s start image. Never chain off the still —
  chain off the rendered frame.

### b) Keeping ONE world / character / style consistent across shots

- **Ingredients-to-Video (up to 3 reference images)** is Google's dedicated consistency feature
  (#1): pass reference images of the scene/character/style and Veo holds the aesthetic across
  shots. Google's dialogue example reuses the SAME detective+office refs across cuts. **Use this
  to lock the diorama's palette/material across legs** where Flow exposes it.
- **Byte-identical style preamble** in every still prompt (our `scroll-world/prompts.md`): the
  literally-identical style sentence is what makes independent scenes read as one place. This is
  the cheapest consistency lever and it's ours, not Veo's — do it regardless.
- **Physical-description templates** for recurring subjects (snubroot #3): if a character/vehicle
  recurs, describe it with the same concrete attributes every prompt; reference-pronoun the
  subsequent shots. For a world (not a character) the equivalent is naming the same concrete props
  each leg (tanks, awning, string lights) — our skill already does this.
- **Do NOT pass a scene as an `--image` reference for photoreal interiors** — it clones the room
  (our skill's photoreal note). Consistency there comes from the identical preamble only.

### c) First-frame vs first+last-frame — WHEN the end-frame HURTS (the claim we're testing)

**Our claim:** _"for a continuous fly-through, locking a fixed end-frame forces the camera to pull
back = the #1 cause of stutter; forward-chaining from the previous clip's last frame (no
end-frame) is smoother."_

**Verdict: CONFIRMED in spirit, with a sharper mechanism.** The external evidence doesn't say the
end-frame literally commands "pull back", but it independently documents the same failure and the
same fix:

- **veo3ai.io #5 (the only failure-mode source):** locking two endpoints that are **too far apart
  in content**, or with a **vague motion prompt**, yields _"warping, a soft dissolve-y midpoint,
  identity drift, a blurry crossfade."_ That soft-dissolve midpoint IS the stutter/morph we see.
  Their fix is **closer endpoints + explicit motion/pacing prompt** — they do NOT recommend dropping
  the end frame, but a forward-only (start-only) clip is the limiting case of "closer endpoints"
  (there is no second point to interpolate toward, so there is no midpoint to dissolve through).
- **Replicate #4 / Eachlabs:** first+last is explicitly a **transition/transformation** tool —
  it interpolates A→B. When A and B imply opposing camera vectors (e.g. B is framed wider/further
  than the motion is traveling), the interpolation must reconcile them, and reconciliation across a
  large gap is exactly where warp/reverse appears.
- **Our own skill already bakes the resolution in** and it matches the claim precisely:
  - **Dive-in + architecture-A legs → START-IMAGE ONLY, no `--end-image`.** Forward glide, camera
    only ever pushes in / forward. (`scroll-world/prompts.md` §"Leg prompt", `pipeline.md` §2.)
  - **First+last (`--end-image`) is used ONLY for the aerial connector** — the pull-up-and-over
    between two scenes — where a defined landing frame is *desirable* and the motion is a genuine
    A→B traversal, not a forward push. (`pipeline.md` §4.)
  - Seam law: _"Reversals are safe INSIDE a leg… only a seam may never reverse"_ and _"check the
    last frame before chaining — a bad handoff frame poisons every leg after it."_

  **Actionable rule for us:**
  1. **Fly-INTO / forward-glide beats → start-image only.** No end frame. Let the camera commit to
     one forward vector; nothing to pull back toward.
  2. **Aerial transition / re-frame beats (rise up, cross the world, descend into next) → first+last.**
     Here the end frame earns its keep — but keep the two frames **close in world/lighting** and
     write the camera path **explicitly** ("smoothly pulls up and back out… rises… glides forward…
     arrives above… begins to descend") so Veo interpolates a path, not a crossfade.
  3. If a first+last clip stutters/morphs at the midpoint → the endpoints are too far apart OR the
     prompt is vague. **Fix by closing the gap or spelling out the move — not by adding more prompt.**

### d) Camera-motion vocabulary Veo actually responds to (official #1/#2 + snubroot #3)

Use these exact terms — Veo is trained on them:

- **Movement:** `dolly (in/out)`, `tracking shot`, `crane shot` (ascend/descend), `aerial view` /
  `drone shot`, `slow pan`, `tilt` (up/down), `orbit` / `arc shot` (e.g. "slow half-orbit"),
  `push-in`, `pull-back`, `handheld`, `POV shot`, `zoom`.
- **Composition:** `wide shot`, `establishing shot`, `medium shot`, `close-up`, `extreme close-up`,
  `low angle`, `high angle`, `worm's-eye`, `two-shot`, `reverse shot`.
- **Lens / focus:** `shallow depth of field`, `deep focus`, `soft focus`, `macro lens`,
  `wide-angle lens`, `rack focus`, `tilt-shift` (miniature — critical for our diorama look).
- **Pacing modifiers that read:** `slow, steady`, `smooth`, `graceful`, `subtle parallax`,
  `slow motion`. (These are exactly the ones our skill uses — good.)
- For our world specifically: `aerial view` + `crane-up reveal` + `tilt-shift miniature` +
  `subtle parallax` is the money combination.

### e) Resolution / quality knobs

- **Veo outputs 720p or 1080p; aspect 16:9 or 9:16; clip length 4/6/8s** (official #1). Google
  gives **no** quality-tradeoff guidance beyond that — 1080p is simply higher res.
- **Always request 1080p for the desktop master.** Then encode for scrubbing, don't upscale
  (`es-gflow` / `scroll-world/pipeline.md` §5): `crf 20`, tight GOP (`-g 8`, `sc_threshold 0`),
  light unsharp, `+faststart`, no audio. Encode **what ffprobe reports** — never upscale a 720p
  return to fake 1080p.
- **Quality comes from the SCAFFOLD, not a quality flag** — the 5-part structured prompt is what
  the guides call the lever for "consistent, high-quality results" (official #1). Vague prompt =
  vague output at any resolution.
- **Mobile scrubbing needs tighter GOP, not more pixels** (`pipeline.md` §6): 720p + `-g 4` (or
  `-g 1` all-intra) makes phone seeks cheap; seek cost scales with frames-from-keyframe.
- Timestamp/multi-shot prompts and Ingredients now carry **native audio** (#1) — irrelevant to us
  (we strip audio), but note Flow may spend the audio budget anyway.

---

## 3. Community consensus — Veo for seamless camera work + failure modes

- **Consensus: Veo 3 / 3.1 is the pick for seamless, photoreal camera work.** Roundups
  (invideo, clixie, modelslab, imagine.art) converge: Veo has "studio polish, camera physics,
  seamless transitions… reads as finished footage"; "scenes no longer break between cuts." Runway
  Gen-3 wins on iteration speed; Kling 3.0 competitive at lower cost. For a marketing hero where
  photorealism/coherence is non-negotiable, Veo is the recommendation.
  (invideo.io/blog/kling-vs-sora-vs-veo-vs-runway, clixie.ai, modelslab.com, imagine.art)
- **Our stack note:** `scroll-world`/`es-gflow` currently chain **Seedance / Kling** through
  Higgsfield, not Veo through Flow — because those expose `--start-image`+`--end-image` and flat
  Higgsfield billing. Veo via Flow is the QUALITY upgrade path; the seam laws port unchanged (the
  frame-handoff method is model-agnostic). Verify Flow exposes first-frame AND first+last before
  committing the chain — the whole architecture depends on it.
- **Known failure modes + fixes (aggregated):**
  1. **Soft-dissolve / morphing midpoint** on first+last → endpoints too far apart or vague motion
     prompt → close the gap, spell out the camera path (veo3ai #5).
  2. **Identity/logo/text drift across a bridge** → keep refs tight, use Ingredients for the
     recurring subject; never rely on the model to re-invent a logo (veo3ai #5). (For us: our
     preamble bans text/logos outright — good.)
  3. **Bad handoff frame poisons the chain** → QA every leg's LAST frame before generating the
     next; re-roll a leg whose end frame shows sideways motion blur or a half-finished orbit
     (`scroll-world/prompts.md`).
  4. **Reversal at a seam** → never let two chained clips imply opposing camera vectors at the
     join; forward-only within forward legs (our seam law, §2c).

---

## Bottom line for spec 021

1. **Scaffold every prompt** as `[Cinematography]+[Subject]+[Action]+[Context]+[Style & Ambiance]`
   (Google-canonical). It IS the quality knob.
2. **Forward legs → start-image only.** **Aerial transitions → first+last, close frames, explicit
   path.** This is our claim, and it's the correct read of how Veo's interpolation fails.
3. **Consistency = identical style preamble (ours) + Ingredients-to-Video reference images (Veo's).**
4. **Timestamp prompting** can pack a whole dive-in beat into one seamless 8s generation — try it
   for the fly-INTO shots.
5. **1080p master, encode-don't-upscale, tight GOP for scrubbing** — quality is prompt-structure +
   encode discipline, not a magic flag.

## Unresolved questions
- Does **Google Flow's** UI expose `first-frame` AND `first+last-frame` as separate modes, and does
  it let us feed an **extracted rendered frame** (not just a still) as the start image? The whole
  chain depends on it — must verify in-product. (gflow-cli via `es-gflow` may or may not surface both.)
- Flow billing: does a silent clip still spend the **native-audio** budget introduced in 3.1?
- Is **Ingredients-to-Video** available through Flow's automated/CLI path, or Vertex-API only? If
  only Vertex, our consistency lever on the gflow path is the identical-preamble method alone.
- No source gives a hard number on **max clip length before coherence degrades** for a pure
  camera-flight (no subject) — needs a real gflow test run (budget one per §"every phase budgets
  one run on real data").
