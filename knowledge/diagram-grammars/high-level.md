---
id: diagram-high-level
description: Grammar for a platform capability sweep — an ordered phase chevron banner acting as legend over a deployment boundary, with an orchestration bar inside it and cross-cutting concern bars stacked below.
when:
  - phase-chevron-banner
  - platform-capability-sweep
  - cross-cutting-footer-bars
---

# Diagram grammar: high-level

`knowledge/diagram-craft.md` owns the shared contract — token inheritance, the accessible SVG floor, the output shape, and the critique loop. This file states only what is specific to a high-level sweep.

## Selection

Select this grammar when the subject is **the capability sweep across phases**: the brief names an ordered run of phases (collect → store → transform → present, or the project's own wording), assigns each named component to exactly one phase, and the point of the picture is that the platform covers every phase end to end.

The phase banner is the legend. Every component's horizontal center must sit on its phase's chevron center — that alignment is the whole contract, and a brief that cannot fill the banner cannot use this grammar.

## Decline

Decline, per the shared decline protocol, when:

- The subject is **which sources and consumers attach to the platform, and over what wire** — that is `knowledge/diagram-grammars/dp-integration.md`, which spends its canvas on integration surfaces and protocol labels instead of a phase axis.
- The subject is **data ascending storage quality tiers** — that is `knowledge/diagram-grammars/medallion.md`; tiers are quality levels of one dataset, not phases of a platform.
- The subject is **the estate as it stands today, before change** — that is `knowledge/diagram-grammars/it-state.md`; a current-state picture flags friction, it does not claim phase coverage.
- The brief names phases but no components to place under them — a banner with empty columns is a list wearing a costume.

## Vocabulary

- **Phase chevron** — one arrow-shaped banner cell per phase, laid left to right along the top, notched into its neighbour so the band reads as a single run. Phase name only; never a component name.
- **Concern chevron** — a phase chevron rotated into a reserved vertical strip on the right edge, for a concern that spans every phase rather than occupying one (orchestration, security, observability, governance, backup).
- **Deployment boundary** — the solid container holding everything the platform actually runs.
- **External source zone** — a dashed container to the left of the boundary. Dashed is the signal "outside the deployment"; never draw it solid.
- **Node** — one named component inside the boundary, owned by exactly one horizontal phase. Never assign a node to a concern chevron.
- **Orchestration bar** — a strip spanning the boundary's inner width, for the scheduler that triggers work in several phases.
- **Cross-cutting bar** — a strip spanning the full body width *below* the boundary, one per layer-wide concern. It applies to everything, so it must not sit inside the boundary.

Concrete lakehouse component vocabulary: `knowledge/domain-packs/lakehouse.md`.

## Hierarchy

Exactly **one focal node** per diagram — normally the component the rest of the platform reads from or writes to. It carries the accent fill and stroke; every other node stays neutral. Two focal nodes erase the signal.

Every concern chevron pairs **1:1** with exactly one spanning component: the orchestration bar, or one cross-cutting bar. A concern chevron with no paired bar (or a bar with no chevron) is an incomplete diagram — resolve it before drawing, do not ship the orphan. Declare the pairs top-down in the strip: the bar-paired concern first, then the cross-cutting concerns in the order their bars stack.

Beyond the focal accent, allow at most two components to carry a semantic tint; a third erases the hierarchy the accent was buying.

## Reading direction

Strictly **left to right** through the phase banner, and every node inherits its column from that banner. The concern strip reads top to bottom and carries no components. Cross-cutting bars read last, as ground the whole sweep stands on. Never introduce a second horizontal direction — a backward edge means the phase order is wrong, not that the arrow is clever.

## Connector routing

- Orthogonal elbows only, **at most two bends** per path, with a small rounded corner at each bend. No straight diagonals; a curve is acceptable where an elbow would be ugly.
- Exit the **right** side of a source node, enter the **left** side of the target. The orchestration bar is the exception: it drops **straight down** from its own bottom edge into the target's top edge, dashed, unlabelled, never elbowed.
- **Fan-out trunk.** When one element feeds several targets, run horizontally to a single shared trunk x — just past the source's phase divider — then vertically, then horizontally into each target. All siblings share the trunk; they never each invent their own bend.
- When several sources land on one target, stagger their entry points evenly down the target's left edge so arrowheads do not stack.
- Cross-cutting bars and concern chevrons **emit no connectors at all**. Their span is their claim.
- Emit every connector before any node shape so node fills mask the line ends. One arrowhead per connector, at the target end only.
- Label the meaningful edges (what moves, or over what) and leave orchestration triggers unlabelled; a label needs an opaque backing so the stroke never reads through it.

## Density

Budget: **≤ 4 external sources**, **≤ 3 outgoing edges per node**, one orchestration bar, and as many cross-cutting bars as there are paired concern chevrons. A node with a fourth outgoing edge is secretly the hub — make it the focal node, or split.

Grow the canvas downward when concerns stack; never shrink nodes or type to fit. Past the budget, take the shared contract's scope-or-split decision: one sweep per platform plane, or a sweep plus a per-phase detail diagram.

## Colors

Every fill, stroke, and text color resolves to a design token — `var(--color-…)`, `currentColor`, `none`, or `url(#…)`. A literal hex, `rgb()`, or `oklch()` in an SVG presentation attribute is rejected by `ui diagram lint`. Semantic tints (a security bar, an observability bar) are token references too; if the project has no token for the concern, use the neutral and say so.

## Metadata

On the root SVG, per the shared metadata contract:

- `data-diagram-grammar="high-level"`
- `data-diagram-element="node"` on every chevron, node, and bar; `data-diagram-element="edge"` on every connector
- a unique, **stable** id per edge (`edge-<source>-<target>`), unchanged across regenerations of the same brief
- `data-focal-id` — the id of the single focal node
- `data-reading-order` — the phase sequence in prose, left to right, ending with the cross-cutting bars
- `data-source-kind="brief"`

## Failure modes

Node centered off its chevron (breaks the banner-as-legend contract); a solid border on the external source zone; a cross-cutting bar drawn inside the deployment boundary; a concern chevron overlaid on the boundary instead of in its reserved strip; more than one focal node; orchestration triggers drawn solid; a source fanning out to four targets with no hub.
