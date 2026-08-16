---
id: diagram-flowchart
description: Native grammar for branching decision logic — terminals, actions, and decision gates whose shape carries type, with every branch labelled and every path resolving to a terminal or a merge.
when:
  - branching-decision-path
  - terminating-branch-logic
  - yes-no-gate
---

# Diagram grammar: flowchart

Cross-cutting rules — SVG accessibility baseline, project tokens, output contract, critique loop, general failure taxonomy — live in `knowledge/diagram-craft.md`. This file states only what is specific to flowcharts.

## Selection

Select this grammar when the brief's structure is **conditional**: the next step depends on an evaluated question, and different answers lead somewhere different. Algorithms, triage trees, onboarding routing, eligibility checks, and user-facing "should I…?" flows land here. The test is that at least one node has two or more outgoing paths distinguished by a stated condition, and that every path eventually terminates or rejoins.

## Decline

Decline, per the shared decline protocol, when:

- There are no decisions — a strictly linear run of steps is an ordered flow, not a flowchart; a diamond with one exit is a rectangle wearing a costume.
- Ownership of each step is the subject and branching is incidental → `swimlane.md`.
- The subject is one entity's states and the events that move it between them → a state grammar; a flowchart drawn over states loses the invariant that a state persists between events.
- The subject is time-ordered messages between named participants → `sequence.md`.
- The brief supplies conditions the diagram cannot evaluate — probabilities, weights, scores. Those are quantities; route them to a chart grammar and say what the substitution loses.

## Vocabulary

**Shape carries type; colour never does.** A reader must be able to identify every node kind in greyscale.

- **Terminal** — a stadium/oval (`rx=20`) marking a start or an end. Exactly one start; one or more ends, each labelled with the outcome it represents.
- **Action** — a rectangle (`rx=6`) for a step that does something and has exactly one exit.
- **Decision** — a diamond holding the question in interrogative form ("Payment cleared?"), with **2 or 3** outgoing branches. Four or more exits means the question is really several questions: refactor into nested diamonds.
- **Merge** — a small filled dot (`r=4`) where branches rejoin. A merge has no label and no logic; it exists so the rejoin is visible rather than implied by two arrowheads landing on one node edge.
- **Branch label** — a short answer token on every outgoing edge of a decision, without exception. An unlabelled branch makes the diagram unreadable even when the convention seems obvious.

Node fills stay neutral and resolve to `var(--color-…)` tokens; `ui diagram lint` rejects a literal hex in a presentation attribute. Reserve the accent for one thing only — either the happy path or the single most consequential decision, never both and never every gate.

## Hierarchy

The spine of the diagram is the path a reader is most likely to follow: the happy path, or the path the brief spends the most words on. Place that path on a single straight vertical axis and let exceptional branches leave it sideways. Depth ranks above breadth — a reader tracing a decision cares what happens next, not what happens elsewhere — so a branch that immediately terminates is drawn short and does not compete with the spine for vertical space.

## Reading direction

Flow runs strictly **top to bottom**. From a decision, the conventional exits are the affirmative to the **right** and the negative **below**, continuing the spine — but the convention never replaces the label; label both regardless. Backward edges (retry, re-ask) run up the outside of the spine and re-enter at a merge dot, never directly into a decision's body. Never invert direction mid-diagram to shorten an edge.

## Connector routing

- **Orthogonal only.** Every connector is an elbow path of horizontal and vertical segments, or a curve; a straight diagonal is rejected by `ui diagram lint`.
- Leave a decision from its side vertex (affirmative) or bottom vertex (negative); leave every other node from its bottom edge. Enter a node at its top edge, or at the side vertex for a re-entering backward edge. Round bends with an 8-px quadratic corner.
- Every connector gets a unique, stable id (`edge-<source>-<target>`, suffixed with the branch token when a decision has multiple exits to the same target) that survives regeneration.
- Each path must be independently traceable: no two connectors share a segment, and no connector passes through an unrelated node. Route around, in the gutter beside the spine.
- When two connectors must cross, put a small arc hop on one so the crossing reads as a crossing — an arc is a curve and remains orthogonal-compliant; a diagonal shortcut is not.
- Place a branch label just outside the decision's vertex, offset perpendicular to the path, never on top of the line or another label. A backward edge is labelled at the point it leaves the spine, where the reader meets it.

## Density

| Dimension | Budget |
|---|---|
| Decisions | 5 |
| Total nodes | 15 |
| Exits per decision | 3 |
| Nesting depth from start to deepest terminal | 5 |

Above budget, extract a sub-decision into its own artifact and represent it in the parent as a single action node named for the sub-flow — that is a scope decision, not a dropped element, and it is declared. Never shrink type or collapse two questions into one diamond to fit.

## Metadata

Set on the root `<svg>`, per the shared metadata contract:

- `data-diagram-grammar="flowchart"`
- `data-diagram-element="node"` on every terminal, action, decision, and merge group; `data-diagram-element="edge"` on every connector.
- Stable edge ids as above, unchanged across regenerations of the same inputs.
- `data-focal-id` — the id of the decision that carries the diagram's claim, or of the start terminal when the flow has one dominant path. Always select one.
- `data-reading-order` — `ttb`, plus the node id sequence of the happy path.
- `data-source-kind="brief"`

## Failure modes

Beyond the shared taxonomy: fill colour used to signal node type instead of shape; a decision with four or more exits; an unlabelled branch; a path that dead-ends without a terminal; a backward edge landing in a decision's body instead of a merge dot; the accent applied to every gate so none reads as consequential; two branches drawn to the same target as one connector, losing which answer led there; a diagonal shortcut used to dodge a crossing that an arc hop would have made legible.
