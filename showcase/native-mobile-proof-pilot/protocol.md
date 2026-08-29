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

Tier 3 records behavior and visual craft independently. `behaviorDisposition` is `PASS`, `FAIL`,
or `NOT_RUN`; `visualDisposition` is `PASS`, `FAIL`, or `UNASSESSED`. The aggregate can be `PASS`
only when both are `PASS`; either failure makes it `FAIL`, and an unassessed visual review leaves it
`PENDING` (or `NOT RUN` when behavior was not run). A behavior pass proves controller-replayed tests,
the exact source subject, environment, and retained behavior evidence. It never creates a taste pass.

## Frozen pilot boundary

- Brief bytes are hashed before generators start.
- Generator prompts contain only the matching brief, exact activation receipt, and installed matching craft.
- Same-run agent self-repair is recorded. Controller source repair fails Tier 2.
- Existing gallery PNGs are reference provenance only; they are not generated-app or owner proof.
- The known unfiltered Xcode 26.5 accessibility audit remains visible until resolved and independently rerun.
- A visual `PASS` requires a controller-issued receipt with controller/reviewer Orca session and worker identities,
  a distinct non-empty generator identity, immutable rubric/brief/source/ledger hashes, and exact six normal plus three
  stress capture paths. Display names are not an independence proof.
- A visual `PASS` requires one v2 current curation, three exact scored screens, both light and dark normal hashes
  per screen, zero blockers, and all auto-fails explicitly false. Stress captures are inspection-only and cannot
  supply normal taste scores. Normal captures use content-size class `large`; stress captures use
  `accessibility-extra-extra-extra-large`.
- Layout, Typography, Spacing, and Consistency score at least 8 per screen. Motion, Iconography, and
  Depth-Surface score at least 7 when applicable; `NOT_APPLICABLE` needs a rationale and never applies to the
  four 8-point axes. Every score includes non-whitespace evidence, and scored/N/A result shapes are exclusive. No
  average, rounding, or score substitution is accepted.
- The v2 capture ledger records point-space above-fold geometry: viewport dimensions, complete rows, detail hero
  and next-section positions, and dictionary chrome height. Declared pixel dimensions must match each PNG IHDR, and
  ledger subjects must match captured capabilities exactly. Legacy v1 curation remains retained history and is
  explicitly `UNASSESSED` for visual craft until a v2 receipt-bound review exists.

## Current environment boundary

The frozen host is macOS 26.5.2 with Xcode 26.5 (17F42), Swift 6.3.2, XcodeGen, and iOS 26.5
simulators. `xcrun devicectl list devices` returned no devices on 2026-08-29, so Tiers 4–5 start as
`NOT RUN`. Tier 6 starts `PENDING` until the owner reviews the exact final hashes.
