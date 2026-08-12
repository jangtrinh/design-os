# Research: Native Diagram Craft

## Source Manifest

- Repository: `https://github.com/cathrynlavery/diagram-design`
- Resolved commit: `4da4dfb80b1f3d2f11678726b0db58c33c1d7e9d`
- Captured: 2026-08-12; source commit dated 2026-08-11
- Scope inspected: root README/license; `skills/diagram-design/`; command wrappers; extractor/lint/verification source
- Trust boundary: read-only untrusted data; no upstream code executed
- License: MIT, Cathryn Lavery © 2025. No source prose/assets/templates/icons will be copied.

## Re-anchor Drift

- Current `main` is `cfcb690`; new authority is `specs/` plus `knowledge/index.json`, not the dirty caller worktree's historical `plans/` surface.
- `plans/ease-design/brainstorm.md` named by inherited instructions is absent from current HEAD and available history; no locked §6 claim can be verified.
- An archived design-os plan mentioned `ui flow render --html|--mermaid`, but current `src/commands/flow.ts` exposes only `lint`; no renderer contract or implementation exists to preserve.
- No real committed `flow.json` exists on this branch. Product-flow semantics and refusal
  paths are covered statically, but the planned real-data projection proof cannot be claimed
  until a product repository supplies one.

## Source Anatomy

1. Intent router selects whether a diagram is useful and one of 27 grammars.
2. Per-type references hold composition rules and anti-patterns.
3. A separate mutable style guide supplies upstream visual tokens.
4. Python parsers reduce Mermaid/draw.io to structural digests.
5. Host judgment redraws rather than converts source layout.
6. HTML-first inline SVG is checked by static skin/accessibility scripts; browser export is optional.

The valuable transferable pattern is: `semantic input -> bounded grammar -> editorial redraw -> objective artifact gates -> fidelity ledger`.

## Local Integration Map

| Concern | Local owner |
|---|---|
| Selective knowledge routing | `knowledge/index.json` |
| Product-flow truth | `schemas/flow.schema.json`, `knowledge/flow-craft.md`, `ui flow lint` |
| Tokens/taste/accessibility | existing knowledge core and generic commands |
| Runtime discovery | workflow/skill templates + adapter registries |
| Deterministic checks | `src/core/` pure transforms + `src/commands/` IO |
| CLI discoverability | `src/cli.ts`, command signatures, init/guide surfaces |

## Dependency Matrix

| Source component | Local equivalent | Status | Decision |
|---|---|---|---|
| Diagram selection | no diagram-specific router | NEW | Add one workflow + compact shared craft file |
| Type references | no diagram grammars | NEW | Add only product-flow, architecture, sequence |
| Style guide | tokens, soul, personas, taste | CONFLICT | Use local authorities; do not port |
| Mermaid/draw.io parser | none | NEW, deferred | No import in v1 |
| HTML inline-SVG artifact | existing HTML generation conventions | EXISTS | Define diagram-specific contract only |
| Static a11y/skin lint | generic a11y/layout/taste checks, incomplete SVG contract | EXISTS + NEW | Reuse generic owners; add thin diagram-only checks |
| PNG export/browser | optional rendered hands | CONFLICT | Exclude from kernel and v1 |
| 100-example gallery | benchmark/specimen precedent | CONFLICT | Use a tiny golden fixture set |

## Challenge Questions

| Question | Source answer | Local answer | Risk if wrong |
|---|---|---|---|
| Do we need the feature or only its idea? | Full standalone plugin | Native workflow + three grammars | Plugin-sized port creates duplicate product authority |
| Can 80% value ship with less? | 27 types and variants | Three high-leverage grammars | Too-small scope could miss ER demand; usage can justify follow-up |
| Is visual style portable? | One upstream skin | Project tokens and stance | Imported skin breaks DESIGN:OS consistency |
| Should product-flow get a new model? | Import digest acts as transient IR | Existing `flow.json` is truth | New DSL creates divergence and edit ambiguity |
| Should `ui` render diagrams? | Host authors templates; scripts lint/export | Host authors; `ui` lints only | Auto-layout becomes a large geometry engine below quality bar |
| Are imports required now? | Major advertised feature | No demonstrated local demand | Premature parsers expand attack/maintenance surface |
| Can static lint judge connector quality? | Many source-text checks | Only exact decidable failures | Overreach produces false confidence or false positives |

## Decision Matrix

| Decision | Source way | Local way | Recommendation |
|---|---|---|---|
| Packaging | Standalone multi-runtime plugin | Existing adapter-generated workflow/skill | Local |
| Grammar count | 27 | 3 | Local |
| Visual authority | `style-guide.md` | project DS + knowledge | Local |
| Product-flow semantics | imported diagram digest | `flow.json` | Local |
| Rendering | host-authored HTML/SVG | same, token-neutral | Hybrid principle |
| Gate | Python skin/a11y script | zero-dependency TypeScript command | Idiomatic port |
| Export/import | bundled | deferred | Reject v1 |

## Risk Score

**Medium (3 critical assumptions)**: static checks can remain precise; adapter wiring stays coherent; the three-grammar slice is enough to validate demand. Resolve through narrow checks, registry tests, and golden/real-data proof before merge.

## License and Provenance

Abstract methods are independently re-expressed. No source sentences, SVG paths, templates, fonts, palettes, icons, or examples enter shipped artifacts. This research record retains the source URL, commit, and MIT status. If later work copies substantial material, it must add the upstream copyright and permission notice plus any third-party asset notices.

## Rejected Scope

- Remaining diagram types, charts, Mermaid/draw.io import, browser export, URL token scraping.
- Upstream style guide, first-run mutation, Google-font assumptions, icon corpus, variants/gallery.
- Universal diagram JSON schema, deterministic layout engine, Playwright/runtime browser dependency.
- Claims that a source-text linter proves visual quality or accessibility compliance.

## Deterministic Gate Boundaries

- Exact shared attachment-point detection was omitted: without rendered node bounds, equal
  endpoints can be intentional fan-in/fan-out and would create false positives.
- Upstream skin/font residue was not encoded as a permanent name blacklist. The native
  contract already rejects external runtime assets; styling provenance remains a review
  concern unless a project declares a concrete forbidden token.
- Accessible-name checks remain in `src/core/diagram-lint.ts` because the complete core stays
  below the 200-line boundary and no reusable overlap with the generic HTML a11y parser was
  proven.
