---
id: diagram-process
description: Native grammar for role-badged operational procedures — the step-and-role grid at full width, with per-node role badges, payload chips, and connector styles that distinguish hand-offs from orchestration triggers and critical edges.
when:
  - role-badged-procedure
  - operational-runbook-steps
  - connector-styled-workstream
---

# Diagram grammar: process

Cross-cutting rules — SVG accessibility baseline, project tokens, output contract, critique loop, general failure taxonomy — live in `knowledge/diagram-craft.md`. The lane grid and its coordinate formulas live in `diagram-grammars/swimlane.md`; the payload-chip layer lives in `diagram-grammars/data-flow.md`. This file states the connector-style layer and the wider budget it buys.

## Selection

Select this grammar for a long, sequential procedure across many divisions where the reader must see, at a glance, **who** owns each step, **what** enters and leaves it, and **which edges are of a different kind** — a routine hand-off, an orchestration or manual trigger, a re-test loop back upstream. This is the widest member of the step-and-role family: it earns its extra columns only when the procedure genuinely runs that long. Responsibility audits, quality-gate reviews, cross-divisional hand-off maps, and end-to-end runbooks land here.

## Decline

Decline, per the shared decline protocol, when:

- The brief names only roles and ordered steps, with no typed payloads and no distinguished edges → `swimlane.md`.
- The brief carries typed payloads but treats every edge alike → `data-flow.md`.
- Family precedence, applied in order: only roles and ordered steps → **swimlane**; steps carry typed payloads → **data-flow**; steps carry role badges *and* distinguished connector styles → **process**. Most specific wins; this grammar is the last stop, so escalating here requires both extra fields, not a preference for the richer picture.
- The subject is branching logic where the next step depends on an evaluated condition → `flowchart.md`.
- The steps have no owner — a procedure with no division of labour is a plain ordered flow, and the lane gutter would be empty scaffolding.

## Vocabulary

Inherits lane, step column, node, empty cell, and handoff from `swimlane.md`; inherits role key, payload chip, and payload codes from `data-flow.md`. Adds:

- **Role badge** — every node renders its lane's key, not its step number. The step number already lives in the column header chip, and a badge that repeats it wastes the only self-contained "who" a node carries when excerpted.
- **In → out line** — a muted line inside the node stating the transformation in the brief's own words ("submissions → approved"), sitting above the tool line. It narrates what the payload chips encode.
- **Tool line** — the generic capability performing the step (ingest tool, object store, query engine, identity provider, scheduler, notebook environment, spreadsheet). Name capabilities, never vendors.
- **Concern colour** — an optional per-node override marking the kind of risk a step carries: security/identity/governance, observability/quality, publication/data-products, backup and archive. Each concern resolves to its own `var(--color-…)` token; `ui diagram lint` rejects a literal hex in a presentation attribute. Applies to border, role badge, and title only.

Two-line titles collide with the chip row. When a title needs two lines, either grow the node to 72px or omit that node's chips — omission is the default.

## Hierarchy

Three ranked signals: the connector style (what kind of edge), the lane badge (who), the step chip (when). Exactly one focal step (the decision or verification pivot — collect, validate, approve) and one focal node (the step that receives the critical hand-off). The focal node's border and badge take the accent; its title stays ink so it remains readable. Concern colour is capped at **3** elements per diagram beyond the focal pair, and is ignored outright on a focal element — accent always wins. Subtitle, in → out line, tool line, and payload chips stay muted regardless of any concern colour.

## Reading direction

Steps left to right, lanes top to bottom, ordered so the procedure's first step sits top-left and ownership moves forward. A long procedure will hand back upstream — that is expected and is exactly what the upward connector form exists for; do not reorder lanes to eliminate every backward edge, only to eliminate a persistent zig-zag.

## Connector routing

- **Orthogonal only.** Elbow paths of horizontal and vertical segments, or curves. A straight diagonal between lanes is rejected by `ui diagram lint`.
- **Single right-angle bend.** Exit at the source node's right edge, vertical centre; run horizontally to the destination's corridor, 8px before the destination node; turn once into the destination's **top** edge when travelling down, or its **bottom** edge when travelling up. Round each bend with an 8-px quadratic corner. Same-lane adjacent steps use a plain horizontal segment. Never exit from a node's top or bottom edge; never enter from the left on a lane-crossing edge.
- Three styles, bound to **topology**, never to a node's concern colour:
  - *standard* — muted solid, standard marker: a routine hand-off between steps or actors. Unlabelled.
  - *focal-in / focal-out* — accent solid, accent marker: every edge terminating at or originating from the focal node.
  - *trigger* — muted dashed, small marker: an orchestration or manual trigger, including a re-test loop back to an earlier step. Unlabelled.
- All connectors are unlabelled by default: the step number and lane already carry the semantics, and a label on every edge is noise. Label only an edge representing a non-step concept (escalation, re-test), over an opaque paper-filled rect.
- Emit every connector before any node rectangle. One `marker-end` per path, never `marker-start`.
- The corridor is the only routing column, so two edges meeting there would cross. Swap step assignments or split the diagram; never bend around, because a bend-around hides the control flow it is dodging.

## Density

| Dimension | Budget |
|---|---|
| Lanes (actors) | 6 |
| Steps | 12 |
| Payload chips per node | 2 (skip the input chip on first-step nodes, the output chip on last-step nodes) |
| Labelled connectors | 0 by default |
| Custom-coloured elements | 3, beyond the focal pair |

Above 6 lanes or 12 steps, split into an overview plus a detail artifact rather than compressing. Step labels stay short (≤ 9 characters) — abbreviate rather than shrink the type. A legend strip below the grid names the step chips, the payload codes in use, the concerns in use, and the connector styles in use; a style used nowhere never appears in the legend.

## Metadata

Set on the root `<svg>`, per the shared metadata contract:

- `data-diagram-grammar="process"`
- `data-diagram-element="node"` on every node group, `data-diagram-element="edge"` on every connector.
- Stable edge ids of the form `edge-<srcLane>-<srcStep>-<dstLane>-<dstStep>`, unchanged across regenerations of the same inputs.
- `data-focal-id` — the id of the focal node. Always select one.
- `data-reading-order` — `ltr-steps-ttb-lanes`, plus the node id sequence of the procedure.
- `data-source-kind="brief"`

## Failure modes

Beyond the shared taxonomy: every connector drawn in one style, so an orchestration trigger reads as a data hand-off; a role badge showing the step number instead of the lane key; a vendor product name in a tool line; concern colour applied to a focal element or bled onto a connector; chips crammed under a two-line title; more than one focal step or focal node; a 14-step procedure squeezed onto one canvas instead of split.
