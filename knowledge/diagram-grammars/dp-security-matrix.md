---
id: diagram-dp-security-matrix
description: Native grammar for a role × component entitlement grid — permission values held in cells, one focal access rule, and no connectors anywhere.
when:
  - role-permission-grid
  - rbac-access-cell
  - entitlement-matrix
---

# Diagram grammar: dp-security-matrix

Cross-cutting rules — accessible inline SVG, project-token inheritance, output contract, critique loop, shared failure taxonomy — live in `knowledge/diagram-craft.md`. This file states only what is specific to the entitlement matrix.

## Selection

Select this grammar when the subject is **who may do what**: a closed set of roles (or groups, or service principals) crossed with a closed set of platform components, where every intersection has a decidable permission value. The brief must supply both axes as enumerable lists and enough intersections to make a grid honest — a matrix with one role or one component is a list, not a matrix.

Select it only when the answer at each intersection is a *level of access*, not a *route*. If the reader's question is "can A reach B", that is topology. If it is "what may A do to B once reached", that is this grammar.

## Decline

Decline, per the shared decline protocol, when:

- The subject is a **containment or stacking relationship** — `layers.md` (bands stacked by abstraction) or `nested.md` (regions enclosing regions). Substituting either loses the whole point of the matrix: containment answers *where a thing sits*, while the matrix answers *what a role may do to it*. A layer band cannot express four different verdicts for four roles against one component; it has one region per tier, not one cell per pair.
- Either axis is open-ended or discovered as you draw. A matrix promises exhaustiveness — every pair rendered, `none` included — and an axis that grows breaks that promise silently.
- The brief describes **how** an entitlement is granted (request, approval, provisioning). That is a procedure; route it to the process or sequence grammar. The matrix shows the resulting state, never the grant flow.

## Vocabulary

- **Role** — one column. A named group of principals, carrying a primary name plus an optional directory-group identifier as a secondary line. 2–6 columns, ordered left to right by descending privilege.
- **Component** — one row. A named part of the platform, described by its *role in the platform*, never by a vendor product name: "identity provider", "object store", "query engine", "notebook environment", "ingest tool". An optional right-aligned hint qualifies the row ("SSO", "raw zone").
- **Cell** — one intersection, holding a free-form display value and exactly one **level** from the closed vocabulary `full | rw | read | none`. The level drives fill, stroke, text color, and weight; the value carries the domain wording (`Admin`, `R/W`, `SELECT`, `Login`, `No access`). Never invent a fifth level to fit unusual wording — set the level to the nearest true category and let the value say the rest.
- **Legend** — one swatch per level *actually used*, never the full vocabulary.

Every omitted intersection renders explicitly as `none` with the diagram's declared no-access label. An empty cell is ambiguous between "no access" and "unknown"; the matrix may not ship an unknown.

Concrete lakehouse component vocabulary: `knowledge/domain-packs/lakehouse.md`.

## Hierarchy

Three tiers of emphasis, and no more. Role banners carry the strongest fill and sit above every data row. Component label cells carry the row identity at low emphasis. Data cells carry emphasis proportional to privilege: `full` reads heaviest, `rw` neutral, `read` recessive, `none` nearly silent — so a reader scanning the grid sees the shape of privilege before reading a single word.

Exactly **one focal cell**, or zero. The focal cell overrides its level with the accent treatment and may carry a second line naming why it matters. It marks the single access rule that distinguishes this platform's posture from a generic permissions table. Two focal cells erase the signal; if two rules genuinely compete, split the matrix.

Do not tint whole rows or whole columns to create emphasis — a full-row highlight collapses the grid back into a list and drowns the focal cell.

## Reading direction

Top-to-bottom by component, left-to-right by role, in that priority. The reader lands on a row (the thing being protected), then sweeps across it (who may touch it). Order components by the path data takes through the platform — identity first, then storage, then query, then interactive and ingest tooling — so the row order itself teaches the platform. Order roles by descending privilege so the grid's weight falls away to the right and an anomaly stands out.

Never re-sort either axis mid-diagram, and never sort rows by "most interesting" — the focal cell already carries emphasis and does not need a position promotion.

## Connector routing

**This grammar emits no edges.** There are no arrows between cells, no flow lines, no leader lines into the focal cell. All information lives in cell content and cell styling; the focal cell's accent border is the only element that "points", and it points by enclosure, not by a stroke leaving the cell.

`dp-security-matrix` is **not** exempt from the orthogonal-connector rule in `ui diagram lint` — it simply presents nothing for that rule to check. If any element is ever marked `data-diagram-element="edge"` here, the artifact is wrong before geometry matters: remove the element rather than routing it. Grid rules, separators, and cell borders are node chrome, not connectors, and carry no edge marking.

Colors come from design tokens only — `var(--color-…)`, `currentColor`, `none`, `url(#…)`. A literal hex, `rgb()`, or `oklch()` in an SVG presentation attribute is rejected by lint, including in per-cell emphasis overrides.

## Density

Budget: **6 roles × 14 components**. Past 6 columns the role banners lose their second line; past 14 rows the grid outgrows a single readable view.

Split before shrinking, and split along a real seam: human roles versus service principals for the column axis; storage / compute / governance / observability for the row axis. Keep tokens, level vocabulary, and column order identical across a split so the parts read as one audit. Say in the artifact what the split left out. Never drop a row to make room — a dropped component reads as an unprotected one.

Cap emphasis overrides beyond the focal cell at two per diagram. More than that and the grid reads as colored noise rather than a ranked posture.

## Metadata

On the root `<svg>`, per the shared metadata contract:

- `data-diagram-grammar="dp-security-matrix"`
- `data-diagram-element="node"` on every cell — role banners, component label cells, and value cells are all nodes. **No element in this artifact carries `data-diagram-element="edge"`,** and consequently there are no edge ids to keep stable.
- Stable ids: `cell-r<row>-c<col>` for value cells, `role-<col>` for banners, `component-<row>` for label cells, derived from axis position so the same inputs regenerate the same ids.
- `data-focal-id` — the id of the single focal cell; when no cell is focal, the id of the highest-privilege cell in the first component row. It must resolve to exactly one element.
- `data-reading-order` — `rows-then-columns`, plus the component id sequence it implies.
- `data-source-kind="brief"`

## Critique

Run the shared critique loop with these checks: every intersection is rendered, including `none`; every level is drawn from the closed vocabulary; exactly one or zero focal cells; no element marked as an edge; the legend lists only levels present; no component named by a vendor product; row order matches the platform path declared in `data-reading-order`.

## Failure modes

Beyond the shared taxonomy: an empty cell standing in for "unknown"; a fifth invented level; whole-row or whole-column tinting; a leader line drawn to the focal cell; the matrix pressed into service as a grant-process diagram; a seventh role column added rather than splitting; the legend listing the full vocabulary instead of what the grid uses.
