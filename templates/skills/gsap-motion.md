---
description: "Direct and implement advanced GSAP web choreography with timelines, ScrollTrigger, responsive variants, framework-safe cleanup, plugin restraint, and performance evidence. Use for story-bearing motion, pinned or scrubbed scenes, spatial transitions, gesture physics, or GSAP review; do not use for simple CSS transitions or native mobile production UI."
---

# Skill: GSAP Motion

Use this skill when a web brief needs motion to carry hierarchy, narrative, feedback, or spatial
state. Do not invoke it merely because GSAP is available.

## Read

1. Read `knowledge/motion-craft.md` to choose the correct motion tier. Stop there when T1-T4 is
   sufficient.
2. For T5, read `knowledge/gsap-motion-direction.md` completely.
3. Check the project's framework and installed dependencies before choosing imports or lifecycle.
4. Consult current official GSAP docs for an unfamiliar plugin API; never rely on old Club GSAP,
   private-registry, or token instructions.

## Direct

Before code, output a compact motion direction:

- signature interaction and what it communicates;
- scene list with trigger, target, meaning, and reduced-motion equivalent;
- shared duration/easing/spatial grammar;
- library and plugin choices with the simpler alternatives rejected;
- desktop/mobile divergence;
- cleanup, refresh, and performance evidence plan.

Keep one signature system. Supporting animations inherit it rather than competing with it.

## Implement

- Use timelines, labels, and position parameters for coordinated beats.
- Scope selectors and assign one lifecycle owner.
- Use `useGSAP` plus `contextSafe` in React; use `gsap.context` and `revert` elsewhere.
- Put ScrollTrigger only on top-level animations. Pick scrub or toggle actions.
- Use `gsap.matchMedia` for responsive and reduced-motion branches.
- Prefer transform aliases and `autoAlpha`; use `quickTo` for continuous pointer input.
- Refresh only after layout changes and remove every listener, context, trigger, marker, and
  development tool during teardown or delivery.

## Verify

Reject the result unless:

- the experience is fully readable without successful animation initialization;
- normal and reduced-motion paths both work;
- pinned scenes remain keyboard-usable and mobile has an explicit fallback;
- late fonts/images, resize, route changes, and interruption do not break state;
- no library shares transform/opacity ownership on the same target;
- evidence covers frame stability, INP, CLS, cleanup, and console errors;
- every animation still has a one-sentence product meaning.

For native mobile production interfaces, translate the direction into platform-native animation
and haptic APIs. GSAP is allowed only in a disposable web motion prototype.
