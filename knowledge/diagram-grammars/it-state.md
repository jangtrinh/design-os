---
id: diagram-it-state
description: Grammar for the current-state estate before a modernisation — departmental zones of existing systems, file-based hand-offs labelled by their real transport, bottlenecks flagged focal, and layer-wide services as footer bars.
when:
  - current-state-landscape
  - pain-point-inventory
  - pre-modernisation-estate
---

# Diagram grammar: it-state

`knowledge/diagram-craft.md` owns the shared contract — token inheritance, the accessible SVG floor, the output shape, and the critique loop. This file states only what is specific to a current-state estate.

## Selection

Select this grammar when the subject is **the estate as it stands today, before change**: the systems that actually exist, grouped by the department or stage that owns them, with the hand-offs between them named by their real transport — a spreadsheet, an emailed file, a copy onto a share — and the friction flagged where it hurts.

This is the "before" companion to a platform proposal. Its job is to make the gap visible: siloed scripts, manual file shuffles, no version control, single points of failure. Naming the ugly transport honestly is the point, not an embarrassment to smooth over.

## Decline

Decline, per the shared decline protocol, when:

- The subject is **which sources and consumers attach to the platform** — that is `knowledge/diagram-grammars/dp-integration.md`, the "after" picture this grammar sets up.
- The subject is **the capability sweep across phases** — that is `knowledge/diagram-grammars/high-level.md`; a phase banner claims coverage, which is exactly what a current state does not have.
- The subject is **data ascending storage quality tiers** — that is `knowledge/diagram-grammars/medallion.md`; a designed tier ladder is not an observed estate.
- The brief describes a target architecture rather than what exists — draw what runs today, or route to the grammar that fits the proposal.

## Vocabulary

- **Zone** — a bounded region for one department or stage (collection, processing, dissemination — or the brief's own names), labelled uppercase and short on a masked break in its own top border.
- **Component** — one existing system inside a zone, with a name and a technical sub-label naming what it actually is.
- **Component kind** — `standard` for a system that simply exists; `focal` for a narrative bottleneck; `external` (dashed stroke, muted ink) for something outside the organisation's control.
- **Hand-off** — a connector labelled with the transport that genuinely carries the data: a file format, an email, a manual copy, a download. An unlabelled hand-off wastes the diagram's only real evidence.
- **Footer bar** — a layer-wide service (identity, observability) spanning the canvas below the zones. It emits no connectors.
- **Legend** — a bottom strip listing only the connector styles and component kinds this diagram actually uses.

Concrete lakehouse component vocabulary: `knowledge/domain-packs/lakehouse.md`.

## Hierarchy

**At most two focal components** — the narrative bottlenecks the proposal exists to remove. Zero is valid when there is no single dominant pain point. Three means two narratives have been collapsed into one canvas: split into one diagram per zone-group instead.

A focal component takes the accent stroke and tinted fill, and any connector touching it renders in the accent style regardless of what it was declared as. For "this is bad but not headline-bad", use a semantic tint instead of promoting it to focal — at most three tinted components, none of them focal, since a tint on a focal component is ignored.

`external` is not a severity: it says "outside our control", and a component can be external and painless. It never counts toward the focal budget.

## Reading direction

Pick **one** orientation and hold it: horizontal (zones left to right, components stacked inside each zone) or vertical (zones top to bottom, components running across). Never mix orientations between zones. Backward references — right-to-left in a horizontal diagram, upward in a vertical one — are permitted only when at least one endpoint is `external`, and must be drawn dashed.

## Connector routing

- Rounded right-angle paths only: exit, run, round the corner, run, land. **No diagonals, ever** — a diagonal here is a hard fail, not a stylistic slip.
- Defaults: same zone with the target below → exit bottom, enter top. Same zone above → exit top, enter bottom. Cross-zone → exit right, enter whichever of the target's edges the path can reach travelling forward.
- **The arrowhead must visibly touch the target's edge.** End the path on the rectangle border, never at its centroid and never short of it.
- **Marker-visibility rule.** An arrowhead's body extends backwards along the path from the endpoint, so it is only visible when that tail sits *outside* the target box. Entering a left edge travelling right, a right edge travelling left, a top edge travelling down, or a bottom edge travelling up all work. Entering a top edge travelling *up*, or a bottom edge travelling *down*, buries the arrowhead — detour through the neighbouring zone background and come in from a side edge instead.
- When several connectors land on one target's edge, fan their attachment points down that edge with even spacing.
- Place each label at the **start** of the connector, on the segment anchored at the source, offset perpendicular to the stroke so it never sits on the line. Never bury a label mid-path: the start position is what makes the direction readable. Give it an opaque backing anyway, since it can graze a zone fill.
- Emit all connectors before any component shape so the fills mask the line ends; a connector's label draws after its own line so the backing sits on top. **Footer bars emit no connectors.**

## Density

Budget: **2–4 zones**, **≤ 5 components per zone**, **≤ 16 components total**, **≤ 3 footer bars**. Zone widths follow their component count, so a zone holding five systems is visibly wider than one holding two — that asymmetry is information, not a defect to even out.

Grow a component box to fit a two-line sub-label rather than truncating it; the sub-label is where the evidence lives ("no version control", "manual bottleneck"). Past the budget, split — most naturally one diagram per pain-point cluster ("collection friction", "dissemination friction") — rather than shrinking components or dropping their sub-labels.

## Colors

Every fill, stroke, and text color resolves to a design token — `var(--color-…)`, `currentColor`, `none`, or `url(#…)`. A literal hex, `rgb()`, or `oklch()` in an SVG presentation attribute is rejected by `ui diagram lint`. Connector style is topology-driven; a component tint never spreads to its edges. Icons inherit ink through `currentColor` and are real glyphs at a readable size — a three-letter text badge is a label, not an icon.

## Metadata

On the root SVG, per the shared metadata contract:

- `data-diagram-grammar="it-state"`
- `data-diagram-element="node"` on every zone, component, and footer bar; `data-diagram-element="edge"` on every hand-off
- a unique, **stable** id per edge (`edge-<from-id>-<to-id>`), built from the component slugs so it survives regeneration of the same brief
- `data-focal-id` — the id of the primary bottleneck; when a second focal exists, name it in `<desc>`; when none exists, the entry component of the first zone anchors the reading order
- `data-reading-order` — the zone sequence in prose, naming the hand-off that crosses each boundary
- `data-source-kind="brief"`

## Failure modes

A diagonal hand-off; an arrowhead buried inside the target or stopping short of it; a label sitting on the stroke mid-segment; a footer bar wired to one component; text badges standing in for icons; `focal` used to flag every painful thing; two orientations mixed in one canvas.
