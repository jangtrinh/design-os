---
id: shader-gradient-direction
description: "The T6 gradient-field direction for ShaderGradient — 10 named presets, 12 surfaces, the design-system colour binding, and the two mandatory fallbacks."
when: [gradient, shader-gradient, mesh-gradient, animated-background, hero-background, webgl, t6, gradient-field]
---

# ShaderGradient Field Direction

## Purpose

This file is DESIGN:OS's T6 vocabulary for **animated 3D gradient fields** — 10 named presets
and 12 hand-configurable surfaces (`knowledge/shader-gradient/`), usable as a top rung of
`knowledge/motion-craft.md`'s ladder. **Reachable ONLY after the ladder selects T6** *and* the
persona's motion cap allows T6 (`High / expressive`) — see `motion-craft.md` § "Persona motion
target → tier cap". A brief that has not climbed the ladder to T6 never loads this file's matrix.

Catalog membership is not endorsement. Every use still needs its own narrative reason — this
file names the vocabulary and the per-preset refusal (`Anti-use`); it does not pre-approve any
of them.

## Mental Model

A gradient field is **a light source, not a picture.** It has no edges, no subject, and no
reading order; it lights the content in front of it. This is the whole difference between a
field that works and one that fights the page — and it produces the single rule most misuses
violate: **content NEVER sits directly on an unmediated field.** A field lights a surface; a
surface carries the text.

The second thing a reader gets wrong: **presets and surfaces are orthogonal axes, not one list.**
A preset is a *complete look* (colours, camera, motion, grain). A surface is a
`shader` × `mesh` pair — the *program* that draws it. Every named preset at the pin uses the
`defaults` shader, so choosing a preset never exercises the other three shader families; those
are reachable by hand-config only. Reading the preset roster as "the vocabulary" hides three
quarters of it.

## When to Use / When NOT

**Use** when a web generation brief has already climbed `motion-craft.md`'s ladder to T6, the
persona's motion target is `High / expressive`, and the surface wanted is an **ambient field** —
a hero backdrop, a section ground, a full-bleed atmosphere.

**Do NOT use**: to satisfy a motion-intensity number; to decorate a brief that T1–T5 already
serves; as a *content* surface (a field NEVER carries text directly — see Mental Model); on a
native-mobile production surface (web-only); before the complete static baseline exists and is
verified; or anywhere the page already spends its one T6 budget (§ "One field per viewport").

**Do NOT use for Figma or `to-figma` canvas surfaces from this file.** Baking a field onto a
Figma node is a different capability with a different contract — `figma-agent shader-gradient`
in the plugin repo. This file governs web generation only.

## Content

### The T6 floor for a gradient field

**Reachable ONLY after `motion-craft.md`'s ladder selects T6 and the persona's motion cap allows
`High / expressive`** — repeated here because a reader landing on this section mid-file never saw
the Purpose gate above.

Every use of a ShaderGradient field requires ALL of:

- **Narrative intent** — a one-sentence reason this specific field, not novelty alone.
- **Both fallbacks below**, complete and verified. Not one of them. Both.
- **Design-system colour binding** — the field's three colours are derived from the active DS,
  never carried over from the preset's own palette (§ "The colour binding").
- **Visual verification** — the field is screenshot-checked working, never assumed.
- **Teardown** — the R3F canvas is disposed on unmount/route change; no leaked RAF loop or
  WebGL context.
- **A provenance note** carrying the upstream revision, **re-checked at use time** — the pinned
  revision in `knowledge/shader-gradient/catalog.json` may not be the revision live at generation
  time; re-verify before treating this matrix as current.

**Pinned revision:** `974a230b1e6c3ec375fbe17a8ea1c89edbc48019`, captured 2026-06, MIT. This
token MUST equal `revision` in `knowledge/shader-gradient/catalog.json` — `ui knowledge check`
fails the pair when they drift, because a matrix describing one revision while the ledger pins
another is worse than no pin at all.

### The two fallbacks — and why one is not enough

<!-- ease:source ref="knowledge/shader-gradient/catalog.json" captured="202606" url="https://github.com/ruucm/shadergradient" -->

A field has **two independent failure axes**, and they need **two different fallbacks**. Shipping
one and calling it done is the most common way this capability fails review:

| Axis | Trigger | Required fallback | Why this one |
|---|---|---|---|
| Motion | `prefers-reduced-motion: reduce` | The **same field, frozen** — `animate: 'off'` at a fixed `uTime` | WebGL still works. The visitor asked for less motion, not a different design. A frozen field is pixel-identical to a paused frame, so the composition they see is the one that was designed |
| Capability | No WebGL context, context loss, or the renderer failing to load | A **token-derived CSS gradient** approximating the field's colour story | There is no canvas to freeze. Something must still light the surface, and it MUST come from the DS tokens, not from a screenshot of the field |

