---
id: scroll-cinema-direction
description: "Directing a scroll-scrubbed camera flight — architecture choice, seam physics, the scrub-encode floor, and the phone floors a ported engine must keep."
when: [scroll-cinema, scroll-scrub, camera-flight, video-scrub, flythrough, seam, currenttime, diorama]
---

# Scroll-Cinema Direction — the scrubbed camera flight

## Purpose

Direct a page whose hero is a **pre-rendered camera flight scrubbed by scroll**: the visitor
scrolls, `video.currentTime` follows, and the camera travels through a world without a cut.

## Mental Model

**The seam is the product.** A scroll-cinema is a chain of separately rendered clips
pretending to be one take, and every judgement below exists to keep that pretence intact.
A viewer never notices a good seam and never forgives a bad one — a single frame of
mismatch, or one moment where the camera appears to reverse, collapses "I am flying
through a place" into "I am watching clips play".

Two different continuities have to hold at every join, and they fail differently:

- **Position continuity** — the next clip must *start on the frame the previous one ended
  on*. Break it and you get a **pop**.
- **Velocity continuity** — the camera must not *reverse direction across a join*. Break it
  and you get a **rewind stutter**, even when every frame matches perfectly.

Position is a mechanical problem with a mechanical fix. Velocity is an architecture
decision you make before generating anything, and it cannot be repaired in the encode.

## When to Use / When NOT

**Use** this file when a brief calls for a scroll-driven flight, a "fly through the world"
hero, a diorama tour, or any surface where scroll position drives video time.

**Do NOT** use it for scroll-triggered *reveals* — copy fading in, elements entering — that
is `motion-craft.md`'s ladder at **T3** (CSS scroll-driven animations, zero bytes) or **T5**
(GSAP ScrollTrigger). A scrubbed flight sits at **T6: authored assets**, alongside
`canvas-effect-direction.md`, and carries T6's cost: megabytes of rendered video, a
generation budget, and a hard reduced-motion obligation. **Reachable only after the ladder
actually selects T6 and the persona's motion cap allows it.** Reaching for a flight because
it looks impressive, when a T3 reveal would carry the same meaning, is the failure this
gate exists to prevent.

This file directs; it does not generate. `knowledge/gflow-hand.md` covers making the legs
through the gflow hand, and `asset-production-orchestration.md` §2 owns identity-lock —
the byte-identical style preamble that keeps every scene recognisably the same world.

## Content

### Architecture — choose before generating a single clip

Two shapes. The choice is aesthetic, and it is irreversible without re-rendering.

**A · Continuous forward take — the default.** One camera that only ever glides forward,
first scene to last. Each leg starts from the **previous leg's actual last frame**, and the
legs *are* the journey — there are no connectors. Every seam is frame-identical and the
camera never reverses.

**B · Dive-in plus connector — diorama only.** A dive into each scene, then a connector that
pulls up and out and flies to the next. The pull-out **reverses direction at every seam**.
In a miniature or god's-eye world that reads as intentional — zoom out to the map, fly to
the next island. In a grounded walkthrough it reads as a rewind.

**ALLOWED:** B for map-like, miniature, deliberately god's-eye worlds.
**NOT ALLOWED:** B for a grounded first-person walkthrough. **When in doubt, choose A** — A's
failure mode is "less spectacular", B's is "broken".

Architecture A also forbids one specific instruction: **do not aim a leg at an end-frame of
a wide establishing shot.** Asking the model to arrive at a wide shot forces the camera to
pull back to reach it, which reintroduces exactly the reversal A exists to avoid. Steer the
destination with the prompt, not with an end-frame.

### Camera grammar — "forward only" is the SEAM rule, not the LEG rule

A common misreading turns architecture A into a boring straight push. It should not be.

- **Across a seam** the camera must never reverse. This is absolute.
- **Inside a leg** the camera is free. One leg is a single continuous render, so there is
  no seam to break mid-clip: orbits, crane-ups, lateral tracking, a push-in that eases back
  out — all safe.

What makes the freedom safe is a **motion handoff contract**, and it must hold in both
directions or the seam breaks:

> Every leg **ends** by settling into a slow, steady forward drift toward the next
> destination. Every leg **begins** by continuing that same drift.

