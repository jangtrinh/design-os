# TocChien native iOS candidate generation report

Scope: Phase 1 fixtures/provenance plus Phase 2 candidate app only. The candidate remains outside the active `native-ios` proof arm.

## Generator and inputs

- Generator: Orca dispatched implementation worker.
- Frozen request: `showcase/native-mobile-proof-pilot/generator-packets/native-ios-tocchien-modernization-activation-request.json` SHA-256 `bf7315924ebb3ac56f48cb2f4652d8727cd0a0f9a60a96aa52c74510e0de5bbe`; its exact schema is accepted by `ui knowledge activate` and binds the `native-ios` route.
- Frozen brief SHA-256: `6a07e697b0688877984a8147f05530f5f432c18e1be0ec54d7a52ee54bc87246`.
- Legacy content authority: Git object `8d095f576cf41b8d6af4cb4186b4db8ffaa89c4b`; 6 authorized champions, 24 authorized terms, and 12 authorized imagesets only.
- Candidate source digest: `8ebbaaa431fd16d3c7b562d2ae02679f9b36d90908b4f7b826da16201a951c88` over sorted per-file SHA-256 rows for candidate files excluding generated `.xcodeproj`, this receipt, and this report.
- Toolchain: Xcode 26.5 (17F42), Swift 6.3.2, Swift 6 language mode, iOS 26.0, iPhone-only.

## Retained RED evidence

1. Before Phase 1 outputs, `npx vitest run tests/native-mobile-proof-tocchien-fixtures.test.ts tests/native-ios-tocchien-source-contract.test.ts` failed: candidate paths were absent (11 failures, 1 passing test).
2. Before production Swift, `xcodegen generate && xcodebuild -project TocChienModernization.xcodeproj -scheme TocChienModernization -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.5' test` failed because `@testable import TocChienModernization` had no production module.
3. Geometry probes subsequently rejected an oversized 407pt detail hero and 171.67pt dictionary content boundary before the view constraints were corrected.
4. The AX XXXL catalogue probe rejected the fixed two-column layout at 179pt against the required 301.5pt minimum before the accessibility-only single-column repair.

## GREEN evidence

1. `npx vitest run tests/native-mobile-proof-tocchien-fixtures.test.ts tests/native-ios-tocchien-source-contract.test.ts` passed: 12 tests.
2. `xcodegen generate && xcodebuild -project TocChienModernization.xcodeproj -scheme TocChienModernization -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.5' test` passed: 8 Swift Testing tests and 8 UI tests.
3. `npm run proof:native-mobile` passed without changing the active manifest or proof board.
4. Forbidden-technology scan returned no matches; store construction scan found one production construction site plus test sites; every Swift file is under 200 lines.
5. The complete final suite passed 8 Swift Testing + 8 UI tests on the exact iPhone 17 Pro simulator. The AX XXXL tests prove one-column catalogue reflow, representative content fully above the persistent bottom reservation, end reachability, and a detail surface captured at top-of-scroll.

## Evidence boundary

- Controller shipped-production source edits: 0; Terra owns all retained production Swift edits.
- Controller verification-harness edits: 1 at `TocChienModernizationUITests/TocChienLayoutUITests.swift`, SHA-256 `c7ef1a6c2955271f8ae96c2479196862aed91422e9f5c74dc7d2ad036dd06226`. This test-target-only edit followed Fable's stress-proof advice and is not shipped in the app product.
- Plan variance: the original phrase “controller does not edit Swift” was too broad. The enforced invariant is zero controller edits to shipped production Swift; any test-target harness edit must be declared by exact path and digest.
- Behavior: candidate technical evidence only.
- Visual: independent simulator curation PASS for the recorded nine captures; this is not physical-device or owner acceptance.
- Device: NOT RUN. Owner: PENDING.

The iOS 26.5 simulator printed its existing `UIAccessibilityLoaderWebShared` duplicate-class warning during UI tests; the final Xcode command exited 0 with all 16 candidate tests passing.
