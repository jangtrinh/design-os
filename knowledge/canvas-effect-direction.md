# Canvas UI External-Effect Direction

## Purpose

This file is DESIGN:OS's T6 vocabulary for Canvas UI — 25 named, WebGL/html-in-canvas
art-direction effects (`knowledge/canvas-ui/`) usable as the top rung of
`knowledge/motion-craft.md`'s ladder. **Reachable ONLY after the ladder selects T6** *and*
the persona's motion cap allows T6 (`High / expressive`) — see `motion-craft.md` §
"Persona motion target → tier cap". A brief that has not climbed the ladder to T6 never
loads this file's matrix.

Catalog membership is not endorsement. Every use still needs its own narrative reason —
this file only names the vocabulary and the per-effect refusal (`Anti-use`); it does not
pre-approve any of them.

## When to Use / When NOT

**Use** when a web generation brief has already climbed `motion-craft.md`'s ladder to T6
and the persona's motion target is `High / expressive`.

**Do NOT use**: to satisfy a motion-intensity number, to decorate a brief that T1–T5
already serves, on a native-mobile production surface (web-only, B5), or before the
complete static baseline exists and is verified (§ "The T6 floor" below).

## Content

### The T6 floor for an external effect

**Reachable ONLY after `motion-craft.md`'s ladder selects T6 and the persona's motion cap
allows `High / expressive`** — repeated here because a reader landing on this section
mid-file never saw the Purpose gate above.

Every use of a Canvas UI effect requires ALL of:

- **Narrative intent** — a one-sentence reason this specific effect, not novelty alone.
- **A complete static / reduced-motion / unsupported fallback** that preserves content,
  controls, focus order, and contrast — **NOT merely a paused animation**. The fallback is
  the real page for every visitor who never sees the effect run.
- **Visual verification** — the effect is screenshot-checked working, never assumed.
- **Teardown** — the effect's cleanup path runs on unmount/route change; no leaked
  listeners, RAF loops, or WebGL contexts.
- **A provenance note** carrying the upstream revision, **re-checked at use time** — the
  pinned revision in `knowledge/canvas-ui/catalog.json` may not be the revision live at
  generation time; re-verify before treating the matrix as current.

**Origin-trial note (B11).** The `live-html` family depends on Chrome's html-in-canvas origin
trial. Per **current official Chrome documentation** —
https://developer.chrome.com/blog/html-in-canvas-origin-trial, **checked: 2026-07-25** — the
desktop origin trial runs **Chrome 148 through 150** (page last updated 2026-05-19). This is the
official source of record; the upstream Canvas UI README separately states, in substance, that
a recent Chrome or Edge release is required for full functionality — consistent with the official
page (an active, time-boxed trial) but not identical in milestone number — the full discrepancy
record, including a planning lead that predicted an
extension beyond 150 which the official page does **not** confirm as of the checked date, is in
`knowledge/canvas-ui/README.md` § Browser-note discrepancy record. If the trial lapses or its
milestone range changes, `live-html` effects degrade to their static baseline — this is a
**designed-for outcome**, not a defect, because the floor above already requires that baseline
to be complete independent of the trial's availability.

### One effect per viewport, and the Tenant Law

**Max ONE active Canvas UI effect per viewport moment.** GPU budget and user attention are
both single-occupancy; two simultaneous WebGL surfaces is the measured failure mode the
coexistence evidence in spec §10 exists to catch.

