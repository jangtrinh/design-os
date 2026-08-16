---
id: diagram-craft
description: "The shared diagram contract — grammar routing across nineteen grammars, the admission bar, collision-family precedence, density, token inheritance, accessible inline SVG, output shape, and critique."
when: [diagram, diagram-craft, svg-diagram, diagram-lint, diagram-grammar-routing, extract-then-redraw]
---

# Diagram Craft — the shared contract behind the diagram grammars

## Purpose

Decide whether a diagram is the right answer, hold the rules every diagram grammar shares,
and route to exactly one of the bounded grammars this capability supports. A grammar
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
chart of quantities (that is `chart-craft.md`, a sibling capability); the request wants an
editable canvas file or a rendered PNG/browser export — neither ships here (see "What this is
NOT"). A drawio or Mermaid source *can* be read as brief material, but it is redrawn natively
rather than converted — see extract-then-redraw below.

## Selecting a grammar

Nineteen grammars exist. Route on what the content actually is, not on the word the requester
used:

| Signal in the request | Grammar |
|---|---|
| Components, services, zones, "what talks to what" as a structural map | `diagram-grammars/architecture.md` |
| Time-ordered exchange between named participants — calls, messages, replies | `diagram-grammars/sequence.md` |
| An existing `flow.json` being turned into a readable picture | `diagram-grammars/product-flow.md` |
| Ordered steps partitioned by the role responsible | `diagram-grammars/swimlane.md` |
| Steps that hand typed payloads to each other | `diagram-grammars/data-flow.md` |
| Steps carrying role badges and distinguished connector styles | `diagram-grammars/process.md` |
| Capability sweep across phases, with cross-cutting footer bars | `diagram-grammars/high-level.md` |
| Which sources and consumers attach to a platform | `diagram-grammars/dp-integration.md` |
| Data ascending storage quality tiers | `diagram-grammars/medallion.md` |
| The estate as it stands today, before a change | `diagram-grammars/it-state.md` |
| Roles against components as an access grid | `diagram-grammars/dp-security-matrix.md` |
| A closed cycle whose stations feed a hub | `diagram-grammars/loop.md` |
| Entities and their cardinality relationships | `diagram-grammars/er.md` |
| A branching path with decisions and terminating branches | `diagram-grammars/flowchart.md` |
| Stacked bands with no cross-band edges | `diagram-grammars/layers.md` |
| Regions enclosing other regions | `diagram-grammars/nested.md` |
| Reporting relationships between people | `diagram-grammars/org-chart.md` |
| States, events, and transitions between them | `diagram-grammars/state.md` |
| Parent-child decomposition of things | `diagram-grammars/tree.md` |

State the match in one sentence before authoring ("this is a structural map of services, so
architecture"). When the request sits between two grammars, resolve it with the precedence
rules below rather than picking by feel — and say what the choice costs.

### Precedence within collision families

Several grammars are deliberately close neighbours. Ambiguity between them is resolved here,
once, rather than re-argued per file.

**Step-and-role family** — `swimlane` < `data-flow` < `process`. Most specific wins; escalate
only when the brief demands the extra fields:

- Roles and ordered steps, nothing more → **swimlane**
- Steps carry typed input/output payloads → **data-flow**
- Steps carry role badges *and* distinguished connector styles → **process**

**Platform-overview family** — one discriminating question each:

- Subject is the capability sweep across phases → **high-level**
- Subject is which sources and consumers attach → **dp-integration**
- Subject is data ascending storage quality tiers → **medallion**
- Subject is the estate as it stands today, before change → **it-state**

**Hierarchy family**:

- Edges are reporting relationships between people → **org-chart**
- Edges are parent-child decomposition of things → **tree**
- Regions enclose other regions → **nested**
- Bands stack with no cross-band edges → **layers**

### The admission bar

A grammar is admitted to this capability when it has **a distinct geometry recipe** *and* **a
decline path no sibling covers**. A shape that reduces to an existing grammar plus different
vocabulary is not a grammar; it is that grammar with a domain pack.

**Decline, do not invent.** A request outside all nineteen gets a decline: name the closest
supported grammar and state plainly what information that substitution would lose. Never
stretch a grammar's invariants to cover a shape it was not built for — a sequence diagram bent
into an ER diagram violates its own participant-order contract the moment it tries.

**Charts are a different capability.** A chart of quantities — bars, lines, scatter, radar,
Gantt, dated timelines, quadrants, Venn, proportional pyramids — is not a diagram and is not
declined into one. Route it to `chart-craft.md`, which owns standalone chart artifacts.
A dated run of events is `chart-grammars/timeline.md`, not `sequence` (which requires named
participants exchanging messages) and not `chart-grammars/gantt.md` (which requires durations,
not instants).

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
- No exports, DSL, browser renderer, or conversion step. The host authors the HTML directly;
  nothing in this capability *produces* Mermaid, draw.io, or any other diagram interchange
  format. Reading one as brief material is permitted — see extract-then-redraw below.
- The document declares, in inspectable `data-*` metadata: the **grammar** used, the **reading order** in prose,
  the **focal element**'s ID, the **source kind** (`flow-json` or `brief`) and, when
  applicable, a **source reference**, plus whether a **token fallback** was used.
- Run `ui diagram lint <file.html>` before treating the artifact as done; use
  `ui diagram --help` for the current deterministic check contract. A clean lint is
  necessary, never sufficient.

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

Not a diagram editor, not a browser renderer, not a universal diagram DSL, not a layout engine
that computes geometry — the host places every element by editorial judgment and
`ui diagram lint` only checks the facts a static reader can prove. Nineteen grammars, held to
the admission bar above; a twentieth is a decline, not a stretch. Charts belong to
`chart-craft.md`.

**Import is extract-then-redraw, never conversion.** The drawio and Mermaid extractors read a
source file and emit *structured intermediate data* — a node/edge digest plus hub, cycle, and
density analysis — which the host then uses as brief material to author a native grammar
diagram:

```
python -m design_os.diagram.drawio_extract  <file.drawio|.xml|.png|.svg> [--json]
python -m design_os.diagram.mermaid_extract <file.mmd|.mermaid|.md>      [--json]
```

Both are read-only, deterministic, standard-library only, and make no network calls. They
refuse DTD/ENTITY declarations, cap input at 32 MiB and inflation at 64 MiB, and reject
unsupported Mermaid grammars outright rather than parsing them partially.

Imported geometry is never emitted into the artifact — the digest informs an editorial
redraw, and the host still places every element. A redraw carries a fidelity ledger naming
what it simplified or dropped.

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
