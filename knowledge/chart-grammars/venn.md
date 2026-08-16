---
id: chart-venn
description: Native grammar for set-overlap charts — two or three circles whose intersections are named regions, drawn schematically unless proportionality is explicitly constructed and disclosed.
when:
  - set-overlap-region
  - shared-membership-area
---

# Chart grammar: venn

`knowledge/chart-craft.md` owns the shared contract — grammar routing, token inheritance, the SVG accessibility floor, the static single-snapshot output shape, and the critique loop. This file states only what is specific to set overlaps.

## Selection

Select this grammar when the subject is **membership in two or three sets** and the point of the artifact is what the sets share. "Where A meets B", the intersection of two disciplines, an ikigai-style three-way sweet spot, attributes common to several categories — all read this way.

The test is the intersection: name every overlap region out loud before drawing. If the intersections have no names — if the artifact would ship with unlabeled lens shapes — the sets do not actually overlap in the source and this is a list of categories, not a set overlap. Every region a reader can see must be nameable, including the region outside all circles when it carries meaning.

## Decline

Decline, per the shared decline protocol, when:

- Regions **enclose** other regions — each item sits wholly inside its parent, nothing straddles two parents → `diagram-grammars/nested.md`. The discriminator is straddling: a Venn exists to show items belonging to more than one set at once, a nesting exists to show one scope containing another. Containment drawn as overlap is a lie about the data; overlap drawn as containment loses the shared members.
- Overlap is incidental rather than the point — the reader wants sizes, ranks, or shares compared → `chart-grammars/bar.md`.
- The sets are ordered strata rather than overlapping memberships → `diagram-grammars/layers.md`.
- The source has **four or more sets**. Four circles cannot show all sixteen regions honestly and the shape becomes unreadable; route to a membership grid (`diagram-grammars/dp-security-matrix.md`) or a table, and say what the substitution costs.
- The reader is meant to toggle sets or drill into a region. Route interactivity to `/ui:generate`.

## Vocabulary

- **Set circle** — one circle per set, hairline stroke plus a near-transparent fill. One set = one circle, never two arcs standing in for one set.
- **Set label** — the set's name, placed **outside** its circle and never crossing the stroke, with an optional terse sublabel giving the set's size.
- **Region** — any distinct area the circles produce: a set-only crescent, a two-way lens, the three-way core. Each region carries a stable id and a direct label.
- **Region label** — placed inside its region when the region can hold it at legible size; otherwise a leader line to clear space outside the silhouette. Never shrink a label to make it fit a lens.
- **Sweet spot** — the one focal region the explanation is about, normally the deepest intersection.

## Hierarchy

Exactly one region takes `var(--color-accent)`. That accent is the artifact's whole hierarchy signal — the reader's eye should land on the sweet spot before reading a single word. A second accented region collapses the signal; an artifact with none has no claim.

Set circles are otherwise equal citizens: same stroke weight, same fill opacity, differing only in the token color assigned to each. Do not add size or stroke-weight emphasis on top of the accent.

## Reading direction

Outside-in. Declare the set circles first, in a stated order (the project's text direction, or the source's own order), then the two-way regions, then the deepest intersection last — the sweet spot means nothing until the reader knows which sets produced it. DOM order matches that sequence so a screen reader traverses the same way the eye does.

## Marks and axes

This grammar has no axes; circle geometry carries everything, which makes its honesty rule unusually load-bearing.

- **Regions are schematic unless proportionality is explicitly constructed and disclosed.** In a hand-authored SVG, overlap areas are almost never proportional to the counts they represent, and a reader who assumes otherwise reads a fabricated quantity. Default: state in the `<desc>` that region areas are schematic and carry no magnitude, and put every real count in a text label. Only claim proportional areas when the radii and centre distances were computed from the actual counts — and then say so, in the same sentence, naming the encoding.
- Radii are equal when the sets are comparable in size, and visibly different when the sets are not. Equal circles over obviously unequal sets is dishonest even under a schematic disclosure.
- **Opacity convention on token colors, stated once.** Each set circle fills with its own `var(--color-chart-1)` … `var(--color-chart-5)` at one shared low fill-opacity; overlaps read darker because the token fills compound, not because a new color was introduced. Declare that convention in the `<desc>`. The focal region takes `var(--color-accent)` at the same stated opacity. A literal hex, `rgb()`, or `oklch()` in an SVG presentation attribute is rejected by lint — an overlap tint is never a new literal.
- **Never encode meaning by color alone.** Compounded tints are indistinguishable to many readers and vanish in grayscale, so every region carries its own direct label, and set identity is repeated in the set label text or a pattern fill.

## Density

- **Two or three sets, never four.** Two is the working default; three is the ceiling and already costs six labelled regions plus the outside.
- A three-set artifact holds at most seven labelled regions; if some are empty in the source, label them as empty rather than leaving them mute.
- Region labels are one line, at most two. A region needing a sentence needs a caption beside the artifact instead.
- Collision policy: move the label to clear space with a leader line, then merge two adjacent region labels into one caption line, then reduce to two sets and state what was dropped. Never shrink below the project's minimum legible type size.

## Metadata

Set on the root `<svg>`, per the shared metadata contract:

- `data-chart-grammar="venn"`
- `data-chart-element="mark|axis|series|label"`: each set circle is a `series`, each distinct region is a `mark`, every set and region name is a `label`. This grammar emits no `axis` element.
- Stable ids for every region, built from the participating set slugs in a fixed order (`region-design`, `region-design-engineering`, `region-design-engineering-research`), so an id survives regeneration of the same brief.
- `data-focal-id` — the id of the accented region; when no region is under special discussion, point at the deepest intersection rather than omitting it.
- `data-reading-order` — prose naming the set order and the outside-in traversal to the focal region.
- The `<desc>` states the schematic-or-proportional disclosure and the fill-opacity convention; an artifact missing either is not done.