**Why the motion fallback is cheaper here than for other T6 effects, and still MUST be built:**
a frozen field is exactly the animation stopped, so unlike a live-DOM effect there is no separate
static composition to design. That makes it cheap, NOT optional — **no preset ships
`animate: 'off'` at the pin**, so the frozen state never exists until it is deliberately wired.

**A paused animation is NOT the capability fallback.** Pausing assumes a context that already
failed to exist. Substituting one fallback for the other leaves whichever visitor hit the other
axis with nothing.

### The colour binding

**The preset's own colours are a starting point, NEVER the shipped palette.** A field carries
three colours; a DESIGN:OS page carries a design system. If the field keeps its upstream palette,
the page has two colour authorities and the field wins, because it is the largest surface on
screen.

- **ALLOWED:** derive the field's three colours from DS tokens — typically a surface/background
  role plus one or two accent roles — through the OKLCH reasoning in `knowledge/color-science.md`.
- **NOT ALLOWED:** shipping a preset's upstream hexes, because the field then defines the page's
  palette instead of expressing it, and `ui ds-usage-lint` is measuring the DOM, which a WebGL
  canvas is invisible to — **the gate cannot catch this for you.** That is precisely why it is
  stated as a rule here rather than left to the linter.

**Contrast is measured against the fallback, not the field.** A moving field has no single
background colour, so no contrast ratio computed against it means anything. Set text contrast
against the token-derived CSS gradient from the capability fallback, and it holds in every state.

### One field per viewport, and the Tenant Law

**Max ONE active gradient field per viewport moment**, and a field counts against the SAME
one-effect T6 budget as a Canvas UI effect (`knowledge/canvas-effect-direction.md`) — a page does
NOT get one of each. GPU budget and user attention are both single-occupancy.

