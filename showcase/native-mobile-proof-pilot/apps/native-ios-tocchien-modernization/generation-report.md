# TocChien native iOS candidate generation report

Scope: Phase 1 fixtures/provenance plus Phase 2 candidate app only. The candidate remains outside the active `native-ios` proof arm.

## Generator and inputs

- Generator: Orca dispatched implementation worker.
- Frozen request: `showcase/native-mobile-proof-pilot/generator-packets/native-ios-tocchien-modernization-activation-request.json` SHA-256 `8db84d6e6def441d87f2841b9e805971d41ed85adce9b9cf865841f88d906b6a`.
- Frozen brief SHA-256: `6a07e697b0688877984a8147f05530f5f432c18e1be0ec54d7a52ee54bc87246`.
- Legacy content authority: Git object `8d095f576cf41b8d6af4cb4186b4db8ffaa89c4b`; 6 authorized champions, 24 authorized terms, and 12 authorized imagesets only.
- Candidate source digest: `9d2b2f333a4776c25215e4ea4446f867ec8ecb4f66da5ac9f73449459f01baab` over sorted per-file SHA-256 rows for candidate files excluding generated `.xcodeproj`, this receipt, and this report.
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
5. The focused layout suite passed 2/2 on the exact iPhone 17 Pro simulator after proving standard Large remains two columns and AX XXXL switches to one column.

## Evidence boundary

- Controller source edits: 0; all edits are worker-owned paths in this candidate slice.
- Behavior: candidate technical evidence only.
- Visual: PENDING independent Phase 3 review; no visual PASS is claimed here.
- Device: NOT RUN. Owner: PENDING.

The iOS 26.5 simulator printed its existing `UIAccessibilityLoaderWebShared` duplicate-class warning during UI tests; the final Xcode command exited 0 with all 16 candidate tests passing.
