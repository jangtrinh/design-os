# Native mobile arm proof protocol

## Purpose

Prove bounded behavior of the exact `native-ios` and `native-ipados` arms. Evidence tiers are independent.
A green lower tier never implies a higher tier, and this pilot never changes official assurance.

## Separation of duties

| Role | Owns | Must not do |
|---|---|---|
| Controller | Briefs, manifest, harness, evidence reconciliation | Edit generated Swift and still call Tier 2 a pass |
| Generator | One held-out app directory and same-run self-repair | Read rubric, expected screenshots, sibling output, or reviewer feedback |
| Verifier | Clean rebuild, tests, launch, hashes | Trust generator self-report without disk evidence |
| Curator/accessibility witness | Binary visual and accessibility disposition | Modify the app being judged |
| Owner | Separate final verdict per exact arm artifact | Let silence or one arm's verdict accept the sibling |

## Evidence tiers

1. Deterministic routing and admission.
2. Generated SwiftUI build, test, install, launch, and critical task.
3. Simulator visual, responsive, state, and structural accessibility review.
4. Physical iPhone and live VoiceOver.
5. Physical iPad, windowing, hardware keyboard, pointer, Full Keyboard Access, and VoiceOver.
6. Owner acceptance of exact artifact hashes.

Every arm/tier cell is `PASS`, `FAIL`, `PENDING`, or `NOT RUN`. A pass needs content-addressed
evidence, an exact environment, and a bounded authorized claim. Hardware identity is mandatory for
Tiers 4–5; explicit owner `ACCEPT` is mandatory for Tier 6.

## Frozen pilot boundary

- Brief bytes are hashed before generators start.
- Generator prompts contain only the matching brief, exact activation receipt, and installed matching craft.
- Same-run agent self-repair is recorded. Controller source repair fails Tier 2.
- Existing gallery PNGs are reference provenance only; they are not generated-app or owner proof.
- The known unfiltered Xcode 26.5 accessibility audit remains visible until resolved and independently rerun.
- No numeric aesthetic score. Tier 3 requires a reviewer who did not generate or repair the app and zero blockers.

## Current environment boundary

The frozen host is macOS 26.5.2 with Xcode 26.5 (17F42), Swift 6.3.2, XcodeGen, and iOS 26.5
simulators. `xcrun devicectl list devices` returned no devices on 2026-08-29, so Tiers 4–5 start as
`NOT RUN`. Tier 6 starts `PENDING` until the owner reviews the exact final hashes.
