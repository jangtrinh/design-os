---
id: diagram-medallion
description: Grammar for storage tiers of one dataset ascending in quality — a left-to-right strip of tier cards carrying tool, format, writer, and a concrete example payload, joined by cubic promotion arcs that rise over the cards.
when:
  - storage-tier-promotion
  - quality-layer-ascent
  - tiered-refinement-arc
---

# Diagram grammar: medallion

`knowledge/diagram-craft.md` owns the shared contract — token inheritance, the accessible SVG floor, the output shape, and the critique loop. This file states only what is specific to a tiered-storage picture.

## Selection

Select this grammar when the subject is **data ascending storage quality tiers**: the same dataset held at several distinct quality or access levels — raw landing, de-identified, cleaned/staging, aggregated indicators, cold archive — and the reader needs to see, per tier, what it holds, who writes it, with what tool, in what format, and how data is promoted to the next tier.

The unit here is a **tier**, not a component. A tier is a level of one dataset; two tiers are the same data at different quality.

## Decline

Decline, per the shared decline protocol, when:

- The subject is **the capability sweep across phases** — that is `knowledge/diagram-grammars/high-level.md`. Prefer it whenever the picture is really about the cluster architecture rather than the storage tier organisation; the two look alike and this is the line between them.
- The subject is **which sources and consumers attach to the platform** — that is `knowledge/diagram-grammars/dp-integration.md`; a tier is not an integration surface.
- The subject is **the estate as it stands today, before change** — that is `knowledge/diagram-grammars/it-state.md`; tiers describe a designed target, not observed friction.
- Fewer than three tiers exist, or the brief cannot say what each tier concretely contains — an abstract tier strip stops earning its space.

## Vocabulary

- **Tier** — one tall card in the strip: header band, tier name, the storage location it maps to, then labelled field rows and an example section.
- **Fields** — the four things every tier must answer: the **tool** that writes it, the **format** it lands in, the **writer** role responsible, and a one- or two-line **example payload** under a domain-specific heading. A tier missing its example is not finished.
- **Tier style** — `outer` for the first, ingest-facing tier; `default` for the working tiers; `focal` for the one analytical pivot; `cold` (dashed, fogged) reserved strictly for a retention or archive tier.
- **Promotion** — the transformation that moves data from one tier to the next, named as a short uppercase verb ("PII REMOVE", "AGGREGATE", "LIFECYCLE").
- **Path card** — an optional bottom row of at most two cards describing *write methods* (how data moves between tiers), never what a tier holds.

Concrete lakehouse component vocabulary: `knowledge/domain-packs/lakehouse.md`.

## Hierarchy

Default style mapping when the brief does not state one: the first tier is `outer`, the last is `cold`, the analytical pivot is `focal`, everything between is `default`. Override only with a reason — the mapping is what lets a reader recognise the strip's shape before reading a single word.

Exactly **one focal tier** — the analytical pivot, normally the tier downstream consumers actually query. It carries the accent fill, a heavier stroke, an accent header band, and renders its location line and example payload in accent; its other field values stay muted so the card does not drown. The promotion arc *into* the focal tier is automatically promoted to the accent style; the arc *out of* it keeps its declared style, usually the dashed lifecycle move into archive.

At most two further tiers or path cards may carry a semantic tint; a tint on the focal tier is ignored, and a `cold` tier takes either its dashed treatment or a tint, never both.

## Reading direction

Strictly **left to right**, quality ascending. Promotions are adjacent-tier only, and there is exactly one fewer promotion than there are tiers. **Backflow is forbidden** — an aggregate writing back into raw is a different picture; use another grammar rather than reversing an arc.

## Connector routing

Promotions are **cubic arcs over the top of the strip**, not lines through the gaps. Reserve a band above the cards for them.

- Anchor each arc at the **top-center** of the source tier and the **top-center** of the next tier, with both control points directly above their anchors at the top of the band. The curve peaks roughly a quarter of the way down the band, and the tangent at landing is straight down, so the arrowhead enters the target's header band cleanly.
- Consecutive arcs share their meeting point: each tier's top-center is a joint where data lands, is transformed inside the card, and leaves again. That chaining is the grammar's signature motion — do not break it with a horizontal jog.
- Cubic arcs are the permitted exception to the orthogonal-connector rule; a straight diagonal segment is still rejected by `ui diagram lint`.
- Style by topology: neutral for a normal promotion, accent for the arc landing in the focal tier, dashed for a lifecycle/retention move. If the target tier carries a tint, the arc, its label, and its arrowhead adopt that tint at normal weight — arcs inherit from the **target** only, never the source.
- Label each arc **inside** the space the arc encloses, below the curve's peak, uppercase and short. No masking rect is needed there; if a label needs one, the arc band is too shallow.
- Emit every arc before any tier card so the cards mask any overshoot. One arrowhead per arc, at the landing end.

## Density

Budget: **3–6 tiers**, one arc per adjacent pair, at most two path cards. Keep promotion labels to roughly fourteen characters — a long verb phrase breaks the rhythm; shorten it, or admit the step is two steps and split the diagram.

Field values wrap to two lines; anything longer belongs in the brief, not the card. Beyond six tiers, split by dataset rather than narrowing the cards.

Tier cards are a fixed width across the strip — one wide card next to four narrow ones destroys the "same data, different level" reading. If one tier needs more room than the others, it is carrying content that belongs in a path card or in the brief.

## Colors

Every fill, stroke, and text color resolves to a design token — `var(--color-…)`, `currentColor`, `none`, or `url(#…)`. A literal hex, `rgb()`, or `oklch()` in an SVG presentation attribute is rejected by `ui diagram lint`. A tier's tint colours its card, header band, location line, and example values; field labels and field values stay neutral, and the arrowhead marker must be defined per tint rather than recoloured inline.

## Metadata

On the root SVG, per the shared metadata contract:

- `data-diagram-grammar="medallion"`
- `data-diagram-element="node"` on every tier card and path card; `data-diagram-element="edge"` on every promotion arc
- a unique, **stable** id per arc (`edge-<from-tier>-<to-tier>`), unchanged across regenerations of the same brief
- `data-focal-id` — the id of the single focal tier
- `data-reading-order` — the tier names in ascending order, naming the promotion between each pair
- `data-source-kind="brief"`

## Failure modes

More than one focal tier; cold styling on a tier that is not an archive; a bidirectional or backward promotion; an arc recoloured from its source tier instead of its target; path cards that explain what a tier holds; a tier with no concrete example payload; promotion labels long enough to collide with the arcs above them.
