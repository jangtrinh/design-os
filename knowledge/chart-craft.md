---
id: chart-craft
description: "The shared chart contract — what a standalone chart artifact is, the boundary against generate/slides and the diagram capability, grammar routing across nine chart grammars, honest encoding, token inheritance, accessible inline SVG, output shape, and critique."
when: [chart-craft, quantity-encoding, standalone-chart-artifact, chart-lint, chart-grammar-routing]
---

# Chart Craft — the shared contract behind the chart grammars

## Purpose

Decide whether a chart is the right answer, hold the rules every chart grammar shares, and
route to exactly one of the nine bounded grammars this capability supports. A grammar file
never repeats what belongs here; this file never repeats what a grammar owns.

## Mental Model

A chart is an **argument about quantities**, not a dump of a dataset. The host reads the
data, decides what comparison the reader is being asked to make, and builds one artifact
that makes that comparison legible before any other. `ui chart lint` only checks the small
set of facts a static reader can prove — contract integrity, not whether the encoding is
honest or the comparison is the right one. `taste-rubric.md` and `accessibility.md` own
whether the result is actually good and actually usable. Treat a clean lint as "the contract
holds," never as "the chart is right."

## What this capability owns

**Standalone chart artifacts**: a self-contained, offline, script-free HTML document holding
one inline SVG that renders a **fixed dataset snapshot**, bound to the project's design
tokens and put through the same gate chain as any other generated artifact. The chart *is*
the deliverable.

## When to route elsewhere

This capability sits next to three others. The boundary is drawn on two observable questions
— *is the chart the whole artifact?* and *does it need interactivity or live data?*

| Situation | Route to |
|---|---|
| The chart lives inside a generated page, dashboard, or product surface | `/ui:generate` (dashboard mode; see `mode-constraints.md`) — it inherits that workflow's gates |
| The chart is a visual inside a deck | `/ui:slides` |
| Anything interactive or live: tooltips, filters, drill-down, streaming or refreshed data | `/ui:generate` — a static artifact cannot honour it |
| The subject has no quantities — components, participants, states, hierarchies | `diagram-craft.md` |

Conversely, `generate` and `slides` decline **to here** when the chart is the entire
deliverable rather than a component of a larger surface.

`/ui:slides` currently states "No charts" in its own constraints. That rule stands: a deck
visual is authored under the slides workflow, and a standalone chart authored here may be
placed into a deck afterwards, but the slides workflow does not invoke this capability
mid-run.

## Selecting a grammar

Nine grammars exist. Route on what the data actually is, not on the word the requester used:

| Signal in the request | Grammar |
|---|---|
| Magnitudes compared across named categories | `chart-grammars/bar.md` |
| A series moving over a continuous interval | `chart-grammars/line.md` |
| Paired values checked for correlation | `chart-grammars/scatter.md` |
| One or more subjects scored across several named axes | `chart-grammars/radar.md` |
| Tasks with durations laid against a calendar | `chart-grammars/gantt.md` |
| Dated events as instants, not spans | `chart-grammars/timeline.md` |
| Items placed by judgement against two named axes | `chart-grammars/quadrant.md` |
| Set membership and overlap | `chart-grammars/venn.md` |
| Tiers whose widths encode proportion | `chart-grammars/pyramid.md` |

### The three boundaries a router gets wrong

- **gantt vs timeline vs `diagram-grammars/sequence.md`** — gantt has *durations* (bars with
  a start and an end); timeline has *instants* (points on a dated axis); sequence has
  *messages between named participants*, ordered causally and not dated at all.
- **quadrant vs scatter** — scatter plots *measured* values on continuous axes; quadrant
  places items by *judgement* against two named axes with a meaningful origin. Measured data
  is a scatter, whatever the requester called it.
- **pyramid vs `diagram-grammars/layers.md`** — a pyramid's tier widths *encode proportion*.
  If the widths mean nothing, it is a stack of bands: `layers.md`, in the diagram capability.

### The admission bar

A grammar is admitted here when it has **a distinct mark-and-scale recipe** *and* **a decline
path no sibling covers**. A shape that reduces to an existing grammar with different
vocabulary is that grammar, not a new one.

**Decline, do not invent.** A request outside all nine gets a decline: name the closest
supported grammar and state what the substitution would lose.

## Deciding whether a chart is useful at all

- Three numbers in a sentence are three numbers in a sentence. A chart earns its space when
  the *shape* of the comparison carries meaning a list would bury.
