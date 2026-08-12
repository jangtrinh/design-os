# Orchestrated-only repeatability result

## Decision

**Do not promote as an unguarded production default yet.**

The visual system is repeatable. The instruction-compliance system is not.

## Visual result

Independent blind review of 9 untouched outputs:

- Overall mean: **8.96 / 10**
- Population standard deviation: **0.25**
- Runs scoring at least 7.5: **9 / 9**
- Cases without significant hero-to-conclusion decline: **3 / 3**
- Screenshot-visible critical failures: **0**

This passes every visual quality and stability threshold in the protocol.

## Deterministic preflight result

Source and runtime checks found:

- Banned em/en-dash characters: **9 / 9 runs**
- Mobile horizontal overflow at 390 px: **2 / 9 runs**
  - `d02-orchestrated-r2`: 456 px document width
  - `d03-orchestrated-r1`: 415 px document width
- Specifically banned serif: **1 / 9 runs**
- Hand-authored inline SVG: **2 / 9 runs**
- Unicode arrow glyphs instead of icon-library arrows: **0 / 9 runs**

The overflow failures violate a promotion-blocking criterion. The repeated typography and source
violations show that prompt instructions alone are not a reliable enforcement mechanism.

## Interpretation

Prompt orchestration reliably produces strong hierarchy, topic-specific evidence, responsive
reflow, live product demonstrations, and sustained quality below the hero. It also converges too
strongly within each category and misses binary rules that are easy to validate mechanically.

The next product step is a deterministic post-generation gate:

1. Scan source for forbidden characters, fonts, inline SVG, and icon substitutions.
2. Render required viewports and compare `scrollWidth` with `clientWidth`.
3. Return precise failure codes and targeted repair instructions.
4. Re-run the gate after one repair pass.
5. Promote orchestration only when both blind visual thresholds and deterministic gates pass.

## Scope

This study intentionally excluded raw and prompt-enhancement workflows. It measures absolute
quality and repeatability of orchestration, not comparative lift.
