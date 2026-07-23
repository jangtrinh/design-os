# PHASE 3 SYNTHESIS — generalize scroll-world into a design:os workflow family

Opus synthesis of MASTERY.md (world, proven) + research/product-scroll.md + research/character-white-bg.md.
This is the INPUT to Fable's direction ruling (architecture) — not the final spec.

## The unifying insight
All three are the SAME shell (scroll drives a pre-rendered cinematic, quiet chrome over it) with a
**profile** that swaps four axes. The axes fall out of the three topics:

| Axis | World (proven) | Product | Character |
|---|---|---|---|
| **What moves** | camera over static scene | camera over static product | subject moves, camera static |
| **Camera arch** | forward seed-chain, NO end-frame | keyframe-anchored (orbit A→A / explode A→B), end-frame REQUIRED | none (subject animates) |
| **Background** | immersive full-bleed | solid / white | white / transparent |
| **Renderer** | `<video>` currentTime scrub | **image-sequence on `<canvas>`** (Apple; crisper, mobile-safe) | alpha `<video>` (dual-codec) OR 3D rig (three.js) OR loop |
| **Identity lock** | master-still neighbour-ref | master-product-ref every gen | 3-view DNA sheet → Flow Ingredients, or 3D rig |
| **Playback** | scrub | scrub | **loop** (new) or scrub-pose |
| **Alpha** | no (opaque, knockout.py ok) | maybe (solid bg) | **yes** — BiRefNet matte + HEVC-alpha(.mov)+VP9-alpha(.webm) |

## What REUSES wholesale (the shell)
gflow/Codex generation hand · consistency-lock discipline (master ref + frozen scaffold + GATE) ·
copy/nav/theme/linger/route/reduced-motion shell · design:os UI layer (persona/claymorphism).

## What is genuinely NEW (must be built)
1. **Second render backend: image-sequence-on-canvas** (product turntable; `<video>` scrub is wrong for crisp product). ~40-line GSAP-style `drawImage(frames[round(p·N)])` + staged preload + WebP q80 + device frame-counts.
2. **Loop playback mode** in the engine (character idle/turntable — not scroll-scrubbed).
3. **Alpha branch** in encode (BiRefNet matte → dual-codec transparent video) + swap knockout.py (wrong for character: bleeds white-on-white, flickers).
4. **Camera-arch switch in the generator**: forward seed-chain (archA_driver, built) vs keyframe-anchored (flythrough_hand, built) — pick by profile. Both already exist.
5. **Profile registry** — a `{motion, camera_arch, background, renderer, frame_source, identity_lock, playback, alpha, frame_density}` table that drives brief→gen→encode→wire.

## OPEN QUESTIONS FOR FABLE (direction)
1. **One skill with profiles, or a family?** e.g. one `es-scroll-cinematic` skill with world/product/character profiles, VS keep `scroll-world` as-is + add `es-product-scroll` + `es-character-hero` siblings, VS a thin shared core + 3 thin topic skills. (Reuse says one core; discoverability/skill-scope says maybe siblings.)
2. **Extend scroll-world's engine, or new engine?** Add canvas-image-seq backend + loop + alpha to `scrub-engine.js` (one engine, more surface) VS a second engine for the image-sequence path. Risk: bloating a clean engine vs duplicating scroll logic.
3. **MVP profile order.** Which topic to build+prove SECOND after world? Product (image-seq canvas, keyframe-anchored — most reuse of existing hand) or Character (alpha + identity — highest new-capability, but codec pain)? Recommend Product (lower risk, both generators exist).
4. **How much to abstract now vs after 2nd proof?** YAGNI: build the profile table only for {world, product} first, add character axis after one real product run — or design all three axes up front? (es-lazy leans: generalize on the 2nd instance, not the 1st.)
5. **Where does this live** — stays in `specs/021` as a track, or graduates to a design:os skill/CLI command now?

## Recommendation (Opus, for Fable to rule on)
- ONE core engine extended minimally (canvas backend + loop + alpha are additive, gated by profile) — avoid duplicating scroll/blob/seam logic.
- Build order: world (done) → **product** next (both generators exist, only new piece = canvas backend; lowest risk) → character last (new alpha+identity capability).
- Generalize the profile table on the SECOND instance (product), not speculatively for all three (es-lazy). Character axis added when built.
- Graduate to an `es-scroll-cinematic` skill once product is proven (2 topics = a real pattern, per librarian recurrence gate).
