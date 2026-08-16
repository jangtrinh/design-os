---
name: diagram-craft
description: Use when the user asks for a structural, sequential, or hierarchical diagram (or asks to generate or update one) and needs it delivered as a rendered design artifact rather than prose or a text description. Charts of quantities route to chart-craft instead.
---

# Diagram Craft

Thin router. This file holds no diagram grammar, token defaults, or lint rules of its own — it dispatches to `knowledge/diagram-craft.md` and the single matching grammar file that document indexes. If you find yourself defining diagram syntax or lint criteria here, stop: that belongs in the knowledge file, not this router.

## 1. Read the knowledge file first

Before doing anything else, read `knowledge/diagram-craft.md` in full. It holds the grammar index, the token contract, and the output contract. Do not proceed from memory or an earlier read in this session — re-read it now.

## 2. Classify intent into exactly one grammar

Match the request against the nineteen supported grammars indexed in `knowledge/diagram-craft.md`. Pick exactly one.

- If the request maps cleanly onto one grammar, proceed with that grammar only.
- If two grammars feel close, do not choose by feel — apply the collision-family precedence rules in `knowledge/diagram-craft.md` (step-and-role, platform-overview, hierarchy). They exist precisely because several grammars are deliberate near-neighbours.
- If the request is a **chart of quantities** (bars, lines, scatter, radar, Gantt, dated timelines, quadrants, Venn, proportional pyramids), do not decline it — **route** it to `knowledge/chart-craft.md`, a sibling capability.
- If it fits no supported grammar and is not a chart (e.g. a mind map or freeform whiteboard), **decline**. Name the closest supported grammar and state explicitly what information would be lost by forcing the request into it. Do not silently substitute a grammar the user didn't ask for.

## 3. Load only the matched grammar file

Using the index in `knowledge/diagram-craft.md`, load the single grammar file for the chosen grammar. Do not load the other grammar files — each is scoped to its own shape, and the unrelated detail is noise, not useful context. The one exception: when a grammar's Decline section names a neighbour you are actively weighing against, read that neighbour's Selection section only.

## 4. Tokens: required, or an explicitly disclosed fallback

Require the project's design tokens (color, type, spacing) before drawing. If the project has none, do not invent values silently — state in the output notes that you are falling back to the neutral token set disclosed in `knowledge/diagram-craft.md`, and name it as a fallback rather than presenting it as the project's own system.

## 5. Output contract

Every diagram is a single self-contained HTML file with inline SVG: no external stylesheets, fonts, scripts, or CDN references. Everything the file needs to render must live inside that one file.

## 6. Lint

Run **ui diagram lint** against the output before returning it. If it fails, fix and re-lint — never hand back a diagram that fails lint with a caveat attached instead of a fix.

Then run **ui a11y-lint** and **ui ds-usage-lint**. The two colour gates are complementary and neither substitutes for the other: `ds-usage-lint` reads CSS declarations, while `ui diagram lint`'s `hardcoded-svg-color` check covers colours sitting in SVG presentation attributes, which `ds-usage-lint` cannot see.

### product-flow only

Product-flow diagrams additionally require:

- **ui flow lint** — validates step sequencing, dead ends, and reachability.
- A **fidelity ledger** — an explicit list mapping each diagram element back to its source (spec section, token, or stated assumption), plus any simplification made and the reason for it.

## 7. Critique

Do not reimplement critique logic here. Run the diagram through the existing a11y skill, the existing layout skill, and the existing taste-critique skill exactly as each is already defined elsewhere. Route any violation they report back into another lint/fix pass before returning the diagram.

## 8. Deterministic vs. judgment boundary

State plainly in the output which checks are pass/fail and which are judgment calls:

- **Deterministic (binary)**: ui diagram lint, ui flow lint, contrast-ratio thresholds, token presence, self-containment (no external references), fidelity-ledger completeness.
- **Model judgment**: grammar selection when the request is ambiguous, visual hierarchy and taste critique, and whether a given simplification is faithful enough to note versus block on.

Never present a judgment call as though it were a binary lint result, and never skip a binary check because a judgment call happened to pass.