- The data must be real and stated. Never invent plausible-looking values to fill a shape;
  a chart with fabricated data is worse than no chart, because it reads as evidence.
- If the source is too sparse to support the grammar's minimum (a two-point line, a
  single-series radar), say so and offer the honest alternative.

## Honest encoding

The floor every grammar inherits:

1. **The encoding must match the claim.** Bar length, line position, point position, and tier
   width are quantitative channels — whatever they encode must be the value being compared,
   on a stated scale.
2. **Zero baselines.** Length-encoded marks (bars, tier widths) start at zero, always. A
   position-encoded series (line, scatter) may use a non-zero baseline when the variation
   matters more than the absolute level — state that it is truncated rather than letting a
   reader assume zero.
3. **State the units once**, on the axis or in the description, never inferred from the data.
4. **Schematic is allowed; silent schematic is not.** Where a shape cannot honour proportion
   in hand-authored SVG (Venn overlap areas especially), say plainly that regions are
   schematic.
5. **No dual axes** — two scales on one frame invite a comparison the data does not support.
   Split into two charts.

## Project-token inheritance

Charts are project artifacts, not a separate visual system. Read the project's tokens the
same way any other generation does (`token-taxonomy.md`).

- Series colors come from `--color-chart-1` … `--color-chart-5`. The focal series may take
  `--color-accent`. Never introduce a palette for "chart mode."
- Text, rules, and grid lines use the same foreground/muted/border roles every other artifact
  uses.
- **No project tokens present** — use the documented neutral fallback and **disclose it**, as
  `diagram-craft.md` requires. A silent fallback is indistinguishable from a broken token read.
- **Accessibility overrides tokens, never silently.** When a token pair fails contrast for a
  mark or label, substitute the minimum change that clears it and report the substitution.

## Accessible inline SVG

Every chart artifact carries the same accessibility floor as a diagram:

- Root `<svg>` carries `role="img"` and an `aria-labelledby` resolving to a non-empty
  `<title>` and `<desc>`. The description states the comparison the chart makes and its
  headline finding — not "a bar chart of sales."
- **Never encode meaning by color alone.** Pair every color distinction with a direct label,
  a marker shape, or a pattern. This is the rule most often broken by multi-series charts.
- Prefer direct labelling over a legend; a legend forces a lookup the chart could have
  answered in place.
- Every series, axis, and mark group carries a stable id.
- Tier 1 static accessibility only — see `accessibility.md`. Rendered contrast and
  screen-reader behaviour still need Tier 2 or a human. Never claim a chart is "accessible";
  say what was checked.

## Output contract

One self-contained HTML document per chart, holding one owned inline SVG:

- No `<script>`, no external stylesheet/font/image URL, no view-time network dependency.
- No charting library, no runtime data fetch, no build step. The host authors the SVG
  directly; nothing here computes a layout from a data file at view time.
- The document declares, in inspectable `data-*` metadata: the **grammar**, the **reading
  order** in prose, the **focal element**'s id, the **source kind**, and whether a **token
  fallback** was used.
- Run `ui chart lint <file.html>`, then `ui a11y-lint` and `ui ds-usage-lint`. Note the
  division of labour on color: `ds-usage-lint` reads CSS declarations only, so a literal in
  an SVG presentation attribute is invisible to it — `ui chart lint`'s `hardcoded-svg-color`
  check covers that gap. Neither substitutes for the other. A clean lint is necessary, never
  sufficient.

## Critique

After lint passes, critique the artifact the same way any other generation is critiqued —
there is no chart-only rubric. Score every applicable axis in `taste-rubric.md` against the
same ≥ 7/10 gate. Motion is rarely applicable to a static chart; mark it not-applicable.
Apply the grammar's own invariants as part of Layout and Consistency, not as separate axes.

## Failure Modes

- **Chart as decoration.** A shape chosen for visual interest rather than because its
  encoding matches the claim — a pyramid whose widths mean nothing, a radar with two axes.
- **Fabricated data.** Filling a grammar's minimum with invented values so the shape renders.
- **Truncated baseline, undisclosed.** A non-zero axis that makes a small difference look
  decisive, with nothing telling the reader the scale was cut.
- **Color as the only channel.** Series distinguished purely by hue, unreadable to a
  colour-blind reader and to anyone printing in grayscale.
- **Legend where a label would do.** Forcing a lookup the chart could have answered in place.
- **Lint mistaken for a quality bar.** A clean `ui chart lint` proves the contract holds; it
  says nothing about whether the comparison is honest or worth making.
