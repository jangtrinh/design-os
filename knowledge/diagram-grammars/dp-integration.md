---
id: diagram-dp-integration
description: Grammar for a data-platform integration topology — source systems on the left, consumer surfaces on the right, a hub-and-spoke platform zone between them, and layer-wide services as footer bars that connect to the zone rather than to any component.
when:
  - source-to-consumer-topology
  - integration-hub-spoke
  - platform-zone-rows
---

# Diagram grammar: dp-integration

`knowledge/diagram-craft.md` owns the shared contract — token inheritance, the accessible SVG floor, the output shape, and the critique loop. This file states only what is specific to an integration topology.

## Selection

Select this grammar when the subject is **which sources and consumers attach to the platform, and over what wire**. The brief must name the individual systems that plug in on each side and, for each one, the protocol or transport it speaks. The diagram's claim is the *number of distinct integration surfaces*; every wire carries a protocol label, because that is how an integration team reads it.

There is no time axis and no phase axis here. If the picture needs one, it is a different grammar.

## Decline

Decline, per the shared decline protocol, when:

- The subject is **the capability sweep across phases** — that is `knowledge/diagram-grammars/high-level.md`; phase chevrons across the top belong there and never here.
- The subject is **data ascending storage quality tiers** — that is `knowledge/diagram-grammars/medallion.md`; one dataset at several quality levels is not an integration surface.
- The subject is **the estate as it stands today, before change** — that is `knowledge/diagram-grammars/it-state.md`, the "before" companion to this grammar's "after".
- Fewer than three distinct systems exist on either side, or the brief wants sources collapsed into one box — collapsing is exactly what this grammar refuses.

## Vocabulary

- **Source** — one external system that pushes or exposes data, drawn in the left column. Never collapse several distinct sources into one node.
- **Consumer** — one surface that reads the platform, drawn in the right column.
- **Platform zone** — the explicit container between the columns, labelled across a break in its own top border. Everything inside it is the platform; everything outside it is not.
- **Row** — a horizontal band inside the zone holding N evenly spaced component nodes.
- **Bar** — a full-zone-width strip inside the zone, for a component that acts on the whole row beneath it (a scheduler, a federated query surface).
- **Footer bar** — a layer-wide service (identity, secrets, observability, audit) drawn *below* the zone, spanning the full canvas width. It gates the layer, so drawing it inside the zone misstates the trust model.

Concrete lakehouse component vocabulary: `knowledge/domain-packs/lakehouse.md`.

## Hierarchy

**Exactly two focal components**, and they are what distinguishes a platform from a pile of tools:

1. the **storage hub** — the surface everything writes into and reads from, and
2. the **federation engine** — the surface that answers queries across whatever is stored.

If the brief has no equivalent of one of those two, this may not be a platform diagram; say so rather than promoting a third component. Every other component — ingest tool, notebook surface, scheduler, identity service, all sources, all consumers — stays neutral. At most two further components may carry a semantic tint; a tint on a focal component is ignored, because the accent already carries that signal.

## Reading direction

**Left to right**: sources → platform zone → consumers. Inside the zone, rows stack top to bottom, with the primary row anchored at the same vertical band as the side columns so its connectors stay horizontal. Footer bars read last and upward — their arrows point *into* the zone's bottom edge, which is the only place in this grammar where an edge runs against the dominant direction.

## Connector routing

- Orthogonal elbows with **at most two bends**, rounded corners, no straight diagonals.
- Exit the **right** of a source, enter the **left** of the target, for source → platform, platform → platform in the same row, and platform → consumer alike.
- A bar drops **vertically** from its own bottom edge into the top edge of each target it triggers: dashed, unlabelled, no bends.
- **Serve-flow rule.** Every edge from the federation engine to a consumer is drawn in the accent style, regardless of anything the brief says about that consumer. It is the platform's public face; the accent is what shows that.
- Every edge touching a focal component uses the accent style. Federation queries that bypass the ingest path (a source read directly by the query engine) get their own distinct dashed link style so the bypass is legible.
- **Footer bars connect to the zone's bottom edge and nowhere else.** An arrow from a footer to one named tool understates the trust scope and is a hard fail. With several footers, stagger their vertical lines by a fixed stride around the zone's center so they never overlap.
- Stagger fan-out exits by a few pixels per sibling, and run the vertical segments in the corridor between the zone edge and the side column.
- Emit all connectors before any node shape. One arrowhead per edge, at the target end. Every edge except a trigger drop carries a protocol label on an opaque backing.

## Density

This grammar deliberately exceeds the usual node budget: **4–6 sources, ~5 platform components, 4–6 consumers, 1–3 footer bars** — 14 to 20 nodes. The count *is* the claim; compressing it destroys the claim.

When it still overflows: merge genuinely identical sources into one node with a count in its sub-label ("4 × relational"), or split by integration plane — one diagram for data, one for identity, one for observability. Never shrink type to fit.

## Colors

Every fill, stroke, and text color resolves to a design token — `var(--color-…)`, `currentColor`, `none`, or `url(#…)`. A literal hex, `rgb()`, or `oklch()` in an SVG presentation attribute is rejected by `ui diagram lint`. Connector color is topology-driven: a component tint never spreads to its edges. If you want a differently coloured edge, you want a different edge style.

## Metadata

On the root SVG, per the shared metadata contract:

- `data-diagram-grammar="dp-integration"`
- `data-diagram-element="node"` on every source, consumer, zone row node, bar, and footer bar; `data-diagram-element="edge"` on every connector
- a unique, **stable** id per edge (`edge-<source>-<target>`), unchanged across regenerations of the same brief
- `data-focal-id` — the id of the storage hub, the primary of the two focal components; name the second focal in `<desc>`
- `data-reading-order` — sources → platform → consumers in prose, closing with the layer-wide footers
- `data-source-kind="brief"`

## Failure modes

Sources or consumers collapsed into one node; a single bus arrow standing in for many labelled wires; per-tool colour coding inside the zone; more or fewer than two focal components; a footer wired to one specific tool; identity drawn inside the zone; phase chevrons imported from the high-level grammar.
