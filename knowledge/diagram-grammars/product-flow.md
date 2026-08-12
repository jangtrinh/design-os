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

Native grammar for turning `flow.json` into a diagram of screens, actions, and system decisions. This is not a wrapper around an external flowcharting tool's syntax — no imported node shapes, icon packs, or prose lifted from other diagramming products. Everything here composes with the shared rules in `knowledge/diagram-craft.md`; this file only adds what is specific to product flows. Do not restate density, token, or a11y baselines already covered there — reference them.

## Source of truth

`flow.json` is read-only semantic truth. The diagram is a *view* generated from it, never an edit surface.

The workflow must not mutate `flow.json`.

- Never write back to `flow.json`. If a flow is wrong, that's a product/engineering fix upstream, not a diagram fix.
- Every diagram file must resolve to a `flow.json` on disk (or a pinned commit/version of one). If it can't be resolved, the diagram is not renderable — say so, don't fabricate nodes.
- If `flow.json` changes after a diagram is generated, the diagram is stale until re-lint. Stale diagrams must be marked, not silently trusted.

## Lint before artifact

Run `ui flow lint` before emitting any diagram artifact. A diagram that hasn't passed lint is a draft, not a deliverable. Lint must check:

- Every diagram node has a `data-source-id` that resolves to a real screen/state/action ID in `flow.json`.
- Every diagram edge resolves to a real transition (or is explicitly declared derived — see below).
- No orphaned node (unreachable from any entry) unless the flow itself defines it as unreachable.
- No dangling edge (source or target ID missing).
- Fidelity ledger is present and non-empty whenever node/edge count in the diagram is less than node/edge count in the source.

If lint fails, the artifact is blocked. Do not hand-patch the diagram to pass lint without also patching the ledger.

## Node vocabulary

| Node type | Meaning | `data-source-id` required |
|---|---|---|
| `screen` | A concrete UI surface the user sees | yes, screen ID |
| `decision` | A branch point (user choice or system condition) | yes, decision/state ID |
| `action` | A user-triggered event without its own screen (e.g. a tap that fires an API call) | yes, action ID |
| `system-event` | An automatic transition not triggered by the user | yes, event ID |
| `entry` | Flow start point | yes, entry ID |
| `exit` | Flow end point (success) | yes, exit ID |
| `terminal-error` | Flow end point (failure/abandonment) | yes, terminal ID |

Every node must carry `data-source-id`. A node without one is not a product-flow node — it's decoration, and decoration doesn't belong in this grammar. If you need a label or grouping, use the shared metadata/grouping conventions in `diagram-craft.md`, not a synthetic node.

## Edge vocabulary

| Edge type | Meaning |
|---|---|
| `transition` | User action moves the flow forward |
| `conditional` | One of several transitions gated by a decision node |
| `auto-transition` | System-driven, no user input |
| `back-edge` | Returns to an earlier node (back button, retry, re-entry) |

Back-edges and cycles are real and common in product flows (retry loops, edit-and-resubmit, back navigation). Never flatten them into a straight line to make the diagram look cleaner:

- Render back-edges with a distinct visual treatment (dashed line + the shared "cycle" token), routed to avoid crossing the primary forward path where possible.
- Label back-edges with the trigger ("back", "retry", "edit"), not left implicit.
- A cycle is not a bug in the diagram — collapsing a cycle into a single pass-through arrow is a fidelity loss and must be logged in the ledger.

## Derived-view declaration

Every product-flow diagram file must declare, in its metadata block, that it is a derived view:

```yaml
derived-view:
  source: flow.json
  source-ref: <commit-sha-or-version>
  generated: <date>
  lint: passed
  fidelity: partial   # or "full"
```

`fidelity: full` is only valid if the ledger below is empty. If the ledger has any entries, `fidelity` must be `partial` and the diagram must not describe itself as complete anywhere in its text or title.

## Fidelity ledger

Any merge, collapse, or drop must be logged with the affected source IDs and a reason. No silent simplification.

| Action | Affected IDs | Reason |
|---|---|---|
| merge | `screen.confirm-a`, `screen.confirm-b` | Both render the same confirmation copy; merged for space, semantics identical |
| collapse | `decision.retry-loop` | Cycle collapsed to single back-edge to fit density budget; loop count not shown |
| drop | `system-event.analytics-ping` | Non-visible system event, excluded from user-facing flow view |

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

- **Not a generic flowchart.** Every node maps to a real screen/action/event in `flow.json`; there's no room for abstract "process" boxes or pseudocode steps that don't correspond to a source ID.
- **Not a pure state machine.** A state machine enumerates all valid states and transitions exhaustively as an implementation contract. A product flow is user-facing and may legitimately omit internal states that never surface to the user (log them as `drop`, don't fake completeness).
- The distinguishing feature is `data-source-id` traceability plus user-facing framing — nodes are what a person sees or does, not internal system states.

## Tokens, a11y, metadata

Use the shared token/contrast/a11y baseline from `diagram-craft.md`. Product-flow-specific additions:

- Reserve a single consistent color token per node type across all product-flow diagrams in the repo (don't reassign `screen` to a different color per file).
- `terminal-error` nodes must be visually distinguishable from `exit` nodes without relying on color alone (shape or icon token too).
- Every node's accessible label must include its `data-source-id` alongside the human label, so the diagram stays auditable against `flow.json` by screen readers and tooling alike.

## Critique / failure modes

Reject or flag a product-flow diagram if it:

- Declares `fidelity: full` while any node/edge is missing relative to `flow.json`.
- Merges nodes that differ in downstream behavior to save space.
- Drops error/terminal states because they're "edge cases" — abandonment and failure paths are part of the product flow.
- Flattens a back-edge/cycle into a forward-only arrow.
- Ships without running `ui flow lint`, or ships after lint failed with the failure suppressed.
- Uses `source-ref` pointing at a stale or unpinned `flow.json`, making the diagram unverifiable against current truth.
- Mutates or proposes edits to `flow.json` itself instead of treating it as read-only.
