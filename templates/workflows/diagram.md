---
description: Runtime-neutral diagram workflow for ease-design. Use when a request needs a visual architecture, sequence, or product-flow diagram and prose/tables would lose structure a reader needs to trace.
argument-hint: "<what to diagram> [--grammar architecture|sequence|product-flow]"
---

# /ui:diagram

Produces exactly one self-contained, offline HTML diagram per invocation, using owned inline SVG — never a generated script, an external renderer, or a browser round-trip.

Read `knowledge/diagram-craft.md` before grammar selection.

## 0. Decide usefulness

Before touching a grammar, ask: does this problem have shape that a diagram reveals and prose hides? Component boundaries and calls, participant/message ordering, or a user's branching path through a product are diagram-shaped. A list of settings, a single linear explanation, or a one-off fact is not. If the request doesn't clearly need a diagram, say so and offer the prose/table alternative instead of drawing anyway.

## 1. Budget context and tokens

Before authoring, size the input: how many nodes/edges/steps will this actually need? Pull only the source material required to draw those elements (files, interfaces, an existing flow spec) — do not ingest a whole codebase to draw a five-box diagram. If the true scope is large enough that a single diagram would become unreadable or blow the token budget, say so and propose splitting into multiple diagrams or scoping down, rather than silently truncating.

## Supported grammars

Only three grammars exist. Pick exactly one per invocation; never mix or invent a fourth.

- [**architecture**](../../knowledge/diagram-grammars/architecture.md) — components, boundaries, and the relationships/calls between them.
- [**sequence**](../../knowledge/diagram-grammars/sequence.md) — participants and time-ordered messages between them.
- [**product-flow**](../../knowledge/diagram-grammars/product-flow.md) — a user's path through real product screens/states, sourced from actual UI, not invented.

If the request doesn't cleanly map to one of the three (e.g. it wants a Gantt chart, a mind map, a generic flowchart of abstract logic), **reject unsupported grammar**: state plainly that this workflow supports only architecture, sequence, and product-flow, and ask which of the three (if any) actually fits, or suggest the request is better served another way.

## 3. Author the diagram

Produce one HTML file, self-contained and openable offline with no network calls, no `<script>`, and no build step:

- **Owned inline SVG** — hand-authored `<svg>` markup sized and laid out by you, not a copy-pasted export from another tool and not delegated to an auto-layout library. Positions, spacing, and routing are explicit and deliberate.
- **Accessibility** — every shape/edge with meaning gets a `<title>` and/or `aria-label`; use real text (not text-as-path) so it's selectable and screen-reader legible; ensure contrast holds in both light backgrounds and, where feasible, without relying on color alone to convey status.
- **Inspectable `data-*` metadata** — every node and edge carries `data-*` attributes identifying what it is (id, kind, source reference) so the diagram is machine-inspectable without parsing rendered pixels.
- Keep the HTML minimal: inline `<style>` for layout/typography is fine; no external stylesheets, fonts, or CDN links.

## 4. product-flow preflight (only for the product-flow grammar)

Before drawing a product-flow diagram, run this preflight in order:

1. **`ui flow lint`** — validate the flow definition itself (states reachable, transitions consistent, no orphaned steps) before any rendering begins.
2. **Source IDs** — every screen/state node must cite the concrete source it came from (component id, route, screenshot ref, or spec section) — no invented screens.
3. **Read-only source** — this workflow only *reads* product source (code, specs, screenshots) to build the diagram; it never edits, scaffolds, or mutates product files as a side effect.
4. **Fidelity ledger** — maintain and surface a short ledger mapping each diagrammed step to its source and noting any place the diagram simplifies, infers, or diverges from that source. This ledger ships with the diagram (see Disclosure below), not buried in a side note.

Architecture and sequence diagrams skip this step entirely — it applies only to product-flow.

## 5. Lint gates

Run gates in this order, and do not proceed past a failing gate without either fixing the diagram or disclosing why it can't pass:

1. **`ui diagram lint`** — the diagram-specific check (grammar conformance, `data-*` completeness, valid owned-SVG structure, no forbidden external refs).
2. **Existing generic a11y/layout gates** — whatever accessibility and layout checks already apply to shipped HTML in this repo. Reuse them; do not fork or reimplement a parallel a11y checker for diagrams.

If a gate can't be satisfied (e.g. a required a11y check needs a runtime this workflow doesn't have), that is a substitution or a stop — handle it per §7, not by skipping silently.

## 6. Critique taste axes and revise

Before calling the diagram done, critique it against these axes and revise anything that fails:

- **Legibility** — can a reader trace every edge and label at a glance without hunting?
- **Honesty** — does the diagram show only what the source supports, with no invented boxes or smoothed-over gaps?
- **Restraint** — is every node/edge earning its place, or is there decoration that adds noise without adding information?
- **Consistency** — do stroke weight, spacing, and label style stay uniform across the whole diagram rather than drifting node to node?

Revise directly; don't ship a diagram you'd critique.

## 7. Disclosure

Before presenting the final diagram, state plainly and in the diagram's accompanying description (not hidden in code comments):

- Any **fallback or accessibility substitution** made (e.g. a pattern used instead of color alone, a simplified label because full text didn't fit).
- Whether specific elements are **static or rendered** — since this workflow never uses a live renderer, every visual is static SVG; say so explicitly rather than letting a reader assume interactivity that doesn't exist.
- For product-flow, the fidelity ledger from §4.4.

## 8. Hard constraints — never do these

- No generated scripts and no `<script>` tags in the output HTML.
- No import/export pipeline and no universal diagram DSL (Mermaid, PlantUML, GraphViz DOT, etc.) — SVG is authored directly.
- No auto-layout algorithm — positions are chosen deliberately, not computed by a force-directed or constraint solver.
- No browser dependency to produce or validate the output — the HTML must be inspectable and correct by reading the markup itself.
- No fourth grammar, ever, under any name.

## 9. Outputs and honest stops

A successful run produces exactly one HTML file plus the disclosure text from §7. A run may legitimately end in a stop instead of an artifact:

- **Declined** — the request doesn't fit one of the three grammars (§2).
- **Scope stop** — the true input is too large for a readable single diagram within budget (§1).
- **Gate stop** — `ui diagram lint` or the generic a11y/layout gates fail and can't be reasonably fixed; report which gate, why, and what would need to change.
- **Source stop** (product-flow only) — required source IDs aren't available, so the flow can't be drawn without inventing screens.

Every stop states the reason in one or two sentences — no silent failures, no diagram shipped to paper over a gap that should have been disclosed.
