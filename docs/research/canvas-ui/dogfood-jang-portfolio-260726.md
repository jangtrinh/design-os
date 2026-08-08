# Canvas UI dogfood — Jang portfolio

Status: partial — implementation complete; Opus review fixes and Fable final gate still pending  
Source: Canvas UI Grid installed in the destination application  
Destination: `/Users/jang/Desktop/Jang/jang-personal-site`  
Decision: adapt  
Confidence: high for implementation findings; medium for final quality until the corrected gate and Fable audit pass

## Decision contract

```yaml
mode: repo
goal: evaluate how well DESIGN:OS governed a real Canvas UI adoption and extract reusable system improvements
source: Canvas UI Grid plus the pinned Canvas UI research ledger
destination: ease-design knowledge, workflows, and deterministic review gates
editable_scope: [docs/research/canvas-ui/dogfood-jang-portfolio-260726.md]
non_goals: [vendoring Canvas UI source, changing the current Spec 028 implementation, publishing the portfolio]
stop_conditions: [insufficient evidence, conflict with the active portfolio fix worker, license-boundary violation]
```

## Executive finding

Canvas UI was useful when treated as **one governed expressive effect plus a source of lifecycle principles**, not as the page's design system. The portfolio retained ordinary semantic HTML, a complete static page, native project evidence, and a Jang-specific visual language. The installed Grid became a hero enhancement that pauses off-screen, respects reduced motion, stops during Measure Mode, and releases its observers, animation frame, GPU textures, framebuffers, shaders, program, and buffer during teardown — observed in the destination implementation at `components/canvasui/Grid.tsx:669-819`.

The session also exposed the missing half of the adoption contract: **mechanical presence is not experiential proof**. The first implementation had paths in the DOM but visually indistinguishable blueprint fragments, and its DESIGN:OS gate reported false zeroes because the wrapper read the wrong JSON level. Opus independently found both. Canvas UI adoption therefore performed well as art-direction integration, but the original validation loop was not trustworthy.

Provisional score:

| Dimension | Score | Evidence |
|---|---:|---|
| Narrative fit | 9/10 | Grid reinforces a systems/instrument thesis and stays hero-only. |
| Native adaptation | 9/10 | Project cards, Builder Receipt, and Evidence Registry use destination content/tokens rather than copied Canvas UI styling. |
| Lifecycle/performance | 8/10 | Reduced motion, off-screen pause, Measure Mode stop, and teardown are present; no long-run GPU profile yet. |
| Accessibility/fallback | 8/10 | Static DOM remains complete; hydration and focus regressions were found and routed to fixes. |
| Visual verification | 6/10 | Breakpoint checks were strong, but DOM-path presence was initially mistaken for perceptibility. |
| Gate integrity | 5/10 | The first gate was blind; independent review caught the parser defect. |
| Overall adoption | **8/10** | Good product result, incomplete proof discipline until the corrected gate passes. |

## What worked

### P0 — Keep Canvas UI external and selective

The existing DESIGN:OS decision remains correct: Canvas UI is a T6 external-effect vocabulary, not a semantic component catalog. The dogfood site used one Grid instance in the hero; the rest of the experience stayed ordinary HTML/CSS/SVG. This matches the existing one-effect cap and Tenant Law in `knowledge/canvas-effect-direction.md:60-70`.

### P0 — Static-first made the experimental feature safe

The installed component uses `useSyncExternalStore` with a server snapshot of `false`, so unsupported/server rendering keeps the ordinary content path. The canvas is enhancement, not content ownership. This validates the existing T6 floor requiring a complete static/unsupported/reduced-motion page in `knowledge/canvas-effect-direction.md:33-44`.

### P0 — Lifecycle patterns generalized well

The strongest reusable Canvas UI contribution was not a shader. It was the lifecycle discipline:

- reduced-motion is read before the animation loop decides to continue;
- IntersectionObserver pauses off-screen work;
- Measure Mode disarms the effect while inspection is active;
- destroy removes every observer/listener and deletes GPU resources.

The session successfully abstracted part of that discipline into a small entrance budget for non-canvas motion at `components/motion/entrance-budget.ts:1-18`. This is concept reimplementation, not source redistribution.

### P1 — Adapt visual grammar, not trade dress

The project-card reference was translated into pale paper, restrained isometric evidence, one signal colour, and an editorial claim. Product-specific diagrams came from verified case copy. The GitFut reference similarly became a Builder Receipt with first-order metrics rather than a FUT card or its synthetic score. This is the right pattern for DESIGN:OS: extract composition rules, reject brand assets and unsupported claims.

## What failed or required rework

### P0 — A green wrapper can invalidate every downstream conclusion

The original portfolio gate read `errorCount` at the envelope root while the CLI returned counts under `data`. Missing values were coerced to zero, so every route appeared clean. The active fix changes the parser to fail closed and read the real envelope at `scripts/gate.mjs:58-86`, with route failure propagation at `scripts/gate.mjs:141-164`.

