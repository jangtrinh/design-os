# Prompt orchestration development results

## Scope

D01 architecture, D02 nutrition, and D03 planning were compiled into prompt-plan v1 contracts.
Each preserves three structural directions, complete major-region production briefs, and paired
content-led/golden proportion candidates under the same content and visual DNA.

## Deterministic result

Run:

```sh
for file in evidence/prompt-plans/*.prompt-plan.json; do
  ui prompt-plan validate "$file" --json
  ui prompt-plan preflight "$file" --json
done
```

Expected: all plans return `ready: true`, zero hard errors, and a builder packet below 6,000
tokens.

## What this proves

- The orchestration contract represents all three development cases.
- Landing and product-app surfaces share the artifact without sharing inappropriate layout rules.
- Every later-page region receives the same required production-brief depth as the hero.
- Golden ratio stays isolated to a justified candidate and releases under content/responsive
  pressure.
- The deterministic binary catches malformed planning artifacts before generation.

## What this does not prove

The D01 rendered content-led, golden, selected, and art-directed variants now exist and have passed
responsive browser QA. Their current scorecard is maker evaluation, not an independent blind win.
D02 and D03 still require the same rendered extension. All three cases require randomized
independent curation before comparative claims become promotion evidence.

Default rollout is blocked until at least ten cases across three categories meet the gate in
`plans/specs/design-prompt-orchestrator/technical-plan.md`.
