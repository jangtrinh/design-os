---
id: diagram-state
description: Native grammar for finite state machines — persistent states, an initial marker, terminal states, and transitions labelled event, guard, and action.
when:
  - state-machine-transition
  - lifecycle-status-change
  - event-driven-state
---

# Diagram grammar: state

Cross-cutting rules — accessible inline SVG, project-token inheritance, output contract, critique loop, shared failure taxonomy — live in `knowledge/diagram-craft.md`. This file states only what is specific to state machines.

## Selection

Select this grammar when the subject is **one entity that persists in a named condition until an event moves it**: an order's status, an authentication session, a connection lifecycle, a job in a queue, a form wizard. Three conditions must hold:

1. The states are a closed, named set, and the entity is in exactly one of them at any moment.
2. Every transition is triggered — an event, a timeout, a completion — and can be named.
3. The machine has a defined entry point, and either terminal states or an explicit statement that it runs indefinitely.

The tell is re-entry: a state can be occupied more than once over the entity's life. If nothing can be revisited, this is probably not a state machine.

## Decline

Decline, per the shared decline protocol, when:

- The subject is a **procedure whose steps complete and hand off**. That is `flowchart.md`. The distinction is persistence: a state is a condition the entity *rests in* and can return to, while a flowchart step is work that runs once and finishes. Substituting a flowchart loses re-entry and the idle interval — it will draw "Awaiting payment" as a box that executes, when the real content is that the order sits there, possibly for days, until one of three events fires.
- The subject is an **exchange between two or more named participants**. That is `sequence.md`. Substituting it loses the machine entirely: sequence shows messages crossing between lifelines, and has no way to say that a participant is *in* a condition, nor which conditions it may legally reach next. A state machine describes one entity's interior; a sequence describes the traffic between several.
- Transitions outnumber states by more than roughly two to one — that is usually two machines braided together; separate them and route each.
- The brief names conditions but no events. An unlabelled transition is the one thing this grammar cannot ship, because *what triggers this* is the entire payload.

## Vocabulary

- **State** — a rounded rectangle carrying a short noun or adjectival phrase describing a condition, never a verb phrase describing work ("Awaiting payment", not "Charge the card"). One state per condition; do not split one condition across two boxes.
- **Initial marker** — exactly one per diagram: a small filled dot with a single unlabelled transition into the entity's first state. It is a marker, not a state, and nothing may transition into it.
- **Terminal state** — a ringed dot (an outline ring around a filled center). Zero or more; a machine with none must say in its description that it runs indefinitely, so a reader does not read the omission as an error.
- **Transition** — a directed connector from one state to another, labelled `event [guard] / action`, omitting any part the brief does not supply. The event is mandatory. The guard is a boolean condition in brackets; the action is an effect after a slash.
- **Composite annotation** — a from-any-state rule (a global timeout, a global cancel) written once as a standing annotation such as `* → Failed on timeout`, never as one transition drawn from every state.

Two transitions leaving the same state on the same event must carry mutually exclusive guards. If they do not, the machine is nondeterministic and the brief is wrong — say so rather than drawing it.

## Hierarchy

One state is focal and carries the accent treatment — typically the error state the reader must notice, or the happy-path completion. Exactly one; a second accent removes the reader's anchor. The initial marker and terminal rings stay neutral: they are structural punctuation, and accenting them competes with the focal state.

Emphasis ranks: focal state, then ordinary states, then transitions, then transition labels, then guards and actions, which may be quieter than the event but must stay legible at rendered size. Never emphasise a transition by thickening its stroke — stroke weight in this grammar means nothing, and a reader will invent a meaning for it.

## Reading direction

One dominant direction per diagram: left-to-right for a lifecycle that progresses, top-to-bottom for a machine dominated by escalation into error or terminal conditions. Order states along that axis by their distance from the initial marker, so the happy path runs as a straight spine and exceptions branch off it.

Backward transitions (retry, reopen, revert) run against the axis and are expected — they are the shape of the machine, not a layout failure. Rearrange states to reduce crossings before accepting a crossing, but never reorder to hide a backward transition; the return edge is often the most informative mark in the figure.

## Connector routing

**This grammar is orthogonal-required.** `ui diagram lint` (`src/core/diagram-lint.ts`) rejects a straight diagonal on any element marked `data-diagram-element="edge"`: every transition is an elbow path of horizontal and vertical segments, or an explicit curve. A diagonal shortcut between two state boxes fails the gate.

- Each transition carries a **stable id** derived from its endpoints and event, not from drawing order: `edge-<source>-<target>-<event>`. Two transitions between the same pair on different events therefore stay distinguishable across regenerations.
- **Self-transitions** loop out of a state and back into the same state, clearing the box on one side — by convention above it, unless a label collision forces another side, in which case every self-transition in the diagram moves with it. A self-transition is labelled like any other; an unlabelled loop is meaningless.
- Attach transitions to state edges, never to corners or to empty space. No two transitions share a path segment, and no transition passes through an unrelated state — route around.
- Transition labels sit at the path's midpoint, offset perpendicular, masked against the background so no stroke runs under the text. If the midpoint collides, move along the path to the nearest clear segment rather than shrinking or rotating the label.

Colors come from design tokens only — `var(--color-…)`, `currentColor`, `none`, `url(#…)`. A literal hex, `rgb()`, or `oklch()` in an SVG presentation attribute is rejected by lint.

## Density

Budget: **8 states and ~14 transitions** in one view, with the two-to-one transition-to-state ratio as the hard tell that the budget is wrong rather than tight.

Past it, split by lifecycle phase — provisioning, steady operation, teardown — and give each half its own initial marker at the boundary state, so the halves compose without a legend. Collapse a cluster of related conditions into one named composite state only when the brief supports the composite as a real condition, and say what it contains. Convert repeated from-any-state edges into a standing annotation before deciding the machine is too dense; that one substitution routinely halves the transition count.

Never drop a transition to fit. A missing transition reads as an assertion that the move is impossible.

## Metadata

On the root `<svg>`, per the shared metadata contract:

- `data-diagram-grammar="state"`
- `data-diagram-element="node"` on every state, on the initial marker, and on every terminal marker; `data-diagram-element="edge"` on every transition, including self-transitions and the initial marker's entry edge.
- Stable edge ids as above (`edge-<source>-<target>-<event>`), unchanged across regenerations. States use `state-<name>`; the initial marker uses `initial`.
- `data-focal-id` — the id of the focal state. It must resolve to exactly one element.
- `data-reading-order` — the chosen direction (`ltr` or `ttb`) plus the state id sequence along the happy path.
- `data-source-kind="brief"`

## Critique

Run the shared critique loop with these checks: exactly one initial marker, with nothing transitioning into it; every state reachable from it; every transition labelled with at least an event; same-event transitions out of one state carry exclusive guards; terminal states present, or their absence explained; from-any-state rules written as one annotation; no diagonal transition path; exactly one focal state.

## Failure modes

Beyond the shared taxonomy: an unlabelled transition; a state named as a verb phrase, which quietly converts the machine into a flowchart; a from-any-state rule drawn from every state; a state unreachable from the initial marker; a terminal state with an outgoing transition; two transitions on the same event with overlapping guards; an unlabelled self-loop; and a layout reordered to hide a backward transition rather than to reduce crossings.
