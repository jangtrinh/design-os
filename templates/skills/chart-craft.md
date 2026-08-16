---
name: chart-craft
description: Use when the user asks for a standalone chart of quantities (bar, line, scatter, radar, gantt, dated timeline, quadrant, venn, proportional pyramid) delivered as a rendered artifact rather than prose. Charts embedded in a page or deck belong to generate or slides instead.
---

# Chart Craft

Thin router. This file holds no chart grammar, token defaults, or lint rules of its own — it dispatches to `knowledge/chart-craft.md` and the single matching grammar file that document indexes. If you find yourself defining scales, mark rules, or lint criteria here, stop: that belongs in the knowledge file, not this router.

## 1. Read the knowledge file first

Before doing anything else, read `knowledge/chart-craft.md` in full. It holds the grammar index, the capability boundary, the honest-encoding floor, and the output contract. Do not proceed from memory or an earlier read in this session — re-read it now.

## 2. Confirm this capability owns the request

This capability owns **standalone chart artifacts**: the chart *is* the deliverable, the data is a fixed snapshot, and the output is static. Route away when:

- The chart lives inside a generated page or dashboard → `/ui:generate`.
- The chart is a deck visual → `/ui:slides`.
- The request needs interactivity or live data (tooltips, filters, drill-down, refresh) → `/ui:generate`; a static artifact cannot honour it.
- The subject has no quantities — components, participants, states, hierarchies → `knowledge/diagram-craft.md`.

## 3. Classify intent into exactly one grammar

Match against the nine grammars indexed in `knowledge/chart-craft.md`. Pick exactly one.

Three boundaries are routinely got wrong; check them explicitly before committing:

- **gantt vs timeline vs `diagram-grammars/sequence.md`** — durations, versus dated instants, versus messages between named participants.
- **quadrant vs scatter** — judged placement against named axes, versus measured values on continuous axes. Measured data is a scatter whatever the requester called it.
- **pyramid vs `diagram-grammars/layers.md`** — a pyramid's tier widths encode proportion. If the widths mean nothing, it is `layers.md`, in the diagram capability.

If it fits no grammar, **decline**: name the closest, and state what forcing the request into it would lose.

## 4. Refuse to invent data

Never fabricate plausible-looking values to make a shape render. If the source data is missing, sparse, or ambiguous, say so and ask — a chart with invented numbers reads as evidence and is worse than no chart. If the data is too sparse for the grammar's minimum, offer the honest alternative instead.

## 5. Load only the matched grammar file

Using the index in `knowledge/chart-craft.md`, load the single grammar file for the chosen shape. Do not load the others. The one exception: when a grammar's Decline section names a neighbour you are actively weighing against, read that neighbour's Selection section only.

## 6. Tokens: required, or an explicitly disclosed fallback

Series colors come from `--color-chart-1` … `--color-chart-5`; the focal series may take `--color-accent`. Never invent a chart palette. If the project has no tokens, state in the output notes that you are using the neutral fallback disclosed in `knowledge/chart-craft.md`, and name it as a fallback.

## 7. Output contract

A single self-contained HTML file with one owned inline SVG: no external stylesheets, fonts, scripts, or CDN references, no charting library, no runtime data fetch. Everything needed to render lives in that one file.

## 8. Lint

Run **ui chart lint** against the output before returning it. If it fails, fix and re-lint — never hand back a chart that fails lint with a caveat attached instead of a fix.

Then run **ui a11y-lint** and **ui ds-usage-lint**. The two colour gates are complementary: `ds-usage-lint` reads CSS declarations, while `ui chart lint`'s `hardcoded-svg-color` check covers colours in SVG presentation attributes, which `ds-usage-lint` cannot see. Neither substitutes for the other.

## 9. Critique

Do not reimplement critique logic here. Score the artifact against the existing 6+1 axis taste rubric in `knowledge/taste-rubric.md` at the same ≥ 7/10 gate, and run the existing a11y and layout checks exactly as defined elsewhere. Route any violation back into another lint/fix pass.

## 10. Deterministic vs. judgment boundary

State plainly in the output which checks are pass/fail and which are judgment calls:

- **Deterministic (binary)**: ui chart lint, ui a11y-lint, ui ds-usage-lint, self-containment, baseline declaration, series labelling.
- **Model judgment**: grammar selection when the request is ambiguous, whether the comparison is the right one to make, whether a truncated baseline is honest here, and visual hierarchy.

Never present a judgment call as though it were a binary lint result, and never skip a binary check because a judgment call happened to pass.
