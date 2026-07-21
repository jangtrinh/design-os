# GSAP Motion Direction

> Adapted from the official [GreenSock GSAP Skills](https://github.com/greensock/gsap-skills)
> at commit `aed9cfd3277740755f6bfc1155c7aa645403b760` (MIT). Use with
> `knowledge/motion-craft.md`; this file specializes the T5 implementation path.

## 1. Role in DESIGN:OS

GSAP is the web choreography engine for experiences whose design read requires coordinated
timelines, scroll-linked storytelling, spatial continuity, SVG transformation, or physical
gesture. It is not the default for a fade, hover color, simple reveal, or native mobile UI.

Before implementation, write one sentence for each major animation:

```text
trigger -> changed property -> user meaning -> reduced-motion equivalent
```

Reject an effect whose meaning is only "looks impressive." Motion must communicate hierarchy,
story, feedback, or state transition.

## 2. Choose the smallest capable layer

| Need | Use |
|---|---|
| Single transition or hover | CSS |
| Simple entrance sequence | CSS or Motion |
| Coordinated multi-step choreography | GSAP timeline |
| Scroll-linked progress, pinning, spatial sequence | GSAP + ScrollTrigger |
| Layout state continuity | Flip |
| Drag, momentum, swipe, direction input | Draggable + Inertia or Observer |
| Text as a narrative material | SplitText, sparingly |
| SVG path drawing or transformation | DrawSVG, MorphSVG, MotionPath |

One owner controls an element's properties. Do not let CSS, Motion, and GSAP animate the same
transform or opacity. A page may use another library in isolated components, but never share
targets or lifecycle ownership.

## 3. Choreography contract

For every GSAP scene, declare:

- `sceneId` and the section job;
- input trigger: load, pointer, focus, drag, state, or scroll;
- target hierarchy and focal handoff;
- timeline beats with labels, not chained delays;
- properties animated and why transform/opacity cannot be simpler;
- interruption behavior: reverse, overwrite, snap, or complete;
- desktop, mobile, and reduced-motion variants;
- cleanup owner and refresh conditions;
- performance budget and validation evidence.

The signature interaction is one memorable system, not unrelated effects scattered through the
page. Supporting motion should reuse its easing, duration family, and spatial logic.

## 4. Core implementation rules

- Install from public npm: `npm install gsap`; React also uses `npm install @gsap/react`.
- Register each plugin once before first use. No private registry, auth token, or Club membership.
- Prefer `x`, `y`, `xPercent`, `yPercent`, `scale`, `rotation`, and `autoAlpha`.
- Use a timeline with defaults, labels, and position parameters for sequencing.
- Use `gsap.matchMedia()` for responsive choreography and `prefers-reduced-motion`.
- Use `quickTo()` for frequently updated pointer properties.
- Scope selectors to a component root.
- Remove development markers and GSDevTools before delivery.

```js
const mm = gsap.matchMedia();

mm.add({
  desktop: "(min-width: 768px)",
  reduce: "(prefers-reduced-motion: reduce)"
}, ({ conditions }) => {
  if (conditions.reduce) {
    gsap.set("[data-beat]", { clearProps: "all" });
    return;
  }

  const timeline = gsap.timeline({ defaults: { ease: "power3.out", duration: 0.7 } });
  timeline
    .addLabel("establish")
    .from("[data-beat='title']", { y: 28, autoAlpha: 0 }, "establish")
    .from("[data-beat='visual']", { scale: 0.96, autoAlpha: 0 }, "establish+=0.12");
});
```

Call `mm.revert()` from the owning lifecycle cleanup.

## 5. ScrollTrigger rules

- Put ScrollTrigger on a top-level tween or timeline, never a child tween.
- Choose `scrub` for continuous progress or `toggleActions` for discrete behavior, never both.
- Pin the scene wrapper and animate a child. Do not transform the pinned element.
- Create triggers in page order. Use `refreshPriority` when asynchronous creation breaks order.
- Call `ScrollTrigger.refresh()` after fonts, images, or dynamic content change layout, not per frame.
- Horizontal container animation uses `ease: "none"`; nested triggers reference
  `containerAnimation`. Pinning and snapping are unavailable on those nested triggers.
- Use markers during construction only.

Scroll hijacking needs a narrative reason and a mobile escape. Do not replace native scrolling
for ordinary content. A pinned sequence must remain keyboard-readable and understandable at rest.

## 6. Framework lifecycle

### React and Next.js

Use a client leaf, refs, `useGSAP`, and `scope`. Wrap later event-created animations with
`contextSafe`. Use `revertOnUpdate` when dependencies rebuild the scene. Never execute GSAP during
server rendering.

### Vue, Nuxt, Svelte

Create after mount inside `gsap.context(callback, root)`. Revert that context on unmount or
destroy. Lazy-load plugins used by one route. Refresh ScrollTrigger after the framework finishes
rendering layout-changing asynchronous content.

### Vanilla

Keep an explicit context or animation registry and revert/kill it during page teardown. Remove
event listeners alongside animation cleanup.

## 7. Advanced plugin restraint

- Flip: use for a real layout-state transition so identity persists across states.
- Draggable + Inertia: use when direct manipulation is the interaction, with bounds and keyboard
  alternative.
- Observer: use for normalized gesture direction, not to block ordinary page scrolling.
- SplitText: split only the units animated, preserve screen-reader semantics, wait for fonts, and
  revert. Avoid character animation on long copy.
- MorphSVG/DrawSVG/MotionPath: use meaningful brand or process geometry, not decorative path spam.
- ScrollSmoother: treat as an enhancement; native scroll and reduced-motion modes remain valid.

## 8. Performance and accessibility gate

- Target smooth behavior on representative low-end mobile hardware, not only desktop devtools.
- Animate compositor-friendly properties; justify any layout animation.
- Apply `will-change` only while a known element animates.
- Avoid hundreds of simultaneous tweens or triggers; virtualize or batch large sets.
- Essential content starts readable without JavaScript. Never hide it permanently behind an
  animation initialization failure.
- Reduced motion preserves content, hierarchy, and state feedback without parallax, scrub, or
  prolonged travel.
- Test keyboard focus during pinned scenes, pointer interruption, resize/orientation change,
  route teardown, late fonts/images, and back navigation.
- Delivery evidence includes normal-motion and reduced-motion captures, console cleanliness,
  cleanup verification, INP, CLS, and a frame-rate trace for the signature interaction.

## 9. Benchmark boundary

For the DESIGN:OS promotion and Architecture web benchmarks, require one story-bearing GSAP
signature interaction and restrained supporting choreography. For the Nutrition native-mobile
benchmark, do not prescribe GSAP in production; evaluate equivalent native transitions, gestures,
and haptics. GSAP may power only a web prototype used to communicate the motion specification.

Score motion on narrative contribution, spatial continuity, input response, interruption,
state completeness, mobile ergonomics, reduced-motion quality, and runtime stability. A visually
dramatic effect that harms comprehension or control fails.
