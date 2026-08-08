# Canvas UI Integration Brief

## Catalog adoption matrix

Every current effect is adopted at the knowledge/workflow level. `Rank` describes use in
a generated experience, not whether the name belongs in the catalog: all 25 names belong
in the external-effect matrix.

| Effect | Narrative job | Rank | Required fallback / caution |
|---|---|---:|---|
| Asciify | technical/editorial inspection lens | P2 | plain readable HTML; pointer-only novelty cannot carry meaning |
| Bend | dimensional page/section transition | P2 | static section; avoid scrolljacking and reading distortion |
| Blaze | heat, urgency, launch energy | P1 | static atmospheric art; keep controls and copy unobscured |
| Bubble | playful cursor refraction | P1 | ordinary HTML; touch must not lose the interaction's meaning |
| Cloth | tactile material storytelling | P2 | static content surface; verify pointer and text interaction |
| Clouds | ambient depth or reveal | P1 | clear static atmosphere; enforce contrast throughout motion |
| Dithered Object | retro/technical 3D artifact | P1 | poster image and asset-load error state |
| Droplets | weather, glass, sensory atmosphere | P1 | clean overlay-off state; avoid persistent reading obstruction |
| Frost | reveal-through-ice interaction | P1 | fully revealed readable state; no required cursor scrubbing |
| Glass | focused inspection/magnification | P1 | normal content and keyboard-equivalent access to targets |
| Glass Object | premium materialized brand object | P1 | poster, loading/error state, and asset provenance |
| Glitch | brief disruption or state change | P2 | stable content; seizure/flash and legibility review |
| Grid | spatial/system response field | P1 | static grid or surface; cap motion near dense content |
| Hex Float | modular/technical spatial surface | P2 | flat readable composition; preserve hit targets |
| Laser | scroll-linked threshold reveal | P2 | content visible without reveal; no load-bearing scroll effect |
| Liquid | playful fluid response/ambient hero | P1 | static gradient/art; throttle resolution and pointer input |
| Magnify | scanner/analysis interaction | P1 | normal readable DOM; keyboard/touch alternative when meaningful |
| Particle Object | decomposable product/brand artifact | P1 | poster and complete no-WebGL state |
| Particle Reveal | materialization from system to clarity | P2 | crisp content shown by default when unsupported/reduced |
| Particle Scroll | dissolution/reassembly chapter transition | P2 | complete static scroll narrative; never hide unrevealed content |
| Peel | before/after or hidden-layer comparison | P1 | explicit control or side-by-side fallback; hover is insufficient |
| Retro Dither | retro-computing inspection lens | P2 | ordinary DOM; treat as decoration only |
| Ripple | click consequence or water metaphor | P1 | static overlay-off state; clicks must retain normal behavior |
| Shatter | dramatic break/reconfiguration moment | P2 | stable readable composition; use once, never around routine tasks |
| VHS | archival/media-era atmosphere | P2 | clean stable content; avoid long-running noise over body copy |

Source evidence for names and descriptions: [live catalog](https://canvasui.dev/components)
and [`src/data/components.ts`](https://github.com/DavidHDev/canvas-ui/blob/728550d4523e1b8bef834b64b3e936c215cad630/src/data/components.ts).

## Destination mapping

| Pattern | Evidence | Rank | Destination mapping | Adaptation | Risk | Verification |
|---|---|---:|---|---|---|---|
| External T6 effect catalog | 25 upstream entries | P1 | versioned provenance snapshot + selective `knowledge/` reference | add narrative job, anti-use, fallback, and evidence fields | catalog drift | knowledge routing tests + revision/slug check |
| Upstream registry handoff | shadcn registry + MCP docs | P1 | runtime adapter instructions, never `src/` network code | resolve current slug/framework at use time | upstream/API drift | dry-run in isolated fixture after source review |
| Shared lifecycle acceptance | source-wide support/reduced-motion/visibility/cleanup patterns | P0 | T6 floor and review checklist | require complete fallback plus teardown evidence | false confidence from static scan | normal/reduced captures, console, unmount, off-screen test |
| License boundary | MIT + Commons Clause | P0 | provenance note beside external catalog | link/install upstream; do not vendor or port | accidental redistribution | release review of packaged files |
| Selective skill routing | existing GSAP skill pattern | P1 | new Canvas UI motion skill referenced only from T6 generation paths | load effect matrix after T6 choice, not before | novelty-first selection | adapter generation tests + prompt-context inspection |

## Proposed implementation contract for Opus planning

1. Preserve all 25 entries in a revisioned external-effect reference and a selective
   knowledge matrix; do not inflate the 32-component semantic catalog.
2. Route into the matrix only after T6 is justified by persona and narrative intent.
3. Require one signature effect per section and a declared static/reduced/browser fallback.
4. Installation is an external hand action against upstream; `ui` remains deterministic
   and offline. Do not freeze current component APIs or source in knowledge.
5. Qualification requires desktop, mobile, reduced-motion, unsupported/fallback, console,
   and cleanup evidence. Three-dimensional asset effects also require load/error evidence.

## Decision

`plan` — Codex's Fable-thinking review recommends the versioned-reference + selective-skill
shape. This is not the actual Fable 5 direction gate. Integration remains gated on Fable
5 direction and an Opus 4.8 spec/plan reviewed by Codex 5.6 sol. No implementation files
were changed.

## Unresolved Questions

1. Should shadcn MCP be the primary handoff with direct CLI install as fallback, or the
   reverse?
2. Which benchmark surface will prove the catalog improves selection quality without
   encouraging indiscriminate T6 use?