Choose the mid-leg move from the concept's own logic — a slow half-orbit around a hero
object for product work, a steadicam glide through doorways for space, a crane-up where the
architecture opens. A move that expresses the subject beats a move that merely advances.

### Generator selection — capability, not preference

A model qualifies for a chain **only if it can frame-lock a seam**: it must accept a start
image, and connectors additionally need an end image. A model whose media inputs are
*reference-only* can condition a generation but cannot continue a shot — it is physically
incapable of holding a seam, whatever its output quality.

**Use ONE model for the entire chain.** Each renderer carries its own motion, colour and
grain character. Mixing models preserves *position* continuity — the frames still hand off —
but the character shift reads as a subtle pop that is hard to diagnose precisely because the
frames match. If a content filter blocks one stubborn clip and a second model is the only
way through, accept the character shift on that single clip and say so; a slight shift on
one connector behind a crossfade beats a missing connector. Never silently swap models to
save budget.

Honour a stated model preference **only if the model qualifies**. If it does not, say so and
use one that does — never ship a non-seamless build to satisfy a model request.

### Seam mechanics

Extract the **actual rendered last frame** of the previous clip and use it as the next
clip's start. Never use the scene still, and never a frame grabbed at a rounded timestamp:
the still is what you asked for, the last frame is what the model produced, and the gap
between them is the pop.

### The scrub-encode floor

Two things are routinely gotten backwards.

**1 · Seekability, not keyframe density, is what makes scrubbing work.** Many static hosts
do not serve HTTP byte-range requests, which pins `video.seekable` to `[0,0]` and clamps
every seek to frame 0 — the video looks frozen while the code looks correct. Fetch each clip
as a **Blob and play it from an in-memory object URL**; blobs are always fully seekable.
Because of that, all-intra encoding is **NOT** required.

**2 · Do not trade quality for smooth seeks.** All-intra bloats clips several-fold for no
scrubbing benefit once blobs are in play.

| Knob | Value | Why |
|---|---|---|
| Resolution | native — do not downscale | video is already softer than the stills |
| `-crf` | ≤ 20 | above this the softness compounds |
| GOP | small (`-g 8`), not all-intra | cheap seeks at a fraction of the bytes |
| Audio | stripped (`-an`) | a scrubbed clip never plays sound |
| `-movflags` | `+faststart` | the index must precede the payload |
| Sharpening | light `unsharp` | counters render softness for free |

Encode every clip in the chain with the same settings — uniform quality is part of the
one-take illusion.

**Do not retype this table into ffmpeg.** `ui scrub-scaffold <dir>` emits `build-assets.sh`
carrying every knob above, plus the poster leg; `ui scrub-lint <file.mp4>` checks the result.
The two read their numbers from one definition in the binary, so the command that produces
the floor and the check that enforces it cannot drift apart. Retyping the table is how a
project ends up with one clip at `crf 23` that reads as a cut.

**Mobile is a native portrait chain, not a crop.** A 16:9 clip on a tall phone shows only
its centre. Render 9:16 natively; encode narrower (~720 wide) with a **tighter GOP**, because
a phone decoder's seek cost scales with GOP length. A centre-crop is a **fallback only** — and
shipping one must be **called out to the user, never silent**.

### The phone floors a ported engine must keep

These are not optimisations. Each one is a bug that only appears on a real device, and a
port that drops them ships broken to phones while passing every desktop check:

- **Coalesce seeks.** Never issue a new `currentTime` while the decoder is still seeking; a
  fast flick otherwise queues seeks until the clip freezes.
- **Keep the poster until the clip paints.** iOS Safari will not paint a seeked frame on a
  muted video that has never played. Hiding the still on `loadedmetadata` yields a black
  scene on iOS while desktop looks perfect.
- **Keep `muted` and `playsinline`.** Stripping either turns the clip into a blank box on
  iOS, or hands the phone a fullscreen takeover.
- **Ignore height-only resizes.** The mobile URL bar showing and hiding fires `resize`; a
  handler that re-runs layout on it makes the page jump while the user scrolls. Gate on a
  width change and keep the orientation path.
- **Respect safe areas.** Use `env(safe-area-inset-*)` for bottom copy **and** ensure the
  viewport meta carries `viewport-fit=cover` — the insets resolve to zero without it, so the
  code looks right and the copy still sits under the home indicator.
