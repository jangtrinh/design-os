---
id: diagram-product-flow
description: Native grammar for rendering product/user flows as diagrams sourced from flow.json, with mandatory linting and a fidelity ledger for anything merged, collapsed, or dropped.
when:
  - Rendering a product flow, user flow, onboarding, or checkout flow from flow.json
  - Auditing an existing product-flow diagram for missing screens, states, or transitions
  - Deciding whether a flow must split across multiple diagram files
  - Reviewing a product-flow diagram before it ships in a PR
---

# Product Flow Diagrams

Native grammar for turning `flow.json` into a diagram of screens, screen states, and the transitions between them. This is not a wrapper around an external flowcharting tool's syntax — no imported node shapes, icon packs, or prose lifted from other diagramming products. Everything here composes with the shared rules in `knowledge/diagram-craft.md`; this file only adds what is specific to product flows. Do not restate density, token, or a11y baselines already covered there — reference them.

## Source of truth

`flow.json` is read-only semantic truth. The diagram is a *view* generated from it, never an edit surface.

The workflow must not mutate `flow.json`.

- Never write back to `flow.json`. If a flow is wrong, that's a product/engineering fix upstream, not a diagram fix.
- Every diagram file must resolve to a `flow.json` on disk (or a pinned commit/version of one). If it can't be resolved, the diagram is not renderable — say so, don't fabricate nodes.
- If `flow.json` changes after a diagram is generated, the diagram is stale until re-lint. Stale diagrams must be marked, not silently trusted.

## Lint before artifact — what each check actually owns

Two different `ui` commands touch this grammar, and they check disjoint things. Naming
either one as covering the other's ground is a false authority claim:

- **`ui flow lint`** validates `flow.json` itself — reachability, dead ends, dangling
  transition references, guard-without-complement, missing error/empty states — entirely
  within the flow graph. It never opens a diagram HTML file and knows nothing about any
  artifact rendered from the flow. Run it before authoring; a flow that doesn't pass is
  not diagram-ready (see `flow-craft.md`).
- **`ui diagram lint`** validates the diagram HTML in isolation — grammar token, owned-SVG
  structure, and (for `product-flow`) that every `node`/`edge` element carries a
  `data-source-id` *attribute at all*. It has no access to `flow.json` and cannot check
  whether that attribute's value actually names a real screen, state, transition, or entry
  point. A diagram can pass `ui diagram lint` while citing IDs that don't exist in the
  source flow.

Neither command performs cross-artifact resolution. Confirming that every
`data-source-id` on the diagram resolves to a real ID in the `flow.json` it claims to
derive from — and that the fidelity ledger is complete and accurate — is an **explicit
manual audit step**, done by the author (or reviewer) reading both files side by side.
Treat a pass on both lints as "the two artifacts are each internally well-formed," never
as "the diagram is proven faithful to the flow." Do not hand-patch the diagram to quiet a
lint finding without re-auditing the ledger.

## Node vocabulary

Every node maps to one of the three identities the schema (`schemas/flow.schema.json`)
actually defines — nothing else is a product-flow node:

| Node type | Source in `flow.json` | `data-source-id` value |
|---|---|---|
| `screen` | An entry in `screens[]` | the screen's `id` |
| `screen-state` | An entry in a screen's `states[]` (a data-lifecycle state — `default`/`empty`/`skeleton`/`loading`/`error`/`success`/`selected`, never a pointer state) | `screenId.stateId` |
| `entry` | An entry in `entryPoints[]` | the entry point's `id` |

`terminal` is a boolean field on a `screens[]` entry, not a separate node kind — a
terminal screen is still a `screen` node; give it a distinct visual treatment (see
Tokens/a11y below) rather than inventing a `terminal`/`exit` node type with its own ID
namespace. There is no `decision`, `action`, or `system-event` node: the schema has no
free-standing branch, tap-only-action, or system-event identity — a branch is expressed as
multiple transitions out of the same screen/state, and a system-driven step is a
transition (see Edge vocabulary).

Every node must carry `data-source-id`. A node without one is not a product-flow node —
it's decoration, and decoration doesn't belong in this grammar. If you need a label or
grouping, use the shared metadata/grouping conventions in `diagram-craft.md`, not a
synthetic node.

## Edge vocabulary

Every edge maps 1:1 to an entry in `transitions[]`; there is no separate edge-type
namespace requiring its own IDs:

| Edge | Source in `flow.json` | `data-source-id` value |
|---|---|---|
| `transition` | An entry in `transitions[]` | the transition's `id` |

A transition's own fields drive its visual treatment — they are rendering choices on the
one real edge type, not additional node/edge kinds:

- **Guarded** — `guard` is set. Render distinctly (e.g. a label tag) as a conditional
  branch; the schema declares guards for linting/handoff only, never for execution.
- **System-driven** — `trigger` is `AFTER_DELAY`. Render distinctly as automatic, since no
  user input fires it.
- **Back-edge** — the transition's `to` was already drawn earlier in the forward reading
  order (a retry, an edit-and-resubmit, a back navigation). This is determined by the
  diagram's own layout, not a `flow.json` field.

Back-edges and cycles are real and common in product flows. Never flatten them into a
straight line to make the diagram look cleaner:

