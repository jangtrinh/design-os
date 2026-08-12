---
id: diagram-craft
description: "The shared diagram contract — grammar routing, selection/deletion, density, token inheritance, accessible inline SVG, output shape, and critique."
when: [diagram, diagram-craft, svg-diagram, architecture-diagram, sequence-diagram, product-flow-diagram, diagram-lint]
---

# Diagram Craft — the shared contract behind three grammars

## Purpose

Decide whether a diagram is the right answer, hold the rules every diagram grammar shares,
and route to exactly one of the three bounded grammars this capability supports. A grammar
file never repeats what belongs here; this file never repeats what a grammar owns.

## Mental Model

A diagram is an **editorial redraw**, not a mechanical export. The host reads the source —
a brief, a component map, an exchange, a `flow.json` — and decides what a reader needs to see
first, second, third, then builds one artifact that earns that reading order. `ui diagram lint`
only checks the small set of facts a static reader can prove without rendering (contract
integrity, not composition quality); `taste-rubric.md` and `accessibility.md` own everything
about whether the result is actually good and actually usable. Treat a clean lint as "the
contract holds," never as "the diagram is right."

## When to Use / When NOT

**Use** this file, and the workflow it backs, whenever a request is best served by a picture
of structure, flow, or exchange rather than prose — a system's components, a screen's
navigation, an API call sequence.

**Do NOT** reach for a diagram when: the request has no spatial or sequential structure to
show (a diagram of nothing but bullet points is a list wearing a costume); the content is a
chart of quantities (`dataviz` skill owns that, not this one); the request wants an editable
canvas file, an imported/converted diagram, or a rendered PNG/browser export — v1 ships none
of those (see "What this is NOT").

## Selecting a grammar

Exactly **three** grammars exist. Route on what the content actually is, not on the word the
requester used:

| Signal in the request | Grammar |
|---|---|
| Components, services, zones, "what talks to what" as a structural map | `diagram-grammars/architecture.md` |
| Time-ordered exchange between named participants — calls, messages, replies | `diagram-grammars/sequence.md` |
| An existing `flow.json` being turned into a readable picture | `diagram-grammars/product-flow.md` |

