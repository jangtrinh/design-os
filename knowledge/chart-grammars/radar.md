---
id: chart-radar
description: Native grammar for radar/spider charts — three to five entities scored on a shared normalized scale across equally spaced axes, drawn as overlapping polygons with one focal series.
when:
  - multi-axis-profile
  - spoke-scored-comparison
---

# Chart grammar: radar

Cross-cutting rules — accessibility floor, project-token inheritance, the static self-contained output contract, critique loop — live in `knowledge/chart-craft.md`. This file states only what is specific to radar; it does not restate the shared contract.

## Selection

Select this grammar when the brief gives **two or more named entities scored on three to five measurable criteria**, and the question is the *shape* of each entity's profile rather than any single number. Capability evaluations, backend or framework scorecards, team assessments. Radar earns its place where a comparison table runs out of horizontal room and the reader needs to see strengths and gaps at a glance.

Every axis must be quantitative and reducible to one shared normalized scale. Axes that mix a measurement, a category, and a date do not belong on a radar — decline rather than coercing them.

## Decline

Decline, per the shared decline protocol, when:

- **A single series is scored across categories** — one polygon carries no comparison, and the same numbers read more accurately as bars. Route to `chart-grammars/bar.md` and say that the spoke geometry was buying nothing.
- **Exactly two series** — a two-row table or paired bars resolves the difference more precisely than two overlapping polygons.
- **More than five axes or more than five series** — the polygons become mush. Split into two radars on separate axis groups, or fall back to a comparison table, and state which split was taken.
- **Axes cannot share one honest scale** and no defensible normalization exists.
- **The request wants interaction** — hover readouts, togglable series, live data. A chart artifact is a fixed snapshot; route interactivity to `/ui:generate`.

The gantt / timeline / sequence boundary is fixed; state it, never blur it:

- **`chart-grammars/gantt.md`** — tasks with *durations* laid against a calendar; every bar has a start and an end.
- **`chart-grammars/timeline.md`** — dated *instants*; every event is a point, never a span.
- **`diagram-grammars/sequence.md`** — named participants exchanging *messages*; ordering is causal, not calendar-dated. A sequence diagram is not a timeline.

## Vocabulary: axes, rings, series

- **Axis** — one spoke from center to outer vertex, carrying one named criterion. No arrowheads; an axis is a scale, not a direction of travel.
- **Ring** — a closed grid polygon at a fixed fraction of the radius. Five rings at `0.2 / 0.4 / 0.6 / 0.8 / 1.0`; the outer ring carries slightly more weight to anchor the figure.
- **Series** — one entity, drawn as one closed polygon with a stable id. One entity is one polygon; never split an entity across two shapes.
- **Focal series** — the single entity the brief argues for. Exactly one per artifact.

## Hierarchy

One focal series carries `var(--color-accent)`, a heavier stroke, and filled vertex dots on every axis. Non-focal series take `var(--color-chart-1)` … `var(--color-chart-5)` in order, drawn largest-area first so smaller profiles stay visible on top. This is the one grammar that legitimately needs a multi-series palette; use only as many slots as there are non-focal entities, never the full ramp for its own sake.

**Never encode a series by color alone.** Every polygon carries a directly attached label at its widest vertex, or a per-series vertex marker shape (circle, square, triangle, diamond) repeated in its legend swatch. A reader who cannot separate two hues must still be able to name every polygon. This bites hardest here, where four polygons overlap in the same space — treat the direct label as load-bearing, not decorative.

## Reading direction

The first axis sits at the top and axes proceed clockwise, equally spaced. Order the axes by the brief's own narrative — the criterion argued first goes to the top — and keep that order identical across every split artifact of the same comparison. Radial reading is outward: center is the scale floor, outer ring is the ceiling.

## Marks and axes

- **Axis count:** three to five. Below three there is no polygon; above five, split.
- **Scale:** one shared 0–N scale across all axes by default. Per-axis scales are permitted only when the brief's criteria are natively incommensurable, and then each spoke carries its own tick labels and the artifact declares the departure.
- **Units differing:** normalize to the shared scale before drawing, state the normalization in the artifact's description, and name the original unit per axis in the label. Never plot raw values of different units on one ring set.
- **Zero baseline:** the innermost value is the scale's true zero. Never start the inner ring above zero to amplify differences.
- **Ticks:** numeric ticks on the first axis only; repeating them on every spoke clutters the figure.
- **Fill convention:** every polygon fills with its own token color at `fill-opacity="0.18"` and strokes the same token at full opacity; the focal series takes a heavier stroke, not a different fill rule. Opacity is the overlap mechanism — never introduce a blended or lightened literal color to fake transparency. All colors resolve to design tokens; literal hex, rgb, or oklch in SVG presentation attributes is rejected by lint.

## Density

Five axes and five series is the ceiling, not a target. Past it, split by criterion group ("throughput profile" and "operations profile") or drop to a table, and declare what the split left out. Never shrink type or thin strokes to fit another series in.

## Metadata

Set on the root SVG element, per the shared metadata contract:

- `data-chart-grammar="radar"`
- `data-chart-element="mark|axis|series|label"` on every drawn element — polygons and vertex dots are `mark`, spokes and rings are `axis`, series groups are `series`, axis and legend text is `label`
- `data-focal-id` — the id of the focal series; every artifact selects one
- `data-reading-order` — the axis id sequence, clockwise from the top axis
- Stable series ids (`series-<entity-slug>`) that survive regeneration of the same brief, plus the declared scale and any normalization applied