- Render back-edges with a distinct visual treatment (dashed line + the shared "cycle"
  token), routed to avoid crossing the primary forward path where possible.
- Label back-edges with the transition's `trigger`/`label`, not left implicit.
- A cycle is not a bug in the diagram — collapsing a cycle into a single pass-through
  arrow is a fidelity loss and must be logged in the ledger, citing the real transition
  `id`s that were collapsed.

## Derived-view declaration

Every product-flow diagram file must declare, in its metadata block, that it is a derived
view. This block is **self-declared by the diagram's author** — no automated check parses
or verifies it; it records what the author attests to having run, not a machine-checked
guarantee. Name each lint separately rather than a single `lint: passed`, since `ui flow
lint` and `ui diagram lint` check disjoint things (see "Lint before artifact" above):

```yaml
derived-view:
  source: flow.json
  source-ref: <commit-sha-or-version>
  generated: <date>
  flow-lint: passed      # `ui flow lint` on flow.json, run by the author
  diagram-lint: passed   # `ui diagram lint` on this file, run by the author
  fidelity: partial   # or "full"
```

`fidelity: full` is only valid if the ledger below is empty. If the ledger has any entries, `fidelity` must be `partial` and the diagram must not describe itself as complete anywhere in its text or title.

## Fidelity ledger

Any merge, collapse, or drop must be logged with the affected source IDs and a reason. No silent simplification.

The table below is illustrative only — it shows the *shape* a ledger takes (plain
`flow.json` `id` strings, no reserved prefix or dot-notation the schema doesn't define),
not a real ledger for any shipped diagram. A real ledger cites the actual `screens[]`,
`transitions[]`, or `screenId.stateId` IDs from the `flow.json` the diagram was generated
from.

| Action | Affected IDs | Reason |
|---|---|---|
| merge | `confirm-a`, `confirm-b` | Both render the same confirmation copy; merged for space, semantics identical |
| collapse | `retry-submit`, `retry-again` | Retry cycle collapsed to a single back-edge to fit density budget; loop count not shown |
| drop | `session-heartbeat` | `AFTER_DELAY` system transition with no user-visible effect, excluded from user-facing flow view |

Rules:

- **Never claim complete with drops.** If the ledger has a `drop` row, the diagram must state explicitly (in its title or intro line) that it is a partial view, and name what's excluded.
- A `merge` is only valid when the merged nodes are truly equivalent in the source (same downstream edges, same semantic role). If they diverge even slightly, don't merge — split the diagram instead.
- Ledger entries must reference real IDs from `flow.json`. "various minor states" is not an entry.

## Density and splitting

Follow the density thresholds in `diagram-craft.md`. When a flow exceeds them:

- Prefer splitting into multiple linked diagram files (one per major sub-flow: e.g. `onboarding.md`, `checkout.md`) over merging/collapsing nodes to fit one canvas.
- A split must preserve every node and edge somewhere across the set — splitting is not an excuse for a drop. Cross-file edges get a `handoff` marker naming the target file and entry node.
- Only merge/collapse when a split still can't fit within the shared density budget for a single sub-flow, and log it in the ledger.

## Product flow vs. flowchart vs. state machine

This grammar is not interchangeable with generic flowcharts or state machines:

- **Not a generic flowchart.** Every node maps to a real `screen`, `screen-state`, or
  `entry` identity in `flow.json`; there's no room for abstract "process" boxes or
  pseudocode steps that don't correspond to a source ID.
- **Not a pure state machine.** A state machine enumerates all valid states and
  transitions exhaustively as an implementation contract. A product flow is user-facing
  and may legitimately omit internal states that never surface to the user (log them as
  `drop`, don't fake completeness).
- The distinguishing feature is `data-source-id` traceability plus user-facing framing —
  nodes are what a person sees, not internal system states.

## Tokens, a11y, metadata

Use the shared token/contrast/a11y baseline from `diagram-craft.md`. Product-flow-specific additions:

- Reserve a single consistent color token per node type (`screen`, `screen-state`,
  `entry`) across all product-flow diagrams in the repo — don't reassign `screen` to a
  different color per file.
- A terminal screen (`terminal: true`) must be visually distinguishable from a
  non-terminal screen without relying on color alone (shape or icon token too), since both
  render as the same `screen` node kind.
- Every node's accessible label must include its `data-source-id` alongside the human label, so the diagram stays auditable against `flow.json` by screen readers and tooling alike.

## Critique / failure modes

Reject or flag a product-flow diagram if it:

- Declares `fidelity: full` while any node/edge is missing relative to `flow.json`.
- Merges nodes that differ in downstream behavior to save space.
- Drops error states or terminal screens because they're "edge cases" — abandonment and
  failure paths are part of the product flow.
- Flattens a back-edge/cycle into a forward-only arrow.
- Ships without running `ui flow lint`, or ships after lint failed with the failure suppressed.
- Ships on a clean `ui diagram lint` alone, treating it as proof the `data-source-id`
  values actually resolve against `flow.json` — that resolution, and the fidelity
  ledger's completeness, is a manual audit step neither lint performs (see "Lint before
  artifact" above).
- Uses `source-ref` pointing at a stale or unpinned `flow.json`, making the diagram unverifiable against current truth.
- Mutates or proposes edits to `flow.json` itself instead of treating it as read-only.
