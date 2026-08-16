---
id: diagram-er
description: Native grammar for entity-relationship models — entity boxes with typed attribute rows, marked primary and foreign keys, and cardinality declared at both ends of every relationship.
when:
  - entity-relationship-cardinality
  - table-key-relation
  - schema-entity-link
---

# Diagram grammar: er

Cross-cutting rules — accessible inline SVG, project-token inheritance, output contract, critique loop, shared failure taxonomy — live in `knowledge/diagram-craft.md`. This file states only what is specific to entity-relationship models.

## Selection

Select this grammar when the subject is a set of **entities that hold attributes and relate to each other with a countable multiplicity**: a database schema, an API resource model, a domain model. Two conditions must both hold, or the grammar does not apply:

1. Each entity has an identity — a primary key, or a stated natural key — and at least some named attributes.
2. Each relationship's multiplicity is decidable at *both* ends (one, zero-or-one, many, one-or-many). An edge whose cardinality you have to guess is not an ER edge.

If the brief supplies entity names but no attributes and no multiplicity, it is a component map, not a data model.

## Decline

Decline, per the shared decline protocol, when:

- The edges are **parent-child decomposition** — a thing broken into its parts. That is `tree.md`. Substituting a tree loses cardinality entirely: a tree edge asserts *contains*, and cannot say whether one parent has exactly one child or unboundedly many, nor whether the child may exist without a parent. It also cannot draw a cycle, and real schemas have them.
- The edges are **runtime interaction between deployed things** — calls, dependencies, deployment placement. That is `architecture.md`. Substituting it loses the key structure and the cardinality: architecture answers *what talks to what*, while this grammar answers *how many rows of A relate to how many rows of B*, a claim architecture has no vocabulary for.
- The brief describes **state changes of one entity over time**. That is `state.md`, and no amount of attribute detail turns a lifecycle into a schema.
- More than roughly a dozen entities carry relationships in every direction — decline or scope down rather than shipping a tangle; see Density.

## Vocabulary

- **Entity** — a two-section box. The **header** carries a type tag and the entity name; the **body** carries attribute rows, one per line, in a monospaced face so keys and types align down the column. Box height follows content — never pad entities to a common height.
- **Attribute row** — `<marker><name> <type>`. The marker column is fixed-width and holds exactly one of:
  - `#` — primary key. Every entity shows its primary key first, before any other attribute.
  - `→` — foreign key, followed by the target entity in the type column.
  - blank — an ordinary attribute.
  A composite primary key marks every participating column with `#`, in key order, and nothing else may sit between them.
- **Relationship** — a connector between exactly two entities, carrying a cardinality mark at *each* end and an optional verb-phrase label ("has", "belongs to", "authors") centered on the path.
- **Weak entity / join table** — drawn as an ordinary entity with its full composite key visible. Never collapse a join table into a single many-to-many line if the brief gives it attributes of its own; a join table with payload is an entity.

**Cardinality notation — declare the convention once, in the artifact, and hold it.** Use crow's-foot: a single bar for *exactly one*, a bar plus circle for *zero or one*, a crow's foot for *many*, a crow's foot plus bar for *one or many*, a crow's foot plus circle for *zero or many*. If the project's tokens cannot carry crow's-foot glyphs, substitute the text notation `1`, `0..1`, `1..*`, `0..*` at both ends — but pick one system per diagram and never mix marks and text, or the two ends of a single relationship in two notations.

Do not introduce an entity, attribute, or relationship the brief does not support.

## Hierarchy

One entity is the model's anchor — the aggregate root, or the entity most relationships terminate on — and carries the accent treatment; everything else is neutral. Exactly one anchor: a second accent turns the model into two competing centers.

Attribute rows carry no emphasis of their own beyond the key markers. Resist typographic ranking inside the body — a bolded "important" column reads as a key and lies to the reader. Emphasis ranks: anchor entity, then entity headers, then attribute rows, then relationship labels, then cardinality marks, which stay small and quiet but must remain legible at the diagram's rendered size.

## Reading direction

Lay out by **cluster, then by dependency**: place each cluster of tightly related entities together, and within a cluster put the referenced entity upstream of the entity holding the foreign key — left-to-right or top-to-bottom, one direction per diagram. The anchor entity sits where the reader lands first under that direction.

Choose the direction that makes most relationships short and straight. Rearranging entities to shorten paths is always preferred to routing a long connector across the canvas; unlike a sequence diagram, this grammar has no fixed axis to protect, so position is free and should be spent on legibility.

## Connector routing

**This grammar is orthogonal-required.** `ui diagram lint` (`src/core/diagram-lint.ts`) rejects a straight diagonal on any element marked `data-diagram-element="edge"`: route every relationship as an elbow path of horizontal and vertical segments, or as an explicit curve. A single diagonal chord between two entity corners fails the gate.

- Each relationship carries a **stable id** derived from its endpoints, not from drawing order: `edge-<source>-<target>-<role>`, where `<role>` disambiguates two relationships between the same pair (a self-referencing hierarchy and a created-by link, say). The id survives regeneration of the same model.
- Attach connectors to entity **edges**, at the row of the participating key where the box is tall enough to make that unambiguous; never to a box corner and never to a floating point.
- Each path must be independently traceable: no two relationships share a segment, and no relationship passes through a third entity. Route around.
- A self-referencing relationship leaves and re-enters the same entity as an elbow that clears the box on one side, with cardinality marks at both ends like any other relationship.
- Cardinality marks sit at the connector's ends, clear of the entity stroke; the verb label sits at the midpoint, offset perpendicular to the path, moved along the path if the midpoint collides.

Colors come from design tokens only — `var(--color-…)`, `currentColor`, `none`, `url(#…)`. A literal hex, `rgb()`, or `oklch()` in an SVG presentation attribute is rejected by lint.

## Density

Budget: **8 entities, ~10 attribute rows each, and ~12 relationships** in one view. Past that, scope or split — never shrink type and never elide the key markers to buy space.

Split along a subdomain seam (ordering, identity, billing) and repeat a shared entity in both halves as a header-only stub with its primary key and no body, so the reader can stitch the halves without a legend. On a model with dozens of foreign keys, lay out by cluster and draw only the relationships that carry the question being asked — then say in the artifact which relationships were left out, because a missing edge in an ER diagram reads as an assertion that none exists.

## Metadata

On the root `<svg>`, per the shared metadata contract:

- `data-diagram-grammar="er"`
- `data-diagram-element="node"` on every entity box; `data-diagram-element="edge"` on every relationship connector. Attribute rows are content inside their entity node, not nodes of their own.
- Stable edge ids as above (`edge-<source>-<target>-<role>`), unchanged across regenerations. Entities use `entity-<name>`.
- `data-focal-id` — the id of the anchor entity. It must resolve to exactly one element.
- `data-reading-order` — the chosen direction (`ltr` or `ttb`) plus the entity id sequence it implies, clusters in order.
- `data-source-kind="brief"`

## Critique

Run the shared critique loop with these checks: every entity shows its primary key first; every foreign key marker names a target entity that exists in the diagram; both ends of every relationship carry a cardinality mark in the same notation; the declared notation is stated once in the artifact; no relationship path is diagonal; exactly one anchor entity; omitted relationships are declared, not silently absent.

## Failure modes

Beyond the shared taxonomy: cardinality present at one end only; two notations mixed across the diagram; an arrow drawn for every foreign key on a model that should have been laid out by cluster; entities padded to equal height; a join table with attributes collapsed into a bare many-to-many line; a foreign key pointing at an entity the diagram does not show; and treating a missing edge as neutral when the grammar reads it as "no relationship exists".
