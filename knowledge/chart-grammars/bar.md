---
id: chart-bar
description: Native grammar for categorical magnitude comparison — one bar per named category, a shared zero baseline, and a single focal bar that carries the message.
when:
  - categorical-magnitude-bars
  - ranked-category-comparison
---

# Chart grammar: bar

Cross-cutting rules — accessible inline SVG, project-token inheritance, output contract, critique loop, shared failure taxonomy — live in `knowledge/chart-craft.md`. This file states only what is specific to bar charts.

## Selection

Select this grammar when the subject is a set of **named categories, each holding one numeric magnitude**, and the comparison between those magnitudes is the message: revenue by region, adoption by feature, count by cohort, velocity by sprint. Two conditions must both hold:

1. The categories are discrete and nameable. A bar's x-position carries identity, not quantity — nothing between two bars exists.
2. Every category's value shares one unit and one scale, so bar lengths are comparable by eye.

A ranking is admitted: sort bars by value when the order *is* the finding. Otherwise keep the source's own category order (calendar, funnel stage, alphabetical) and say which order was used.

## Decline

Decline, per the shared decline protocol, when:

- The x-axis is a **continuous interval** and the reader needs the rate of change between samples — that is `line.md`. Substituting bars loses slope: a reader compares heights instead of reading direction, and the between-sample trajectory the message depends on is not drawn at all.
- Each observation is a **pair of measured variables** rather than one magnitude per name — that is `scatter.md`. Bars can encode only one number per category, so the second variable would have to be dropped or smuggled into a label.
- The subject carries **no quantities at all** — components, steps, states, relationships. That is a diagram; route to `knowledge/diagram-craft.md` and let it select a grammar.
- The request needs hover, filtering, drill-down, or live data. Chart artifacts are static and script-free; route interactive work to `/ui:generate`.

## Vocabulary

- **Bar** — one rectangle per category, anchored on the zero baseline, length proportional to value. One category = one bar; never split a category across two bars.
- **Category label** — the bar's name, sitting on the baseline side, horizontal, centered on the bar.
- **Value label** — the magnitude printed at the bar's free end in a monospaced face, so the reader never estimates a length against a gridline.
- **Focal bar** — exactly one bar in `var(--color-accent)`; every other bar is neutral. A second accent means nothing is accented.
- **Group** (optional) — at most two bars per category, adjacent, no gap between them, one pitch gap between groups. Series colors from `var(--color-chart-1)`…, focal series may take the accent.
- **Stack** (optional) — segments summing to a total, total printed at the free end. Use only when the total is itself meaningful; a stack makes every segment except the baseline one hard to compare.

Do not introduce a category, value, or grouping the source does not support. Never draw a bar for a category whose value is unknown — declare the gap.

## Hierarchy

One focal bar, then value labels, then category labels, then axis labels, then gridlines — which sit at the bottom of the ranking and should be the first thing a reader stops noticing. Non-focal bars are a low-emphasis fill of a neutral token with a hairline stroke of the same token; the accent's job is to be the only saturated thing in the frame.

## Reading direction

Vertical bars (columns) by default, read left to right along the baseline. Switch to horizontal bars when category names are long, or past roughly eight categories — a horizontal bar gives the label a full line and removes any temptation to rotate type. Pick one orientation per artifact.

Rotated category labels are a layout failure, not a solution. If labels collide: shorten the names, go horizontal, or split — never rotate past horizontal, and never below a legible size.

## Marks and axes

- **The value axis always starts at zero.** A bar encodes magnitude by length; a truncated baseline multiplies apparent differences and is dishonest. There is no signalling convention that repairs it — if the interesting variation lives in a narrow band far from zero, that subject belongs to `line.md`, not to bars.
- Bar width is at least half the category pitch; the gap never exceeds the bar. Bars of equal width, always.
- **Gridlines: four to six**, perpendicular to the bars, hairline weight, drawn behind the bars. The baseline is a slightly stronger single rule. No vertical gridlines between categories, no axis frame, no ticks where a gridline already lands.
- **Units are stated once**, in the axis title or the artifact title — never repeated on every value label.
- Flat fills only: no gradient, no 3-D extrusion, no drop shadow, no rounded cap that makes short bars read longer than they are.
- Colors come from design tokens only — `var(--color-chart-1)` … `var(--color-chart-5)` for series, `var(--color-accent)` for the focal series, plus `currentColor`, `none`, `url(#…)`. Vary alpha with `fill-opacity`, never by writing a color. A literal hex, `rgb()`, or `oklch()` in an SVG presentation attribute is rejected by lint. Never invent a palette outside the token scale.
- **Never encode meaning in color alone.** In a grouped or stacked chart the series must also be told apart without color: label the first group's segments directly on the plot, or carry a distinct hatch pattern per series. Prefer direct labelling to a legend — a legend forces the reader to hold a color key in memory and fails outright for a color-blind reader.

## Density

Budget: **eight bars**, or eight groups of two. Past that, aggregate into periods, cut to a top-N and say what the remainder holds, or split into two artifacts along a real seam. Never shrink type or narrow bars to buy room.

Stacks: at most four segments, and only when their order is stable across categories.

## Metadata

On the root `<svg>`, per the shared metadata contract:

- `data-chart-grammar="bar"`
- `data-chart-element="mark"` on every bar, `"axis"` on axis lines, gridlines, and tick labels, `"series"` on the group wrapping one series' bars, `"label"` on category and value labels.
- Every series carries a **stable id** derived from its name, not from drawing order (`series-<name>`), unchanged across regenerations of the same data. Bars use `bar-<series>-<category>`.
- `data-focal-id` — the id of the focal bar. It must resolve to exactly one element.
- `data-reading-order` — the orientation (`ltr` or `ttb`) plus the category sequence it implies, and whether that sequence is source order or a value ranking.
- `data-source-kind="brief"`

## Critique

Run the shared critique loop with these checks: the value axis reaches zero; exactly one focal bar; every bar carries a value label; units stated once; no rotated category labels; gridlines quieter than bars; grouped or stacked series distinguishable without color; the category order declared and matching the data.

## Failure modes

Beyond the shared taxonomy: a truncated baseline; accent spread across several bars; more than eight bars crammed into one view; a stack whose segment order shifts between categories; a legend standing in for direct labels; bars of unequal width; a category silently omitted because its value was missing; gridlines drawn as heavily as the data.