When a field is embedded as a section among others — a page the user also builds, not a page the
field owns — [motion-craft.md's Tenant contract](motion-craft.md) binds: `ui tenant-lint` must
pass; an off-screen pause must actually **disarm** (release the RAF subscription and let the
canvas idle, not merely stop visually). Upstream exposes `lazyLoad` / `threshold` / `rootMargin`
on the canvas for exactly this, but an upstream visibility observer counts as evidence only when
it is **verified at page level**, never assumed from source reading.

### The peer-dependency clause

**The install handoff is conditional, and a single command is wrong for a whole class of hosts.**
`@shadergradient/react` renders through React Three Fiber, whose required major depends on the
destination app's framework — resolve it before emitting anything:

| Destination | React | `@react-three/fiber` |
|---|---|---|
| **Next.js 15 App Router** | `^19` | `^9` — REQUIRED, not preferred |
| Next 14 / Next 15 Pages / Vite / CRA | `^18` or `^19` | matching `8.x` or `9.x` |

Next 15's App Router is structurally incompatible with R3F v8. Emitting the generic command into
an App Router project produces an install that resolves and then fails at runtime — the expensive
kind of wrong, because it looks like it worked.

<!-- ease:gradient-handoff:start -->
```bash
npm i @shadergradient/react @react-three/fiber three three-stdlib camera-controls
```
Pin `@react-three/fiber` per the table above before running this, and add the three types as a
dev dependency. Resolve preset slugs from `knowledge/shader-gradient/catalog.json`.
<!-- ease:gradient-handoff:end -->

**`@shadergradient/ui` is NOT installable.** Upstream's control-surface package is not published
to npm; it exists only as an ESM bundle for upstream's own Framer/Figma integrations. NEVER emit
it in a handoff — the install will fail. A control surface, if a brief needs one, is ours to build.

### The preset matrix

Colour character below is descriptive direction, not the preset's parameter values — resolve
actual colours from the DS per § "The colour binding", never from this table.

| Preset | slug | mesh | Narrative job | Anti-use | Required fallback |
|---|---|---|---|---|---|
| Halo | `halo` | plane | A warm directional wash behind a single focal statement — the flattest, most text-friendly field in the roster | A page needing a cool or neutral ground; the grain pass fights small type | Frozen field + warm token-derived linear gradient |
| Pensive | `pensive` | sphere | A deep violet-blue orb for reflective, long-form or end-of-journey moments | Anything urgent, transactional, or conversion-critical — it reads as slow | Frozen field + violet-blue token-derived radial gradient |
| Mint | `mint` | waterPlane | A cool, clean rippling ground for product and utility surfaces that must feel calm and current | A brand with a warm core palette; the cool cast will not bind to warm tokens without distorting them | Frozen field + cool token-derived linear gradient |
| Interstella | `interstella` | sphere | A teal-and-ember orb lit by an environment map — the most physically-present object in the roster | Any surface where the light must stay stable: it is the one preset whose lighting is environment-driven, so it shifts most under change | Frozen field + contrasting token-derived radial gradient |
| Nighty night | `nighty-night` | waterPlane | A near-black rippling field for dark-mode heroes and low-light, end-of-day contexts | A light-mode surface — inverting it to light destroys the composition rather than adapting it | Frozen field + dark token-derived linear gradient |
| Viola | `viola-orientalis` | sphere | A high-contrast primary orb for bold, graphic, brand-forward statements | Dense UI or anything adjacent to text — the internal contrast competes directly with type | Frozen field + high-contrast token-derived radial gradient |
| Universe | `universe` | waterPlane | A violet-to-black expanse for spatial, infinite, or scale-conveying narratives | Compact or bounded sections — it needs full-bleed room or it reads as a smudge | Frozen field + deep token-derived radial gradient |
| Sunset | `sunset` | sphere | A dawn-lit warm/cool orb for optimistic, beginning-of-something moments | Neutral or institutional tone — it carries unmistakable emotional temperature | Frozen field + warm-to-cool token-derived radial gradient |
| Mandarin | `mandarin` | waterPlane | A single-hue orange field for maximum energy with minimum colour complexity | A page whose accent is already warm — the field and the accent will collapse into one another | Frozen field + single-hue token-derived linear gradient |
| Cotton Candy | `cotton-candy` | waterPlane | A near-white pastel field for light surfaces that need atmosphere without weight | Anywhere the field must carry contrast on its own — it is close to white by design and will not | Frozen field + near-white token-derived linear gradient |

### The surface matrix (hand-config only)

**No named preset selects any of these except `defaults`.** Reaching `positionMix`, `cosmic`, or
`glass` means hand-configuring `shader` and `type`, and accepting that the preset roster's
verified looks do not cover it. Each family pairs with all three meshes:

| Shader family | Meshes | Reached by |
|---|---|---|
| `defaults` | `plane` · `sphere` · `waterPlane` | every named preset, and hand-config |
| `positionMix` | `plane` · `sphere` · `waterPlane` | hand-config ONLY |
| `cosmic` | `plane` · `sphere` · `waterPlane` | hand-config ONLY |
| `glass` | `plane` · `sphere` · `waterPlane` | hand-config ONLY |

A hand-configured surface carries the SAME T6 floor as a preset — narrative intent, both
fallbacks, colour binding, teardown. It carries one obligation more: **its own visual
verification at every breakpoint**, because no preset row in the matrix above vouches for how it
looks. An unverified hand-configured surface is the one case where this capability ships
something nobody has ever actually seen.

## Failure Modes

- **Two colour authorities.** The field keeps its upstream palette, so the largest surface on the
  page ignores the design system. `ds-usage-lint` reads the DOM and a canvas is invisible to it —
  nothing fails, and the page is off-brand anyway.
- **One fallback, shipped as if it were both.** `prefers-reduced-motion` is handled, WebGL failure
  is not (or the reverse). Half the failing visitors get a blank hero.
- **The frozen state was never built.** No preset ships `animate: 'off'`, so the reduced-motion
  path renders nothing rather than a still field — and it is invisible in every review done on a
  machine without the setting enabled.
- **Text on the raw field.** Content placed directly on the field instead of on a surface the
  field lights. Contrast becomes unmeasurable and drifts as the animation moves.
- **Contrast measured against the field.** A ratio computed against one frame of a moving surface,
  presented as if it held for all of them.
- **Two T6 effects on one page.** A gradient field plus a Canvas UI effect, each individually
  justified, together over budget — neither file's cap was read as shared.
- **The generic install command into a Next 15 App Router project.** Resolves cleanly, fails at
  runtime, and the failure looks like our bug rather than a peer mismatch.
- **`@shadergradient/ui` in a handoff.** Emitted because the README mentions it; it is not on npm
  and the install fails.
- **A hand-configured surface nobody looked at.** `cosmic` or `glass` selected from this file's
  table, shipped without its own visual verification, on the assumption that catalogued means
  vouched-for.
- **Teardown skipped on route change.** The canvas survives navigation; RAF loops and WebGL
  contexts accumulate until the tab stalls.
