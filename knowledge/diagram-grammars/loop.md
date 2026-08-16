---
id: diagram-loop
description: Native grammar for closed operating cycles — stations on a ring advancing clockwise while dashed spokes write state back to one shared hub.
when:
  - closed-cycle-ring
  - flywheel-station
  - recurring-feedback-orbit
---

# Diagram grammar: loop

Cross-cutting rules — accessible inline SVG, project-token inheritance, output contract, critique loop, shared failure taxonomy — live in `knowledge/diagram-craft.md`. This file states only what is specific to the loop.

## Selection

Select this grammar when the subject is a cycle that genuinely **returns**: the last station hands work back to the first, and the cycle is the point rather than a detail of the path. Select it only when the brief supports both motions at once — work advancing around the ring, and each pass depositing durable state into one shared center.

The dashed write-back spokes are the defining signal. If the brief names no accumulating state — no shared record, memory, standard, evidence base, or policy that every pass improves — remove the spokes and what remains is a circular process, not a loop; that shape does not earn this grammar.

## Decline

Decline, per the shared decline protocol, when:

- The path **ends, branches toward an outcome, or never truly returns** to its first step. That is `flowchart.md`, and this is the boundary this grammar inherits from its source: *prefer flowchart when the path ends, branches, or never truly returns*. Bending such a path into a ring loses the terminal state and the decision points — a flowchart's whole payload — and asserts a return the brief never claimed.
- The brief names **two accumulating centers**. Two hubs are two systems; draw two diagrams rather than one figure with a divided middle.
- Stations cannot be reduced to 5–8 named, ordered steps, or the ordering is not semantic — an unordered set of activities in a circle is decoration.

## Vocabulary

- **Station** — one named step on the ring, carrying a name plus one short sublabel. 5–8 stations, no fewer, no more. `stations[0]` sits at the top and the sequence proceeds clockwise; the last station always connects back to the first.
- **Hub** — exactly one, at the center: the accumulated state every pass writes into. It is **not** a further process step. Its copy is one name plus one short sublabel, never a list of responsibilities.
- **Ring connector** — a solid arc carrying work from one station to the next adjacent station, clockwise only.
- **Write-back spoke** — a dashed radial connector running inward from a station to the hub, at reduced emphasis. One spoke per station is the norm; a second is justified only when the two write-backs cannot be merged semantically.
- **Spoke label** — optional, uppercase, on one side of the spoke, masked against the background. Label a curated subset, never every spoke.

Do not add a station to "balance" the ring, and do not promote the hub into the station count.

## Hierarchy

The hub is the single darkest element on the canvas — that inversion is what tells a reader the center is state rather than another step. At most one station is focal, drawn with the accent fill and stroke; zero is allowed when no editorial gate deserves emphasis. Accent on multiple stations destroys the gate.

Emphasis ranks: hub, then focal station, then the solid ring, then the dashed spokes, which are deliberately the quietest marks in the figure. Never raise spoke emphasis to make the write-back "more visible" — the whole distinction between operating flow and write-back rides on that contrast.

## Reading direction

Clockwise from the top station, in SVG coordinates. Station `k` sits at `-90° + k·(360°/N)`, spacing equal unless a documented phase grouping requires a deliberate gap. The reader enters at the top, travels clockwise, and returns; the spokes are read second, as a set, not as part of the sequence.

There is no left-to-right or top-to-bottom alternative for this grammar — a loop with a linear reading direction is a flowchart wearing a circle.

## Connector routing

**This grammar is exempt from the orthogonality rule.** `loop` is listed in `NON_ORTHOGONAL_GRAMMARS` in `src/core/diagram-lint.ts`, so `ui diagram lint` does not geometry-check its edges: its ring and spoke geometry is radial by construction, and elbowing either into H/V segments would destroy the shape the grammar exists to draw. The exemption is a licence for exactly two primitives and nothing else:

- **Ring arcs.** Same-center, same-radius circular arcs (`A R R 0 0 1`), solid, clockwise. Every segment is a piece of one continuous circle — never mix a cubic, a straight chord, or a rounded-orthogonal segment into the ring, or it reads as a rounded rectangle. Each arc begins where the circle exits the source station's box and ends on the destination station's edge, compensated for the marker tip; no ring connector ends at a center point.
- **Radial spokes.** True radii from a station's inner edge toward the hub, dashed, stopping a small marker gap short of the hub stroke. Spokes must not cross one another and may touch only their own station and the hub.

No ring arc may cross the hub: enlarge the radius or split the diagram rather than threading flow through shared state. When two spokes must leave one station, fan their attachment points with clear separation. Labels sit clear of the stroke with an opaque mask, never on it.

Every connector carries a **stable id** derived from position, not from drawing order: `edge-ring-<k>-<k+1>` (the closing arc is `edge-ring-<N-1>-0`) and `edge-spoke-<k>`. Colors come from design tokens only — `var(--color-…)`, `currentColor`, `none`, `url(#…)`; a literal hex, `rgb()`, or `oklch()` in an SVG presentation attribute is rejected by lint.

## Density

Budget: **5–8 stations plus exactly one hub.** Below five the ring reads as a triangle of arrows; above eight the labels and spokes crowd the hub halo.

Past the budget, split into an overview loop plus one or more detail diagrams — never shrink type or drop a sublabel to fit a ninth station. Keep the hub, tokens, and clockwise convention identical across the split. When splitting, say which stations the overview collapsed and where their detail went.

The canvas must contain the full station rectangles, the outer ring curves, every arrowhead, and real breathing room; never shrink the viewBox until a stroke, marker, or arc clips.

## Metadata

On the root `<svg>`, per the shared metadata contract:

- `data-diagram-grammar="loop"`
- `data-diagram-element="node"` on every station and on the hub; `data-diagram-element="edge"` on every ring arc and every write-back spoke.
- Stable edge ids as above (`edge-ring-<k>-<k+1>`, `edge-spoke-<k>`), unchanged across regenerations of the same inputs. Stations use `station-<k>`, the hub uses `hub`.
- `data-focal-id` — the id of the focal station; when no station is focal, the hub's id. It must resolve to exactly one element.
- `data-reading-order` — `clockwise-from-top`, plus the station id sequence it implies.
- `data-source-kind="brief"`

## Critique

Run the shared critique loop with these checks: the return to station 0 is true, not asserted; exactly one hub, and it holds state rather than work; every ring segment shares one center and radius; every spoke is dashed, radial, and stops short of the hub; no spoke crosses another; at most one accent station; every edge id derives from position.

## Failure modes

Beyond the shared taxonomy: two hubs; solid spokes that impersonate primary flow; stations at uneven angles for no documented reason; mixed arc and orthogonal segments in one ring; a ring routed across the hub; accent on several stations; a ninth station instead of a split; and above all a cycle that never actually returns — a flowchart arranged in a circle, which should have been a flowchart showing its real endpoint.
