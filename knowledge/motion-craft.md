# Motion Craft — the animation decision ladder

Motion is persona-led: a data tool wants near-instant feedback, a marketing hero wants
orchestrated movement. This file is the **build contract** — it decides *which technology*
to reach for so capability never exceeds intent. Whether the result is *good* is graded
by `knowledge/taste-rubric.md` Axis 4 (Motion), the grading contract; read that for the
0–10 bands and do not restate its scoring numerics here. Pick the **lowest tier** on the
ladder that satisfies the brief, obey the floors at every tier, and never exceed the
persona's tier cap.

---

## The ladder (T1–T6)

Climb only as far as the intent demands. Each rung up costs bytes, a dependency, or a
compatibility caveat — earn it.

| Tier | Technology | Use for | Cost | When NOT |
|---|---|---|---|---|
| **T1** | CSS transitions & `@keyframes` | Hovers, focus, entrances, micro-interactions | Zero bytes | — (the default; always try first) |
| **T2** | View Transitions API | State/route/view swaps, shared-element morphs | Zero bytes; feature-guarded | Cross-document navigation |
| **T3** | CSS scroll-driven animations | Scroll narrative, progress, reveal — off main thread | Zero bytes; needs `@supports` guard | When the effect must be identical in Firefox today |
| **T4** | Motion **or** anime.js (CDN) | Orchestrated sequences, spring physics, stagger beyond CSS | One library (~pin a major) | Anything T1–T3 already covers |
| **T5** | GSAP + plugins (CDN) | Complex timelines, `ScrollTrigger`, `SplitText` text effects | One larger library | When a single tween would do — don't ship GSAP for a fade |
| **T6** | Authored assets — Lottie/dotLottie · WebGL | Hero loops, brand moments, empty states, ambient shaders | An asset + a player, or a WebGL scene | Anything 2D/CSS can express; unverified WebGL |

### T1 — CSS transitions & keyframes

**Use for:** hover/focus feedback, button presses, entrance fades/slides, accordions,
tooltips — the overwhelming majority of UI motion. **Cost:** zero bytes, zero
dependencies, GPU-composited when you animate the right properties. **This is the only
tier allowed without justification** — every variant starts here and stays here unless the
brief or persona explicitly reaches higher.

- `transition` for state changes (hover, focus, `.is-open`); `@keyframes` + `animation`
  for entrances and looping affordances (spinners, pulses).
- Directional easing: `ease-out` for enter/respond, `ease-in` for exit. Never `linear`
  for UI (reads mechanical) — reserve `linear` for genuinely constant motion (a spinner).
- Reduced-motion guard is a **CSS media query** (see Floors).

### T2 — View Transitions API

**Use for:** animating between two DOM states or views — a list→detail swap, a filtered
grid re-order, a shared-element (thumbnail→hero) morph — with the browser tweening the
before/after snapshots for you. **Cost:** zero bytes, same-document. **When NOT:** never
for cross-document navigation.

- Same-document View Transitions are **Baseline (Newly available since Oct 2025)** —
  Chrome 111+, Safari 18+, Firefox 144+.
- **Always feature-guard:** `if (document.startViewTransition) { … } else { /* apply
  state directly */ }`. The un-transitioned path must still be correct.
- Cross-document view transitions are Chromium-only — **do not use them**; ship the
  same-document form.
- Reduced-motion guard is a **JS check** before calling `startViewTransition` (see Floors).

### T3 — CSS scroll-driven animations

**Use for:** tying an animation's timeline to scroll position — progress bars, reveal-on-
enter, parallax — with **zero main-thread JS** (`animation-timeline: scroll()` / `view()`).
**Cost:** zero bytes, but a real compatibility gap. **When NOT:** when the effect must be
pixel-identical across every browser *today*.

- Supported in Chrome/Edge (2+ years) and Safari 26. **Firefox is still behind a flag**
  (152, Jun 2026).
- **Progressive enhancement is REQUIRED:** wrap the scroll-linked CSS in
  `@supports (animation-timeline: view()) { … }`. The un-enhanced experience (static, or
  a simple T1 entrance) must be **complete**, not broken — a degraded reveal is fine, a
  blank section is not.
- If the scroll narrative is load-bearing and must run in Firefox now, drop to **T5**
  (GSAP `ScrollTrigger`) as the JS fallback instead.
- Reduced-motion guard is a **CSS media query** (see Floors).

