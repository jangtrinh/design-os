---
id: chart-line
description: Native grammar for a quantity sampled across a continuous interval — ordered vertices joined into a polyline, one focal series, and a baseline policy stated on the artifact.
when:
  - continuous-series-trend
  - value-over-interval
---

# Chart grammar: line

Cross-cutting rules — accessible inline SVG, project-token inheritance, output contract, critique loop, shared failure taxonomy — live in `knowledge/chart-craft.md`. This file states only what is specific to line charts.

## Selection

Select this grammar when the subject is **one or more quantities sampled at ordered positions along a continuous interval**, and the direction and rate of change between samples is the message: signups by week, latency by release, cost by month. Three conditions must hold:

1. The x-axis is continuous and ordered — time, an index, a version sequence. Reordering the samples would destroy the meaning.
2. The space between two samples is real, so joining them asserts something a reader may believe.
3. Every series shares one x-axis and one unit.

## Decline

Decline, per the shared decline protocol, when:

- The x-positions are **discrete named categories** with nothing between them — that is `bar.md`. A line across categories draws a slope through empty space and invents a trajectory the data never claimed.
- The subject is a run of **dated instants** — releases, incidents, milestones — with no quantity measured at each. That is `chart-grammars/timeline.md`. This grammar plots a magnitude over an interval; a timeline plots events at points, and substituting a line would force a fabricated y-value onto every instant.
- Each observation is an **unordered pair of variables** — that is `scatter.md`.
- The subject carries **no quantities at all**. That is a diagram; route to `knowledge/diagram-craft.md` and let it select a grammar.
- The request needs hover readouts, zoom, brushing, or live data. Chart artifacts are static and script-free; route interactive work to `/ui:generate`.

## Vocabulary

- **Series** — one ordered run of samples, drawn as a single polyline with `fill="none"`. One series = one polyline; never split a series into two paths to change its color mid-run.
- **Vertex** — one sample. Vertices are drawn as dots on the focal series only; other series are line-only, or the plot becomes a bead curtain.
- **Focal series** — exactly one, in `var(--color-accent)`, at the heaviest stroke on the plot. Everything else is a supporting series.
- **Area fill** (optional) — the focal series closed down to the baseline at low opacity, used only when the accumulated area is itself meaningful. Never fill more than one series.
- **Gap** — a break in the polyline where data is genuinely missing. Draw the gap; never bridge two disjoint runs with a straight segment, which asserts a measurement that was not taken.
- **Annotation** (optional) — a hairline vertical rule with a short label marking an event that explains an inflection.

Do not introduce a sample, a series, or an interpolation the source does not support.

## Hierarchy

Focal series, then its vertex dots and end label, then supporting series, then axis labels, then gridlines. Stroke weight ranks with emphasis: the focal series is roughly one and a half times the supporting weight, and supporting series are all equal to each other — a third weight class invents a hierarchy the data does not have.

## Reading direction

Left to right along the x-axis, always, with the earliest sample at the left. Time never runs right to left, and a series is never reversed to make a shape more pleasing.

The reader lands on the focal series' rightmost vertex — its latest value — so that end carries the direct label. Rotated x-axis labels are a layout failure: shorten the tick text, thin the ticks, or aggregate into coarser periods.

## Marks and axes

- **Baseline policy is stated on the artifact, always.** Zero baseline is the default and is required whenever absolute magnitude is part of the message. A non-zero baseline is honest only when the message is variation within a band far from zero, and only when it is signalled: state the axis range in the axis title, put the lowest gridline's value in the tick label, and never fill the area under a non-zero-baselined series — a fill without zero draws a magnitude that does not exist.
- **Never truncate silently.** An unlabelled axis start reads as zero to most readers, and that misreading is the artifact's fault, not theirs.
- **Gridlines: four to six horizontals**, hairline weight, behind the data. No vertical gridlines unless the x-axis has meaningful periods to separate, and then at most one per period boundary. No axis frame, no ticks duplicating a gridline.
- **Tick density:** four to twelve x-axis samples in one view. Fewer means a sentence would do; more means aggregating into coarser periods. Label every tick or every other tick — never an irregular subset.
- **Units are stated once**, in the axis title or artifact title, never repeated per label.
- Polyline, not spline. Smoothing sampled data invents intermediate values and softens the very inflections the reader is here for. Round the joins, not the data.
- Colors come from design tokens only — `var(--color-chart-1)` … `var(--color-chart-5)` for supporting series in scale order without skipping, `var(--color-accent)` for the focal series, plus `currentColor`, `none`, `url(#…)`. Vary alpha with `stroke-opacity` / `fill-opacity`, never by writing a color. A literal hex, `rgb()`, or `oklch()` in an SVG presentation attribute is rejected by lint. Never invent a palette outside the token scale.
- **Never encode meaning in color alone — this bites hardest here.** Overlapping series in a shared plot are indistinguishable to a color-blind reader and in a grayscale print. Label every series directly at its right-hand end, and give each supporting series a distinct dash pattern or vertex marker shape. Direct end labels replace a legend; a legend is the fallback, not the default.

## Density

Budget: **five series and twelve samples** in one view. Past five series the plot is mush — promote one to focal and move the rest to a small-multiple grid, or split. Past twelve samples, aggregate into periods rather than thinning the stroke.

Two series that cross more than three times are not readable together whatever the styling; separate them.

## Metadata

On the root `<svg>`, per the shared metadata contract:

- `data-chart-grammar="line"`
- `data-chart-element="mark"` on every polyline, vertex dot, and area fill, `"axis"` on axis lines, gridlines, and tick labels, `"series"` on the group wrapping one series and its marks, `"label"` on end labels, annotations, and axis titles.
- Every series carries a **stable id** derived from its name, not from drawing order (`series-<name>`), unchanged across regenerations of the same data. Vertices use `point-<series>-<index>`.
- `data-focal-id` — the id of the focal series. It must resolve to exactly one element.
- `data-reading-order` — `ltr`, plus the focal series id and the interval it spans.
- `data-source-kind="brief"`

## Critique

Run the shared critique loop with these checks: baseline policy stated, and non-zero baselines signalled in the axis label; exactly one focal series; every series labelled at its end and distinguishable without color; missing data drawn as a gap; no spline smoothing of sampled data; ticks regular and unrotated; units stated once; supporting series at one shared weight.

## Failure modes

Beyond the shared taxonomy: a silently truncated y-axis; an area fill above a non-zero baseline; a straight segment bridging a data gap; dots on every series; more than five series in one plot; a legend carrying color as the only series cue; smoothed curves over sampled points; supporting series drawn at three different weights; the x-axis reversed or irregularly labelled.
