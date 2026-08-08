---
description: "Direct and implement one selective, web-only Canvas UI T6 effect after the static baseline is verified — narrative intent, one-effect cap, tenant contract, Draco decision, and teardown required. Use for T6-justified web generation only, after the motion ladder and persona cap allow it; do not use for Figma or to-figma canvas surfaces, native-mobile production UI, or to satisfy a motion-intensity number."
---

# Skill: Canvas Effect

Use this skill when a T6-justified web brief needs one Canvas UI external effect, after the
complete static baseline is built and verified. Do not invoke it merely because Canvas UI is
available, for Figma/`to-figma` canvas surfaces, or for native-mobile production UI — web-only.

## Read

1. Read `knowledge/motion-craft.md` first to choose the correct motion tier. **Stop there when
   T1–T5 suffices** — this skill is reachable only when the ladder actually selects T6 and the
   persona's motion cap allows `High / expressive`.
2. Only after T6 is justified, read `knowledge/canvas-effect-direction.md` completely — the T6
   floor, the one-effect cap, the Tenant Law binding, the Draco clause, the effect matrix, and
   the install handoff.
3. Consult Canvas UI's own current docs at use time for the chosen effect's install/usage
   surface; neither this skill nor the knowledge file caches that surface.

## Direct

Before code:

- **Build and verify the complete static baseline FIRST** — content, controls, focus order, and
  contrast all correct with the effect entirely absent. Selecting an effect before this baseline
  exists and is verified is out of order.
- Pick at most ONE effect for the viewport (one-effect cap) and write its narrative-intent
  sentence: why this specific effect, not novelty.
- Read its row in the effect matrix for `Anti-use` and `Required fallback`; reject the effect if
  the brief matches its `Anti-use`.
- Declare the static / reduced-motion / unsupported fallback, the teardown owner, and — when the
  effect is embedded among other sections — the Tenant Law binding (`ui tenant-lint` must pass).
- For an `object`-family effect, declare the Draco decision (self-hosted, or an explicit
  per-destination permit — never the default Google-hosted CDN).

## Implement

- The static baseline ships first and stays fully functional without the effect.
- One effect per viewport, always.
- When embedding as a section among others, honor the Tenant Law
  (`knowledge/motion-craft.md` § Tenant contract): read only the section's own bounding box,
  write only inside its own subtree, no global writes.
- `object`-family effects: wire the Draco decision decided in Direct; never let the default CDN
  ship silently.
- Install handoff — emit this command for the host/user to run against the destination app
  (never run it from `ui`):

<!-- ease:install-handoff:start -->
```bash
npx shadcn@latest add @canvas-ui/<slug>-<framework>
```
Resolve `<slug>` from `knowledge/canvas-ui/catalog.json` and `<framework>` from the destination
app's stack. A host-exposed shadcn MCP server is acceptable convenience for running the same
install — never a requirement.
<!-- ease:install-handoff:end -->

- Remove development markers before delivery; wire teardown (unmount/route-change) to release
  the effect's listeners, RAF loop, and WebGL context.

## Verify

Reject the result unless:

- the static baseline is complete and correct with the effect absent (unsupported-browser
  capture);
- `prefers-reduced-motion: reduce` produces the complete static state, not merely a paused
  effect;
- console is clean, and teardown leaves no leaked listeners, RAF loop, or WebGL context;
- WebGL context loss recovers to the static fallback;
- at most one effect is active in the viewport at any moment, and `ui tenant-lint` passes when
  embedded;
- for an `object`-family effect, asset load AND asset-error states are both verified, and the
  Draco decision is evidenced;
- every effect still has a one-sentence narrative meaning distinct from its `Anti-use`.

For native-mobile production interfaces, this skill does not apply — Canvas UI is web-only (B5).