### T4 — Motion / anime.js via CDN

**Use for:** orchestration CSS can't express cleanly — spring physics, sequenced
timelines, stagger with per-item easing, animating along paths. **Cost:** one JS library
over a CDN. **When NOT:** anything T1–T3 already covers; a single hover tween never
justifies a library.

- **Pick ONE library per page** — never load both Motion and anime.js (mixing two JS
  animation engines is an anti-pattern).
- **Motion** (motion.dev, ex-Framer Motion) — independent vanilla-JS + React library with
  a hybrid WAAPI/JS engine. CDN pattern `https://cdn.jsdelivr.net/npm/motion@<major>`;
  **pin a major and verify its API surface per use** (the API moves between majors).
- **anime.js v4** (2024 rewrite) — free, GSAP-class performance, named-export API. CDN
  `https://cdn.jsdelivr.net/npm/animejs@4`.
- Reduced-motion guard is a **JS check** that skips (or collapses) the animation (see
  Floors + CDN recipes).

### T5 — GSAP + plugins via CDN

**Use for:** the heaviest choreography — long scrubbed timelines, `ScrollTrigger`-driven
scenes, `SplitText` per-character text reveals, `MorphSVG`/`DrawSVG` path work. Also the
**JS fallback for T3** when the Firefox scroll gap matters. **Cost:** one larger library
(plus plugins). **When NOT:** for a fade or a single tween — that's a T1/T4 job.

- **GSAP is 100% free since April 2025** (Webflow acquisition), **including all former
  Club plugins** — ScrollTrigger, SplitText, MorphSVG, DrawSVG, and the rest. No token,
  no licence gate.
- Load the core then each plugin from the same jsdelivr pattern
  (`…/gsap@3/dist/gsap.min.js`, `…/gsap@3/dist/ScrollTrigger.min.js`) and
  `gsap.registerPlugin(...)`.
- Reduced-motion guard is a **JS check** (see CDN recipes) — GSAP also exposes
  `gsap.matchMedia()` for a `(prefers-reduced-motion: reduce)` branch.

### T6 — Authored assets: Lottie/dotLottie · WebGL

**Use for:** the art-direction tier — hero loops, brand moments, celebratory
confirmations, characterful empty states (Lottie); immersive hero/ambient shader
backgrounds (WebGL). **Cost:** a designed asset + a runtime player, or a bespoke WebGL
scene. **When NOT:** anything 2D or CSS can express — WebGL for content that a gradient
and T1 handle is pure waste.

- **Lottie playback:** use the dotLottie web player (`@lottiefiles/dotlottie-web`, jsdelivr).
  Prefer the `.lottie` format over raw `.json` — it is ≈40–70% smaller.
- **Lottie authoring is an EXTERNAL hand.** The Text-to-Lottie framework
  (`diffusionstudio/lottie`, MIT) is an agent-driven generator that emits standard
  `lottie.json`. Treat it exactly as `knowledge/figma-agent-hand.md` frames the figma
  hand: an optional tool driven over Bash, **not** part of ease-design's deterministic
  `ui` binary and never bundled — the binary stays zero-network. Generate the asset with
  the external hand, then play it with the dotLottie CDN player.
- **Rive** is the strongest option for interactive/state-machine animation, but authoring
  requires the Rive editor — **import-only, not authorable here**; out of scope for
  generated variants.
- **WebGL** (three.js / OGL, loaded from the same jsdelivr npm pattern, pinning a major)
  is the shader/3D tier. **Model-written WebGL is hallucination-prone and is assumed wrong
  until seen working** — a WebGL scene MUST be **visually verified** (screenshot / export
  and look at it) before ship. Use sparingly.
- Reduced-motion guard is **pause + poster**: render a static frame (Lottie first frame,
  or a WebGL still) and do not autoplay when reduced motion is requested (see Floors).

---

## Persona motion target → tier cap

The persona's Motion target sets a **hard ceiling** on the ladder. The cap binds:

| Persona Motion target | Tier cap | Notes |
|---|---|---|
| **Low** (restrained) | **T1** | T2 allowed for essential view/state swaps; no JS animation libraries. |
| **Mid** | up to **T4** | T1 default; escalate to T2/T3/T4 only where the interaction earns it. |
| **High / expressive** | up to **T6** | Full ladder available; still pick the lowest tier that lands the effect. |