When an effect is embedded as a section among others — a page the user also builds, not a
page this effect owns — [motion-craft.md's Tenant contract](motion-craft.md) binds:
`ui tenant-lint` must pass; an off-screen pause must actually **disarm** (release its
decoder/RAF subscription, not just visually stop); an upstream visibility observer only
counts as evidence when it is **verified at page level**, not assumed from source reading.

### The Draco clause

**The three `object`-family effects (Dithered Object, Glass Object, Particle Object) MUST
NOT ship the default Google-hosted Draco decoder** in generated output. ALLOWED: a
self-hosted Draco decoder, or an explicit per-destination permit to use the hosted one.
NOT ALLOWED: silently defaulting to Google's CDN. *Why:* an undisclosed third-party CDN
dependency in a user's shipped page is a supply-chain and privacy fact the user never
agreed to. Each `object` row's `Required fallback` cell below restates this per-row.

### The effect matrix
<!-- ease:source ref="knowledge/canvas-ui/catalog.json" captured="202607" url="https://canvasui.dev/components" -->

**Repeated gate:** every row below is reachable only after T6 is selected and the persona
cap allows it — see § Purpose. `family` is `live-html` (redraws the live DOM into canvas via
the origin-trial API — 22 effects) or `object` (an independent 3D-scene artifact — 3 effects) —
a **two-value enum**. There is no `overlay` family: the WebGL-overlay behaviour every
`live-html` effect degrades to when the origin trial is unsupported is a per-effect runtime
**mode**, not a membership class — carried by the ledger's required `overlayFallback` boolean
(`object` rows are `false` by construction), never a matrix column. Read
`knowledge/canvas-ui/README.md` § `overlayFallback` derivation for the per-effect value and its
evidentiary basis.

**Pinned revision:** `728550d4523e1b8bef834b64b3e936c215cad630` — must match
`knowledge/canvas-ui/catalog.json`'s `revision` field; `effect-catalog-revision-drift`
fails otherwise. Re-verify at use time (§ "The T6 floor" above); this note is only as
current as the last ledger refresh.

| Effect | slug | family | Narrative job | Anti-use | Required fallback |
|---|---|---|---|---|---|
| Asciify | `asciify` | live-html | technical/editorial inspection lens | Do not use to decorate a hero with no inspection/technical narrative — the ascii lens reads as a gimmick without a stated "look closer" reason. | plain readable HTML; pointer-only novelty cannot carry meaning |
| Bend | `bend` | live-html | dimensional page/section transition | Do not use as a scroll transition between ordinary sections with no spatial-continuity story — it adds distortion cost for a plain scroll a T1/T3 reveal already serves. | static section; avoid scrolljacking and reading distortion |
| Blaze | `blaze` | live-html | heat, urgency, launch energy | Do not use for calm or trust-building content (finance, healthcare, docs) — fire/heat imagery contradicts the tone and the distortion competes with reading. | static atmospheric art; keep controls and copy unobscured |
| Bubble | `bubble` | live-html | playful cursor refraction | Do not use on a page whose primary interaction is keyboard/touch-first with no meaningful pointer story — the refraction is desktop-cursor-only spectacle. | ordinary HTML; touch must not lose the interaction's meaning |
| Cloth | `cloth` | live-html | tactile material storytelling | Do not use unless the brand narrative is materially about fabric/texture — an unrelated product wrapped in cloth motion is decoration mistaken for a signature move. | static content surface; verify pointer and text interaction |
| Clouds | `clouds` | live-html | ambient depth or reveal | Do not use as a permanent background behind dense text — the blur/refraction that reads as atmosphere in a hero degrades legibility over body copy. | clear static atmosphere; enforce contrast throughout motion |
| Dithered Object | `dithered-object` | object | retro/technical 3D artifact | Do not use for a product with no real 3D asset or no retro/technical brand angle — the 1-bit dither is a specific aesthetic choice, not a generic "make it 3D" button. | poster image and asset-load error state; self-hosted Draco decoder only, never the default Google-hosted CDN |
| Droplets | `droplets` | live-html | weather, glass, sensory atmosphere | Do not use to fill empty visual space with no weather/sensory narrative — it reads as stock rain over unrelated content. | clean overlay-off state; avoid persistent reading obstruction |
| Frost | `frost` | live-html | reveal-through-ice interaction | Do not use when the revealed content must be visible by default — a mandatory scrub-to-reveal gate hides content from anyone who never interacts. | fully revealed readable state; no required cursor scrubbing |
| Glass | `glass` | live-html | focused inspection/magnification | Do not use as a generic hover-highlight — the lens implies "inspect this specific detail," and using it everywhere on a page dilutes that meaning. | normal content and keyboard-equivalent access to targets |
| Glass Object | `glass-object` | object | premium materialized brand object | Do not use for a low-price/utility product — the liquid-glass premium read actively undersells or misrepresents a budget offering. | poster, loading/error state, and asset provenance; self-hosted Draco decoder only, never the default Google-hosted CDN |
| Glitch | `glitch` | live-html | brief disruption or state change | Do not use as ambient/looping decoration — glitch reads as an error state; sustained or unmotivated glitch erodes trust in the interface. | stable content; seizure/flash and legibility review |
| Grid | `grid` | live-html | spatial/system response field | Do not use behind reading-heavy content — the rippling tiles compete with text for attention with no systemic/spatial narrative to justify it. | static grid or surface; cap motion near dense content |
| Hex Float | `hex-float` | live-html | modular/technical spatial surface | Do not use for warm/organic brand positioning — the hex-tile technical surface actively fights a soft or human brand voice. | flat readable composition; preserve hit targets |
| Laser | `laser` | live-html | scroll-linked threshold reveal | Do not use to gate primary content behind a scroll threshold — the reveal must be a bonus, never the only path to reading the section. | content visible without reveal; no load-bearing scroll effect |
| Liquid | `liquid` | live-html | playful fluid response/ambient hero | Do not use on a low-power/mobile-first audience without a tested fallback — the fluid simulation is GPU-heavy and easily the worst-performing effect on constrained hardware. | static gradient/art; throttle resolution and pointer input |
| Magnify | `magnify` | live-html | scanner/analysis interaction | Do not use as a generic zoom-on-hover — the HUD-reticle framing implies an analysis/scanning narrative that most product imagery does not have. | normal readable DOM; keyboard/touch alternative when meaningful |
| Particle Object | `particle-object` | object | decomposable product/brand artifact | Do not use for a product with no assembly/modularity story — the scatter-and-reassemble motion promises a parts-becoming-whole narrative a flat product image does not carry. | poster and complete no-WebGL state; self-hosted Draco decoder only, never the default Google-hosted CDN |
| Particle Reveal | `particle-reveal` | live-html | materialization from system to clarity | Do not use for content the user must read immediately — the crisp/legible state is the default per the T6 floor; this effect is a bonus on top of it, never the primary way text becomes readable. | crisp content shown by default when unsupported/reduced |
| Particle Scroll | `particle-scroll` | live-html | dissolution/reassembly chapter transition | Do not use between sections with no chapter/narrative break — a dissolve implies "you are leaving one idea and entering another"; using it as a generic section divider empties the signal. | complete static scroll narrative; never hide unrevealed content |
| Peel | `peel` | live-html | before/after or hidden-layer comparison | Do not use when there is nothing genuinely hidden underneath — a peel with no meaningful second layer is a hover trick, not a comparison. | explicit control or side-by-side fallback; hover is insufficient |
| Retro Dither | `retro-dither` | live-html | retro-computing inspection lens | Do not use for a contemporary/premium brand — the retro-computing texture is a specific era reference, not a generic "cool filter." | ordinary DOM; treat as decoration only |
| Ripple | `ripple` | live-html | click consequence or water metaphor | Do not use on every click across the page — ripple should mark one specific meaningful action (a submit, a like), not become ambient click feedback everywhere. | static overlay-off state; clicks must retain normal behavior |
| Shatter | `shatter` | live-html | dramatic break/reconfiguration moment | Do not use more than once per experience or around routine tasks — shatter is a one-time dramatic beat; repeated or applied to ordinary interactions it just reads broken. | stable readable composition; use once, never around routine tasks |
| VHS | `vhs` | live-html | archival/media-era atmosphere | Do not use as a permanent skin over long-form reading content — the noise/wave texture is an atmospheric accent, not a legibility-safe backdrop for extended body copy. | clean stable content; avoid long-running noise over body copy |

### Install handoff

**Primary = an emitted direct upstream CLI command**, runtime-neutral and inspectable in
every host CLI. shadcn MCP is opportunistic convenience when the host exposes it — never a
requirement, never wired into `ui`. `ui` never runs this command and never fetches (B1).

<!-- ease:install-handoff:start -->
Emit this command for the host/user to run against the **destination app** (never run it
from `ui`):

```bash
npx shadcn@latest add @canvas-ui/<slug>-<framework>
```

Resolve `<slug>` from `knowledge/canvas-ui/catalog.json` and `<framework>` from the
destination app's stack (react, solid, preact, vue, svelte, or vanilla). If the host CLI
exposes a shadcn MCP server, using it to run the same install is acceptable convenience —
never a requirement, and never something `ui` itself calls.
<!-- ease:install-handoff:end -->

**Adverse branch.** If the owner's license interpretation (spec §12.1) lands adverse, this
section and the mirrored block in `templates/skills/canvas-effect.md` § Implement are
deleted in full — nothing else in this file depends on the handoff.

## Failure Modes

- **Novelty-first selection** — an effect chosen because it looks impressive, with no
  narrative-intent sentence tying it to the brief. Observable: the direction step has no
  one-sentence "why this effect" before implementation starts.
- **A fallback that is a paused animation** — freezing the effect's last frame instead of
  rendering the complete static/reduced-motion/unsupported state required by the T6 floor.
  Observable: the unsupported-browser capture (spec §10) still shows canvas artifacts
  instead of plain HTML.
- **Two effects active in one viewport** — violates the one-effect cap (B7). Observable:
  two WebGL contexts or two live-DOM-into-canvas surfaces visible at once, or `ui
  tenant-lint` failing the coexistence check.
- **An `object` effect shipping the default Draco CDN** — violates the Draco clause (B8).
  Observable: the shipped page's network requests include Google's hosted Draco decoder
  with no explicit per-destination permit on record.
- **A stale revision note** — the provenance note's upstream revision was never re-checked
  at use time, so the matrix a generation used no longer matches what upstream ships.
  Observable: `effect-catalog-revision-drift` firing, or a use-time note whose revision
  predates the last ledger refresh with no re-check recorded.
