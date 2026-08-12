---
id: diagram-architecture
description: Native grammar for system/software architecture diagrams — components, zones, and relationships resolved into a single-direction layout with independently traceable connectors.
when:
  - Brief describes services, modules, layers, containers, or infrastructure and how they connect or depend on each other
  - User explicitly asks for a system diagram, architecture diagram, component diagram, or deployment view
  - Brief names discrete components with relationships that are explicit ("calls", "depends on", "deploys to") or reliably inferable from the source
---

# Diagram grammar: architecture

Cross-cutting rules — SVG accessibility baseline, project tokens, metadata conventions, critique loop, general failure taxonomy — live in `knowledge/diagram-craft.md`. This file only states what is specific to architecture diagrams; it does not restate the shared contract.

## Selection

Select this grammar only when the brief yields a stable component set: named things (services, modules, systems, actors, stores) plus edges between them that survive a re-read. If the brief only vaguely gestures at "how the system works" without naming distinguishable parts, do not force this grammar — decline instead of inventing components.

## Decline

Decline, per the shared decline protocol, when:

- The brief describes a **process or sequence over time** (steps, states, transitions) rather than a static structure — that belongs to a flow/sequence grammar, not this one.
- Fewer than two components have a nameable relationship — a single box is not architecture.
- The brief is copy/paste of an existing diagram or a request to reproduce a specific vendor's icon set or asset library — native grammar means constructing shapes from project tokens, never copying external prose or imagery.

## Vocabulary: components, zones, relationships

- **Component** — a titled rectangle (or the project's native shape token) representing one named part of the system. One component = one node; do not split a single named entity across multiple boxes.
- **Zone** — an optional bounding region (e.g. "client", "backend", "external") drawn as a lower-emphasis container behind the components it groups. Zones nest at most one level deep; do not stack zones inside zones.
- **Relationship** — a connector between exactly two components, carrying an optional label naming the interaction (verb phrase: "calls", "writes to", "publishes"). Undirected relationships are rare in architecture; default to directed unless the brief states otherwise.

Do not introduce a component or relationship the brief does not support — see the shared contract's rule against invented content.

## Hierarchy

Establish one visual hierarchy signal, not several competing ones: either zone grouping *or* size/emphasis differences between components, not both unless the brief clearly warrants it (e.g. one system explicitly described as central). A component central to the brief's narrative earns stronger emphasis (weight, fill) — this is the diagram's focal component, and drives `data-focal-id` (see Metadata below).

## Reading direction

Exactly one dominant reading direction per diagram: left-to-right, top-to-bottom, or (rarely) an explicit radial/hub layout when the brief describes a hub-and-spoke system. Pick the direction from the brief's own narrative order (what's described first is upstream) or from a natural data-flow order (request → processing → storage). Never mix, e.g., left-to-right for one zone and top-to-bottom for another — if the brief's relationships don't reduce to one direction, split the diagram (see Density) rather than layering directions.

## Connector routing

- Every connector gets a **unique, stable id** (`edge-<source>-<target>` or equivalent) that does not change across regenerations of the same brief — downstream tooling and critique passes rely on id stability.
- Each connector's path must be **independently traceable**: no two connectors may share a path segment, and a connector must not visually pass through an unrelated component. Route around, not through.
- Prefer orthogonal or gently curved routing consistent with the chosen reading direction; do not mix routing styles within one diagram.
- When two components have relationships in both directions, use two distinct connectors (two ids, two paths) rather than one bidirectional-looking line — traceability requires each edge to resolve to exactly one relationship.

## Label placement

Place a relationship label at the connector's midpoint by default, offset perpendicular to the path so it never overlaps the line itself or another label. If midpoint placement collides with a component or zone boundary, move along the path to the nearest clear segment rather than shrinking or rotating the label. Component titles live inside their shape, centered; never rely on an external legend to name a component that appears on the canvas.

## Density and splitting

If placing all components at readable size within one canvas would force overlapping connectors, unreadable labels, or a mixed reading direction, split into multiple diagrams (e.g. one per zone, or a top-level overview plus per-component detail) rather than compressing. Density is a split decision, not a shrink-and-hope decision — see the shared contract's density guidance for the general threshold.

## Tokens and accessible SVG

Use only project tokens for color, stroke, spacing, and type (per `diagram-craft.md`) — no ad hoc hex values, no borrowed icon glyphs. Emit inline SVG following the shared accessibility baseline (`<title>`/`<desc>` per component and for the diagram as a whole, sufficient contrast, no color-only encoding of relationship meaning — use label text or line style differences too).

## Metadata

Set on the root SVG element, per the shared metadata contract:

- `data-diagram-grammar="architecture"`
- `data-reading-order` — the chosen direction (`ltr`, `ttb`, or a named hub order) plus, where useful, the component id sequence it implies
- `data-focal-id` — the id of the diagram's focal component, if one was established under Hierarchy; omit if the brief supports no single focal point
- `data-source-kind="brief"`

## Critique

Run the shared critique loop with these architecture-specific checks: reading direction is singular and matches the brief's narrative order; every connector id and path is unique and traceable in isolation; no invented component or relationship; focal component (if any) is visually distinguishable without relying on `data-focal-id` alone.

## Failure modes

Beyond the shared failure taxonomy, watch for: connectors that visually cross a third component's boundary; two relationships collapsed into one ambiguous bidirectional line; zones nested more than one level; a diagram that reads top-to-bottom in one zone and left-to-right in another; components invented to "balance" the layout rather than sourced from the brief.
