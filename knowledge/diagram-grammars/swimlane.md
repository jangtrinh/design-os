---
id: diagram-swimlane
description: Native grammar for role-partitioned step grids — one horizontal band per responsible party, ordered step columns, and handoffs drawn as lane-crossing orthogonal connectors.
when:
  - role-partitioned-steps
  - responsibility-band
  - who-does-which-step
---

# Diagram grammar: swimlane

Cross-cutting rules — SVG accessibility baseline, project tokens, output contract, critique loop, general failure taxonomy — live in `knowledge/diagram-craft.md`. This file states only what is specific to swimlanes.

## Selection

Select this grammar when the brief yields two things and no more: a set of **named responsible parties** and an **ordered set of steps**, where every step has exactly one owner. The reader's question is "who does which step", and the answer is complete once the step lands in the right band. If removing the party names would still leave a usable picture, the content is a plain ordered flow, not a swimlane.

This is the **base encoding of the step-and-role grid**. `data-flow.md` and `process.md` are the same grid with extra fields; start here and escalate only when the brief actually carries those fields.

## Decline

Decline, per the shared decline protocol, when:

- Steps carry typed input/output payloads the reader must trace → `data-flow.md`.
- Steps carry role badges **and** the brief distinguishes connector kinds (standard handoff vs. trigger vs. critical edge) → `process.md`.
- The precedence rule for the whole family, applied in order: only roles and ordered steps → **swimlane**; steps carry typed payloads → **data-flow**; steps carry role badges *and* distinguished connector styles → **process**. Most specific wins; never escalate to buy visual richness the brief does not supply.
- Only one party participates — there is nothing to partition; use a flow or decision grammar.
- The branch structure, not the ownership, is the subject → `flowchart.md`.
- Ownership is a permission fact rather than an activity (who *may* do a thing, not who *does* it) → a role/permission grid grammar.

## Vocabulary

- **Lane** — one horizontal band per party, spanning the full content width. Every lane carries a label in the left gutter; an unlabelled lane is a defect, not a style.
- **Step column** — one vertical slot per ordered step, shared by every lane. Column position encodes order and nothing else.
- **Node** — a titled rectangle placed at exactly one `(lane, step)` cell. A step has one owner: never draw a node straddling a divider, and never duplicate one step into two lanes.
- **Empty cell** — a `(lane, step)` pair with no work renders **nothing**: no placeholder rect, no ghost outline, no label. Lanes are not required to have equal step counts; a single-step lane is legitimate.
- **Handoff** — a connector crossing a lane divider. These are the load-bearing edges of the diagram; same-lane continuations are not.

## Hierarchy

Rank by three signals, in this order: lane label gutter (who), step column header (when), node title (what). One focal handoff per diagram — the crossing that introduces the most coupling or the longest wait — carries the accent stroke; every other connector stays muted. Lane tints are decoration above one lane: tint at most one band, and never tint to compensate for a missing label.

## Reading direction

Steps run **left to right**; lanes stack **top to bottom** ordered by first participation, so the diagram's first node sits in the top-left cell. Vertical lanes (columns per party, steps descending) are permitted only when the artifact must fit a tall, narrow view; pick one orientation per diagram and never mix. Order the lanes so the dominant flow trends forward — if connectors snake backward repeatedly, reorder the lanes rather than accepting the tangle.

## Geometry

The step-and-role family shares one deterministic grid; two generations from the same inputs must produce identical coordinates.

```
label_col_w = 140      step_slot_w = 112     # 100-px node + 12-px corridor
header_h    = 36       lane_h      = 80      right_pad = 28
node_w      = 100      node_h      = 64

viewBox_w   = label_col_w + n_steps * step_slot_w + right_pad
viewBox_h   = header_h + n_lanes * lane_h + footer_h    # footer_h = 80 with a legend strip, else 24
lane_y_top(k) = header_h + k * lane_h
lane_y_mid(k) = lane_y_top(k) + lane_h / 2
step_cx(j)    = label_col_w + j * step_slot_w + step_slot_w / 2
node_x(j)     = step_cx(j) - node_w / 2
node_y(k)     = lane_y_top(k) + (lane_h - node_h) / 2
```

Lane dividers are hairlines at every `lane_y_top(k)`; the label gutter closes with one vertical hairline at `x = label_col_w`. The 12-px corridor inside each step slot is the only routing column — it exists so connectors never run under a node.

## Connector routing

- **Orthogonal only.** Every connector is an elbow path built from horizontal and vertical segments, or a curve; a straight diagonal between two cells is rejected by `ui diagram lint`.
- **Single bend.** Exit the source node's **right edge** at `lane_y_mid(src)`, run horizontally into the destination's corridor, then turn once — down into the destination's top edge, or up into its bottom edge. Same-lane adjacent steps use a plain horizontal segment.
- Round each bend with an 8-px quadratic corner. Never exit from a node's top or bottom edge, and never enter from the left on a lane-crossing edge.
- Emit every connector **before** any node rectangle, so node fills mask the line ends.
- One `marker-end` per connector; never `marker-start`. Bidirectional traffic is two connectors with two ids.
- Label the focal handoff only, with an opaque paper-filled rect behind the text. Unlabelled connectors are the default: the lane and column already carry the semantics.
- Crossings are a layout failure here, not a drawing problem. If two connectors would meet in one corridor, swap step assignments or split the diagram.

## Density

| Dimension | Budget |
|---|---|
| Lanes | 6 |
| Steps | 8 |
| Labelled connectors | 1 (the focal handoff) |
| Tinted lanes | 1 |

Above budget, split by phase (e.g. intake then fulfilment) keeping lane order and tokens identical across the pair, so the two artifacts read as one story. Never shrink type or narrow the corridor to buy another column.

## Metadata

Set on the root `<svg>`, per the shared metadata contract:

- `data-diagram-grammar="swimlane"`
- `data-diagram-element="node"` on every step node group, `data-diagram-element="edge"` on every connector.
- Stable edge ids of the form `edge-<srcLane>-<srcStep>-<dstLane>-<dstStep>`, unchanged across regenerations of the same inputs.
- `data-focal-id` — the id of the focal handoff, or of the node that receives it when no crossing dominates. Always select one.
- `data-reading-order` — `ltr-steps-ttb-lanes` (or the vertical equivalent), plus the node id sequence the order implies.
- `data-source-kind="brief"`

## Failure modes

Beyond the shared taxonomy: an unlabelled lane; one step drawn across two lanes; placeholder boxes in empty cells; connectors snaking backward instead of a reordered lane stack; every crossing accented so none reads as focal; a tint on every band; a lane invented to balance the grid rather than sourced from the brief.