**Precedence — floors > brief > persona.** A low-motion persona never ships GSAP no matter
how the brief is phrased *by the model*; escalation above the cap requires the **user** to
ask for animation explicitly, at which point the brief wins over the persona. The floors
below win over both — no brief and no persona can waive a reduced-motion fallback or
license animating layout properties.

---

## Floors (every tier, non-negotiable)

These are the deterministic and doctrinal minimums. They apply at T1 as much as at T6.

- **Reduced-motion in EVERY tier.** Honor `prefers-reduced-motion: reduce`:
  - T1 / T3 → a **CSS media query** (`@media (prefers-reduced-motion: reduce) { … }`)
    that removes or near-zeroes animation/transition.
  - T2 / T4 / T5 → a **JS check** (`matchMedia("(prefers-reduced-motion: reduce)").matches`,
    or `gsap.matchMedia()`) that skips the animation and applies the end state directly.
  - T6 → **pause + poster**: no autoplay, render a static frame instead.
- **Animate `transform` and `opacity` only** — never layout properties
  (`width`/`height`/`top`/`left`/`right`/`bottom`/`margin`/`padding`). Layout animation
  reflows every frame and janks; transform/opacity composite on the GPU.
- **Durations by role:** UI/functional transitions **150–250 ms**; large or hero movement
  **400–800 ms**. Anything over ~400 ms on routine feedback reads as slow.
- **Stagger lists** by **20–60 ms per item** rather than animating all at once.
- **Directional easing:** `ease-out` for enter/respond, `ease-in` for exit; **never
  `linear`** for UI transitions.
- **`will-change` on ≤ 3 elements** at a time — it is a scarce hint, not a blanket class;
  over-applying it costs memory and can *hurt* performance.
- **Deterministic floor = `ui taste-lint`.** Four Motion checks fail the build and cannot
  be talked past: `linear-easing`, `transition-all`, `animation-no-reduced-motion`
  (animation/`@keyframes`/a T4–T6 library with no reduced-motion fallback anywhere), and
  `keyframes-layout-props` (a `@keyframes` block animating a layout property). Clearing
  them is necessary, not sufficient — the taste-rubric Motion axis still grades the rest.

---

## CDN recipes

One copy-paste-safe snippet per library tier, each with the reduced-motion guard **inline**.
Use only these pinned CDN patterns; pin a major and re-verify a library's API per use.

**T4 — anime.js v4 (or Motion) — entrance cascade with reduced-motion guard:**

```html
<script type="module">
  // Pick ONE library. anime.js v4 (named-export API — verify the current major):
  import { animate, stagger } from "https://cdn.jsdelivr.net/npm/animejs@4/+esm";
  // Motion alternative (pin + verify the major per motion.dev):
  //   import { animate, stagger } from "https://cdn.jsdelivr.net/npm/motion@<major>/+esm";

  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    animate(".card", {
      opacity: [0, 1],
      translateY: [12, 0],   // transform only — never top/margin
      delay: stagger(40),    // 20–60 ms per item
      duration: 400,
      ease: "out(3)",        // ease-out on enter
    });
  }
  // Reduced motion → do nothing; elements stay at their final CSS state.
</script>
```

**T5 — GSAP + ScrollTrigger (free, all plugins) — scroll reveal with guard:**

```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/ScrollTrigger.min.js"></script>
<script>
  gsap.registerPlugin(ScrollTrigger);
  gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
    gsap.from(".reveal", {
      opacity: 0,
      y: 24,                 // transform only
      duration: 0.6,
      ease: "power2.out",
      stagger: 0.04,         // 40 ms per item
      scrollTrigger: { trigger: ".reveal", start: "top 80%" },
    });
  });
  // Reduced motion → the matchMedia branch never runs; content is visible as authored.
</script>
```

**T6 — dotLottie player — hero loop, static poster under reduced motion:**

```html
<canvas id="hero-lottie" width="480" height="480" aria-hidden="true"></canvas>
<script type="module">
  import { DotLottie } from "https://cdn.jsdelivr.net/npm/@lottiefiles/dotlottie-web/+esm";
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  new DotLottie({
    canvas: document.getElementById("hero-lottie"),
    src: "hero.lottie",      // .lottie ≈ 40–70% smaller than .json
    autoplay: !still,        // reduced motion → hold the first frame
    loop: !still,
  });
  // WebGL (three.js/OGL) hero: same guard (don't start the RAF loop; show a still),
  // and MUST be screenshot-verified before ship — assume model-written WebGL is wrong.
</script>
```

