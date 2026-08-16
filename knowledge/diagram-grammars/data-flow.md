---
id: diagram-data-flow
description: Native grammar for payload-typed handoffs across roles — the step-and-role grid extended with input/output payload chips so a reader can trace what shape the data takes at every hand-off.
when:
  - payload-typed-handoff
  - data-producer-consumer
  - in-out-payload-chips
---

# Diagram grammar: data-flow

Cross-cutting rules — SVG accessibility baseline, project tokens, output contract, critique loop, general failure taxonomy — live in `knowledge/diagram-craft.md`. The lane grid, its coordinate formulas, and its corridor discipline live in `diagram-grammars/swimlane.md`. This file states only the payload layer on top.

## Selection

Select this grammar when the brief names, per step, **what goes in and what comes out** — raw extract, dataset, analysis-ready table, report, event stream — and the reader's question is where the data changes shape. Producer and consumer roles must both be identifiable; the payload types must be a small closed set, not free prose. If the payloads are unstated or uniform across every step, the chips carry no information and this grammar is the wrong pick.

## Decline

Decline, per the shared decline protocol, when:

- The brief names only roles and ordered steps, with no typed payloads → `swimlane.md`.
- The brief also distinguishes connector kinds — standard handoff vs. orchestration trigger vs. critical edge — and leans on role badges → `process.md`.
- Family precedence, applied in order: only roles and ordered steps → **swimlane**; steps carry typed payloads → **data-flow**; steps carry role badges *and* distinguished connector styles → **process**. Most specific wins; escalate only when the brief supplies the extra fields, never to add visual interest.
- The subject is which systems are wired to which, with no role partition and no step order → an architecture/topology grammar.
- The payload set is open-ended (every step emits a differently named artifact) — chips degrade into a second label row; state the payloads in a caption instead.

## Vocabulary

Inherits lane, step column, node, empty cell, and handoff from `swimlane.md`. Adds:

- **Role key** — a 2–3 character uppercase badge in the node's top-left corner naming the lane's party. It makes a node self-describing when excerpted, and it never repeats the step number.
- **Payload chip** — a small badge carrying a payload-type code. Position is fixed and non-negotiable: the **input** chip sits bottom-left of the node, the **output** chip bottom-right. Either may be omitted (a source has no input, a sink no output); nothing else may occupy those two slots.
- **Payload codes** — one closed vocabulary per project, each code bound to its own token. The default set: `WB` web/public data, `DB` dataset or raw extract, `TB` analysis-ready table, `FL` file, report, or export, `LS` live stream or event. Chip fills resolve to `var(--color-…)` tokens; a literal hex in a presentation attribute is rejected by `ui diagram lint`.
- **Tool line** — an optional muted line naming the generic capability performing the step (ingest tool, object store, query engine, identity provider, scheduler, notebook environment). Name capabilities, never vendors — a product name dates the artifact and leaks a procurement decision into a structural diagram.

Payload type and node concern are **separate semantic axes**. A chip says what format moved; a node's concern colour says what kind of risk the step carries. A node may legitimately show both — do not collapse them into one signal.

## Hierarchy

Reading a row is a payload-transformation trace: scan left to right and each node's input code → output code tells you what the data became. That trace is the diagram's primary claim, so it outranks node titles for emphasis. Exactly one focal triple per diagram: one focal step (the analytical or transformational pivot, its column header in accent), one focal node (the receiver of the decisive cross-role handoff, accent border), one focal connector (the handoff into it, accent stroke and the diagram's only label). Zero or more than one of any focal slot is a defect — resolve it before emitting.

Concern colour is a third, optional axis: at most **3** custom-coloured elements per diagram beyond the focal pair. Concern colour applies to a node's border, role badge, and title only — subtitles, tool lines, and payload chips stay muted, and it never spreads to a connector.

## Reading direction

Steps left to right, lanes top to bottom, ordered from producer to consumer so the payload trace runs forward. Order lanes by position in the supply chain — origination first, consumption last — not by org-chart seniority. One orientation per diagram.

## Connector routing

- **Orthogonal only.** Elbow paths of horizontal and vertical segments, or curves. A straight diagonal is rejected by `ui diagram lint`.
- Single bend: exit the source node's right edge, run horizontally into the destination's corridor, turn once into the destination's top or bottom edge. Same-step cross-lane edges drop straight down the shared column centre. Round bends with an 8-px quadratic corner.
- Connector styles bind to **topology**, never to a node's colour:
  - *standard* — muted solid: a hand-off between steps or within a lane.
  - *trigger* — muted dashed: an upstream authorisation or governance action that enables downstream work; always unlabelled.
  - *focal* — accent solid: the single cross-role handoff that carries the diagram's claim; labelled with a short payload descriptor.
  - *published* — link-toned solid: output leaving the platform to an external consumer.
- Emit every connector before any node rectangle. One `marker-end` per path, never `marker-start`. Label only the focal connector, over an opaque paper-filled rect.

## Density

| Dimension | Budget |
|---|---|
| Lanes (roles) | 4 |
| Steps | 6 |
| Payload chips per node | 2 (one in, one out) |
| Labelled connectors | 1 |
| Custom-coloured elements | 3, beyond the focal pair |

Above 4 lanes or 6 steps, split along the natural seam — origination pipeline and consumption pipeline as two artifacts — keeping lane order, codes, and tokens identical across the pair. A legend strip below the grid names the step chips, the payload codes actually used (with the sub-hint that the left chip is input and the right is output), the concern colours in play, and the connector styles in play — codes used nowhere in the diagram never appear in the legend.

## Metadata

Set on the root `<svg>`, per the shared metadata contract:

- `data-diagram-grammar="data-flow"`
- `data-diagram-element="node"` on every node group, `data-diagram-element="edge"` on every connector.
- Stable edge ids of the form `edge-<srcLane>-<srcStep>-<dstLane>-<dstStep>`, unchanged across regenerations of the same inputs.
- `data-focal-id` — the id of the focal connector. Always select one.
- `data-reading-order` — `ltr-steps-ttb-lanes`, plus the node id sequence of the payload trace.
- `data-source-kind="brief"`

## Failure modes

Beyond the shared taxonomy: chips on both slots of every node when the payload never actually changes; input and output chips swapped or repositioned; a vendor product name in a tool line; concern colour leaking onto a connector or onto a focal element; more than one labelled connector; a legend row for a code the diagram never uses; payload codes invented per node instead of drawn from the closed set.
