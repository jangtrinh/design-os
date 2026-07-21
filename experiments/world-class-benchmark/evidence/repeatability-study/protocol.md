# Repeatability study protocol

## Question

Does full prompt orchestration produce high-quality design consistently across fresh generations,
not only in one refined implementation?

## Matrix

- Cases: D01 Architecture, D02 Nutrition, D03 Planning.
- Workflow: full orchestration only.
- Independent runs: three per case.
- Total outputs: 9.
- Viewports: 390 × 844 and 1440 × 1000.

## Immutable controls

- Same case brief, audience, primary outcome, action, and prohibited claims.
- Same implementation stack and delivery directory shape.
- Same Phosphor, SVGL, responsive, interaction, motion, and accessibility floors.
- Same ten-axis blind curator rubric.
- No run may inspect another run's output.
- No manual repair before the first scored capture.

## Independence

Each run starts in an empty isolated directory and a fresh host-model session. A run receives only
its assigned workflow packet. Run IDs do not encode workflow identity. Repeated screenshots of one
implementation do not count.

## Workflow boundaries

- Raw: original request plus universal delivery floors only.
- Enhanced: raw request plus clarified audience, outcome, hierarchy, and responsive intent.
- Orchestrated: validated prompt plan, region briefs, visual strategy, image-generation prompts,
  proportion decision, negative constraints, and preflight contract.

## Capture and blinding

Capture every untouched first delivery at both viewports with reduced motion. Replace run IDs with
random candidate IDs before curation. Keep the mapping outside the curator evidence root until the
scorecard is sealed.

## Promotion criteria

- Mean score is at least 8.0 across all nine runs.
- At least 8 of 9 runs score at least 7.5.
- No critical accessibility, responsive, overflow, truthfulness, or fake-evidence failure.
- Overall and per-case standard deviation is no greater than 1.0.
- At least two of the three cases show no significant quality decline from hero to conclusion.
- Mobile overflow failure rate is 0%.
