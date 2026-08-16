---
id: chart-pyramid
description: Native grammar for pyramid and funnel charts — stacked trapezoid tiers whose widths encode a real proportion, narrowing monotonically toward one declared end.
when:
  - proportional-tier-volume
  - narrowing-population-stack
---

# Chart grammar: pyramid

`knowledge/chart-craft.md` owns the shared contract — grammar routing, token inheritance, the SVG accessibility floor, the static single-snapshot output shape, and the critique loop. This file states only what is specific to pyramids and funnels.

## Selection

Select this grammar when the subject is an ordered set of tiers whose **populations shrink**, and the shrinking itself is the claim: a conversion funnel, a value pyramid, a hierarchy of needs, a rarity stack. The width of a tier is the encoding, so the source must supply a real number per tier — a count, a percentage, a share.

The test is subtractive on width: redraw every tier at the same width. If nothing is lost, the widths were decorative and this is not a pyramid. If the artifact stops making its point, the widths are load-bearing and this grammar is correct.

Pick one orientation and hold it. **Pyramid** points up: the apex is the rarest, most valuable, most selective tier; the base is broadest and foundational. **Funnel** points down: the top is the whole audience, the narrow end is the converted remainder. Never mix the two in one artifact.

## Decline

Decline, per the shared decline protocol, when:

- The tiers are **bands of equal weight** whose widths carry nothing — an abstraction stack, protocol strata, a runtime tier cake → `diagram-grammars/layers.md`. This is the critical boundary: a layer stack encodes meaning by *position only*, a pyramid encodes it by *width*. A tapered silhouette drawn over equal-weight bands invents a proportion the source never stated, and it belongs to the diagram capability, not here.
- The reader needs to compare magnitudes precisely, or the values do not shrink monotonically → `chart-grammars/bar.md`. A trapezoid is a poor ruler; bars share a baseline and read exactly.
- The structure is parent-child decomposition rather than a shrinking population → `diagram-grammars/tree.md`.
- Tiers overlap in membership rather than nesting cleanly inside the one above → `chart-grammars/venn.md`.
- The reader is meant to change the date range, re-segment, or drill a tier. Route interactivity to `/ui:generate`.

Also decline when the source gives fewer than three tiers (a stack of two is a sentence) or when the numbers are unknown — an estimated funnel drawn as if measured is the failure this grammar exists to prevent.

## Vocabulary

- **Tier** — one trapezoid, a four-point polygon, representing one stage or rank. One tier = one polygon; a tier is never split across two shapes.
- **Tier name** — the stage's name, set inside the trapezoid in the project's primary type token.
- **Value label** — the tier's own number, always present, inside the trapezoid or as a side annotation. The number is what makes the width checkable.
- **Delta annotation** — the optional change between adjacent tiers (a drop-off percentage on a funnel), placed in the margin beside the boundary it describes and derived from the same numbers as the widths.
- **Direction indicator** — a single margin arrow parallel to the stack, labeled with what increases along it. Exactly one per artifact.
- **Elided tier** — a stand-in for stages collapsed out of scope, labeled with what it replaces and how many. It occupies a real ordinal so the sequence stays contiguous.

## Hierarchy

Width is the encoding; the accent is the hierarchy. Exactly one tier takes `var(--color-accent)` — the apex of a pyramid, the conversion tier of a funnel, or the bottleneck under discussion. Never accent the base of a pyramid: the base is the widest shape on the canvas already, and accenting it fights the "apex is rare" claim the geometry makes.

Every other tier takes one consistent treatment — a single surface token with hairline dividers, or a monotonic ramp across `var(--color-chart-1)` … `var(--color-chart-5)` that follows the tier order. Pick one and hold it for the whole artifact; a ramp that does not follow the order is a second, contradictory hierarchy.

## Reading direction

Declare the end the reader starts from and name it: apex-first for a selectivity claim ("only these reach the top"), base-first for a foundation claim ("everything rests on this"), top-down for a funnel following the population as it drops. Tier order and DOM order match that declaration, and the margin direction indicator states the same thing in words.

## Marks and axes

There is no drawn axis; the width scale is implicit, which is why it must be declared.

- **The proportion must be real, and the encoding must be named.** Pick one — *width ∝ value* or *area ∝ value* — state which in the `<desc>`, and derive every tier's geometry from the dataset under that single rule. The two produce visibly different silhouettes for the same numbers; leaving the choice unstated leaves the reader to guess a magnitude. Eyeballed widths, evenly-stepped widths over unevenly-dropping values, or an apex widened so its label fits are all fabrications. If the widths cannot be computed, the artifact is a `diagram-grammars/layers.md` stack instead.
- Tier heights are uniform. Height is not a second encoded dimension; only width carries value.
- The silhouette narrows monotonically. A tier wider than the one before it means the data is not funnel-shaped — decline to `chart-grammars/bar.md` rather than reordering to force the taper.
- Colors resolve through project tokens only: `var(--color-chart-1)` … `var(--color-chart-5)`, `var(--color-accent)` for the focal tier, `currentColor` or `none` otherwise. A literal hex, `rgb()`, or `oklch()` in an SVG presentation attribute is rejected by lint.
- **Never encode meaning by color alone.** Every tier carries its name and its value as text, so the ordering and the magnitudes survive grayscale, low vision, and a color-blind reader.

## Density

- **4–6 tiers is the working range; 7 is the hard ceiling.** Past that, merge adjacent stages into one named tier and state the merge, or split into an overview artifact plus a detail artifact.
- Minimum legible tier height is the project's minimum legible type size plus its vertical padding token — enough for the tier name and its value on one or two baselines. A tier that cannot clear that height is a scope decision, never a shrink decision.
- The narrowest tier must still hold its own name at legible size, or take a leader line to a label in clear space. Never rotate or shrink an apex label to make it fit.
- At most two delta annotations plus one direction indicator in the margin. More than that and the notes belong in a caption beside the artifact.

## Metadata

Set on the root `<svg>`, per the shared metadata contract:

- `data-chart-grammar="pyramid"`
- `data-chart-element="mark|axis|series|label"`: every tier polygon is a `mark`, the margin direction indicator is an `axis`, a set of tiers drawn from one dataset is a `series`, and every name, value, and delta is a `label`.
- Stable ids per tier, carrying the ordinal and slug (`tier-1-visitors`, `tier-4-purchased`), so an id survives regeneration of the same brief.
- `data-focal-id` — the id of the accented tier; when none is under discussion, point at the apex of a pyramid or the conversion tier of a funnel rather than omitting it.
- `data-reading-order` — prose naming the orientation, the starting end, and the ordinal sequence it implies.
- The `<desc>` names the encoding rule (width ∝ value, or area ∝ value) and the units behind the values; an artifact that omits it is not done.
