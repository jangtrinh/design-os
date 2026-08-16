---
id: chart-scatter
description: Native grammar for two measured variables plotted against each other — one point per observation, axes scaled to the data's real range, and clusters and outliers left visible.
when:
  - paired-variable-correlation
  - point-cloud-distribution
---

# Chart grammar: scatter

Cross-cutting rules — accessible inline SVG, project-token inheritance, output contract, critique loop, shared failure taxonomy — live in `knowledge/chart-craft.md`. This file states only what is specific to scatter plots.

## Selection

Select this grammar when every observation carries **two measured numeric variables**, and the relationship between them — correlation, clustering, spread, outliers — is the message: effort against impact, price against usage, load against latency. Two conditions must both hold:

1. Both axes are quantitative and measured. Neither is a rank, a category, or an opinion.
2. The observations are **unordered**: shuffling them changes nothing, because no point follows another.

The absence of a relationship is a valid finding, and this grammar is the right way to show it.

## Decline

Decline, per the shared decline protocol, when:

- The observations form an **ordered series** along one axis — samples over time or an index. That is `line.md`. A cloud of points hides the sequence, and the trajectory between consecutive samples, which is the whole message there, is not drawn.
- The two axes are **judged placements** rather than measurements — "high effort, low risk" assigned by a workshop. That is `quadrant.md`. Substituting a scatter dresses judgement as measurement: it implies a scale, a unit, and a distance between points that were never measured, and readers will compute differences from positions nobody computed.
- Each item has **one magnitude under a name** rather than a measured pair — that is `bar.md`.
- The subject carries **no quantities at all**. That is a diagram; route to `knowledge/diagram-craft.md` and let it select a grammar.
- The request needs hover identification, lasso selection, filtering, or live data. Chart artifacts are static and script-free; route interactive work to `/ui:generate`.

## Vocabulary

- **Point** — one observation, drawn as a single mark at its measured coordinates. One observation = one point; never merge two observations into a shared mark.
- **Focal point** — at most one observation drawn in `var(--color-accent)` at a slightly larger radius, when the message names a specific item. A plot about distribution as a whole may have none — say so rather than inventing one.
- **Group** (optional) — up to four labelled subsets, each with its own marker shape *and* its own series token.
- **Point label** — a short name beside a point, set over an opaque backing shape so it never sits on top of another mark. Label the focal point and at most two notable outliers; labelling everything erases the cloud.
- **Trend line** (optional) — one dashed hairline showing a relationship that is already visible without it. Never fit a line through a genuinely scattered cloud; a drawn trend is a claim.
- **Median dividers** (optional) — dashed hairlines at the median of each axis, splitting the plot into four regions with quiet corner labels. These describe the measured data; they do not turn this into `quadrant.md`.

Do not introduce an observation, a group, or a trend the source does not support.

## Hierarchy

Focal point and labelled outliers, then the body of the cloud, then median dividers and any trend line, then axis labels, then gridlines. The cloud is the subject: keep non-focal points at a low-opacity fill with a hairline stroke so overlaps read as density rather than as a solid blob, and keep any trend line lighter than the points it describes.

## Reading direction

There is no reading order along the marks — the cloud is read as a field. The reading order is the **frame**: x-axis meaning, then y-axis meaning, then the shape of the cloud, then the focal point. Say it in that order in the artifact's description, and let the axis titles carry it on the canvas.

Put the variable the reader is assumed to control, or to have measured first, on the x-axis. Axis titles are horizontal on both axes; a rotated y-axis title is acceptable only where the project's type conventions already use one, and never rotate tick labels.

## Marks and axes

- **Zero is not automatic here.** Include zero on an axis when absolute position is part of the message; exclude it when the data occupies a narrow band far from zero and forcing zero would compress the cloud into a smudge. Whichever is chosen, **print both axis ranges in the axis titles** so the reader can see the frame they are reading — an unlabelled truncated axis exaggerates correlation.
- Both axes carry **four to six gridlines** at regular intervals, hairline weight, behind the points. No axis frame. Equal visual spacing per equal value step on each axis; a log axis is permitted only when labelled as one on the axis title.
- **Units are stated once per axis**, in that axis's title, never on each tick.
- Marker radius is constant within a group. **Do not encode a third variable as marker area** — area judgement is unreliable; state the third variable in a label or split into two plots.
- Overlapping points: reduce fill opacity so density reads through, or jitter by less than one marker radius and declare the jitter. Never silently drop a coincident point.
- Colors come from design tokens only — `var(--color-chart-1)` … `var(--color-chart-5)` for groups in scale order without skipping, `var(--color-accent)` for the focal point, plus `currentColor`, `none`, `url(#…)`. Vary alpha with `fill-opacity`, never by writing a color. A literal hex, `rgb()`, or `oklch()` in an SVG presentation attribute is rejected by lint. Never invent a palette outside the token scale.
- **Never encode meaning in color alone.** Groups overlap by nature here, so each group carries a distinct **marker shape** — circle, square, triangle, diamond — as its primary cue, with the series token as reinforcement. Where a group occupies a coherent region, label that region directly on the plot instead of adding a legend.

## Density

Budget: **thirty points**, four groups, three labels. Past thirty points the cloud turns to mush: bin into a density treatment, sample and declare the sampling, or split by group into small multiples. Fewer than five points is not a distribution — describe the relationship in a sentence instead.

Never shrink markers below a legible size to fit more; a plot that needs more points needs a different treatment.

## Metadata

On the root `<svg>`, per the shared metadata contract:

- `data-chart-grammar="scatter"`
- `data-chart-element="mark"` on every point, trend line, and median divider, `"axis"` on axis lines, gridlines, and tick labels, `"series"` on the group wrapping one group's points, `"label"` on point labels, region labels, and axis titles.
- Every series carries a **stable id** derived from its name, not from drawing order (`series-<name>`), unchanged across regenerations of the same data. Points use `point-<series>-<observation>`.
- `data-focal-id` — the id of the focal point, or of the group whose region the message is about when no single observation is focal. It must resolve to exactly one element.
- `data-reading-order` — the frame order: x-axis variable, y-axis variable, then the focal id.
- `data-source-kind="brief"`

## Critique

Run the shared critique loop with these checks: both axis ranges printed, and any excluded zero deliberate; both axes measured, not judged; groups told apart by marker shape as well as token; at most three point labels; any trend line visible in the raw cloud without it; jitter or sampling declared; no third variable encoded as marker area; units stated once per axis.

## Failure modes

Beyond the shared taxonomy: a forced trend line through an uncorrelated cloud; truncated axes with no range printed; bubble-area encoding; every point labelled; groups separated by color alone; coincident points silently dropped; more than thirty points with no binning; judged placements presented on measured axes; markers shrunk to fit the count.
