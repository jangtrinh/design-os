---
id: diagram-nested
description: Native grammar for containment diagrams — concentric regions where an enclosing boundary means "broader scope", inward means "more specific", and no stroke ever crosses an enclosure wall.
when:
  - containment-enclosure
  - boundary-within-boundary
  - scope-nesting
---

# Diagram grammar: nested

`knowledge/diagram-craft.md` owns the shared contract — grammar routing, token inheritance, the SVG accessibility floor, output shape, and the critique loop. This file states only what is specific to containment diagrams.

## Selection

Select this grammar when the hierarchy is carried by **enclosure**: each level is a region that wholly contains the next, and the relationship being shown is "inside of" / "scoped by" / "within the blast radius of". Trust boundaries, configuration cascades, scope resolution, permission perimeters, and directory nesting all read this way.

The test is spatial, not lexical: if every child sits geometrically inside its parent and no child belongs to two parents, containment is the true shape. A source where one item legitimately belongs to two enclosing scopes is a graph, not a nesting — say so and decline rather than drawing overlapping regions.

## Decline

Decline, per the shared decline protocol, when:

- Edges are **reporting relationships between people** — owners, roles, escalation paths → `org-chart.md`.
- Edges are **parent-child decomposition of things**, drawn as connectors between separated nodes rather than as one region inside another → `tree.md`. The discriminator is drawn form: a tree spends edges, a nesting spends walls. When both would read, pick nesting only if enclosure itself is the point.
- Bands **stack** with no cross-band edges, so position rather than containment carries the order → `layers.md`.
- The subject is services and their runtime connections — what calls what, what deploys where → `architecture.md`. A zone drawn behind a set of communicating services is an architecture zone, not a nesting; the connectors between the services are what the reader came for.

Also decline when the source needs more than five levels, or when content that is not part of the hierarchy has to live inside a region to make the picture work.

## Vocabulary

- **Region** — one rounded rectangle representing one scope level, drawn as an enclosure with a visible wall and a near-transparent fill. A region is a **node**, not an edge, and not a container decoration: it is a first-class element with an id and a name.
- **Wall** — a region's stroke. Wall weight and opacity are the grammar's hierarchy signal (see Hierarchy); the wall is never dashed unless the region's boundary is genuinely permeable in the source, and that convention is then stated once in the metadata description.
- **Level label** — the region's name, set at its leading top corner in the project's eyebrow/mono token, sitting on a surface-colored mask rect that breaks the wall behind it. Labels sit **on** the wall, never floating inside the region's interior where they would be mistaken for content.
- **Inset** — the uniform padding between a region's wall and the wall of the region it holds. One horizontal inset value and one vertical inset value for the whole artifact; irregular insets read as accident, not as meaning.
- **Leaf content** — the innermost region's payload: at most a few labeled nodes or one glyph. Everything drawn inside a region must be part of that scope.

**A boundary is drawn differently from a node, and the difference must survive a squint.** A region carries a near-transparent fill, a wall the reader sees straight through, a label that breaks the wall at the top corner, and further geometry inside it. A content node carries a solid surface fill, a full-weight stroke, a label centered in its interior, and nothing nested within it. Never draw a region with a solid fill (it stops reading as an enclosure and starts reading as a big node) and never nest anything inside a content node (it stops reading as a node and starts reading as an unlabeled region). Two rounded rectangles that differ only in size are the single most common failure of this grammar.
- **Callout** — an optional annotation outside the outermost wall, tied to one region. Two maximum.

## Hierarchy

Outer is broader; inner is more specific. Encode that with one monotonic progression and no other: wall opacity and weight step up from the faintest outermost region to the strongest innermost, and interior fills step up in opacity by the same number of steps. Every region reads its depth from that ramp alone.

Exactly one region takes the accent treatment, and it is the region the explanation is about — normally the innermost, sometimes the boundary being crossed or hardened. Accent on two regions collapses the ramp and the depth signal with it. Do not add size or corner-radius variation as a second signal; the radius token is constant across every level, and size is already fully determined by depth and inset.

## Reading direction

Outside-in. The declared reading order starts at the outermost region and names each level inward to the leaf, because the outer scope is the context a reader needs before the inner one means anything. Where several regions sit side by side at the same depth, they read in the project's text direction after their shared parent, never before it — DOM order must match that sequence so a screen reader traverses the nesting the same way the eye does.

## Connector routing

**No stroke crosses an enclosure wall.** An arrow that pierces a region's boundary contradicts the one claim the diagram makes — that the wall is what separates scopes. Anything that must reach across levels is expressed as a callout tied to a region, not as a connector.

Connectors are therefore permitted only between siblings inside the same region, and only when the source states a real relationship between them. `nested` is **not** in the linter's non-orthogonal set, so those connectors must be orthogonal: elbow paths built from `H`/`V` segments, or an explicit curve command. A corner-to-corner `<line>` or an `L` segment that changes both coordinates is rejected by `ui diagram lint` as a diagonal. Region walls themselves are node geometry, not edges, and are never marked as edges to dodge that check.

## Density

- Maximum nesting depth is **5**; 3–4 is the working range. Past five levels the innermost region has no room left for content and the ramp runs out of distinguishable steps — split into an outer-scope artifact plus a detail artifact that re-enters at the level where the first stopped.
- Maximum **4 sibling regions** at any one depth, and siblings may only appear at one depth per artifact. Side-by-side siblings at two different depths turn the nesting into a layout puzzle.
- The leaf region holds at most 4 content nodes. More than that means the leaf is really its own diagram.
- Both inset values are constant for the whole artifact. Tightening the inset at one depth to fit a long label makes the nesting read as accidental, and the ramp then has to carry a depth signal the geometry is contradicting.
- Insets never shrink to buy a sixth level. Depth is a scope decision, per the shared contract, not a padding decision.

## Metadata

Set on the root `<svg>`, per the shared metadata contract:

- `data-diagram-grammar="nested"`
- Every enclosing region is a **node**: `data-diagram-element="node"`, with a stable id encoding its depth (`region-<depth>-<slug>`). A region is a thing that contains, never a relationship — nothing in this grammar marks a wall as an edge.
- Sibling connectors, where they exist, are the only elements carrying `data-diagram-element="edge"`, each with a stable id (`edge-<source>-<target>`) that survives regeneration of the same brief.
- `data-reading-order` — prose naming the outside-in traversal (e.g. "outermost region-1-org inward to region-4-session").
- `data-focal-id` — the id of the accented region; when no region is under special discussion, point at the innermost region rather than omitting it.
- `data-source-kind="brief"`.

All color values resolve through the project's tokens — `var(--color-…)`, `currentColor`, `none`, or a `url(#…)` reference. A literal hex, `rgb()`, or `oklch()` in an SVG presentation attribute is rejected by `ui diagram lint`.
