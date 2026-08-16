---
id: chart-timeline
description: Native grammar for dated event runs — instants placed truthfully along a single calendar axis, with alternating labels, marked milestones, and disclosed gap compression.
when:
  - dated-event-sequence
  - chronological-milestone-run
---

# Chart grammar: timeline

Cross-cutting rules — accessibility floor, project-token inheritance, the static self-contained output contract, critique loop — live in `knowledge/chart-craft.md`. This file states only what is specific to dated event runs; it does not restate the shared contract.

## Selection

Select this grammar when the brief gives **named events that each carry one date**, and the reader needs to see when they happened relative to one another. Release history, incident reconstructions, milestone runs, changelog snapshots, company or product history.

Every event must resolve to a point on a calendar. An event whose date the brief only implies is either dated explicitly from the brief or left out — a plotted guess is indistinguishable from a fact.

## Decline

Decline, per the shared decline protocol, when:

- **Events carry durations rather than dates** — spans belong on a bar field, not on a point axis.
- **Ordering is known but dating is not** — an unordered-in-time sequence of steps is a flow or process, and placing it on a calendar axis invents precision the brief never had.
- **Two or three events with no meaningful spacing** — a dated list is more precise and shorter.
- **The request wants interaction** — zoomable eras, scrubbing, live event feeds. A chart artifact is a fixed snapshot of one dataset; route interactivity to `/ui:generate`.

The gantt / timeline / sequence boundary is fixed; state it, never blur it:

- **`chart-grammars/gantt.md`** — tasks with *durations* laid against a calendar; every bar has a start and an end.
- **`chart-grammars/timeline.md`** — dated *instants*; every event is a point, never a span.
- **`diagram-grammars/sequence.md`** — named participants exchanging *messages*; ordering is causal, not calendar-dated. A sequence diagram is not a timeline.

The last case is the most common misroute: a request phrased as "the timeline of the login request" is participants exchanging messages, and belongs in `diagram-grammars/sequence.md`. Ask whether the ordering is calendar-dated or merely causal before selecting.

## Vocabulary: baseline, events, milestones, eras

- **Baseline** — one continuous hairline carrying the calendar. Exactly one baseline per artifact; a second axis is a second artifact.
- **Event** — a small filled marker positioned at its date, with a label attached by a hairline leader. One event is one marker; never merge two dates into one marker.
- **Milestone** — an event the brief argues is pivotal, drawn at a larger marker size with a heavier label.
- **Era** — an optional low-emphasis band naming a stretch of the axis. Eras label the axis; they never become spans of their own, which would make this a Gantt.

## Hierarchy

One focal milestone carries `var(--color-accent)`. Ordinary events take a single muted token; when the brief genuinely groups events into tracks (e.g. releases versus incidents), those tracks take `var(--color-chart-1)` … `var(--color-chart-5)`, capped at what the brief actually distinguishes.

**Never encode a track or event kind by color alone.** Pair every color distinction with a distinct marker shape (circle, square, triangle, diamond) and a direct label, and repeat the shape in any legend. The focal milestone must stay identifiable in grayscale on marker size and label weight alone.

All colors resolve to design tokens; literal hex, rgb, or oklch in SVG presentation attributes is rejected by lint. Opacity on a token color is the only permitted way to soften a fill.

## Reading direction

Horizontal, earliest at the left, is the default. Switch to a vertical axis, earliest at the top, when labels are long enough that horizontal placement would truncate them, or when the run exceeds roughly a dozen events. Choose one orientation per artifact and hold it — never bend the baseline or wrap it onto a second line, which destroys the reader's mapping from distance to elapsed time.

## Marks and axes

- **Spacing is truthful:** marker position is proportional to real elapsed time. Never equalize spacing for tidiness — unequal gaps are the data.
- **Granularity:** label the axis at one gradation — day, month, quarter, or year — chosen from the run's shortest meaningful interval, and name the unit on the axis.
- **Near-date collisions:** alternate labels above and below the baseline (or left and right when vertical), each on its own leader, before doing anything else. If markers still overlap, cluster the collided dates under one bracketed group label naming the count and the date range — never nudge a marker off its true date to make room.
- **Gap compression:** a long empty stretch may be compressed only with a visible axis break at the compressed segment, and the compression must be declared in the artifact's description and metadata. A silently rescaled gap is a false claim about elapsed time. When the run has more than one such gap, split the artifact by era instead.
- **Leaders and labels:** each leader connects exactly one marker to exactly one label; leaders never cross. Dates print with their labels in the monospace token, so a reader never has to measure position to recover a date.

## Density

Roughly a dozen events per horizontal artifact, or two dozen vertical. Beyond that, split by era — one artifact per era, identical orientation and tokens so the set reads as one run — and declare the range each artifact covers. Never shrink type or drop an event silently to fit.

## Metadata

Set on the root SVG element, per the shared metadata contract:

- `data-chart-grammar="timeline"`
- `data-chart-element="mark|axis|series|label"` on every drawn element — event and milestone markers are `mark`, the baseline, ticks, era bands, and any axis break are `axis`, track groups are `series`, event names, dates, and axis text are `label`
- `data-focal-id` — the id of the focal milestone; every artifact selects one
- `data-reading-order` — the event id sequence in date order, plus the chosen orientation
- Stable series ids (`track-<slug>`, `event-<date>-<slug>`) that survive regeneration of the same brief, plus the declared granularity, the covered date range, and any gap compression applied
