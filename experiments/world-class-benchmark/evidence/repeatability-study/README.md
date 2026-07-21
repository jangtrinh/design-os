# Orchestrated generation examples

Nine untouched first deliveries generated from three product briefs. Each case was executed in
three fresh isolated model sessions using the full DESIGN:OS prompt-plan orchestration contract.

## Preview locally

From the repository root:

```sh
npx serve experiments/world-class-benchmark/evidence/repeatability-study/runs
```

Open the printed local URL and select any `d01`, `d02`, or `d03` orchestrated run.

## Cases

| Case | Runs | Product surface |
| --- | --- | --- |
| D01 | `d01-orchestrated-r1` to `r3` | Site-specific residential architecture |
| D02 | `d02-orchestrated-r1` to `r3` | Meal understanding and nutrition guidance |
| D03 | `d03-orchestrated-r1` to `r3` | Connected planning and decision context |

Every run includes:

- `index.html`: standalone interactive first delivery;
- `preview.webp`: optimized full-page desktop capture;
- `mobile-preview.webp`: optimized full-page 390 px capture.

The original lossless test captures are intentionally excluded from the committed showcase to
keep repository weight reasonable.

## Evidence

- [Protocol](protocol.md)
- [Combined result](result.md)
- [Independent blind report](blind-curation/report.md)
- [Independent scorecard](blind-curation/scorecard.json)

The blind visual audit passed the promotion thresholds. Deterministic preflight did not: two runs
overflow at 390 px and prompt-only enforcement missed other binary rules. The failures remain in
the examples intentionally so they can drive the next repair-gate implementation.
