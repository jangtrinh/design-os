---
description: Runtime-neutral chart workflow for ease-design. Use when a standalone chart of quantities is the deliverable and prose or a table would bury the comparison. Charts inside a page or deck belong to generate or slides.
argument-hint: "<what to chart> [--grammar <name>]"
---

# /ui:chart

Produces exactly one self-contained, offline chart artifact per invocation — HTML holding owned inline SVG, never a charting library, an external renderer, or a runtime data fetch.

Read `knowledge/chart-craft.md` before grammar selection.

## 0. Confirm this capability owns the request

This capability owns **standalone chart artifacts**: the chart *is* the deliverable, the data is a fixed snapshot, the output is static. Route away when:

- The chart sits inside a generated page or dashboard → `/ui:generate` (dashboard mode, `knowledge/mode-constraints.md`).
- The chart is a deck visual → `/ui:slides`.
- Interactivity or live data is required — tooltips, filters, drill-down, streaming, refresh → `/ui:generate`. A static artifact cannot honour it; say so rather than shipping something that looks interactive and is not.
- The subject has no quantities at all → `knowledge/diagram-craft.md`.

## 1. Decide a chart is warranted

Three numbers in a sentence are three numbers in a sentence. A chart earns its space when the *shape* of the comparison carries meaning a list would bury. If it doesn't, say so and offer the sentence or table instead.

**Never invent data.** If the values are missing, sparse, or ambiguous, stop and ask. A chart with fabricated numbers reads as evidence, which makes it worse than no chart. If the data is too sparse for the grammar's minimum — a two-point line, a single-series radar — state that and offer the honest alternative.

## 2. Budget context

Size the input before authoring: how many series, categories, or points does this actually need? Pull only the data required. If the honest chart would be unreadable at this density, say so and propose a scope cut or a split into several charts — never shrink marks until they stop being legible.

## Supported grammars

Nine grammars exist. Pick exactly one per invocation; never mix them, and never invent one outside the list.

- **bar** — read `knowledge/chart-grammars/bar.md`; magnitudes compared across named categories.
- **line** — read `knowledge/chart-grammars/line.md`; a series moving over a continuous interval.
- **scatter** — read `knowledge/chart-grammars/scatter.md`; paired values checked for correlation.
- **radar** — read `knowledge/chart-grammars/radar.md`; subjects scored across several named axes.
- **gantt** — read `knowledge/chart-grammars/gantt.md`; tasks with durations against a calendar.
- **timeline** — read `knowledge/chart-grammars/timeline.md`; dated events as instants, not spans.
- **quadrant** — read `knowledge/chart-grammars/quadrant.md`; items placed by judgement against two named axes.
- **venn** — read `knowledge/chart-grammars/venn.md`; set membership and overlap.
- **pyramid** — read `knowledge/chart-grammars/pyramid.md`; tiers whose widths encode proportion.

If the request doesn't cleanly map to one of the nine, **reject unsupported grammar**: name the closest supported grammar, state what forcing the request into it would lose, and ask which (if any) actually fits.

### The three boundaries most often got wrong

- **gantt vs timeline vs sequence** — durations, versus dated instants, versus messages between named participants (`knowledge/diagram-grammars/sequence.md`, a different capability).
- **quadrant vs scatter** — judged placement against named axes, versus measured values on continuous axes. Measured data is a scatter whatever the requester called it.
- **pyramid vs layers** — a pyramid's tier widths encode proportion. If the widths mean nothing it is `knowledge/diagram-grammars/layers.md`, in the diagram capability.

## 3. Author the chart

One HTML file, self-contained, openable offline, no network calls, no `<script>`, no build step:

- **Owned inline SVG** — hand-authored `<svg>` you position deliberately, marked `data-chart-owned="true"`. No charting library, no computed layout at view time.
- **Honest encoding** — the quantitative channel must carry the value being compared, on a stated scale. Bars and pyramid tiers start at zero, always. A line or scatter may truncate when variation matters more than level, but must declare it. Units stated once. No dual axes — split into two charts instead.
- **Accessibility** — `role="img"` with a resolving `<title>`/`<desc>`; the description states the comparison and its headline finding, not "a bar chart of sales". Never distinguish series by colour alone: pair every colour with a direct label, marker shape, or pattern. Prefer direct labels over a legend.
- **Tokens only** — series colours from `var(--color-chart-1)` … `var(--color-chart-5)`, focal series may use `var(--color-accent)`. Never a literal hex, `rgb()`, or `oklch()` in a presentation attribute.
- **Inspectable metadata** — `data-chart-grammar`, `data-chart-element` on every mark/axis/series/label, `data-focal-id`, `data-reading-order`, `data-source-kind`, and `data-baseline`. Every series carries a stable id and a `data-series-label`.

## 4. Lint gates

Run in this order; do not proceed past a failing gate without fixing the chart or disclosing why it cannot pass:

1. **`ui chart lint <file.html>`** — the chart contract: grammar value, owned SVG, accessible name, baseline declaration, series identity and labelling, no dual value axis, and `hardcoded-svg-color`.
2. **`ui gate <file.html>`** — the composed floor judge every shipped HTML artifact runs (layout, a11y, taste, content families plus the autofix dry-run in one verdict).
3. **`ui ds-usage-lint <file.html>`** — proves the CSS draws on real design-system tokens. Note the division of labour: it reads CSS declarations only, so a colour in an SVG presentation attribute is invisible to it — `ui chart lint` covers that gap. Neither substitutes for the other.
4. **`ui autofix <file.html> --write`** — deterministic repairs only (run BEFORE the gate; the gate's autofix family then confirms a re-run is a no-op); it never rewrites inline `<svg>`.

## 5. Critique against the taste rubric and revise

A chart is critiqued the same way as any other generation — there is no separate, chart-only rubric:

1. The gate already ran taste-lint; fix any findings it reported before scoring.
2. Score every applicable axis from the full **6+1 axis taste rubric** in `knowledge/taste-rubric.md` — Layout, Typography, Spacing, Motion, Iconography, Depth/Surface, plus Consistency — against the same **≥ 7/10 gate** used everywhere else. Motion is rarely applicable to a static chart; mark it not-applicable rather than scoring it against a criterion it cannot meet.
3. Apply the grammar's own invariants (baseline policy, density budget, axis rules) as part of Layout and Consistency, not as separate ad hoc axes.

Any axis below 7 gets a targeted revision, not a shipped exception.

## 6. Disclosure

State plainly, in the artifact's description rather than hidden in comments:

- The **data source** and its as-of date. A snapshot with no date is undated evidence.
- Any **truncated baseline**, and why the truncation is honest here.
- Anything **schematic rather than proportional** — Venn overlap areas above all.
- Any **token or accessibility substitution** made.
- That the artifact is **static** — no interactivity exists, so a reader should not assume any.

## 7. Hard constraints — never do these

- No `<script>` tags, no charting library, no runtime data fetch, no build step.
- No fabricated data, ever, for any reason.
- No dual value axes.
- No meaning carried by colour alone.
- No tenth grammar, under any name.

## 8. Outputs and honest stops

A successful run produces exactly one HTML file plus the disclosure text from §6. A run may legitimately end in a stop instead:

- **Declined** — the request fits no supported grammar, or belongs to another capability (§0, §2).
- **Data stop** — the values needed are missing, ambiguous, or would have to be invented.
- **Scope stop** — an honest chart at this density would be unreadable; propose a split or a narrower scope.
- **Gate stop** — a lint or rubric gate fails and cannot reasonably be fixed; report which gate, why, and what would need to change.

Every stop states the reason in one or two sentences — no silent failures, no chart shipped to paper over a gap that should have been disclosed.