---

## Choreography patterns

Named recipes, each with its tier and when to reach for it.

- **Entrance cascade** — T1 (or T4 for spring). Stagger a section's children in on load
  (`opacity` + small `translateY`), 20–60 ms apart. When: hero, feature grid, first paint.
- **Scroll reveal** — T3 (`@supports` guard) or T5 (`ScrollTrigger`, when Firefox parity
  matters). Fade/slide elements as they enter the viewport, once. When: long marketing
  pages, storytelling sections.
- **Hero parallax restraint** — T3 or T5. Move background layers a *fraction* of scroll
  speed. When: a single hero band — keep displacement small; never hijack the scroll.
- **Skeleton → content** — T1. Cross-fade a shimmer/skeleton to loaded content
  (`opacity`), no layout jump. When: async data, image loads, above-the-fold placeholders.
- **Count-up** — T1 (CSS) or T4 (JS tween of a number). Animate a stat from 0 to its value
  on reveal. When: metrics, dashboards, pricing — pair with a scroll-reveal trigger.
- **View-swap morph** — T2. Let View Transitions tween a list→detail or thumbnail→hero
  change; feature-guard, apply the swap directly when unsupported. When: SPA state/view
  changes, filtered grids, shared-element navigation.

---

## Figma canvas motion — the prototype / Smart-Animate layer

Everything above authors motion for **web output**. This section is different: motion
authored **on the Figma canvas** — prototype reactions and Motion keyframe tracks — which
ease-design drives through the figma-agent plugin (`executor-motion.ts`). The Plugin-API
facts here are what keep that path from silently producing dead animation.

**G1 — the field & easing contract (Plugin API truth):**
- **Public transform field allowlist:** `TRANSLATION_X`, `TRANSLATION_Y`, `TRANSLATION_XY`,
  `ROTATION`, `SCALE_X`, `SCALE_Y`, `SCALE_XY` — plus absolute value fields
  (`OPACITY`, `CORNER_RADIUS`, …). A keyframe track must target one of these; anything
  outside the allowlist is rejected. (`executor-motion.ts` emits the X/Y forms — a valid
  subset.)
- **Easing enum is `EASE_IN_AND_OUT`, NEVER `EASE_IN_OUT`.** The intuitive `EASE_IN_OUT`
  string does not exist in the API — using it throws/no-ops. The real member is
  `EASE_IN_AND_OUT` (with `EASE_IN`, `EASE_OUT`, `LINEAR`, `GENTLE`, spring presets, …).
- **Animate DESCENDANTS, not the top-level frame.** Keyframe/Smart-Animate tracks belong on
  the children *inside* a frame (the elements that move), not on the frame node itself —
  animating the top-level frame produces no visible motion.
- **Omit `baseValue` for a NEW track.** When creating a fresh keyframe track, do not pass a
  `baseValue`; let Figma seed it from the node. Supplying one on a new track is a common
  source of a track that starts from the wrong state.

**G2 — verifying canvas motion (`export_video`):**
- Motion on the canvas is verified with **`export_video`** — a **server-side** render that
  takes **~10 s to minutes**, so treat each render as expensive.
- **Plan 4–6 phase frames**, render at a **small width + low fps**, then **extract stills
  with ffmpeg** to inspect the motion frame by frame.
- **Batch all fixes before re-rendering** — never re-run the slow `export_video` per tweak;
  collect the corrections across phases and render once more.

---

## Anti-patterns

- **Scrolljacking** — overriding native scroll speed/direction so the page fights the
  user. Enhance scroll; never seize it.
- **Animating everything** — every element moving at once, no stagger, no hierarchy. Motion
  must direct attention, not scatter it.
- **Mixing two JS animation libraries** — Motion *and* anime.js, or either *and* GSAP, on
  one page. Pick one engine.
- **Infinite attention-seeking loops near reading content** — a perpetual bounce/pulse
  beside body copy competes with reading. Loops belong on idle affordances, not text.
- **Motion with no reduced-motion fallback** — any tier without the guard. Deterministically
  caught by `animation-no-reduced-motion`.
- **WebGL for content 2D handles** — a shader for what a gradient, an SVG, or a T1 fade
  would express. Reserve WebGL for genuinely 3D/ambient work, and verify it visually.