- **Honour `prefers-reduced-motion`.** A scroll-driven flight is continuous camera motion —
  the tier's floor is not optional here. Reduced motion gets a settled state that still
  carries the content: the poster stills and the copy, without the scrub.

### QA the seams — the step most likely to be skipped

- Screenshot just before and just after **each** seam. The pair must be near-identical. If
  they pop, the join used a still rather than a real frame, or the crossfade band is too
  short.
- Confirm `video.seekable.end(0) > 0` — if it is zero, blob loading is not working and every
  seek is silently clamping to frame 0.
- Confirm `currentTime` actually tracks scroll across each clip's band, not just at the ends.
- Check the console. A scrub page that throws on one clip usually still *looks* alive,
  because the neighbouring clips keep painting.

### The machine floor — what `ui taste-lint` decides for you

Three of the floors above are decidable from static source, so they are checks rather than
advice. They run inside `ui taste-lint <file.html>` on the Motion axis, at error severity.

| checkId | Fails when |
|---|---|
| `video-scrub-no-reduced-motion` | scroll drives `currentTime` and nothing in the document branches on `prefers-reduced-motion` |
| `video-scrub-attrs` | a scrubbed `<video>` is missing `muted` or `playsinline` |
| `safe-area-viewport-fit` | `env(safe-area-inset-*)` is used without `viewport-fit=cover` in the viewport meta |
| `video-poster-missing` *(warning)* | a scrubbed `<video>` has no `poster` to hold while the clip loads |

The first two are gated on **real scrub wiring** — a `currentTime` assignment *and* a scroll
source — so an ordinary page with a decorative video stays silent. The third is not gated:
that trap belongs to any page reaching for safe areas.

**The encoded clip has its own checker.** `ui scrub-lint <file.mp4>` reads the container —
an ISO-BMFF box walk, no decoding and no ffmpeg — and enforces the encode floor directly:
`scrub-no-faststart` (moov after mdat), `scrub-has-audio`, `scrub-gop-too-long`,
`scrub-no-video`. Point it only at a clip that will be **scrubbed**: a playback video is
correctly encoded with long GOPs, and no heuristic can tell the two apart, since both are
silent and both are faststart.

Its emitter is `ui scrub-scaffold` — the pair named above. A floor with only a checker tells
you at render time what a command could have gotten right the first time.

**What this floor CANNOT see.** `taste-lint` reads one HTML file. A production scroll-cinema
keeps its engine in an external `scrub-engine.js`, and **none of the scrub checks reach it** —
measured against this skill's own standalone template, where all three stay silent because
the page contains no inline `currentTime` and no `env(safe-area-inset-*)`. A clean run means
"nothing wrong in this file", never "the flight is sound". Everything above about
architecture, seams and camera grammar is judgment no static check can make.

## Failure Modes

- **Choosing architecture B for a grounded walkthrough.** The most expensive mistake here:
  it is invisible in stills, obvious in motion, and unfixable without re-rendering every
  connector.
- **Seaming from the scene still instead of the rendered last frame.** The still is what was
  requested; the frame is what exists. Every seam built on the request pops.
- **Reading "forward only" as "no camera movement".** Produces a flat push-in through the
  whole film and wastes the one technique that makes the format worth its megabytes.
- **Swapping models mid-chain to save budget.** Position continuity survives, so the frames
  match and the pop looks like an encoding fault — the hardest class of bug to trace.
- **Fixing a frozen scrub by re-encoding.** Frozen almost always means `seekable=[0,0]`, a
  transport problem. All-intra "fixes" it by accident on some hosts while multiplying file
  size, and still fails on the hosts that matter.
- **Porting the engine and dropping the phone floors.** Each floor guards a device-only
  failure, so a port passes desktop review and ships black scenes to iOS.
- **Shipping a centre-crop as the mobile version without saying so.** The user sees a
  cropped world and assumes that is the design.
- **Skipping seam QA because the film looks right while scrolling by hand.** A slow manual
  scroll hides exactly the stutter a real visitor's flick exposes.

---

> Distilled from the `scroll-world` field skill, captured 2026-08; generator-specific
> pipeline (model flags, prompt templates, batch scripts) stays with that skill. Proven on
> the spec-021 pilot (studio repo: `specs/021-scrollworld-gflow-video-track`).