State the match in one sentence before authoring ("this is a structural map of services, so
architecture"). When the request sits between two grammars, pick the one that loses less —
and say what the choice costs.

**Decline, do not invent.** A request outside all three (entity-relationship, Gantt, mind map,
flowchart-as-generic-DSL) gets a decline: name the closest of the three supported grammars,
and state plainly what information that substitution would lose. Never stretch a grammar's
invariants to cover a shape it was not built for — a sequence diagram bent into an ER diagram
violates its own participant-order contract the moment it tries.

## Deciding whether a diagram is useful at all

Before selecting a grammar, decide the diagram is warranted:

- The relationship is genuinely clearer spatially than in a short paragraph or list.
- The source has enough structure to support a reading order (a focal element, a direction).
- A `flow.json` request has already cleared `ui flow lint` — see `flow-craft.md` and
  `diagram-grammars/product-flow.md`; an unlinted flow is not diagram-ready.

If none of these hold, say so and offer the prose or list alternative instead of forcing a
picture where one adds no clarity.

## Density and scope

A diagram earns its reading order by staying inside one readable view. When the source is too
large for that — too many components, too many participants, too many screens — the correct
move is a **scope or split decision**, never a denser artifact that trades legibility for
completeness:

- Pick the sub-scope that answers the actual question being asked, and say what was left out.
- Offer a split into more than one artifact (e.g., one architecture diagram per zone) rather
  than shrinking every element to fit one canvas.
- Never silently drop an element to make room — a dropped element is either out of scope
  (declared) or a fidelity-ledger drop (product-flow only, see that grammar file).

## Project-token inheritance

Diagrams are project artifacts, not a separate visual system:

1. Read the project's design tokens and stance the same way any other generation would
   (`token-taxonomy.md`, `design/soul.md` when present). Resolve colors, type, spacing, and
   radii to the project's tokens — never introduce a new hardcoded palette for "diagram mode."
2. **No project tokens present** — use a documented neutral fallback (system-default
   sans-serif stack, a small achromatic + one-accent palette, an 8px spacing base) and
   **disclose the fallback explicitly** in the artifact's declared metadata. A silent fallback
   is indistinguishable from a broken token read; always say which path was taken.
3. **Accessibility overrides tokens, never silently.** When a token pair fails contrast for
   diagram text/strokes, substitute the minimum change that clears it and report the
   substitution — the project's stylistic choice loses to a reader's ability to see the
   diagram, but the loss must be visible, not swallowed.

## Accessible inline SVG (every grammar's artifact)

Every diagram grammar produces exactly one owned inline SVG per artifact, and every one of
them carries the same accessibility floor:

- Root `<svg>` carries `role="img"` and an `aria-labelledby` that resolves to real IDs.
- The first owned children are a non-empty `<title>` and `<desc>`, both with artifact-unique
  IDs — the title names what the diagram is, the description carries the reading order and
  the focal element in prose a screen reader can speak.
- Every node and connector gets a unique, stable ID; nothing textual is baked into an
  unlabeled `<path>` a reader can't reference.
- This is Tier 1 static accessibility only — see `accessibility.md`. A clean `ui a11y-lint`
  and clean SVG-contract check are not a conformance claim; rendered contrast and
  screen-reader behavior still need Tier 2 or a human. Never claim a diagram is
  "accessible" — say what was checked.

## Output contract

One self-contained HTML document per diagram, holding one owned inline SVG and nothing that
reaches outside itself:

- No `<script>`, no external stylesheet/font/image URL, no view-time network dependency — the
  file opens offline and renders identically.
- No imports, exports, DSL, browser renderer, or conversion step. The host authors the HTML
  directly; nothing in this capability parses or produces Mermaid, draw.io, or any other
  diagram interchange format.
- The document declares, in inspectable metadata (inert `data-*` attributes or an inert JSON
  block — never an executable script): the **grammar** used, the **reading order** in prose,
  the **focal element**'s ID, the **source kind** (`flow-json` or `brief`) and, when
  applicable, a **source reference**, plus whether a **token fallback** was used.
- Run `ui diagram lint <file.html>` before treating the artifact as done — it is the
  deterministic floor for the facts above (see `../specs/029-diagram-craft/contracts/diagram-lint-cli.md`
  for the exact check list and envelope). A clean lint is necessary, never sufficient.

## Critique

After lint passes, critique the artifact the same way any other generation is critiqued:

1. Score every applicable axis in `taste-rubric.md` — Layout (does the reading order actually
   read?), Typography, Spacing, Iconography, Depth/Surface, and Consistency when the project
   has an established system. Motion is rarely applicable to a static diagram; mark it
   not-applicable rather than scoring it against a criterion it cannot meet.
2. Apply the grammar-specific invariants from the routed grammar file (product-flow fidelity,
   architecture reading direction, sequence ordering) as part of Layout and Consistency, not as
   a separate score.
3. Anything below the 7/10 gate in `taste-rubric.md` gets a targeted revision, not a shipped
   exception.

## What this is NOT

Not a diagram editor, not an import/export pipeline for Mermaid or draw.io, not a browser
renderer, not a universal diagram DSL, not a layout engine that computes geometry — the host
places every element by editorial judgment and `ui diagram lint` only checks the facts a
static reader can prove. Three grammars, full stop; a fourth is a decline, not a stretch.

## Failure Modes

- **Grammar stretched to fit.** Forcing an ER or Gantt shape into sequence or architecture
  because "it's close enough" produces an artifact that violates its own grammar's invariants
  — the reader trusts the grammar's promise (e.g. sequence = strict time order) and gets
  something else.
- **Silent token fallback.** Using the neutral fallback palette without declaring it in the
  artifact metadata — a reader can't tell "no tokens existed" from "tokens were ignored."
- **Density solved by shrinking, not scoping.** Cramming every node onto one canvas until text
  is illegible, instead of declaring a sub-scope or splitting into multiple artifacts.
- **Lint mistaken for a quality bar.** Treating a clean `ui diagram lint` as proof the diagram
  is well-composed or accessible — it only proves the small set of statically decidable
  contract facts; taste and Tier 2 accessibility are unchecked by it.
- **Metadata as an afterthought.** Authoring the SVG first and bolting on grammar/reading-order
  declarations after — the declarations then describe what was easy to state, not what the
  artifact actually does.
