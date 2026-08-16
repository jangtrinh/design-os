---
id: diagram-org-chart
description: Native grammar for reporting hierarchies — people, teams, and agents arranged under a single front door, where every edge is an accountability line and every node answers who to reach and for what.
when:
  - reporting-line
  - personnel-hierarchy
  - team-headcount-tree
---

# Diagram grammar: org-chart

`knowledge/diagram-craft.md` owns the shared contract — grammar routing, token inheritance, the SVG accessibility floor, output shape, and the critique loop. This file states only what is specific to reporting hierarchies.

## Selection

Select this grammar when the nodes are **people, roles, teams, pods, or agents** and the edges are **accountability**: who reports to whom, who owns what, who picks up work that arrives without an owner. The reader's question is "who do I go to", not "how does this break down".

The subject must have a single top node — the front door that receives ambiguous work — and every other node must have exactly one accountable parent. A dotted second line is a supplement to that parent, never a replacement for it. A source where ownership genuinely forks with no primary owner is a coverage gap; draw it as one, per Vacancies below, rather than drawing two solid parents.

## Decline

Decline, per the shared decline protocol, when:

- Edges are **parent-child decomposition of things** — a taxonomy, a dependency breakdown, a file hierarchy → `tree.md`. Identical geometry, different claim: a tree's edge means "is made of", this grammar's edge means "answers to".
- Regions **enclose** other regions, so the picture is containment rather than reporting edges → `nested.md`.
- Bands **stack** with no cross-band edges at all, so seniority reads as strata rather than as lines → `layers.md`.
- The subject is services and their runtime connections — what calls what, what deploys where → `architecture.md`. An agent fleet drawn by its message paths is architecture; the same fleet drawn by its ownership is this grammar.

Also decline when the real question is "who does which step, in what order" — that is a role-partitioned process, not an ownership map — and when the org exceeds the density budget even after grouping.

## Vocabulary

- **Front door** — the single root: the person, team, or agent that receives work with no obvious owner. Exactly one per artifact, at the top, horizontally centered, carrying the accent treatment.
- **Group node** — a department, pod, queue, or routing bucket. Group nodes exist to keep span of control legible; introduce one whenever a parent would otherwise exceed its budget.
- **Owner node** — an individual role, specialist, or agent. Where space allows, an owner node answers three things and stops: **name** (the role, in the primary type token), **invocation** (the handle, queue, or trigger, in the mono token), and **scope** (two to four ownership words — never a sentence, never a job description).
- **Vacancy** — an owner that is unfilled, not yet live, or not yet wired up. Drawn with a dashed wall and the muted surface token, and drawn *present*. A missing route is operationally the most important thing on the chart; hiding it is the failure this grammar exists to prevent.
- **Dotted line** — a secondary, advisory, or matrix relationship to a node that already has a solid parent elsewhere. Dashed stroke, always labeled with what the relationship is.
- **Rule strip** — escalation and approval rules, carried in one footer strip or side callout. Approval gates are rules, not people; they never become nodes in the hierarchy.

Drawing every node as an identical box defeats the grammar: the reader can no longer see the front door, cannot tell a pod from a person, and cannot spot a gap. Treatment differences are the payload, not decoration. Equally, an invocation path stated in prose beside the diagram belongs in the node's sublabel — that is what the sublabel is for.

## Hierarchy

Depth is seniority of accountability, and it is the only structural signal — every node at a given tier sits on the same baseline, and node width takes at most two values across the artifact. Distinguish node *kinds* (front door, group, owner, vacancy) by treatment tokens: accent for the front door, the standard surface plus ink for groups, the secondary surface for owners, dashed muted for vacancies.

Exactly one node takes the accent, and it is the front door. Accenting a second node destroys the chart's only job, which is making the entry point unmissable.

**Sibling ordering** is deterministic, in this precedence: the source's own stated order first; otherwise by span of control descending (the pod with the most owners leads); otherwise alphabetically by name. State which rule was used in the critique so the order is not mistaken for a ranking that the source never made.

## Reading direction

Strictly top-to-bottom, front door first. Each tier reads across in the project's text direction, and DOM order follows tier-by-tier so a screen reader walks the chart the way the eye does. Never invert to bottom-up and never rotate to a left-root layout — the front-door-at-top convention is what makes the entry point findable at a glance, and this grammar spends its whole layout budget on that.

## Connector routing

Reporting lines use the **vertical drop → horizontal bus → vertical drop** convention: the parent drops a short stem, a single horizontal bus spans the children, and each child takes its own drop into the top edge of its node. One bus per parent; siblings share it and never each get their own path from the parent.

`org-chart` is listed in `NON_ORTHOGONAL_GRAMMARS` in `src/core/diagram-lint.ts`, so `ui diagram lint` will **not** reject a corner-to-corner connector here — the grammar is orthogonality-exempt at the lint layer. That exemption exists for the dotted matrix line, which may run corner to corner when an orthogonal route would have to tunnel through intervening nodes. It is not a licence for diagonal reporting lines: every solid accountability edge is drawn with the elbow convention above, and a diagonal solid line is a grammar violation that the linter simply is not the thing that catches it.

Dotted lines are labeled, never unlabeled; an unexplained dashed stroke reads as a mistake. No connector may pass through an unrelated node — route the bus above or below the obstruction.

## Density

- **Max 12 visible nodes.** Past that, ship an overview chart of the front door plus its groups, and one detail chart per group, with tokens and node treatments identical across the set.
- **Max depth 4 tiers**, counting the front door as tier 0.
- **Max 5 direct reports** under one parent — the span-of-control budget. A sixth report is the signal to introduce a group node, not to widen the bus.
- **A wide tier** (more than 5 nodes that genuinely belong at one level) is resolved by grouping, never by shrinking type or wrapping the tier onto two rows. If no honest grouping exists, split the artifact by branch and say what each split covers.
- Max one accent node, max two callouts, max one rule strip.

## Metadata

Set on the root `<svg>`, per the shared metadata contract:

- `data-diagram-grammar="org-chart"`
- Every person, team, group, and vacancy is `data-diagram-element="node"` with a stable id (`node-<tier>-<slug>`).
- Every reporting line and dotted line is `data-diagram-element="edge"` with a stable id (`edge-<parent>-<child>`) that does not change across regenerations of the same brief; a dotted line's id is prefixed to mark it advisory (`edge-dotted-<from>-<to>`).
- `data-reading-order` — prose naming the top-down traversal, front door first, tier by tier.
- `data-focal-id` — the id of the front door.
- `data-source-kind="brief"`.

All color values resolve through the project's tokens — `var(--color-…)`, `currentColor`, `none`, or a `url(#…)` reference. A literal hex, `rgb()`, or `oklch()` in an SVG presentation attribute is rejected by `ui diagram lint`.
