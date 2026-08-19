---
description: Runtime-neutral diagram workflow for ease-design. Use when a request needs a structural, sequential, or hierarchical picture and prose/tables would lose structure a reader needs to trace. Charts of quantities belong to the chart workflow.
argument-hint: "<what to diagram> [--grammar <name>]"
---

# /ui:diagram

Produces exactly one self-contained, offline HTML diagram per invocation, using owned inline SVG — never a generated script, an external renderer, or a browser round-trip.

Read `knowledge/diagram-craft.md` before grammar selection.

## 0. Decide usefulness

Before touching a grammar, ask: does this problem have shape that a diagram reveals and prose hides? Component boundaries and calls, participant/message ordering, or a user's branching path through a product are diagram-shaped. A list of settings, a single linear explanation, or a one-off fact is not. If the request doesn't clearly need a diagram, say so and offer the prose/table alternative instead of drawing anyway.

## 1. Budget context and tokens

Before authoring, size the input: how many nodes/edges/steps will this actually need? Pull only the source material required to draw those elements (files, interfaces, an existing flow spec) — do not ingest a whole codebase to draw a five-box diagram. If the true scope is large enough that a single diagram would become unreadable or blow the token budget, say so and propose splitting into multiple diagrams or scoping down, rather than silently truncating.

## Supported grammars

Nineteen grammars exist. Pick exactly one per invocation; never mix them, and never invent one outside the list. When two feel close, resolve it with the collision-family precedence rules in `knowledge/diagram-craft.md` rather than choosing by feel.

- **architecture** — read `knowledge/diagram-grammars/architecture.md`; components, boundaries, and their relationships.
- **sequence** — read `knowledge/diagram-grammars/sequence.md`; participants and time-ordered messages.
- **product-flow** — read `knowledge/diagram-grammars/product-flow.md`; a derived view of an existing lint-clean `flow.json`.
- **swimlane** — read `knowledge/diagram-grammars/swimlane.md`; ordered steps partitioned by the responsible role.
- **data-flow** — read `knowledge/diagram-grammars/data-flow.md`; steps handing typed payloads to each other.
- **process** — read `knowledge/diagram-grammars/process.md`; steps with role badges and distinguished connector styles.
- **high-level** — read `knowledge/diagram-grammars/high-level.md`; a capability sweep across phases with cross-cutting footer bars.
- **dp-integration** — read `knowledge/diagram-grammars/dp-integration.md`; which sources and consumers attach to a platform.
- **medallion** — read `knowledge/diagram-grammars/medallion.md`; data ascending storage quality tiers.
- **it-state** — read `knowledge/diagram-grammars/it-state.md`; the estate as it stands today, before a change.
- **dp-security-matrix** — read `knowledge/diagram-grammars/dp-security-matrix.md`; roles against components as an access grid.
- **loop** — read `knowledge/diagram-grammars/loop.md`; a closed cycle whose stations feed a hub.
- **er** — read `knowledge/diagram-grammars/er.md`; entities and their cardinality relationships.
- **flowchart** — read `knowledge/diagram-grammars/flowchart.md`; a branching path with decisions and terminating branches.
- **layers** — read `knowledge/diagram-grammars/layers.md`; stacked bands with no cross-band edges.
- **nested** — read `knowledge/diagram-grammars/nested.md`; regions enclosing other regions.
- **org-chart** — read `knowledge/diagram-grammars/org-chart.md`; reporting relationships between people.
- **state** — read `knowledge/diagram-grammars/state.md`; states, events, and the transitions between them.
- **tree** — read `knowledge/diagram-grammars/tree.md`; parent-child decomposition of things.

If the request doesn't cleanly map to one of the nineteen (e.g. it wants a mind map or a freeform whiteboard), **reject unsupported grammar**: name the closest supported grammar, state what forcing the request into it would lose, and ask which (if any) actually fits. A chart of quantities — bars, lines, scatter, radar, Gantt, dated timelines, quadrants, Venn, proportional pyramids — is not declined but routed: it belongs to `knowledge/chart-craft.md`.

## 3. Author the diagram

Produce one HTML file, self-contained and openable offline with no network calls, no `<script>`, and no build step:

- **Owned inline SVG** — hand-authored `<svg>` markup sized and laid out by you, not a copy-pasted export from another tool and not delegated to an auto-layout library. Positions, spacing, and routing are explicit and deliberate.
- **Accessibility** — every shape/edge with meaning gets a `<title>` and/or `aria-label`; use real text (not text-as-path) so it's selectable and screen-reader legible; ensure contrast holds in both light backgrounds and, where feasible, without relying on color alone to convey status.
- **Inspectable `data-*` metadata** — every node and edge carries `data-*` attributes identifying what it is (id, kind, source reference) so the diagram is machine-inspectable without parsing rendered pixels.
- Keep the HTML minimal: inline `<style>` for layout/typography is fine; no external stylesheets, fonts, or CDN links.

## 4. product-flow preflight (only for the product-flow grammar)

Before drawing a product-flow diagram, run this preflight in order:

