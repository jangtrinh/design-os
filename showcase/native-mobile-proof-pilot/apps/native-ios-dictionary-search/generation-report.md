# TocChien Dictionary Search — generation report

- Generator id: `terra-native-ios-pilot-01`
- Artifact: local, native iOS SwiftUI application for iPhone; iOS 17+.
- Assurance boundary: `PROVISIONAL`; `QUALIFIED_DELIVERY_FORBIDDEN` remains in force.
- Capability receipt: [`activation-receipt.json`](activation-receipt.json), retained verbatim from `knowledge activate`.

## Generated scope

- `project.yml` is the XcodeGen source of truth; `.gitignore` excludes `TocChienDictionary.xcodeproj/`, `DerivedData/`, and `build/`.
- Swift source: `TocChienDictionaryApp.swift`; `Models/DictionaryEntry.swift`; `Models/DictionarySearchState.swift`; `Store/DictionarySearchStore.swift`; `Support/LaunchConfiguration.swift`; and all five `Views/*.swift` files.
- Tests: `TocChienDictionaryTests/DictionarySearchStoreTests.swift` and `TocChienDictionaryUITests/TocChienDictionaryUITests.swift`.
- Every Swift file is 102 lines or fewer (12 Swift files, 716 lines total).

## Product behavior

- Local sanitized Vietnamese-English content only; no network dependency, no HTML fallback, and no UIKit bridge.
- `NavigationStack` owns result-to-detail navigation. `@SceneStorage` persists the query and selected detail route across scene backgrounding/restoration; returning from detail restores search and accessibility focus.
- Semantic SwiftUI controls/colors, 44-point minimum interactive controls, Dynamic Type-aware layouts, VoiceOver labels/hints/traits, keyboard-safe scrolling, and Reduce Motion/Reduce Transparency handling are implemented.
- Launch arguments: `-ui-state ready|loading|results|empty|offline|detail`, optional `-ui-query <term>`, and `-ui-reset-state`. UI tests exercise ready, loading, empty, offline/retry, results/detail/back, largest Dynamic Type with retained evidence, and landscape.

## Attempts and exact verification

0. Capability activation succeeded with route `native-ios`, artifact `native-ios-application`, and the required provisional/forbidden claim policy.
1. Preflight generation used an invalid `--project` destination and stopped in XcodeGen before compilation: `The file “XcodeGen” doesn’t exist.` Same-run repair: the task-prescribed destination was used next. A read-only check confirmed no unintended destination was created; no Swift source changed for this repair.
2. **First compile result:** the exact XcodeGen command succeeded, then the exact `xcodebuild` command below exited `0` with `** TEST SUCCEEDED **`: 6 unit tests and 6 UI tests passed.
3. After adding restoration and landscape checks, the same exact commands succeeded with `** TEST SUCCEEDED **`: 7 unit tests and 7 UI tests passed (14 total, 0 failures).
4. Curation round 1 repaired the AX offline-retry proof. The same exact commands exited `0` with `** TEST SUCCEEDED **`: 7 unit tests and 7 UI tests passed (14 total, 0 failures).
5. **Final compile result:** evidence-quality repair delayed the retained AX witness until the test-only scroll-settling expectation completed and Retry was re-confirmed hittable. The same exact commands exited `0` with `** TEST SUCCEEDED **`: 7 unit tests and 7 UI tests passed (14 total, 0 failures).

```sh
cd /Users/jang/orca/workspaces/ease-design/native-mobile-proof-pilot
xcodegen generate --spec showcase/native-mobile-proof-pilot/apps/native-ios-dictionary-search/project.yml --project showcase/native-mobile-proof-pilot/apps/native-ios-dictionary-search
xcodebuild -project showcase/native-mobile-proof-pilot/apps/native-ios-dictionary-search/TocChienDictionary.xcodeproj -scheme TocChienDictionary -destination 'platform=iOS Simulator,name=iPhone 17 Pro,OS=26.5' test CODE_SIGNING_ALLOWED=NO
```

Environment: Xcode 26.5 (build 17F42), XcodeGen 2.45.4, iPhone 17 Pro simulator on iOS 26.5.

## Curation round 1 repair

- Tier 3 blocker: at accessibility-extra-large offline state, the retry action could be below the retained frame while the prior test asserted only existence.
- Repair: `testLargestDynamicTypeCanReachAndActivateRetry` conditionally scrolls the native SwiftUI scroll surface up to three times, asserts `dictionary-retry.isHittable`, uses a bounded UI-test-only XCTest expectation to let the scroll animation settle for 0.5 seconds, reasserts hittability, retains an `XCTAttachment` named `native-ios-offline-ax-retry-hittable`, taps Retry, and waits for `dictionary-result-keen`.
- The final iPhone 17 Pro simulator run added the retained attachment only after the settle expectation and post-settle hit assertion; the recovered result appeared. No production Swift layout change or production delay was necessary because the existing single scroll owner provides the reachable native path.

## Generator declaration and limitations

Generator declaration: no controller edited Swift. All Swift creation and edits were made by `terra-native-ios-pilot-01` in this owned app directory.

- Simulator build and XCTest evidence are deterministic evidence only. The test runner emitted simulator haptic and LLDB metadata warnings, but the command exited `0`; neither is an app test failure.
- No live VoiceOver, Switch Control, Full Keyboard Access, real-device, independent-curator, or owner-visible acceptance evidence was collected or claimed.
- No qualified platform-delivery claim is made.
