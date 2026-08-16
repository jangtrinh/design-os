---
id: diagram-tree
description: Native grammar for parent-child decomposition — one root breaking down into branches and leaves through elbow connectors, with explicit elision rather than silent pruning.
when:
  - parent-child-branching
  - taxonomy-descent
  - hierarchical-decomposition
---

# Diagram grammar: tree

`knowledge/diagram-craft.md` owns the shared contract — grammar routing, token inheritance, the SVG accessibility floor, output shape, and the critique loop. This file states only what is specific to decomposition trees.

## Selection

Select this grammar when the edges are **parent-child decomposition of things**: a category dividing into subcategories, a package resolving into dependencies, a directory into its contents, a capability into its parts. The edge means "is made of" or "descends from", and it is a claim about the things themselves, not about anyone's responsibility for them.

Structural requirements: exactly one root, every non-root node has exactly one parent, no cycles, and no edge that skips a level. A node connected to its grandparent with the intervening level missing is a source problem — draw the intermediate node or state that the branch is elided (see Elision), never bridge the gap.

## Decline

Decline, per the shared decline protocol, when:

- Edges are **reporting relationships between people** — roles, owners, front doors, escalation → `org-chart.md`. The geometry is nearly identical; the discriminator is what an edge asserts. If a reader would ask "who do I contact", it is an org chart even when the nodes have team names.
- Regions **enclose** other regions, so the decomposition is drawn as containment rather than as connectors → `nested.md`. Choose nesting when the reader needs to see that a child is *inside* its parent's scope; choose this grammar when the reader needs to compare siblings across a level.
- Bands **stack** with no cross-band edges at all → `layers.md`.
- The subject is services and their runtime connections — what calls what, what deploys where → `architecture.md`. Decomposition is not the same claim as communication, and a tree drawn over a service mesh will misstate both.

Also decline a decision tree whose branches are conditions and outcomes rather than parts, and any structure where a node legitimately has two parents — that is a graph, and forcing it into a tree duplicates a node and lies about the count.

## Vocabulary

- **Root** — the single top (or leading) node naming the whole being decomposed. One per artifact.
- **Branch node** — an interior node that has children. Its label is the name of the sub-whole, optionally with a mono sublabel carrying a count, a version, or a type.
- **Leaf** — a terminal node with no children. Terminal *position* already reads as terminal; add at most one quiet secondary signal — a lighter stroke weight or the secondary surface fill — and never a different shape.
- **Bus** — the horizontal run that joins a parent's children (see Connector routing). Part of the edge, not a node.
- **Elision node** — an explicit terminator standing in for a pruned sub-branch, labeled with what was cut and how much (`+14 modules`, `…3 more tiers`). It carries the branch's own id namespace so the cut is traceable.
- **Node width** — at most two values across the whole artifact. Wildly varying widths make the level structure unreadable, and width must never be used to encode importance.

**Root placement** is a layout decision made once, before any node is placed, and it follows label length: root-at-top when node labels are short enough that a level of five siblings fits across the canvas at readable size; root-at-leading-edge when labels are long, because an advancing tree grows in the direction that has room for text. Whichever is chosen, the root sits centered on the cross-axis of its own subtree, not of the canvas — a root visually offset from the branch it heads reads as a peer of the tier below it.

## Hierarchy

Depth is the only structural signal, and every node at a given depth shares one baseline (top-root layout) or one axis position (left-root layout). Do not vary corner radius, fill, or type size by depth — a reader infers depth from position, and a second encoding only competes with it.

Exactly one node takes the accent treatment: **either** the root **or** one critical leaf, never both. Accenting the root says "this is what we are decomposing"; accenting a leaf says "this is the part that matters, here is where it sits". Pick the one the explanation needs and state which in the critique. The accented node is the artifact's `data-focal-id`.

**Balancing** is descriptive, never cosmetic. Sibling subtrees are laid out by their real breadth, so an unbalanced source produces an unbalanced picture — that asymmetry is information. Never add a filler node, never redistribute children between parents, and never reorder siblings to even out the silhouette. Sibling order follows the source's stated order, otherwise breadth-descending, otherwise alphabetical; say which rule was used.

## Reading direction

One direction per artifact, declared: **root-at-top descending** by default, or **root-at-leading-edge advancing** when labels are long enough that a top-down layout would force wrapping. Never mix — a tree that descends for one branch and advances for another has no reading order at all.

Within a level, siblings read in the project's text direction, and DOM order is the depth-first traversal from the root so the spoken order matches the drawn structure.

## Connector routing

Edges use the **elbow convention**: the parent drops (or extends) a short stem, one horizontal bus spans the children, and each child takes its own short drop into its leading edge. One bus per parent. Draw connectors before nodes so a node's fill covers any stroke that would otherwise touch its edge.

`tree` is listed in `NON_ORTHOGONAL_GRAMMARS` in `src/core/diagram-lint.ts`, so `ui diagram lint` will **not** reject a corner-to-corner connector here — the grammar is orthogonality-exempt at the lint layer. That exemption covers the deliberate cases: a curved spline into an elision node, or a radial/fan layout where the elbow convention has no meaningful axis. **Default routing remains orthogonal**, and a diagonal drawn merely because it was the shortest path is a grammar violation the linter is simply not the check that catches. No edge may pass through an unrelated node.

Every edge gets a stable id (`edge-<parent>-<child>`) that survives regeneration of the same brief, and no two edges may share a path segment other than a shared sibling bus.

## Density

- **Max depth 4** — root plus three tiers. A fifth tier is illegible at readable type size; cut it with an elision node and ship a detail tree that re-roots at the elided branch.
- **Max breadth 5** per parent. A sixth child means either an intermediate grouping node the source supports, or an elision node counting the remainder.
- **Elision is explicit, always.** A pruned branch is drawn as an elision node naming what it stands for; silently dropping children is the shared contract's silent-drop failure and makes the tree's counts wrong.
- When splitting into an overview plus detail trees, keep node treatments, widths, and connector convention identical across the set so they read as one structure.

## Metadata

Set on the root `<svg>`, per the shared metadata contract:

- `data-diagram-grammar="tree"`
- Every root, branch, leaf, and elision node is `data-diagram-element="node"` with a stable id (`node-<depth>-<slug>`).
- Every connector is `data-diagram-element="edge"` with a stable id (`edge-<parent>-<child>`); a shared sibling bus is ided to its parent (`edge-bus-<parent>`).
- `data-reading-order` — prose naming the declared direction and the depth-first traversal it implies.
- `data-focal-id` — the id of the accented root or critical leaf; every artifact selects one.
- `data-source-kind="brief"`.

All color values resolve through the project's tokens — `var(--color-…)`, `currentColor`, `none`, or a `url(#…)` reference. A literal hex, `rgb()`, or `oklch()` in an SVG presentation attribute is rejected by `ui diagram lint`.
