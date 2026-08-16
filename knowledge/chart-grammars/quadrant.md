---
id: chart-quadrant
description: Native grammar for 2×2 quadrant charts — items or named cells placed against two judged axes whose crossing origin carries a stated meaning.
when:
  - two-axis-positioning
  - four-cell-placement
---

# Chart grammar: quadrant

`knowledge/chart-craft.md` owns the shared contract — grammar routing, token inheritance, the SVG accessibility floor, the static single-snapshot output shape, and the critique loop. This file states only what is specific to quadrants.

## Selection

Select this grammar when the subject is a set of items judged against **two named dimensions at once**, and the reader's takeaway is which of four regions each item lands in. Prioritisation frames (impact × effort), positioning frames (reach × frequency), portfolio maps, and four-futures scenario frames all read this way.

Two conditions must hold before authoring. Both axes must be nameable in one word each, and the **origin must mean something** — "median of the set", "today's position", "the break-even line". A quadrant whose crossing point is arbitrary places every item unfalsifiably, and its four regions are then decoration.

Two variants share this geometry. The **positioned variant** places marks inside cells, and position within a cell carries meaning. The **cell variant** names one scenario per cell and places no marks; position within a cell then carries nothing. Pick one per artifact and hold it.

## Decline

Decline, per the shared decline protocol, when:

- The two dimensions hold **measured values on continuous scales** — real numbers read off a dataset rather than judged placements → `chart-grammars/scatter.md`. This is the sharpest boundary this grammar has: a quadrant asserts *judgement* against two named axes with a meaningful origin, a scatter reports *measurement*. If the coordinates came from data, it is a scatter, and rounding measured data into four buckets discards the precision the reader came for.
- One dimension carries the whole comparison — a ranking, a magnitude per category → `chart-grammars/bar.md`.
- The grid is roles against components, or any grid wider than 2×2 whose cells hold access or status values → `diagram-grammars/dp-security-matrix.md`. A 3×3 or 2×3 is a different artifact, not this grammar stretched.
- The reader is meant to filter, hover, or re-sort the placements. This capability ships one static snapshot; route interactivity to `/ui:generate`.

Also decline when the origin's meaning cannot be stated, or when items would have to sit on an axis line to be honest — an on-axis item belongs to no quadrant and the claim collapses.

## Vocabulary

- **Axis** — one of exactly two lines crossing at the origin, drawn hairline through the full plot. Each axis is named by a **single word at each tip**: no arrow glyphs baked into the text, no parentheticals, no `HIGH`/`LOW` modifiers. Labels sit beyond the tip, never on the line, and never at the midpoint.
- **Origin** — the crossing point. Its meaning is stated once, as a short caption beside the cross or in the artifact's `<desc>`, and never left implicit.
- **Cell** — one of the four regions, carrying a stable id and a short corner tag naming its axis combination. Corner tags must use the same words as the axis labels; a tag that disagrees with its axes reads as a bug on first pass.
- **Item mark** — in the positioned variant, one small dot per item with a direct text label offset 8–10px, placed clear of both axis lines.
- **Scenario** — in the cell variant, a named title plus one to three lines of description, left-aligned inside its cell.

## Hierarchy

Exactly one focal element per artifact: one item mark in the positioned variant, one cell in the cell variant. The focal element takes `var(--color-accent)`; everything else takes one neutral token treatment. Two accents erase the signal; a template with none is unfinished.

Do not fill the four cells in four different colors. Position plus label already carries the whole claim, and four fills add a second, competing hierarchy that says nothing the geometry has not said.

## Reading direction

Declare which corner the reader starts from and why — normally the corner the recommendation lives in (top-right under an up-is-better convention), then the remaining cells in a stated rotation. Axis polarity is part of that declaration: state which direction is "more" on each axis, since neither the geometry nor a one-word tip label proves it.

## Marks and axes

- Both axes are the same weight; the axis pair is the figure's spine and outranks every cell boundary in visual weight.
- Item marks are uniform in size. Mark size is not a third encoded dimension — a bubble sizing convention belongs to `chart-grammars/scatter.md`.
- Never place a mark on an axis line. If the honest placement is on the line, the item's value is undecided; say so in the caption or drop it from scope.
- Colors resolve through project tokens only: `var(--color-chart-1)` … `var(--color-chart-5)` for grouped marks, `var(--color-accent)` for the focal element, `currentColor` or `none` otherwise. A literal hex, `rgb()`, or `oklch()` in an SVG presentation attribute is rejected by lint.
- **Never encode meaning by color alone.** Every mark carries a direct text label, and any grouping shown by color is repeated as a shape, a pattern fill, or a labelled cluster.

## Density

- **12 item marks is the ceiling**; 6–9 is the working range. The cell variant is capped at one scenario per cell — four.
- Collision policy, in order: offset the colliding label to the mark's opposite side; then attach a leader line to clear space inside the same cell; then merge the colliding items into one named cluster mark and state the merge in the caption; then split into two artifacts by sub-scope. Never shrink type below the project's minimum legible size, and never drop an item silently to buy room.
- A label may not cross an axis line or leave its own cell. A label that cannot be placed inside its cell means the artifact is over its density budget.

## Metadata

Set on the root `<svg>`, per the shared metadata contract:

- `data-chart-grammar="quadrant"`
- `data-chart-element="mark|axis|series|label"` on every element: the two axis lines and their tip labels are `axis`, item dots and scenario cells are `mark`, a grouping of items is `series`, every text label is `label`.
- Stable ids for all four cells, from the axis words rather than position (`cell-high-impact-low-effort`), so an id survives a re-render that flips a polarity. Item marks are ided `mark-<slug>`.
- `data-focal-id` — the id of the accented item or cell; every artifact selects one.
- `data-reading-order` — prose naming the starting corner, the rotation, and the polarity of each axis.
- The origin's meaning is stated in the `<desc>` alongside the reading order; an artifact whose origin is undeclared is not done.
