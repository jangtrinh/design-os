---
description: "Direct and implement one selective, web-only ShaderGradient T6 gradient field after the static baseline is verified — narrative intent, design-system colour binding, the two mandatory fallbacks, the shared one-effect cap, and teardown required. Use for T6-justified web generation only, after the motion ladder and persona cap allow it; do not use for Figma or to-figma canvas surfaces, native-mobile production UI, or to satisfy a motion-intensity number."
---

# Skill: Shader Gradient

Use this skill when a T6-justified web brief needs one animated gradient field as an ambient
surface, after the complete static baseline is built and verified. Do not invoke it merely
because ShaderGradient is available, for Figma/`to-figma` canvas surfaces, or for native-mobile
production UI — web-only.

## Read

1. Read `knowledge/motion-craft.md` first to choose the correct motion tier. **Stop there when
   T1–T5 suffices** — this skill is reachable only when the ladder actually selects T6 and the
   persona's motion cap allows `High / expressive`.
2. Only after T6 is justified, read `knowledge/shader-gradient-direction.md` completely — the
   T6 floor, the two fallbacks, the colour binding, the shared one-field cap, the Tenant Law
   binding, the peer-dependency clause, and both matrices.
3. Read `knowledge/color-science.md` before deriving the field's colours — the binding is an
   OKLCH decision, not a hex copy.
4. Consult ShaderGradient's own current docs at use time for the chosen surface's usage; neither
   this skill nor the knowledge file caches that surface.

## Direct

Before code:

- **Build and verify the complete static baseline FIRST** — content, controls, focus order, and
  contrast all correct with the field entirely absent. Selecting a preset before this baseline
  exists and is verified is out of order.
- Confirm the page has not already spent its T6 budget. **A gradient field and a Canvas UI
  effect share ONE budget** — a page does not get one of each.
- Pick at most ONE field for the viewport and write its narrative-intent sentence: why this
  specific field, not novelty.
- Read its row in the preset matrix for `Anti-use` and `Required fallback`; reject the preset if
  the brief matches its `Anti-use`.
- **Derive the field's three colours from the active design system**, never from the preset's own
  palette. State which token roles they came from. A field carrying upstream colours makes the
  largest surface on the page the page's colour authority.
- Declare BOTH fallbacks — the frozen field for `prefers-reduced-motion`, and the token-derived
  CSS gradient for no-WebGL/context-loss — plus the teardown owner and, when the field is
  embedded among other sections, the Tenant Law binding (`ui tenant-lint` must pass).
- Resolve the destination app's React and React Three Fiber majors **before** emitting any
  install command. Next 15 App Router REQUIRES R3F v9 + React 19; the generic command resolves
  there and then fails at runtime.
- For a hand-configured surface (any shader family other than the default one), declare that no
  preset row vouches for it and that it carries its own per-breakpoint visual verification.

## Implement

- The static baseline ships first and stays fully functional without the field.
- One field per viewport, always, and never a second T6 effect beside it.
- Content NEVER sits directly on the field. The field lights a surface; the surface carries text.
- Set text contrast against the token-derived fallback gradient, not against the moving field —
  a ratio measured against one frame of a moving surface holds for no other frame.
- When embedding as a section among others, honor the Tenant Law
  (`knowledge/motion-craft.md` § Tenant contract): read only the section's own bounding box,
  write only inside its own subtree, no global writes. An off-screen pause must **disarm**, not
  merely stop drawing.
- Wire the frozen state explicitly. No preset ships a static default, so the reduced-motion path
  renders nothing until it is built.
- Install handoff — emit this command for the host/user to run against the destination app
  (never run it from `ui`):

<!-- ease:gradient-handoff:start -->
```bash
npm i @shadergradient/react @react-three/fiber three three-stdlib camera-controls
```
Pin `@react-three/fiber` to the major the destination framework requires before running this,
and add the three types as a dev dependency. Resolve preset slugs from
`knowledge/shader-gradient/catalog.json`. **NEVER emit the upstream control-surface package** —
it is not published to npm and the install will fail.
<!-- ease:gradient-handoff:end -->

- Remove development markers before delivery; wire teardown (unmount/route-change) to dispose the
  canvas and release its RAF loop and WebGL context.

## Verify

Reject the result unless:

- the static baseline is complete and correct with the field absent;
- `prefers-reduced-motion: reduce` produces a **frozen field**, not a blank surface and not a
  still-moving one;
- WebGL failure and context loss both produce the **token-derived CSS gradient**, verified
  separately from the reduced-motion path — one fallback standing in for both is a reject;
- every colour in the field traces to a design-system token role, stated explicitly;
- text contrast is measured against the fallback gradient and passes there;
- no content sits directly on the field;
- console is clean, and teardown leaves no leaked RAF loop or WebGL context;
- at most one T6 effect — field or Canvas UI effect, not both — is active in the viewport at any
  moment, and `ui tenant-lint` passes when embedded;
- a hand-configured surface carries its own per-breakpoint visual verification;
- the field still has a one-sentence narrative meaning distinct from its `Anti-use`.

For native-mobile production interfaces, this skill does not apply — ShaderGradient is web-only.
To bake a field onto a Figma node instead, this skill does not apply either: that is
`figma-agent shader-gradient`, a different capability with a different contract.