Lesson: a deterministic tool is not enough. Every orchestration wrapper needs an adversarial fixture proving that a known-bad input produces a non-zero failure.

### P0 — DOM presence is not visual evidence

The initial blueprint tests proved that each project fragment existed and was deterministic, but floor and fragment paths shared the same stroke. All three cards looked like the same grid. A valid adoption gate needs both:

1. structural proof — expected paths/data exist; and
2. perceptual proof — the intended distinction is visible in rendered output.

### P1 — User review remains part of the system

Three important refinements came from direct visual feedback rather than a linter: keeping the exact Homepage Wordmark, removing numbered receipts, and restructuring the raw sources dump into an Evidence Registry. DESIGN:OS should preserve a named human-feedback checkpoint after the first rendered artifact; deterministic gates cannot decide whether a citation device is annoying or a source registry feels like debug output.

### P1 — Framework defaults can poison token audits

An unused Tailwind preflight introduced raw hexadecimal values into built CSS even though authored CSS was token-clean. Adoption review must inspect shipped output and distinguish authored violations from dependency output. When a framework layer is unused, remove it rather than teaching the gate to ignore it.

## Recommended DESIGN:OS contributions

| Pattern | Evidence | Rank | Destination mapping | Adaptation | Risk | Verification |
|---|---|---:|---|---|---|---|
| Fail-closed CLI envelope parser contract | false-zero portfolio gate | P0 | shared helper for workflow/gate authors; documented JSON envelope schema | parse `data`, reject malformed/missing counts, never `undefined ?? 0` | wrapper drift | known-bad fixture must return non-zero; malformed fixture must fail |
| External-effect qualification record | Grid dogfood | P0 | Canvas effect workflow output | require intent, effect slug/revision, static state, reduced state, unsupported state, off-screen state, cleanup evidence | checklist theatre | artifact paths plus commands/screenshots for every state |
| Structural + perceptual verification pair | invisible project blueprints | P0 | review workflow and Canvas effect skill | DOM/data assertion plus rendered discriminability check | subjective thresholds | named screenshots at 390/768/1440 and reviewer verdict |
| One-animation arbitration | entrance-budget abstraction | P1 | motion-craft / generated-app guidance | one effect per viewport band, reduced-motion denial, deterministic priority | global state across navigation | coexistence fixture with two candidates |
| Output-origin classification | Tailwind preflight findings | P1 | taste-lint report schema/guidance | mark finding origin as authored, generated, framework, or external without suppressing it | misclassification | fixture containing authored and framework CSS |
| Flex overflow heuristic | repeated `min-width:auto` failures | P1 | `ui validate-layout` | warn when an overflow container is inside an unconstrained flex/grid child | false positives | positive and negative layout fixtures |
| Immediate focus invariant | animated card focus | P1 | taste-lint + motion guidance | focus-visible outline/affordance must not be transitioned | hover/focus selector coupling | CSS fixture with animated focus and instant-focus control |
| Evidence Registry pattern | user rejection of raw source dump | P1 | design-system knowledge pattern | grouped provenance with label/value/source/period; no ordinal clutter | overbuilding small source sets | compact and large-source fixtures |
| Clip-path seam check | receipt notch manual gate | P2 | future visual gate research | raster check at multiple DPRs | renderer variance | compare known-clean and known-seamed fixtures |
| Long-run GPU evidence | Grid lifecycle only statically verified | P2 | benchmark protocol | memory/frame sampling through mount, off-screen, route change | noisy metric | repeat samples with guard thresholds |

## Smallest update sequence

1. **P0:** add a shared fail-closed envelope-parsing contract and known-bad fixture guidance to gate-authoring workflows. The portfolio bug proves this is not optional.
2. **P0:** extend the Canvas effect qualification output with explicit structural and perceptual evidence fields. Current T6 already requires screenshots and teardown; make the expected evidence shape concrete.
3. **P1:** add the focus-animation and flex-overflow fixtures to the applicable linters instead of relying on project-local CSS review.
4. **P1:** document the Evidence Registry and one-animation arbitration as reusable patterns, not mandatory components.
5. **P2:** research raster seam and long-run GPU gates separately; do not block Spec 028 on immature metrics.

## Contribution boundaries

- Keep Canvas UI source in destination applications. Do not copy `Grid.tsx` or other implementation source into DESIGN:OS packages.
- Contribute contracts, vocabulary, anti-use rules, workflow prompts, fixtures, and deterministic checks.
- Do not generalize the Jang visual style into a universal component library. The transferable parts are evidence structure, lifecycle, arbitration, and validation.
- Do not claim the dogfood run fully passed until Sonnet fixes are re-reviewed and Fable 5 closes the final gate.

## Unresolved questions

1. Should the fail-closed envelope parser live in a generated workflow template, a reusable CLI helper, or both?
2. What rendered discriminability standard can be mechanical without replacing design judgment with a brittle pixel threshold?
3. Should Evidence Registry graduate into shared knowledge now, or wait for a second product to validate the pattern?
4. What minimum browser evidence is required before claiming off-screen disarm and GPU cleanup at page level rather than source level?