1. **`ui flow lint`** — validate the flow definition itself (states reachable, transitions consistent, no orphaned steps) before any rendering begins. This checks `flow.json` only; it never opens the diagram artifact.
2. **Source IDs** — every `screen`/`screen-state`/`entry` node and every `transition` edge cites the concrete `flow.json` ID it came from — no invented screens, states, or decisions. `ui diagram lint` (§5) only confirms the `data-source-id` attribute is *present*; it does not read `flow.json` and cannot confirm the value actually resolves. Resolving each `data-source-id` against the real `flow.json` is a manual step you do here, not a lint gate.
3. **Read-only source** — this workflow only *reads* product source (`flow.json`, code, specs, screenshots) to build the diagram; it never edits, scaffolds, or mutates product files as a side effect.
4. **Fidelity ledger** — maintain and surface a short ledger mapping each diagrammed step to its source and noting any place the diagram simplifies, infers, or diverges from that source. Completeness of this ledger is verified manually, alongside the source-ID resolution in step 2 — no automated check owns it. This ledger ships with the diagram (see Disclosure below), not buried in a side note.

Architecture and sequence diagrams skip this step entirely — it applies only to product-flow.

## 5. Lint gates

Run gates in this order, and do not proceed past a failing gate without either fixing the diagram or disclosing why it can't pass:

1. **`ui diagram lint`** — the diagram-specific check (grammar conformance, `data-*` *presence* and shape, valid owned-SVG structure, no forbidden external refs). It proves the artifact is well-formed on its own; for product-flow it does **not** prove any `data-source-id` resolves against `flow.json` — that resolution stays a manual step (§4.2).
2. **`ui gate <file.html>`** — the composed floor judge every shipped HTML artifact runs (layout, a11y, taste, content families plus the autofix dry-run in one verdict). Reuse it; do not fork or reimplement a parallel checker for diagrams.
3. **`ui ds-usage-lint <file.html>`** — proves the artifact's CSS draws on real design-system tokens rather than off-system values. Note its blind spot: it reads CSS declarations only, so a color sitting in an SVG presentation attribute (`fill="#eb6c36"`) is invisible to it. `ui diagram lint`'s `hardcoded-svg-color` check covers that gap — the two gates are complementary and neither substitutes for the other.
4. **`ui autofix <file.html> --write`** — deterministic repairs (viewport, duplicate ids; run BEFORE the gate — its autofix family then confirms a re-run is a no-op). It never rewrites inline `<svg>`, so it cannot fix a diagram's SVG for you.

If a gate can't be satisfied (e.g. a required a11y check needs a runtime this workflow doesn't have), that is a substitution (disclose it per §7) or a stop (report it as a Gate stop per §9) — not something to skip silently.

## 6. Critique against the taste rubric and revise

A diagram is critiqued the same way as any other generation — there is no separate,
diagram-only rubric:

1. The gate already ran taste-lint where applicable (the artifact is generated HTML with
   inline CSS) and fix any findings it reports before scoring.
2. Score every axis that applies from the full **6+1 axis taste rubric** in
   `knowledge/taste-rubric.md` — Layout, Typography, Spacing, Motion, Iconography,
   Depth/Surface, plus the systems axis Consistency — against the same **≥ 7/10 gate**
   used everywhere else. Motion is rarely applicable to a static SVG; mark it
   not-applicable rather than scoring it against a criterion it cannot meet.
3. Apply the grammar's own invariants (product-flow fidelity, architecture reading
   direction, sequence ordering, the routed grammar's density budget — see the routed
   grammar file) as part of the Layout and Consistency scores, not as separate ad hoc axes.

Any axis below 7 gets a targeted revision, not a shipped exception. Don't ship a diagram you'd critique.

## 7. Disclosure

Before presenting the final diagram, state plainly and in the diagram's accompanying description (not hidden in code comments):

- Any **fallback or accessibility substitution** made (e.g. a pattern used instead of color alone, a simplified label because full text didn't fit).
- Whether specific elements are **static or rendered** — since this workflow never uses a live renderer, every visual is static SVG; say so explicitly rather than letting a reader assume interactivity that doesn't exist.
- For product-flow, the fidelity ledger from §4.4.

## 8. Hard constraints — never do these

- No generated scripts and no `<script>` tags in the output HTML.
- No export pipeline and no universal diagram DSL (Mermaid, PlantUML, GraphViz DOT, etc.) as *output* — SVG is authored directly. Reading a drawio/Mermaid source as brief material is permitted via extract-then-redraw; its geometry is never emitted.
- No auto-layout algorithm — positions are chosen deliberately, not computed by a force-directed or constraint solver.
- No browser dependency to produce or validate the output — the HTML must be inspectable and correct by reading the markup itself.
- No twentieth grammar, ever, under any name. A shape that reduces to an existing grammar plus different vocabulary is that grammar with a domain pack, not a new one.

## 9. Outputs and honest stops

A successful run produces exactly one HTML file plus the disclosure text from §7. A run may legitimately end in a stop instead of an artifact:

- **Declined** — the request doesn't fit any supported grammar (§2).
- **Scope stop** — the true input is too large for a readable single diagram within budget (§1).
- **Gate stop** — `ui diagram lint` or the generic a11y/layout gates fail and can't be reasonably fixed; report which gate, why, and what would need to change.
- **Source stop** (product-flow only) — required source IDs aren't available, so the flow can't be drawn without inventing screens.

Every stop states the reason in one or two sentences — no silent failures, no diagram shipped to paper over a gap that should have been disclosed.
