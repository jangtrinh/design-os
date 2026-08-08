# Fable 5 Architecture Gate — Canvas UI Adoption

## Role

Set architecture and direction only. Do not write the routine implementation plan or code.

## Decision requested

Determine whether DESIGN:OS should adopt all 25 current Canvas UI effects as a governed
external T6 WebGL recipe catalog, while keeping Canvas UI source outside the DESIGN:OS
distribution.

## Read first

1. `docs/research/canvas-ui/README.md`
2. `docs/research/canvas-ui/integration-brief.md`
3. `docs/research/canvas-ui/fable-thinking-review.md`
4. `docs/research/canvas-ui/architecture-review.md`
5. `knowledge/motion-craft.md`
6. `.project-agent.md`

## Proposed shape to audit

- Preserve all 25 effects in a revisioned source ledger plus one selective `knowledge/`
  reference.
- Treat them as effect wrappers/recipes, not additions to the semantic component catalog.
- Route to them only after the existing motion ladder justifies T6.
- Mirror the existing GSAP routing shape with a specialized Canvas UI motion skill so
  ordinary generation does not load the effect catalog.
- Require narrative intent, static/reduced-motion/browser fallback, performance evidence,
  visual verification, cleanup, and provenance for every use.
- Have the host implementation hand install from Canvas UI's upstream shadcn registry
  into the destination application.
- Keep the deterministic `ui` binary offline; do not vendor, port, bundle, or redistribute
  Canvas UI implementation source.
- Preserve the MIT + Commons Clause boundary and re-check the upstream revision at use time.
- Treat html-in-canvas as experimental progressive enhancement. Design the complete
  static baseline before selecting the effect.

## Constraints

- DESIGN:OS has two sources of truth: runtime-neutral `knowledge/` and deterministic `ui`.
- Do not duplicate knowledge into code.
- WebGL remains T6 and must not become a default styling shortcut.
- Existing motion, tenant, accessibility, and qualification floors remain binding.
- Source redistribution is outside the proposed scope because Canvas UI prohibits
  redistributing the components themselves, including bundles and ports.

## Questions for the verdict

1. Is the external-effect catalog the right architectural boundary?
2. Should installation prefer shadcn MCP or direct upstream CLI, with the other as fallback?
3. Should Figma receive static approximation guidance, or should this catalog remain web-only?
4. What benchmark surface and failure threshold must gate release?
5. Does the proposed upstream-install handoff need legal review before Opus planning or
   before Sonnet implementation?

## Required output

Return only:

```text
Verdict: approve | revise | reject
Direction:
- <binding architectural decision>
Boundaries:
- <must / must-not rules>
Required proof:
- <benchmark and evidence gate>
Open decisions:
- <owner decisions only>
```

If approved, the next stage is Opus 4.8 authoring the specification and execution plan,
followed by Codex 5.6 sol review. Do not declare the work complete.
