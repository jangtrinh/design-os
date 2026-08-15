---
id: chart-gantt
description: Native grammar for Gantt charts — tasks with explicit start and end dates drawn as bars against a calendar axis, grouped into phases with one focal deliverable.
when:
  - scheduled-task-bars
  - project-duration-plan
---

# Chart grammar: gantt

Cross-cutting rules — accessibility floor, project-token inheritance, the static self-contained output contract, critique loop — live in `knowledge/chart-craft.md`. This file states only what is specific to Gantt charts; it does not restate the shared contract.

## Selection

Select this grammar when the brief gives **named tasks that each carry a start and an end on a real calendar**, and the reader needs to see overlap, parallel tracks, and phase sequencing. Project plans, roadmaps, delivery schedules, migration waves.

Both endpoints must be sourced from the brief. A task whose end date is a guess is either dropped from the artifact or drawn to its stated end with the uncertainty named in the description — never silently extended to make a phase look tidy.

## Decline

Decline, per the shared decline protocol, when:

- **Tasks have no durations** — a run of dated events with no spans is not a schedule.
- **Dates are relative only** ("after design signoff") with no calendar anchor — ordering without a calendar is a dependency structure, not a Gantt; route to a flow or sequence grammar and say the calendar axis was unavailable.
- **A single task, or tasks with no temporal overlap at all** — a list carries that more cheaply than a bar field.
- **The request wants interaction** — draggable bars, live schedule sync, hover detail. A chart artifact is a fixed snapshot of one dataset; route interactivity to `/ui:generate`.

The gantt / timeline / sequence boundary is fixed; state it, never blur it:

- **`chart-grammars/gantt.md`** — tasks with *durations* laid against a calendar; every bar has a start and an end.
- **`chart-grammars/timeline.md`** — dated *instants*; every event is a point, never a span.
- **`diagram-grammars/sequence.md`** — named participants exchanging *messages*; ordering is causal, not calendar-dated. A sequence diagram is not a timeline.

A zero-duration item on a Gantt is a milestone marker, not a bar; more than a few of them means the brief is a timeline and belongs in `chart-grammars/timeline.md`.

## Vocabulary: rows, bars, phases

- **Row** — one task, one label in the left column, one bar in the plotting area. One task is one row; never stack two tasks on a shared row to save vertical space.
- **Bar** — a rounded rect whose left edge is the start date and whose right edge is the end date, both read off the calendar axis. Bar width means duration and nothing else.
- **Phase** — a contiguous group of rows sharing a stage of work, marked by a low-emphasis banded region behind them and an eyebrow label. Phases do not nest.
- **Milestone** — a zero-duration instant, drawn as a small marker on the axis position, labeled directly.

## Hierarchy

Exactly one focal bar — the key deliverable or critical-path task — carries `var(--color-accent)`. Every other bar takes a single muted token fill at reduced opacity with a matching stroke; do not run a rainbow across tasks. When phases need color separation, they take `var(--color-chart-1)` … `var(--color-chart-5)` at the phase band, not at the individual bars.

**Never encode a task's status or track by color alone.** Pair any color distinction with a direct in-bar or adjacent label, or with a stroke pattern (solid, dashed) that is named in the legend. The focal bar must remain identifiable in grayscale.

All colors resolve to design tokens; literal hex, rgb, or oklch in SVG presentation attributes is rejected by lint. Opacity on a token color is the only permitted way to soften a fill.

## Reading direction

Time runs strictly left to right; rows run top to bottom in phase order, and within a phase in start-date order. Ties break on end date, then on the brief's own order. Never sort rows by name or by duration — a row's vertical position must carry schedule meaning.

## Marks and axes

- **Calendar granularity:** pick exactly one — day, week, month, or quarter — from the plan's shortest meaningful task, and label the axis with it. Never mix two granularities on one axis, and never let a bar start or end between two unlabeled gradations.
- **Axis honesty:** pixel pitch per calendar unit is constant across the whole axis. A compressed stretch of quiet calendar is a split decision, not a silent rescale.
- **Dependency arrows:** off by default. Add them only when a specific hand-off is the point of the artifact, cap them at a handful, route them orthogonally around bars rather than across them, and give each a stable id. A dense arrow web means the brief wanted a flow grammar.
- **Today marker:** draw a dashed vertical rule at the current date **only when the artifact declares its snapshot date**, labeled with that date. An undated plan gets no today marker — a marker whose date the reader cannot verify is worse than none.
- **Labels:** task names live in the left column, not inside the bar, so bar length stays readable at short durations. Start and end dates are read off the axis, never printed in the bar label.

## Density

Twelve tasks and five parallel tracks per phase is the ceiling. Beyond it, collapse to a phase-level view or split into sub-plans, and declare what each artifact covers and what it omits. Never shrink row height or type to fit more schedule on one canvas.

## Metadata

Set on the root SVG element, per the shared metadata contract:

- `data-chart-grammar="gantt"`
- `data-chart-element="mark|axis|series|label"` on every drawn element — bars and milestone markers are `mark`, the calendar axis, gridlines, and today rule are `axis`, phase groups are `series`, task names and axis text are `label`
- `data-focal-id` — the id of the focal task bar; every artifact selects one
- `data-reading-order` — top-to-bottom row id sequence, plus the left-to-right calendar span
- Stable series ids (`phase-<slug>`, `task-<slug>`) that survive regeneration of the same brief, plus the declared calendar granularity and snapshot date
