---
id: diagram-layers
description: Native grammar for stacked-band layer diagrams — full-width strata ordered along one axis, where position in the stack carries the whole meaning and no connector crosses a band.
when:
  - stacked-tier-band
  - abstraction-strata
  - layer-cake-section
---

# Diagram grammar: layers

`knowledge/diagram-craft.md` owns the shared contract — grammar routing, token inheritance, the SVG accessibility floor, output shape, and the critique loop. This file states only what is specific to layer stacks.

## Selection

Select this grammar when the subject is a set of strata that **stack**, where each band's meaning comes from its position relative to the bands above and below it, and there is nothing to draw between them. The classic sources: protocol layers, an abstraction ladder, a cascade of overriding scopes, a storage/latency hierarchy, a stack of runtime tiers. The test is subtractive: remove every connector from the picture and the diagram still says everything it needs to. If it does, this is a layer stack. If removing the connectors destroys the meaning, it is not.

Every band must be nameable and every band must sit at a determinable ordinal. A set of peers with no defensible order is not a stack; say so rather than imposing an order the source does not support.

## Decline

Decline, per the shared decline protocol, when:

- Edges between the elements are **reporting relationships between people** — roles, owners, headcount, who answers to whom → `org-chart.md`.
- Edges are **parent-child decomposition of things** — one item breaking down into its constituent items → `tree.md`.
- Regions **enclose** other regions, so the hierarchy is carried by containment rather than by stacked position → `nested.md`.
- The subject is services and their runtime connections — what calls what, what deploys where → `architecture.md`.

Also decline when the bands are not actually ordered (a flat set of categories dressed as a stack), when the source needs cross-band arrows to make sense (that requirement disqualifies this grammar outright, see Connector routing), or when the stack cannot be reduced below the density budget.

## Vocabulary

- **Band** — one full-width rectangle representing one stratum. Every band shares the same x and the same width; only its y differs. One stratum = one band, never split across two rectangles.
- **Index tag** — a short ordinal or code at the band's leading edge (`L3`, `07`, `TRANSPORT`), set in the project's mono/eyebrow token. Numbering is contiguous; a skipped ordinal must be drawn as an explicit elided band, never silently omitted.
- **Band name** — the stratum's name, set inside the band in the project's primary type token.
- **Sublabel** — an optional terse note at the band's trailing edge (a protocol, a latency, an owner). One line, never a sentence.
- **Direction indicator** — a single arrow in the margin *outside* the stack, parallel to the stack axis, labeled with what increases along it (`abstraction ↑`, `packets ↓`). Exactly one per diagram.
- **Segment** — a sub-division of one band into side-by-side cells when that band alone has internal parts. Segments never restack; they divide a band across its width, keep the parent band's height, and are separated by the same hairline divider the stack uses between bands.
- **Elided band** — a band standing in for strata that were collapsed out of scope, labeled with what it replaces and how many (`L4–L5 collapsed`). It occupies a real ordinal so the numbering stays contiguous.

**Label placement is inside the band, always.** Index tag, band name, and sublabel all sit within the band's own rectangle, on one baseline, in that leading-to-trailing order. Nothing that names a band sits beside it — a name in the margin forces the reader to re-associate text with a rectangle on every row, and it makes the stack's edges ambiguous. Only the direction indicator and the artifact's callouts live outside the silhouette. A band whose name will not fit inside it at the project's minimum legible type size is a naming problem or a density problem, never a reason to move the label out.

## Hierarchy

Position is the hierarchy. Do not add a second competing signal: bands are the same height unless the source gives a real reason for one to differ (a band that genuinely spans two ordinals), and fills are either a single surface token throughout with hairline dividers, or a two-token alternation — pick one and hold it for every band.

Exactly one band may take focal emphasis (accent stroke plus a tint fill from the project's accent token), and it earns that only by being the band the explanation is about — the bottleneck, the layer under discussion, the layer being replaced. A stack with three highlighted bands has no hierarchy at all. Every band a different color is the same failure by another route.

## Reading direction

Declare which end is the **foundation** and read from it. The default is bottom-as-foundation: the most concrete, lowest-level, most-depended-upon stratum sits at the bottom and abstraction increases upward. Invert only when the source itself is written the other way (a cascade that overrides downward), and when you invert, the margin direction indicator must say so.

One axis per diagram. Segments inside a band read leading-edge to trailing-edge, which never overrides the stack axis for the diagram as a whole.

## Connector routing

**A layer stack has no cross-band edges.** This is the grammar's defining invariant, not a stylistic preference: adjacency in the stack already states the relationship, and an arrow drawn between two bands claims a specific interaction the stack cannot support. A source that needs those arrows is an architecture diagram wearing bands — route it to `architecture.md`.

`layers` is **not** in the linter's non-orthogonal set, so every stroke the artifact marks as an edge is checked for diagonals. The only edge-marked element this grammar permits is the margin direction indicator, and it must be a single axis-aligned segment — one `V` (or `H`) path, or a `<line>` whose two endpoints share a coordinate. A corner-to-corner stroke is rejected by `ui diagram lint` and has no meaning here anyway. Band dividers are part of the band's own geometry, not edges.

## Density

- 4–6 bands is the working range; 8 is the hard ceiling. Past that, collapse adjacent strata into one named band and state what was merged, or split into a top-level stack plus one detail stack.
- Only one band may carry segments, and at most 3 of them. A second subdivided band means the stack is really two dimensions — split it into two artifacts rather than building a grid.
- Sublabels are optional and per-band; if more than half the bands need one, the notes belong in a caption beside the stack, not inside it.
- One direction indicator and at most two callouts. A second indicator implies a second axis, which this grammar does not have.
- Never solve density by shrinking band height below the project's minimum legible type size plus its padding token — that is the shared contract's shrink-instead-of-scope failure.

## Metadata

Set on the root `<svg>`, per the shared metadata contract:

- `data-diagram-grammar="layers"`
- Every band is a **node**: `data-diagram-element="node"`, with a stable id (`band-<ordinal>-<slug>`). Bands are nodes, never edges — a band is a thing, not a relationship. Segments are nodes too, ided under their parent band.
- The direction indicator, being the only stroke, carries `data-diagram-element="edge"` and a stable id (`edge-direction-stack`). It is the sole edge in the artifact.
- `data-reading-order` — prose naming the foundation end and the ordinal sequence it implies (e.g. "bottom-up: band-1-physical through band-6-application").
- `data-focal-id` — the id of the focal band; when no band is under special discussion, point at the foundation band rather than omitting it.
- `data-source-kind="brief"`.

All color values resolve through the project's tokens — `var(--color-…)`, `currentColor`, `none`, or a `url(#…)` reference. A literal hex, `rgb()`, or `oklch()` in an SVG presentation attribute is rejected by `ui diagram lint`.
