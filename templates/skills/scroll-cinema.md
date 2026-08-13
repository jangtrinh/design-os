---
description: "Direct a scroll-scrubbed camera flight — choose the architecture before generating anything, keep every seam frame-identical and never reversing, and hold the scrub-encode and phone floors. Use when scroll position drives video time; do not use for scroll-triggered reveals, which are the motion ladder's T3 or T5, and not before the ladder actually selects T6."
---

# Skill: Scroll Cinema

Use this skill when a brief calls for a **scroll-scrubbed camera flight** — a "fly through
the world" hero, a diorama tour, any surface where scroll position drives `video.currentTime`.

Do NOT use it for scroll-triggered *reveals* — copy fading in, elements entering. Those are
`motion-craft.md`'s **T3** (CSS scroll-driven, zero bytes) or **T5** (GSAP ScrollTrigger).
A scrubbed flight is **T6: authored assets** and costs megabytes of rendered video plus a
generation budget. Reach it only when the ladder selects T6 and the persona's motion cap
allows it.

## Read

1. Read `knowledge/motion-craft.md` first to place the brief on the ladder. **Stop there when
   T1–T5 suffices** — a flight that a T3 reveal could have carried is the expensive mistake.
2. Read `knowledge/scroll-cinema-direction.md` — architecture, seam physics, camera grammar,
   the scrub-encode floor, the phone floors, and seam QA.
3. Read `knowledge/gflow-hand.md` when generating the legs through the gflow hand.
4. Read `knowledge/asset-production-orchestration.md` §2 for identity-lock — the byte-identical
   style preamble that keeps every scene the same world.

## Do

1. **Choose the architecture before generating a single clip.** Continuous forward take (A)
   by default; dive-in plus connector (B) only for a miniature or god's-eye world, because B
   reverses camera direction at every seam. The choice is irreversible without re-rendering.
2. **Pick one generator for the whole chain**, and only one that can frame-lock a seam. A
   reference-only model cannot continue a shot, whatever its output quality. Mixing models
   preserves frame handoff but shifts render character — a pop that looks like an encoding bug.
3. **Seam from the actual rendered last frame**, never the scene still.
4. **Encode to the floor**: native resolution, `crf ≤ 20`, small GOP, audio stripped,
   faststart, light sharpening. Serve clips as blobs so seeks are not clamped by a host that
   refuses byte ranges. Mobile is a native portrait chain — a centre-crop is a fallback and
   must be called out, never shipped silently.
5. **Keep the phone floors** if you port or adapt the engine: coalesce seeks, hold the poster
   until the clip paints, keep `muted` and `playsinline`, ignore height-only resizes, honour
   safe areas with `viewport-fit=cover`, and branch on `prefers-reduced-motion`.
6. **QA the seams.** Screenshot before and after each one; confirm `seekable.end(0) > 0` and
   that `currentTime` tracks scroll across each band. Run `ui taste-lint` on the page — it
   decides the three floors it can see, and nothing about the flight itself.

## Report

Name the architecture chosen and why, the generator used for the chain, and the seam QA
result per join. If a centre-crop shipped instead of a native portrait chain, or a clip came
from a second model, say so — both are visible to the user and neither should be discovered.
